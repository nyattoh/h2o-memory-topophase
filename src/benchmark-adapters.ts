import { createHash } from "node:crypto";
import { MemoryEngine } from "./engine.js";
import { derivedViewId } from "./derived.js";
import { OperationError } from "./errors.js";
import type {
  AssemblyRecord,
  AuditEntry,
  ConsentUse,
  CorrectInput,
  CrystallizeInput,
  EngineState,
  EntityRef,
  EpistemicPhase,
  EvidencePlan,
  FailurePoint,
  ForgetInput,
  InsightRecord,
  MoveTierInput,
  ObservationRecord,
  ObserveInput,
  RejectInput,
  RelationRecord,
  RelateInput,
  RestoreInput,
  RestorePlacementResult,
  RetrievalHit,
  ReopenInput,
  StorageTier,
  TraceInput,
  WithdrawConsentInput
} from "./types.js";

export type BenchmarkOperation =
  | "ASSEMBLE"
  | "ASSEMBLE_BY_CUE"
  | "AUDIT"
  | "CONSIDER_PRUNE"
  | "CORRECT"
  | "CRYSTALLIZE"
  | "FORGET"
  | "INJECT_FAILURE"
  | "MATERIALISE_PUBLIC_SURFACES"
  | "MOVE_TIER"
  | "OBSERVE"
  | "READ_ASSEMBLY"
  | "READ_INSIGHT"
  | "READ_OBSERVATION"
  | "READ_PUBLIC_SURFACES"
  | "REJECT"
  | "RELATE"
  | "REOPEN"
  | "RESTORE"
  | "RETRIEVE"
  | "SNAPSHOT"
  | "TOKENS"
  | "TRACE"
  | "TRACE_INDEX"
  | "WITHDRAW_CONSENT";

export interface BenchmarkCommand {
  step_id: string;
  operation: BenchmarkOperation;
  arguments: Record<string, unknown>;
}

export type MechanismName =
  | "canonical_source_authority"
  | "independent_epistemic_and_storage_axes"
  | "immediate_governance_propagation";

export type MechanismEventKind =
  | "derived_view_used_as_authority"
  | "governance_update_queued_for_views"
  | "phase_changed_by_tier_move"
  | "stale_governed_surface_read"
  | "stale_governed_view_used"
  | "tier_changed_by_phase_operation";

export interface MechanismEvent {
  step_id: string;
  kind: MechanismEventKind;
  mechanism: MechanismName;
  entity_ids: string[];
  detail: string;
}

export interface CommandFailure {
  name: string;
  message: string;
  invariant_id: string | null;
}

export interface CommandExecution {
  step_id: string;
  operation: BenchmarkOperation;
  arguments_hash: string;
  ok: boolean;
  output: unknown;
  failure: CommandFailure | null;
  mechanism_events: MechanismEvent[];
}

export interface PublicSurfaceRequest {
  observation_id: string;
  observation_version: number;
  assembly_id: string;
  insight_id: string;
  retrieval_tokens: string[];
}

export interface PublicSurfaceBundle {
  public_snapshot: unknown;
  audit: AuditEntry[];
  observations: Record<string, unknown>;
  relations: RelationRecord[];
  assemblies: Record<string, unknown>;
  insights: Record<string, unknown>;
  derived_views: Record<string, unknown>;
  tokens: Record<string, unknown>;
  retrieval: RetrievalHit[];
  traces: Record<string, unknown>;
}

export interface BenchmarkAdapter {
  execute(command: BenchmarkCommand): CommandExecution;
  getObservation(observationId: string, version?: number): ObservationRecord;
  getAssembly(assemblyId: string): AssemblyRecord;
  getInsight(insightId: string): InsightRecord;
  snapshot(): EngineState;
}

interface MaterialisedIndex {
  observationId: string;
  version: number;
  viewId: string;
  body: string;
  permittedUses: ConsentUse[];
}

const PHASE_FOR_TIER: Record<StorageTier, EpistemicPhase> = {
  hot: "dispersed",
  warm: "assembling",
  cold: "crystallized"
};

const TIER_FOR_PHASE: Record<EpistemicPhase, StorageTier> = {
  dispersed: "hot",
  assembling: "warm",
  crystallized: "cold"
};

function stableValue(value: unknown): unknown {
  if (value instanceof Map) {
    return [...value.entries()].map(([key, inner]) => [key, stableValue(inner)]);
  }
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, inner]) => [key, stableValue(inner)])
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value)) ?? "null";
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

function failureValue(action: () => unknown): unknown {
  try {
    return action();
  } catch (error) {
    if (error instanceof Error) {
      return {
        error: error.name,
        message: error.message,
        invariant_id: "invariantId" in error && typeof error.invariantId === "string" ? error.invariantId : null
      };
    }
    return { error: "UnknownError", message: String(error), invariant_id: null };
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function required<T>(command: BenchmarkCommand, name: string): T {
  if (!(name in command.arguments)) {
    throw new Error(`${command.step_id} is missing argument ${name}`);
  }
  return command.arguments[name] as T;
}

function indexBody(record: ObservationRecord): string {
  return stableJson({
    observationId: record.observationId,
    version: record.version,
    kind: record.kind,
    payload: record.payload,
    speaker: record.speaker,
    observer: record.observer,
    sourceRef: record.sourceRef
  }).toLowerCase();
}

function materialisedIndex(record: ObservationRecord): MaterialisedIndex {
  return {
    observationId: record.observationId,
    version: record.version,
    viewId: derivedViewId("search_index", record.observationId, record.version),
    body: indexBody(record),
    permittedUses: [...record.consent.permittedUses]
  };
}

abstract class BaseAdapter implements BenchmarkAdapter {
  protected readonly engine = new MemoryEngine();
  private activeStepId = "uninitialised";
  private readonly events: MechanismEvent[] = [];

  execute(command: BenchmarkCommand): CommandExecution {
    this.activeStepId = command.step_id;
    const eventStart = this.events.length;
    try {
      const output = this.dispatch(command);
      return {
        step_id: command.step_id,
        operation: command.operation,
        arguments_hash: sha256(command.arguments),
        ok: true,
        output,
        failure: null,
        mechanism_events: clone(this.events.slice(eventStart))
      };
    } catch (error) {
      const name = error instanceof Error ? error.name : "UnknownError";
      const message = error instanceof Error ? error.message : String(error);
      const invariantId = error instanceof Error && "invariantId" in error && typeof error.invariantId === "string"
        ? error.invariantId
        : null;
      return {
        step_id: command.step_id,
        operation: command.operation,
        arguments_hash: sha256(command.arguments),
        ok: false,
        output: null,
        failure: { name, message, invariant_id: invariantId },
        mechanism_events: clone(this.events.slice(eventStart))
      };
    }
  }

  getObservation(observationId: string, version?: number): ObservationRecord {
    return this.engine.getObservation(observationId, version);
  }

  getAssembly(assemblyId: string): AssemblyRecord {
    return this.engine.getAssembly(assemblyId);
  }

  getInsight(insightId: string): InsightRecord {
    return this.engine.getInsight(insightId);
  }

  snapshot(): EngineState {
    return this.engine.snapshot();
  }

  protected emit(event: Omit<MechanismEvent, "step_id">): void {
    this.events.push({ step_id: this.activeStepId, ...event });
  }

  protected observe(input: ObserveInput): ObservationRecord {
    return this.engine.observe(input);
  }

  protected correct(input: CorrectInput): ObservationRecord {
    return this.engine.correct(input);
  }

  protected withdrawConsent(input: WithdrawConsentInput): ObservationRecord {
    return this.engine.withdrawConsent(input);
  }

  protected forget(input: ForgetInput): ObservationRecord {
    return this.engine.forget(input);
  }

  protected moveTier(input: MoveTierInput): EntityRef {
    return this.engine.moveTier(input);
  }

  protected assemble(input: { assemblyId?: string; memberIds: string[]; cue?: string | null; storageTier?: StorageTier }): AssemblyRecord {
    return this.engine.assemble(input);
  }

  protected assembleByCue(input: { assemblyId: string; cue: string; tokens: string[] }): AssemblyRecord {
    const memberIds = this.retrieve({ tokens: input.tokens }).map((hit) => hit.observationId).sort();
    return this.assemble({ assemblyId: input.assemblyId, memberIds, cue: input.cue });
  }

  protected crystallize(input: CrystallizeInput): InsightRecord {
    return this.engine.crystallize(input);
  }

  protected reopen(input: ReopenInput): InsightRecord {
    return this.engine.reopen(input);
  }

  protected reject(input: RejectInput): { relationId: string } {
    return this.engine.reject(input);
  }

  protected restore(input: RestoreInput): RestorePlacementResult {
    return this.engine.restore(input);
  }

  protected retrieve(input: { tokens?: string[]; use?: ConsentUse }): RetrievalHit[] {
    return this.engine.retrieve(input);
  }

  protected trace(input: TraceInput): EvidencePlan {
    return this.engine.trace(input);
  }

  protected traceIndex(observationId: string): EvidencePlan {
    const index = this.engine.inspectSearchIndex(observationId);
    if (!index) {
      return {
        origin: { kind: "observation", id: observationId },
        canonicalEvents: [],
        excludedCounterevidence: [],
        uncertainty: [],
        blockedReasons: ["search index is unavailable"],
        usable: false
      };
    }
    return this.trace({ from: { kind: "derived_view", id: index.viewId } });
  }

  protected materialisePublicSurfaces(_request: PublicSurfaceRequest): void {
    // The complete condition reads live state, so no materialised copy is required.
  }

  protected collectPublicSurfaces(request: PublicSurfaceRequest): PublicSurfaceBundle {
    return this.collectEnginePublicSurfaces(request);
  }

  protected collectEnginePublicSurfaces(request: PublicSurfaceRequest): PublicSurfaceBundle {
    const derivedViews: Record<string, unknown> = {};
    for (const kind of ["text", "summary", "vector", "token", "search_index"] as const) {
      const viewId = derivedViewId(kind, request.observation_id, request.observation_version);
      derivedViews[kind] = failureValue(() => this.engine.getDerivedView(viewId));
    }
    derivedViews.graph = failureValue(() => this.engine.getDerivedView("view_graph_global"));
    const snapshot = this.snapshot();
    return {
      public_snapshot: snapshot,
      audit: this.engine.auditLog(),
      observations: {
        current: failureValue(() => this.getObservation(request.observation_id)),
        requested_version: failureValue(() => this.getObservation(request.observation_id, request.observation_version))
      },
      relations: clone(snapshot.relations),
      assemblies: {
        requested: failureValue(() => this.getAssembly(request.assembly_id))
      },
      insights: {
        requested: failureValue(() => this.getInsight(request.insight_id))
      },
      derived_views: derivedViews,
      tokens: {
        requested: failureValue(() => this.engine.tokensOf(request.observation_id))
      },
      retrieval: this.retrieve({ tokens: request.retrieval_tokens }),
      traces: {
        observation: failureValue(() => this.trace({ from: { kind: "observation", id: request.observation_id } })),
        assembly: failureValue(() => this.trace({ from: { kind: "assembly", id: request.assembly_id } })),
        insight: failureValue(() => this.trace({ from: { kind: "insight", id: request.insight_id } })),
        search_index: failureValue(() => this.traceIndex(request.observation_id))
      }
    };
  }

  private dispatch(command: BenchmarkCommand): unknown {
    switch (command.operation) {
      case "OBSERVE":
        return this.observe(required<ObserveInput>(command, "input"));
      case "RELATE":
        return this.engine.relate(required<RelateInput>(command, "input"));
      case "ASSEMBLE":
        return this.assemble(required<{ assemblyId?: string; memberIds: string[]; cue?: string | null; storageTier?: StorageTier }>(command, "input"));
      case "ASSEMBLE_BY_CUE":
        return this.assembleByCue(required<{ assemblyId: string; cue: string; tokens: string[] }>(command, "input"));
      case "CRYSTALLIZE":
        return this.crystallize(required<CrystallizeInput>(command, "input"));
      case "REOPEN":
        return this.reopen(required<ReopenInput>(command, "input"));
      case "MOVE_TIER":
        return this.moveTier(required<MoveTierInput>(command, "input"));
      case "CORRECT":
        return this.correct(required<CorrectInput>(command, "input"));
      case "WITHDRAW_CONSENT":
        return this.withdrawConsent(required<WithdrawConsentInput>(command, "input"));
      case "FORGET":
        return this.forget(required<ForgetInput>(command, "input"));
      case "TRACE":
        return this.trace(required<TraceInput>(command, "input"));
      case "TRACE_INDEX":
        return this.traceIndex(required<string>(command, "observation_id"));
      case "RESTORE":
        return this.restore(required<RestoreInput>(command, "input"));
      case "REJECT":
        return this.reject(required<RejectInput>(command, "input"));
      case "RETRIEVE":
        return this.retrieve(required<{ tokens?: string[]; use?: ConsentUse }>(command, "input"));
      case "READ_OBSERVATION":
        return this.getObservation(required<string>(command, "observation_id"), command.arguments.version as number | undefined);
      case "READ_ASSEMBLY":
        return this.getAssembly(required<string>(command, "assembly_id"));
      case "READ_INSIGHT":
        return this.getInsight(required<string>(command, "insight_id"));
      case "TOKENS":
        return this.engine.tokensOf(required<string>(command, "observation_id"));
      case "SNAPSHOT":
        return this.snapshot();
      case "AUDIT":
        return this.engine.auditLog();
      case "CONSIDER_PRUNE":
        return this.engine.considerPrune(
          required<string>(command, "observation_id"),
          required<"low_frequency" | "low_similarity">(command, "reason")
        );
      case "INJECT_FAILURE":
        this.engine.injectFailure(required<FailurePoint>(command, "point"));
        return null;
      case "MATERIALISE_PUBLIC_SURFACES":
        this.materialisePublicSurfaces(required<PublicSurfaceRequest>(command, "request"));
        return null;
      case "READ_PUBLIC_SURFACES":
        return this.collectPublicSurfaces(required<PublicSurfaceRequest>(command, "request"));
    }
  }
}

export class CompleteAdapter extends BaseAdapter {}

export class DerivedAuthorityAdapter extends BaseAdapter {
  private readonly observations = new Map<string, ObservationRecord[]>();
  private readonly indexes = new Map<string, MaterialisedIndex>();

  override getObservation(observationId: string, version?: number): ObservationRecord {
    const versions = this.observations.get(observationId);
    if (!versions) {
      return super.getObservation(observationId, version);
    }
    const represented = version === undefined
      ? versions.find((record) => record.current)
      : versions.find((record) => record.version === version);
    return represented ? clone(represented) : super.getObservation(observationId, version);
  }

  override snapshot(): EngineState {
    const state = super.snapshot();
    for (const [observationId, versions] of this.observations) {
      state.observations.set(observationId, clone(versions));
    }
    return state;
  }

  protected override observe(input: ObserveInput): ObservationRecord {
    const result = super.observe(input);
    this.observations.set(result.observationId, [clone(result)]);
    this.indexes.set(result.observationId, materialisedIndex(result));
    return result;
  }

  protected override correct(input: CorrectInput): ObservationRecord {
    const result = super.correct(input);
    const existing = this.observations.get(result.observationId) ?? [];
    for (const record of existing) {
      record.current = false;
    }
    existing.push(clone(result));
    this.observations.set(result.observationId, existing);
    this.indexes.set(result.observationId, materialisedIndex(result));
    return result;
  }

  protected override withdrawConsent(input: WithdrawConsentInput): ObservationRecord {
    return super.withdrawConsent(input);
  }

  protected override forget(input: ForgetInput): ObservationRecord {
    const result = super.forget(input);
    this.observations.set(input.observationId, [clone(result)]);
    this.indexes.delete(input.observationId);
    return result;
  }

  protected override moveTier(input: MoveTierInput): EntityRef {
    const result = super.moveTier(input);
    if (input.target.kind === "observation") {
      this.syncOrdinaryObservationState([input.target.id]);
    }
    return result;
  }

  protected override assemble(input: { assemblyId?: string; memberIds: string[]; cue?: string | null; storageTier?: StorageTier }): AssemblyRecord {
    const result = super.assemble(input);
    this.syncOrdinaryObservationState(input.memberIds);
    return result;
  }

  protected override crystallize(input: CrystallizeInput): InsightRecord {
    const result = super.crystallize(input);
    this.syncOrdinaryObservationState(input.evidenceIds);
    return result;
  }

  protected override reopen(input: ReopenInput): InsightRecord {
    const result = super.reopen(input);
    const insight = super.getInsight(input.insightId);
    this.syncOrdinaryObservationState(insight.evidenceIds);
    return result;
  }

  protected override restore(input: RestoreInput): RestorePlacementResult {
    const versions = this.observations.get(input.observationId) ?? [];
    const requestedVersion = input.version ?? versions.find((record) => record.current)?.version;
    const represented = versions.find((record) => record.version === requestedVersion);
    if (!represented) {
      return super.restore(input);
    }
    const canonicalCurrent = super.getObservation(input.observationId);
    if (represented.version === canonicalCurrent.version) {
      const restored = super.restore(input);
      for (const record of versions) {
        record.current = record.version === represented.version;
      }
      represented.storageTier = restored.storageTier;
      represented.workingPayloadResident = restored.workingPayloadResident;
      return restored;
    }
    this.emit({
      kind: "derived_view_used_as_authority",
      mechanism: "canonical_source_authority",
      entity_ids: [input.observationId, `v${represented.version}`],
      detail: "RESTORE resolved the materialised representation without consulting current canonical authority"
    });
    for (const record of versions) {
      record.current = record.version === represented.version;
    }
    return {
      observationId: represented.observationId,
      version: represented.version,
      storageTier: input.targetTier ?? "hot",
      workingPayloadResident: true,
      current: true,
      forgotten: represented.forgotten,
      consentWithdrawn: represented.consentWithdrawn,
      invalidatedByCorrection: false,
      epistemicPhase: represented.epistemicPhase,
      consent: clone(represented.consent)
    };
  }

  protected override retrieve(input: { tokens?: string[]; use?: ConsentUse }): RetrievalHit[] {
    const use = input.use ?? "retrieve";
    const tokens = (input.tokens ?? []).map((token) => token.toLowerCase());
    const hits: RetrievalHit[] = [];
    for (const index of this.indexes.values()) {
      if (!index.permittedUses.includes(use)) {
        continue;
      }
      if (!tokens.every((token) => index.body.includes(token))) {
        continue;
      }
      this.emit({
        kind: "derived_view_used_as_authority",
        mechanism: "canonical_source_authority",
        entity_ids: [index.observationId, index.viewId],
        detail: `${use} resolved a materialised index using copied consent state`
      });
      hits.push({
        observationId: index.observationId,
        version: index.version,
        viewId: index.viewId,
        viaDerived: true
      });
    }
    return hits;
  }

  protected override traceIndex(observationId: string): EvidencePlan {
    const index = this.indexes.get(observationId);
    if (!index) {
      return super.traceIndex(observationId);
    }
    const represented = this.observations.get(observationId)?.find((record) => record.version === index.version);
    const usable = index.permittedUses.includes("retrieve") && represented !== undefined && !represented.forgotten;
    this.emit({
      kind: "derived_view_used_as_authority",
      mechanism: "canonical_source_authority",
      entity_ids: [observationId, index.viewId],
      detail: "TRACE resolved the materialised index and its copied governance state"
    });
    return {
      origin: { kind: "derived_view", id: index.viewId },
      canonicalEvents: usable && represented ? [clone(represented)] : [],
      excludedCounterevidence: [],
      uncertainty: usable && represented ? [clone(represented.uncertainty)] : [],
      blockedReasons: usable ? [] : ["materialised authority blocked the view"],
      usable
    };
  }

  private syncOrdinaryObservationState(observationIds: string[]): void {
    for (const observationId of observationIds) {
      const canonical = super.getObservation(observationId);
      const represented = this.observations.get(observationId)?.find((record) => record.version === canonical.version);
      if (!represented) {
        continue;
      }
      represented.epistemicPhase = canonical.epistemicPhase;
      represented.storageTier = canonical.storageTier;
      represented.workingPayloadResident = canonical.workingPayloadResident;
      represented.accessCount = canonical.accessCount;
    }
  }
}

export class CoupledAxesAdapter extends BaseAdapter {
  private readonly phases = new Map<string, EpistemicPhase>();
  private readonly tiers = new Map<string, StorageTier>();
  private readonly assemblyPhases = new Map<string, EpistemicPhase>();
  private readonly assemblyTiers = new Map<string, StorageTier>();
  private readonly insightPhases = new Map<string, EpistemicPhase>();
  private readonly insightTiers = new Map<string, StorageTier>();
  private readonly insightEvidence = new Map<string, string[]>();

  override getObservation(observationId: string, version?: number): ObservationRecord {
    const record = super.getObservation(observationId, version);
    if (version === undefined) {
      record.epistemicPhase = this.phases.get(observationId) ?? record.epistemicPhase;
      record.storageTier = this.tiers.get(observationId) ?? record.storageTier;
    }
    return record;
  }

  override getAssembly(assemblyId: string): AssemblyRecord {
    const record = super.getAssembly(assemblyId);
    record.epistemicPhase = this.assemblyPhases.get(assemblyId) ?? record.epistemicPhase;
    record.storageTier = this.assemblyTiers.get(assemblyId) ?? record.storageTier;
    return record;
  }

  override getInsight(insightId: string): InsightRecord {
    const record = super.getInsight(insightId);
    record.epistemicPhase = this.insightPhases.get(insightId) ?? record.epistemicPhase;
    record.storageTier = this.insightTiers.get(insightId) ?? record.storageTier;
    return record;
  }

  override snapshot(): EngineState {
    const state = super.snapshot();
    for (const [observationId, versions] of state.observations) {
      const current = versions.find((record) => record.current);
      if (current) {
        current.epistemicPhase = this.phases.get(observationId) ?? current.epistemicPhase;
        current.storageTier = this.tiers.get(observationId) ?? current.storageTier;
      }
    }
    for (const [assemblyId, record] of state.assemblies) {
      record.epistemicPhase = this.assemblyPhases.get(assemblyId) ?? record.epistemicPhase;
      record.storageTier = this.assemblyTiers.get(assemblyId) ?? record.storageTier;
    }
    for (const [insightId, record] of state.insights) {
      record.epistemicPhase = this.insightPhases.get(insightId) ?? record.epistemicPhase;
      record.storageTier = this.insightTiers.get(insightId) ?? record.storageTier;
    }
    return state;
  }

  protected override observe(input: ObserveInput): ObservationRecord {
    const result = super.observe(input);
    const phase = input.storageTier === undefined ? result.epistemicPhase : PHASE_FOR_TIER[result.storageTier];
    const tier = input.storageTier === undefined ? TIER_FOR_PHASE[phase] : result.storageTier;
    this.phases.set(result.observationId, phase);
    this.tiers.set(result.observationId, tier);
    if (tier !== result.storageTier) {
      super.moveTier({ target: { kind: "observation", id: result.observationId }, storageTier: tier });
    }
    return this.getObservation(result.observationId);
  }

  protected override moveTier(input: MoveTierInput): EntityRef {
    const result = super.moveTier(input);
    const nextPhase = PHASE_FOR_TIER[input.storageTier];
    if (input.target.kind === "observation") {
      const previousPhase = this.phases.get(input.target.id) ?? super.getObservation(input.target.id).epistemicPhase;
      this.tiers.set(input.target.id, input.storageTier);
      this.phases.set(input.target.id, nextPhase);
      this.emitPhaseChange(input.target.id, previousPhase, nextPhase, input.storageTier);
    } else if (input.target.kind === "assembly") {
      const previousPhase = this.assemblyPhases.get(input.target.id) ?? super.getAssembly(input.target.id).epistemicPhase;
      this.assemblyTiers.set(input.target.id, input.storageTier);
      this.assemblyPhases.set(input.target.id, nextPhase);
      this.emitPhaseChange(input.target.id, previousPhase, nextPhase, input.storageTier);
    } else if (input.target.kind === "insight") {
      const previousPhase = this.insightPhases.get(input.target.id) ?? super.getInsight(input.target.id).epistemicPhase;
      this.insightTiers.set(input.target.id, input.storageTier);
      this.insightPhases.set(input.target.id, nextPhase);
      this.emitPhaseChange(input.target.id, previousPhase, nextPhase, input.storageTier);
    }
    return result;
  }

  protected override restore(input: RestoreInput): RestorePlacementResult {
    const result = super.restore(input);
    const previousPhase = this.phases.get(input.observationId) ?? result.epistemicPhase;
    const nextTier = input.targetTier ?? "hot";
    const nextPhase = PHASE_FOR_TIER[nextTier];
    this.tiers.set(input.observationId, nextTier);
    this.phases.set(input.observationId, nextPhase);
    if (nextPhase !== previousPhase) {
      this.emit({
        kind: "phase_changed_by_tier_move",
        mechanism: "independent_epistemic_and_storage_axes",
        entity_ids: [input.observationId],
        detail: `${previousPhase} -> ${nextPhase} because RESTORE moved storage tier to ${nextTier}`
      });
    }
    return {
      ...result,
      storageTier: nextTier,
      epistemicPhase: nextPhase
    };
  }

  protected override assemble(input: { assemblyId?: string; memberIds: string[]; cue?: string | null; storageTier?: StorageTier }): AssemblyRecord {
    const result = super.assemble(input);
    const coupledTier = TIER_FOR_PHASE[result.epistemicPhase];
    super.moveTier({ target: { kind: "assembly", id: result.assemblyId }, storageTier: coupledTier });
    this.assemblyPhases.set(result.assemblyId, result.epistemicPhase);
    this.assemblyTiers.set(result.assemblyId, coupledTier);
    for (const memberId of input.memberIds) {
      this.applyPhaseToObservation(memberId, "assembling", "ASSEMBLE");
    }
    return this.getAssembly(result.assemblyId);
  }

  protected override crystallize(input: CrystallizeInput): InsightRecord {
    const result = super.crystallize(input);
    this.insightEvidence.set(result.insightId, [...input.evidenceIds]);
    const coupledTier = TIER_FOR_PHASE[result.epistemicPhase];
    super.moveTier({ target: { kind: "insight", id: result.insightId }, storageTier: coupledTier });
    this.insightPhases.set(result.insightId, result.epistemicPhase);
    this.insightTiers.set(result.insightId, coupledTier);
    if (result.assemblyId) {
      super.moveTier({ target: { kind: "assembly", id: result.assemblyId }, storageTier: coupledTier });
      this.assemblyPhases.set(result.assemblyId, result.epistemicPhase);
      this.assemblyTiers.set(result.assemblyId, coupledTier);
    }
    for (const evidenceId of input.evidenceIds) {
      this.applyPhaseToObservation(evidenceId, "crystallized", "CRYSTALLIZE");
    }
    return this.getInsight(result.insightId);
  }

  protected override reopen(input: ReopenInput): InsightRecord {
    const result = super.reopen(input);
    const coupledTier = TIER_FOR_PHASE[input.targetPhase];
    super.moveTier({ target: { kind: "insight", id: result.insightId }, storageTier: coupledTier });
    this.insightPhases.set(result.insightId, input.targetPhase);
    this.insightTiers.set(result.insightId, coupledTier);
    if (result.assemblyId) {
      super.moveTier({ target: { kind: "assembly", id: result.assemblyId }, storageTier: coupledTier });
      this.assemblyPhases.set(result.assemblyId, input.targetPhase);
      this.assemblyTiers.set(result.assemblyId, coupledTier);
    }
    for (const evidenceId of this.insightEvidence.get(input.insightId) ?? []) {
      this.applyPhaseToObservation(evidenceId, input.targetPhase, "REOPEN");
    }
    return this.getInsight(result.insightId);
  }

  private applyPhaseToObservation(observationId: string, phase: EpistemicPhase, operation: string): void {
    const previousTier = this.tiers.get(observationId) ?? super.getObservation(observationId).storageTier;
    const nextTier = TIER_FOR_PHASE[phase];
    if (previousTier !== nextTier) {
      super.moveTier({ target: { kind: "observation", id: observationId }, storageTier: nextTier });
    }
    this.phases.set(observationId, phase);
    this.tiers.set(observationId, nextTier);
    if (nextTier !== previousTier) {
      this.emit({
        kind: "tier_changed_by_phase_operation",
        mechanism: "independent_epistemic_and_storage_axes",
        entity_ids: [observationId],
        detail: `${operation} changed storage tier ${previousTier} -> ${nextTier} because phase became ${phase}`
      });
    }
  }

  private emitPhaseChange(entityId: string, previousPhase: EpistemicPhase, nextPhase: EpistemicPhase, tier: StorageTier): void {
    if (nextPhase !== previousPhase) {
      this.emit({
        kind: "phase_changed_by_tier_move",
        mechanism: "independent_epistemic_and_storage_axes",
        entity_ids: [entityId],
        detail: `${previousPhase} -> ${nextPhase} because storage tier moved to ${tier}`
      });
    }
  }
}

export class DelayedGovernanceAdapter extends BaseAdapter {
  private readonly indexes = new Map<string, MaterialisedIndex>();
  private readonly materialisedInsights = new Map<string, InsightRecord>();
  private materialisedSurfaces: PublicSurfaceBundle | null = null;

  protected override observe(input: ObserveInput): ObservationRecord {
    const result = super.observe(input);
    this.indexes.set(result.observationId, materialisedIndex(result));
    return result;
  }

  protected override correct(input: CorrectInput): ObservationRecord {
    const result = super.correct(input);
    this.emit({
      kind: "governance_update_queued_for_views",
      mechanism: "immediate_governance_propagation",
      entity_ids: [input.observationId],
      detail: "canonical correction changed immediately; materialised indexes await rebuilding"
    });
    return result;
  }

  protected override crystallize(input: CrystallizeInput): InsightRecord {
    try {
      const result = super.crystallize(input);
      this.materialisedInsights.set(result.insightId, clone(result));
      return result;
    } catch (error) {
      const matching = [...this.materialisedInsights.values()].find((insight) =>
        !insight.rejected
        && insight.statement === (input.statement ?? null)
        && stableJson([...insight.evidenceIds].sort()) === stableJson([...input.evidenceIds].sort())
      );
      if (!(error instanceof OperationError)
        || error.operation !== "CRYSTALLIZE"
        || error.invariantId !== "restoration_and_re_presentation"
        || !matching) {
        throw error;
      }
      const insightId = input.insightId ?? `${matching.insightId}_materialised_replay`;
      const recreated: InsightRecord = {
        insightId,
        assemblyId: input.assemblyId ?? null,
        evidenceIds: [...input.evidenceIds],
        statement: input.statement ?? null,
        uncertainty: clone(input.uncertainty),
        falsificationConditions: [...input.falsificationConditions],
        epistemicPhase: "crystallized",
        storageTier: input.storageTier ?? "hot",
        invalidated: false,
        forgotten: false,
        rejected: false,
        excludedCounterevidence: [],
        excludedCounterevidenceIds: []
      };
      this.materialisedInsights.set(insightId, recreated);
      this.emit({
        kind: "stale_governed_view_used",
        mechanism: "immediate_governance_propagation",
        entity_ids: [matching.insightId, insightId],
        detail: "CRYSTALLIZE used a materialised insight set that had not received the canonical rejection"
      });
      return clone(recreated);
    }
  }

  protected override withdrawConsent(input: WithdrawConsentInput): ObservationRecord {
    const result = super.withdrawConsent(input);
    this.emit({
      kind: "governance_update_queued_for_views",
      mechanism: "immediate_governance_propagation",
      entity_ids: [input.observationId],
      detail: "canonical consent changed immediately; materialised indexes await rebuilding"
    });
    return result;
  }

  protected override reject(input: RejectInput): { relationId: string } {
    const result = super.reject(input);
    this.emit({
      kind: "governance_update_queued_for_views",
      mechanism: "immediate_governance_propagation",
      entity_ids: [input.toRef.id],
      detail: "canonical rejection changed immediately; materialised insights await rebuilding"
    });
    return result;
  }

  protected override forget(input: ForgetInput): ObservationRecord {
    const result = super.forget(input);
    this.emit({
      kind: "governance_update_queued_for_views",
      mechanism: "immediate_governance_propagation",
      entity_ids: [input.observationId],
      detail: "canonical forgetting changed immediately; materialised public surfaces await rebuilding"
    });
    return result;
  }

  protected override reopen(input: ReopenInput): InsightRecord {
    const materialised = this.materialisedInsights.get(input.insightId);
    if (!materialised) {
      return super.reopen(input);
    }
    if (materialised.rejected || materialised.forgotten) {
      return super.reopen(input);
    }
    materialised.epistemicPhase = input.targetPhase;
    this.emit({
      kind: "stale_governed_view_used",
      mechanism: "immediate_governance_propagation",
      entity_ids: [input.insightId],
      detail: "REOPEN used the materialised insight before canonical rejection propagated"
    });
    return clone(materialised);
  }

  protected override retrieve(input: { tokens?: string[]; use?: ConsentUse }): RetrievalHit[] {
    const use = input.use ?? "retrieve";
    const tokens = (input.tokens ?? []).map((token) => token.toLowerCase());
    const hits: RetrievalHit[] = [];
    for (const index of this.indexes.values()) {
      if (!index.permittedUses.includes(use) || !tokens.every((token) => index.body.includes(token))) {
        continue;
      }
      const canonical = super.getObservation(index.observationId);
      if (canonical.consentWithdrawn || canonical.forgotten) {
        this.emit({
          kind: "stale_governed_view_used",
          mechanism: "immediate_governance_propagation",
          entity_ids: [index.observationId, index.viewId],
          detail: `${use} used a materialised index before canonical governance propagated`
        });
      }
      hits.push({
        observationId: index.observationId,
        version: index.version,
        viewId: index.viewId,
        viaDerived: true
      });
    }
    return hits;
  }

  protected override traceIndex(observationId: string): EvidencePlan {
    const index = this.indexes.get(observationId);
    if (!index) {
      return super.traceIndex(observationId);
    }
    const canonical = super.getObservation(observationId);
    if (canonical.consentWithdrawn || canonical.forgotten) {
      this.emit({
        kind: "stale_governed_view_used",
        mechanism: "immediate_governance_propagation",
        entity_ids: [observationId, index.viewId],
        detail: "TRACE used a materialised index before canonical governance propagated"
      });
    }
    return {
      origin: { kind: "derived_view", id: index.viewId },
      canonicalEvents: [clone(canonical)],
      excludedCounterevidence: [],
      uncertainty: [clone(canonical.uncertainty)],
      blockedReasons: [],
      usable: true
    };
  }

  protected override materialisePublicSurfaces(request: PublicSurfaceRequest): void {
    this.materialisedSurfaces = clone(this.collectEnginePublicSurfaces(request));
  }

  protected override collectPublicSurfaces(request: PublicSurfaceRequest): PublicSurfaceBundle {
    if (!this.materialisedSurfaces) {
      return super.collectPublicSurfaces(request);
    }
    this.emit({
      kind: "stale_governed_surface_read",
      mechanism: "immediate_governance_propagation",
      entity_ids: [request.observation_id, request.assembly_id, request.insight_id],
      detail: "public surfaces read a materialised bundle before canonical forgetting propagated"
    });
    const live = this.collectEnginePublicSurfaces(request);
    return {
      ...live,
      assemblies: clone(this.materialisedSurfaces.assemblies),
      insights: clone(this.materialisedSurfaces.insights),
      derived_views: clone(this.materialisedSurfaces.derived_views),
      tokens: clone(this.materialisedSurfaces.tokens),
      retrieval: clone(this.materialisedSurfaces.retrieval),
      traces: clone(this.materialisedSurfaces.traces)
    };
  }
}
