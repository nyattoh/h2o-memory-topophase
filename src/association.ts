import { MemoryEngine } from "./engine.js";
import type { AssemblyRecord, EngineState, ObservationRecord, RelationRecord } from "./types.js";

export type AssociationReason = "direct_cue" | "contradiction_guard";

export interface AssociationCandidate {
  observationId: string;
  reason: AssociationReason;
  score: number;
}

export interface AssociationDecision {
  cueObservationId: string;
  candidates: AssociationCandidate[];
  selectedIds: string[];
  excludedIds: string[];
  triggered: boolean;
  assembly: AssemblyRecord | null;
}

export interface AssociationOptions {
  minDirectMembers?: number;
  maxDirectMembers?: number;
  assemblyId?: string;
}

function currentEligibleObservation(
  state: EngineState,
  observationId: string
): ObservationRecord | null {
  const versions = state.observations.get(observationId) ?? [];
  const current = versions.find((row) => row.current) ?? null;
  if (
    current === null ||
    current.forgotten ||
    current.invalidatedByCorrection ||
    current.consentWithdrawn ||
    !current.consent.permittedUses.includes("assemble")
  ) {
    return null;
  }
  return current;
}

function observationNeighbor(
  relation: RelationRecord,
  observationId: string
): string | null {
  if (relation.fromRef.kind === "observation" && relation.fromRef.id === observationId) {
    return relation.toRef.kind === "observation" ? relation.toRef.id : null;
  }
  if (relation.toRef.kind === "observation" && relation.toRef.id === observationId) {
    return relation.fromRef.kind === "observation" ? relation.fromRef.id : null;
  }
  return null;
}

function occurrenceTime(state: EngineState, observationId: string): string {
  return currentEligibleObservation(state, observationId)?.occurrenceTime ?? "";
}

/**
 * Deterministic Stage B baseline. A new typed cue activates old canonical
 * observations without using text, summaries, vectors, or a recency cutoff.
 * Learning the selection policy is a later stage.
 */
export class AssociativeAssemblyController {
  constructor(private readonly engine: MemoryEngine) {}

  onCue(cueObservationId: string, options: AssociationOptions = {}): AssociationDecision {
    const state = this.engine.snapshot();
    if (currentEligibleObservation(state, cueObservationId) === null) {
      throw new Error(`cue observation ${cueObservationId} is not eligible`);
    }

    const directIds = new Set<string>();
    for (const relation of state.relations) {
      if (relation.type !== "cue") {
        continue;
      }
      const neighbor = observationNeighbor(relation, cueObservationId);
      if (neighbor !== null && neighbor !== cueObservationId) {
        directIds.add(neighbor);
      }
    }

    const excludedIds = new Set<string>();
    const eligibleDirect = [...directIds].filter((id) => {
      const eligible = currentEligibleObservation(state, id) !== null;
      if (!eligible) {
        excludedIds.add(id);
      }
      return eligible;
    });
    eligibleDirect.sort((left, right) => {
      const timeOrder = occurrenceTime(state, left).localeCompare(occurrenceTime(state, right));
      return timeOrder !== 0 ? timeOrder : left.localeCompare(right);
    });

    const maxDirectMembers = options.maxDirectMembers ?? Number.MAX_SAFE_INTEGER;
    const selectedDirect = eligibleDirect.slice(0, maxDirectMembers);
    for (const id of eligibleDirect.slice(maxDirectMembers)) {
      excludedIds.add(id);
    }

    const contradictionIds = new Set<string>();
    for (const relation of state.relations) {
      if (relation.type !== "contradiction") {
        continue;
      }
      for (const directId of selectedDirect) {
        const neighbor = observationNeighbor(relation, directId);
        if (
          neighbor !== null &&
          neighbor !== cueObservationId &&
          !directIds.has(neighbor) &&
          currentEligibleObservation(state, neighbor) !== null
        ) {
          contradictionIds.add(neighbor);
        }
      }
    }

    const candidates: AssociationCandidate[] = [
      ...selectedDirect.map((observationId) => ({
        observationId,
        reason: "direct_cue" as const,
        score: 1
      })),
      ...[...contradictionIds]
        .sort((left, right) => left.localeCompare(right))
        .map((observationId) => ({
          observationId,
          reason: "contradiction_guard" as const,
          score: 0.5
        }))
    ];
    const selectedIds = candidates.map((candidate) => candidate.observationId);
    const minDirectMembers = options.minDirectMembers ?? 2;
    if (selectedDirect.length < minDirectMembers) {
      return {
        cueObservationId,
        candidates,
        selectedIds,
        excludedIds: [...excludedIds].sort(),
        triggered: false,
        assembly: null
      };
    }

    const assembly = this.engine.assemble({
      assemblyId: options.assemblyId,
      memberIds: selectedIds,
      cue: `typed cue ${cueObservationId}`
    });
    return {
      cueObservationId,
      candidates,
      selectedIds,
      excludedIds: [...excludedIds].sort(),
      triggered: true,
      assembly
    };
  }
}

export function recentWindowBaseline(engine: MemoryEngine, cueObservationId: string, size: number): string[] {
  if (!Number.isInteger(size) || size < 0) {
    throw new Error("recent window size must be a non-negative integer");
  }
  return engine
    .timeline()
    .filter((row) => row.observationId !== cueObservationId)
    .slice(-size)
    .map((row) => row.observationId);
}

function lexicalTokens(record: ObservationRecord): Set<string> {
  return new Set(
    Object.values(record.payload.data)
      .filter((value): value is string | number | boolean => value !== null)
      .join(" ")
      .toLowerCase()
      .match(/[\p{L}\p{N}_-]+/gu) ?? []
  );
}

export function lexicalOverlapBaseline(engine: MemoryEngine, cueObservationId: string): string[] {
  const rows = engine.timeline();
  const cue = rows.find((row) => row.observationId === cueObservationId);
  if (!cue) {
    throw new Error(`cue observation ${cueObservationId} is not presentable`);
  }
  const cueTokens = lexicalTokens(cue);
  return rows
    .filter((row) => row.observationId !== cueObservationId)
    .filter((row) => [...lexicalTokens(row)].some((token) => cueTokens.has(token)))
    .map((row) => row.observationId);
}
