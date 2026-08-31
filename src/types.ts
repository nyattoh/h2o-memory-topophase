import type { InvariantId } from "./invariants.js";

export type IsoTime = string;

export type EpistemicPhase = "dispersed" | "assembling" | "crystallized";
export type StorageTier = "hot" | "warm" | "cold";

export type ObservationKind =
  | "observed_evidence"
  | "recognizer_candidate"
  | "user_self_report"
  | "system_inference";

export type PayloadKind =
  | "speech"
  | "pause"
  | "overlap"
  | "prosody"
  | "gesture"
  | "structured"
  | "other";

export const CONSENT_USES = ["retrieve", "present", "share", "derive", "assemble"] as const;

export type ConsentUse = (typeof CONSENT_USES)[number];

export function isConsentUse(value: string): value is ConsentUse {
  return (CONSENT_USES as readonly string[]).includes(value);
}

/**
 * Tuple-level uniqueness for WITHDRAW_CONSENT.
 * Open `ConsentUse[]` stays assignable; `as const` duplicate tuples become `never`.
 */
export type UniqueConsentUses<T extends readonly ConsentUse[]> = T extends readonly [
  infer First extends ConsentUse,
  ...infer Rest extends readonly ConsentUse[]
]
  ? First extends Rest[number]
    ? never
    : readonly [First, ...UniqueConsentUses<Rest>]
  : T;

export type RelationType =
  | "correction"
  | "rejection"
  | "consent_withdrawal"
  | "deletion"
  | "derivation"
  | "simultaneity"
  | "branch"
  | "contradiction"
  | "potential_falsifier"
  | "cue";

export type DerivedKind = "text" | "summary" | "vector" | "graph" | "token" | "search_index";

export type OperationName =
  | "OBSERVE"
  | "RELATE"
  | "ASSEMBLE"
  | "CRYSTALLIZE"
  | "REOPEN"
  | "MOVE_TIER"
  | "CORRECT"
  | "WITHDRAW_CONSENT"
  | "FORGET"
  | "TRACE"
  | "RESTORE"
  | "REJECT";

export type EntityKind = "observation" | "assembly" | "insight" | "derived_view" | "relation";

export interface EntityRef {
  kind: EntityKind;
  id: string;
  version?: number;
}

export interface TemporalRange {
  start: IsoTime;
  end: IsoTime;
}

export interface TemporalValidity {
  validFrom: IsoTime;
  validTo: IsoTime | null;
}

export interface ConsentScope {
  permittedUses: ConsentUse[];
}

export const FORGOTTEN_TOMBSTONE = "<forgotten>";

export interface UncertaintyRecord {
  declared: boolean;
  note: string | null;
  recognizerConfidence: number | null;
}

export interface CanonicalPayload {
  kind: PayloadKind;
  data: Record<string, string | number | boolean | null>;
  representationLossDeclared: boolean;
}

export interface ObservationRecord {
  observationId: string;
  version: number;
  kind: ObservationKind;
  payload: CanonicalPayload;
  occurrenceTime: IsoTime;
  timeSpan: TemporalRange | null;
  temporalValidity: TemporalValidity;
  speaker: string | null;
  observer: string | null;
  sourceRef: string | null;
  consent: ConsentScope;
  uncertainty: UncertaintyRecord;
  /** Derived from assembly and insight candidates that still reference this observation. */
  epistemicPhase: EpistemicPhase;
  storageTier: StorageTier;
  current: boolean;
  forgotten: boolean;
  consentWithdrawn: boolean;
  invalidatedByCorrection: boolean;
  workingPayloadResident: boolean;
  accessCount: number;
}

export interface RelationRecord {
  relationId: string;
  type: RelationType;
  fromRef: EntityRef;
  toRef: EntityRef;
  note: string | null;
}

export interface AssemblyRecord {
  assemblyId: string;
  memberIds: string[];
  cue: string | null;
  epistemicPhase: EpistemicPhase;
  storageTier: StorageTier;
  invalidated: boolean;
  forgotten: boolean;
  rejected: boolean;
}

export interface InsightRecord {
  insightId: string;
  assemblyId: string | null;
  evidenceIds: string[];
  statement: string | null;
  uncertainty: UncertaintyRecord;
  falsificationConditions: string[];
  epistemicPhase: EpistemicPhase;
  storageTier: StorageTier;
  invalidated: boolean;
  forgotten: boolean;
  rejected: boolean;
  /** Version-pinned counterevidence. TRACE and internal records use these refs. */
  excludedCounterevidence: EntityRef[];
  /** Compatibility projection of pinned counterevidence IDs. Not used to resolve versions. */
  excludedCounterevidenceIds: string[];
}

export interface DerivedViewRecord {
  viewId: string;
  kind: DerivedKind;
  sourceObservationId: string | null;
  sourceVersion: number | null;
  sourceRefs: EntityRef[];
  body: string;
  stale: boolean;
  representationLossDeclared: true;
}

export interface ColdRecord {
  observationId: string;
  version: number;
  payload: CanonicalPayload;
}

export interface AuditEntry {
  auditId: string;
  operation: OperationName;
  at: IsoTime;
  entityRefs: EntityRef[];
  summary: string;
}

export interface EvidencePlan {
  origin: EntityRef;
  canonicalEvents: ObservationRecord[];
  excludedCounterevidence: ObservationRecord[];
  uncertainty: UncertaintyRecord[];
  blockedReasons: string[];
  usable: boolean;
}

export interface RetrievalHit {
  observationId: string;
  version: number;
  viewId: string | null;
  viaDerived: boolean;
}

/**
 * Placement-only result of RESTORE. Does not include re-presentable user content.
 * Body reads go through public observation APIs after restore.
 */
export interface RestorePlacementResult {
  observationId: string;
  version: number;
  storageTier: Exclude<StorageTier, "cold">;
  workingPayloadResident: boolean;
  current: boolean;
  forgotten: boolean;
  consentWithdrawn: boolean;
  invalidatedByCorrection: boolean;
  epistemicPhase: EpistemicPhase;
  consent: ConsentScope;
}

export interface EngineState {
  observations: Map<string, ObservationRecord[]>;
  relations: RelationRecord[];
  assemblies: Map<string, AssemblyRecord>;
  insights: Map<string, InsightRecord>;
  derivedViews: Map<string, DerivedViewRecord>;
  coldStore: Map<string, ColdRecord>;
  audit: AuditEntry[];
}

export interface Clock {
  now(): IsoTime;
}

export interface IdFactory {
  next(prefix: string): string;
}

export type FailurePoint =
  | "mid_correct_after_new_version"
  | "mid_observe_after_insert"
  | "mid_crystallize_after_insert"
  | "before_commit";

export interface ObserveInput {
  observationId?: string;
  kind: ObservationKind;
  payload: CanonicalPayload;
  occurrenceTime?: IsoTime;
  timeSpan?: TemporalRange | null;
  temporalValidity?: Partial<TemporalValidity>;
  speaker?: string | null;
  observer?: string | null;
  sourceRef?: string | null;
  consent?: ConsentScope;
  uncertainty?: Partial<UncertaintyRecord>;
  epistemicPhase?: EpistemicPhase;
  storageTier?: StorageTier;
}

export interface RelateInput {
  type: RelationType;
  fromRef: EntityRef;
  toRef: EntityRef;
  note?: string | null;
}

export interface AssembleInput {
  assemblyId?: string;
  memberIds: string[];
  cue?: string | null;
  storageTier?: StorageTier;
}

export type ExcludedCounterevidenceInput = string | EntityRef;

export interface CrystallizeInput {
  insightId?: string;
  assemblyId?: string | null;
  evidenceIds: string[];
  statement?: string | null;
  uncertainty: UncertaintyRecord;
  falsificationConditions: string[];
  /**
   * Compatibility input. String IDs are pinned to the current version at CRYSTALLIZE.
   * Entity refs keep an explicit version when provided.
   */
  excludedCounterevidenceIds?: readonly ExcludedCounterevidenceInput[];
  /** Versioned excluded counterevidence. Preferred over string IDs. */
  excludedCounterevidence?: readonly EntityRef[];
  storageTier?: StorageTier;
}

export interface ReopenInput {
  insightId: string;
  targetPhase: "assembling" | "dispersed";
}

export interface MoveTierInput {
  target: EntityRef;
  storageTier: StorageTier;
}

export interface CorrectInput {
  observationId: string;
  payload: CanonicalPayload;
  uncertainty?: Partial<UncertaintyRecord>;
  note?: string | null;
}

export interface WithdrawConsentInput<U extends readonly ConsentUse[] = ConsentUse[]> {
  observationId: string;
  permittedUses: UniqueConsentUses<U> extends never ? never : U;
}

export interface ForgetInput {
  observationId: string;
  note?: string | null;
}

export interface TraceInput {
  from: EntityRef;
}

export interface RestoreInput {
  observationId: string;
  version?: number;
  targetTier?: Exclude<StorageTier, "cold">;
}

export interface RejectInput {
  fromRef: EntityRef;
  toRef: EntityRef;
  note?: string | null;
}

export interface RetrieveInput {
  tokens?: string[];
  use?: ConsentUse;
}

export interface OperationFailure {
  operation: OperationName;
  message: string;
  invariantId?: InvariantId;
}

export const DEFAULT_CONSENT_USES: ConsentUse[] = [...CONSENT_USES];
