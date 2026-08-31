import { InvariantError } from "./errors.js";
import { coldKey } from "./state.js";
import type { EngineState, EpistemicPhase, ObservationRecord } from "./types.js";

export function currentObservation(
  state: EngineState,
  observationId: string
): ObservationRecord | undefined {
  const versions = state.observations.get(observationId);
  if (!versions) {
    return undefined;
  }
  return versions.find((row) => row.current);
}

const PHASE_RANK: Record<EpistemicPhase, number> = {
  dispersed: 0,
  assembling: 1,
  crystallized: 2
};

export function derivedEpistemicPhase(state: EngineState, observationId: string): EpistemicPhase {
  let phase: EpistemicPhase = "dispersed";
  const raise = (next: EpistemicPhase): void => {
    if (PHASE_RANK[next] > PHASE_RANK[phase]) {
      phase = next;
    }
  };
  for (const insight of state.insights.values()) {
    if (insight.forgotten || insight.rejected) {
      continue;
    }
    if (!insight.evidenceIds.includes(observationId)) {
      continue;
    }
    raise(insight.epistemicPhase);
  }
  for (const assembly of state.assemblies.values()) {
    if (assembly.forgotten || assembly.rejected) {
      continue;
    }
    if (!assembly.memberIds.includes(observationId)) {
      continue;
    }
    raise(assembly.epistemicPhase);
  }
  return phase;
}

export function syncObservationPhases(state: EngineState, observationIds?: Iterable<string>): void {
  const ids = observationIds === undefined ? state.observations.keys() : observationIds;
  for (const observationId of ids) {
    const current = currentObservation(state, observationId);
    if (!current || current.forgotten) {
      continue;
    }
    current.epistemicPhase = derivedEpistemicPhase(state, observationId);
  }
}

export function assertInvariants(state: EngineState): void {
  assertIdentity(state);
  assertProvenance(state);
  assertTemporalValidity(state);
  assertCorrectionLineage(state);
  assertDeletionAndConsent(state);
  assertUncertainty(state);
  assertSimultaneity(state);
  assertRepresentationLoss(state);
  assertRestoration(state);
  assertDerivedObservationPhases(state);
}

function assertIdentity(state: EngineState): void {
  for (const [observationId, versions] of state.observations) {
    const currents = versions.filter((row) => row.current);
    if (currents.length !== 1) {
      throw new InvariantError(
        "identity",
        `observation ${observationId} has ${currents.length} current versions`
      );
    }
    const nums = versions.map((row) => row.version);
    if (new Set(nums).size !== nums.length) {
      throw new InvariantError("identity", `duplicate versions for ${observationId}`);
    }
    for (const row of versions) {
      if (row.observationId !== observationId) {
        throw new InvariantError("identity", "observation ID is not stable across versions");
      }
    }
    const phases = new Set(currents.map((row) => row.epistemicPhase));
    if (phases.size !== 1) {
      throw new InvariantError("identity", `multiple active phases for ${observationId}`);
    }
  }
  for (const insight of state.insights.values()) {
    const matching = [...state.insights.values()].filter((row) => row.insightId === insight.insightId);
    if (matching.length !== 1) {
      throw new InvariantError("identity", `duplicate insight ${insight.insightId}`);
    }
  }
}

function assertProvenance(state: EngineState): void {
  for (const versions of state.observations.values()) {
    for (const row of versions) {
      const hasActor = row.speaker !== null || row.observer !== null || row.sourceRef !== null;
      if (!hasActor) {
        throw new InvariantError(
          "provenance",
          `observation ${row.observationId} v${row.version} lacks speaker, observer, and sourceRef`
        );
      }
      if (row.kind === "user_self_report" && row.speaker === null) {
        throw new InvariantError(
          "provenance",
          `user self-report ${row.observationId} requires a speaker`
        );
      }
      if (row.kind === "recognizer_candidate" && row.observer === null) {
        throw new InvariantError(
          "provenance",
          `recognizer candidate ${row.observationId} requires an observer`
        );
      }
    }
  }
}

function assertTemporalValidity(state: EngineState): void {
  for (const versions of state.observations.values()) {
    for (const row of versions) {
      if (row.temporalValidity.validTo !== null && row.temporalValidity.validTo < row.temporalValidity.validFrom) {
        throw new InvariantError(
          "temporal_validity",
          `invalid window on ${row.observationId} v${row.version}`
        );
      }
      if (row.timeSpan !== null && row.timeSpan.end < row.timeSpan.start) {
        throw new InvariantError(
          "temporal_validity",
          `invalid time span on ${row.observationId} v${row.version}`
        );
      }
    }
  }
}

function assertCorrectionLineage(state: EngineState): void {
  for (const [observationId, versions] of state.observations) {
    const sorted = [...versions].sort((a, b) => a.version - b.version);
    for (const row of sorted) {
      if (row.version > 1 && row.invalidatedByCorrection === false && row.current === false && !row.forgotten) {
        const hasCorrection = state.relations.some(
          (rel) =>
            rel.type === "correction" &&
            rel.toRef.kind === "observation" &&
            rel.toRef.id === observationId &&
            rel.toRef.version === row.version
        );
        if (!hasCorrection && !row.current) {
          throw new InvariantError(
            "correction_lineage",
            `non-current ${observationId} v${row.version} lacks a correction or invalidation mark`
          );
        }
      }
      if (row.invalidatedByCorrection && row.current) {
        throw new InvariantError(
          "correction_lineage",
          `corrected ${observationId} v${row.version} cannot remain current`
        );
      }
    }
    if (sorted.length > 1) {
      const hasLine = state.relations.some(
        (rel) => rel.type === "correction" && rel.fromRef.id === observationId && rel.toRef.id === observationId
      );
      if (!hasLine) {
        throw new InvariantError("correction_lineage", `multi-version ${observationId} lacks correction relation`);
      }
    }
  }
}

function assertDeletionAndConsent(state: EngineState): void {
  for (const view of state.derivedViews.values()) {
    if (view.sourceObservationId === null) {
      continue;
    }
    const current = currentObservation(state, view.sourceObservationId);
    if (!current) {
      continue;
    }
    if ((current.forgotten || current.consentWithdrawn) && !view.stale) {
      throw new InvariantError(
        "deletion_and_consent",
        `derived view ${view.viewId} remains usable after deletion or consent withdrawal`
      );
    }
    if (!view.stale && !current.consent.permittedUses.includes("derive")) {
      throw new InvariantError(
        "deletion_and_consent",
        `derived view ${view.viewId} exists without derive consent`
      );
    }
  }
  const graph = state.derivedViews.get("view_graph_global");
  if (graph) {
    for (const ref of graph.sourceRefs) {
      if (ref.kind !== "observation") {
        continue;
      }
      const current = currentObservation(state, ref.id);
      if (current && (!current.consent.permittedUses.includes("derive") || current.forgotten)) {
        throw new InvariantError(
          "deletion_and_consent",
          `graph view includes ${ref.id} outside derive consent`
        );
      }
    }
  }
}

function assertUncertainty(state: EngineState): void {
  for (const insight of state.insights.values()) {
    if (insight.epistemicPhase === "crystallized" && !insight.invalidated) {
      if (!insight.uncertainty.declared) {
        throw new InvariantError("uncertainty", `insight ${insight.insightId} lacks declared uncertainty`);
      }
      if (insight.falsificationConditions.length === 0) {
        throw new InvariantError("uncertainty", `insight ${insight.insightId} lacks falsification conditions`);
      }
    }
  }
  for (const versions of state.observations.values()) {
    for (const row of versions) {
      if (row.kind === "recognizer_candidate" && row.uncertainty.recognizerConfidence === null) {
        throw new InvariantError(
          "uncertainty",
          `recognizer candidate ${row.observationId} lacks confidence`
        );
      }
      if (row.kind === "system_inference" && !row.uncertainty.declared) {
        throw new InvariantError("uncertainty", `system inference ${row.observationId} must declare uncertainty`);
      }
    }
  }
}

function assertSimultaneity(state: EngineState): void {
  for (const rel of state.relations) {
    if (rel.type === "simultaneity" && rel.fromRef.id === rel.toRef.id && rel.fromRef.kind === rel.toRef.kind) {
      throw new InvariantError("simultaneity_and_ordering", "simultaneity cannot collapse an entity onto itself");
    }
    if (rel.type === "contradiction") {
      const from = rel.fromRef.kind === "observation" ? currentObservation(state, rel.fromRef.id) : undefined;
      const to = rel.toRef.kind === "observation" ? currentObservation(state, rel.toRef.id) : undefined;
      if (from && to && from.forgotten !== to.forgotten && (from.forgotten || to.forgotten)) {
        const forgottenHasDeletion = state.relations.some(
          (other) => other.type === "deletion" && (other.toRef.id === from.observationId || other.toRef.id === to.observationId)
        );
        if (!forgottenHasDeletion) {
          throw new InvariantError(
            "simultaneity_and_ordering",
            "contradictory fragment disappeared without a deletion contract"
          );
        }
      }
    }
  }
}

function assertRepresentationLoss(state: EngineState): void {
  for (const view of state.derivedViews.values()) {
    if (view.representationLossDeclared !== true) {
      throw new InvariantError("representation_loss_declaration", `derived view ${view.viewId} must declare loss`);
    }
    if (view.sourceObservationId !== null && view.sourceVersion !== null) {
      const current = currentObservation(state, view.sourceObservationId);
      if (current && current.version !== view.sourceVersion && !view.stale) {
        throw new InvariantError(
          "representation_loss_declaration",
          `derived view ${view.viewId} is not stale relative to current source version ${current.version}`
        );
      }
    }
  }
}

function assertRestoration(state: EngineState): void {
  for (const versions of state.observations.values()) {
    for (const row of versions) {
      if (row.current && row.invalidatedByCorrection) {
        throw new InvariantError(
          "restoration_and_re_presentation",
          `corrected ${row.observationId} v${row.version} is current after restoration`
        );
      }
      if (row.workingPayloadResident && row.storageTier === "cold") {
        throw new InvariantError(
          "restoration_and_re_presentation",
          `cold ${row.observationId} v${row.version} still has a resident working payload`
        );
      }
      if (row.storageTier === "cold" && !row.forgotten) {
        const stored = state.coldStore.get(coldKey(row.observationId, row.version));
        if (!stored) {
          throw new InvariantError(
            "restoration_and_re_presentation",
            `cold ${row.observationId} v${row.version} lacks a restorable record`
          );
        }
      }
    }
  }
}

function assertDerivedObservationPhases(state: EngineState): void {
  for (const [observationId, versions] of state.observations) {
    const current = versions.find((row) => row.current);
    if (!current || current.forgotten) {
      continue;
    }
    const derived = derivedEpistemicPhase(state, observationId);
    if (current.epistemicPhase !== derived) {
      throw new InvariantError(
        "identity",
        `observation ${observationId} phase ${current.epistemicPhase} disagrees with candidate-derived phase ${derived}`
      );
    }
  }
}
