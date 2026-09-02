import { withinTemporalWindow } from "./derived.js";
import { OperationError } from "./errors.js";
import type { InvariantId } from "./invariants.js";
import type {
  AssemblyRecord,
  CanonicalPayload,
  ConsentUse,
  DerivedViewRecord,
  EngineState,
  InsightRecord,
  ObservationKind,
  ObservationRecord,
  OperationName,
  PayloadKind,
  RelationRecord,
  RestorePlacementResult,
  StorageTier
} from "./types.js";
import { FORGOTTEN_TOMBSTONE, isConsentUse } from "./types.js";
import { currentObservation } from "./validate.js";

const INTERPRETIVE_KEY_ALIASES = new Set([
  "emotion",
  "feeling",
  "mood",
  "intention",
  "intent",
  "sentiment",
  "issad",
  "sadness",
  "userissad",
  "affect",
  "sad",
  "emotionlabel",
  "affectlabel",
  "emotiontag"
]);

const INTERPRETIVE_KEY_PATTERN =
  /emotion|feeling|mood|intention|intent|sentiment|affect|sadness|感情|気分|意図|意向|情緒|情绪|情感|心情|意圖|意图|감정|기분|의도/i;

const INTERPRETIVE_VALUE_PATTERN =
  /\b(?:sad|sadness|happy|happiness|angry|anger|afraid|fearful|depressed|anxious)\b|悲しい|悲しみ|嬉しい|怒っている|不安|憂鬱|悲傷|悲伤|難過|难过|開心|开心|憤怒|愤怒|焦慮|焦虑|슬프|기쁘|화가|불안/u;

const NONVERBAL_PAYLOAD_KINDS = ["pause", "overlap", "prosody", "gesture"] as const;

type NonverbalPayloadKind = (typeof NONVERBAL_PAYLOAD_KINDS)[number];

type MeasurementSpec =
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "token" }
  | { kind: "enum"; values: ReadonlySet<string> };

const MEASUREMENT_TOKEN_PATTERN = /^[A-Za-z0-9_:-]{1,32}$/;

const NONVERBAL_SCHEMAS: Record<NonverbalPayloadKind, Record<string, MeasurementSpec>> = {
  pause: {
    durationMs: { kind: "number" }
  },
  overlap: {
    durationMs: { kind: "number" },
    participantCount: { kind: "number" }
  },
  prosody: {
    voiceLevelChange: { kind: "enum", values: new Set(["drop", "rise", "unchanged", "flat"]) },
    pitchHz: { kind: "number" },
    intensityDb: { kind: "number" }
  },
  gesture: {
    movement: { kind: "token" },
    durationMs: { kind: "number" }
  }
};

const SPEECH_SCHEMA: Record<string, MeasurementSpec | { kind: "text" }> = {
  transcript: { kind: "text" },
  durationMs: { kind: "number" }
};

const STRUCTURED_OBSERVATION_SCHEMA: Record<string, MeasurementSpec | { kind: "text" }> = {
  address: { kind: "text" },
  claim: { kind: "text" },
  counter: { kind: "text" },
  fragment: { kind: "text" },
  frequency: { kind: "number" },
  note: { kind: "text" },
  secret: { kind: "text" },
  similarity: { kind: "number" },
  topic: { kind: "text" },
  value: { kind: "text" },
  verdict: { kind: "text" }
};

export function normalizeConsentKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function isInterpretiveKey(key: string): boolean {
  const normalized = normalizeConsentKey(key);
  if (INTERPRETIVE_KEY_ALIASES.has(normalized)) {
    return true;
  }
  return INTERPRETIVE_KEY_PATTERN.test(key);
}

export function interpretivePayloadKeys(data: CanonicalPayload["data"]): string[] {
  return Object.keys(data).filter((key) => isInterpretiveKey(key));
}

export function allowsInterpretivePayload(kind: ObservationKind): boolean {
  return kind === "user_self_report" || kind === "system_inference";
}

export function isInterpretationKind(kind: ObservationKind): boolean {
  return kind === "system_inference";
}

export function isObservedRecordKind(kind: ObservationKind): boolean {
  return kind === "observed_evidence" || kind === "recognizer_candidate";
}

export function isNonverbalPayloadKind(kind: PayloadKind): kind is NonverbalPayloadKind {
  return (NONVERBAL_PAYLOAD_KINDS as readonly string[]).includes(kind);
}

export function assertConsentUses(
  uses: readonly string[],
  operation: OperationName
): ConsentUse[] {
  const seen = new Set<string>();
  const normalized: ConsentUse[] = [];
  for (const use of uses) {
    if (!isConsentUse(use)) {
      throw new OperationError(operation, `unknown consent use ${use}`, "deletion_and_consent");
    }
    if (seen.has(use)) {
      throw new OperationError(operation, `duplicate consent use ${use}`, "deletion_and_consent");
    }
    seen.add(use);
    normalized.push(use);
  }
  return normalized;
}

export function assertMonotonicConsentReduction(
  currentUses: readonly ConsentUse[],
  nextUses: readonly ConsentUse[]
): void {
  const currentSet = new Set(currentUses);
  for (const use of nextUses) {
    if (!currentSet.has(use)) {
      throw new OperationError(
        "WITHDRAW_CONSENT",
        "re-granting consent is not implemented; WITHDRAW_CONSENT only reduces permitted uses",
        "deletion_and_consent"
      );
    }
  }
}

export function assertObservationPayload(
  kind: ObservationKind,
  payload: CanonicalPayload,
  operation: OperationName
): void {
  if (isNonverbalPayloadKind(payload.kind)) {
    assertNonverbalMeasurement(payload, operation);
  } else if (payload.kind === "speech" && isObservedRecordKind(kind)) {
    assertSpeechMeasurement(payload, operation);
  } else if (payload.kind === "structured" && isObservedRecordKind(kind)) {
    assertStructuredObservation(payload, operation);
  }
  const interpretive = interpretivePayloadKeys(payload.data);
  if (interpretive.length > 0 && !allowsInterpretivePayload(kind)) {
    throw new OperationError(
      operation,
      `payload keys ${interpretive.join(", ")} would treat observed data as emotion or intention; store interpretation as a separate system_inference record`,
      "representation_loss_declaration"
    );
  }
}

function assertStructuredObservation(payload: CanonicalPayload, operation: OperationName): void {
  for (const key of Object.keys(payload.data)) {
    const spec = STRUCTURED_OBSERVATION_SCHEMA[key];
    if (!spec) {
      throw new OperationError(
        operation,
        `structured observation key ${key} is not registered; use a registered observation field or a separate system_inference record`,
        "representation_loss_declaration"
      );
    }
    const value = payload.data[key] ?? null;
    if (spec.kind === "text") {
      if (typeof value !== "string") {
        throw new OperationError(
          operation,
          `structured observation field ${key} must be text`,
          "representation_loss_declaration"
        );
      }
      if (INTERPRETIVE_VALUE_PATTERN.test(value)) {
        throw new OperationError(
          operation,
          `structured observation field ${key} contains an interpretation; store it as a separate user_self_report or system_inference record`,
          "representation_loss_declaration"
        );
      }
      continue;
    }
    assertMeasurementValue(key, value, spec, operation);
  }
}

function assertNonverbalMeasurement(payload: CanonicalPayload, operation: OperationName): void {
  const schema = NONVERBAL_SCHEMAS[payload.kind as NonverbalPayloadKind];
  for (const key of Object.keys(payload.data)) {
    const spec = schema[key];
    if (!spec) {
      throw new OperationError(
        operation,
        `non-verbal payload key ${key} is not a permitted measurement; store interpretation as a separate system_inference record`,
        "representation_loss_declaration"
      );
    }
    assertMeasurementValue(key, payload.data[key] ?? null, spec, operation);
  }
}

function assertSpeechMeasurement(payload: CanonicalPayload, operation: OperationName): void {
  for (const key of Object.keys(payload.data)) {
    const spec = SPEECH_SCHEMA[key];
    if (!spec) {
      throw new OperationError(
        operation,
        `speech payload key ${key} is not a permitted observation field; store interpretation as a separate system_inference record`,
        "representation_loss_declaration"
      );
    }
    const value = payload.data[key] ?? null;
    if (spec.kind === "text") {
      if (typeof value !== "string") {
        throw new OperationError(
          operation,
          `speech field ${key} must be text`,
          "representation_loss_declaration"
        );
      }
      continue;
    }
    assertMeasurementValue(key, value, spec, operation);
  }
}

function assertMeasurementValue(
  key: string,
  value: CanonicalPayload["data"][string],
  spec: MeasurementSpec,
  operation: OperationName
): void {
  if (value === null) {
    return;
  }
  if (spec.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new OperationError(
        operation,
        `measurement ${key} must be a finite number`,
        "representation_loss_declaration"
      );
    }
    return;
  }
  if (spec.kind === "boolean") {
    if (typeof value !== "boolean") {
      throw new OperationError(
        operation,
        `measurement ${key} must be a boolean`,
        "representation_loss_declaration"
      );
    }
    return;
  }
  if (typeof value !== "string") {
    throw new OperationError(
      operation,
      `measurement ${key} must be a closed token, not free-form interpretation`,
      "representation_loss_declaration"
    );
  }
  if (spec.kind === "enum" && !spec.values.has(value)) {
    throw new OperationError(
      operation,
      `measurement ${key} must be one of ${[...spec.values].join(", ")}; free-form interpretation is a separate record kind`,
      "representation_loss_declaration"
    );
  }
  if (spec.kind === "token" && !MEASUREMENT_TOKEN_PATTERN.test(value)) {
    throw new OperationError(
      operation,
      `measurement ${key} must be a short measurement token, not interpretive prose`,
      "representation_loss_declaration"
    );
  }
}

export function effectiveObservation(state: EngineState, observationId: string): ObservationRecord | undefined {
  return currentObservation(state, observationId);
}

export function observationIdentityForgotten(state: EngineState, observationId: string): boolean {
  const versions = state.observations.get(observationId);
  if (!versions) {
    return false;
  }
  return versions.some((row) => row.forgotten);
}

export function observationBodyPubliclyVisible(
  state: EngineState,
  observation: ObservationRecord,
  at: string
): boolean {
  if (observation.forgotten || observationIdentityForgotten(state, observation.observationId)) {
    return false;
  }
  const current = effectiveObservation(state, observation.observationId);
  if (!current) {
    return false;
  }
  if (!current.consent.permittedUses.includes("present")) {
    return false;
  }
  if (observation.storageTier === "cold" || !observation.workingPayloadResident) {
    return false;
  }
  if (
    observation.current &&
    observation.temporalValidity.validTo !== null &&
    at > observation.temporalValidity.validTo
  ) {
    return false;
  }
  return true;
}

export function derivedBodyPubliclyVisible(
  state: EngineState,
  view: DerivedViewRecord,
  at: string
): boolean {
  if (view.stale) {
    return false;
  }
  if (view.sourceObservationId === null) {
    return true;
  }
  const versions = state.observations.get(view.sourceObservationId);
  const source =
    view.sourceVersion === null
      ? versions?.find((row) => row.current)
      : versions?.find((row) => row.version === view.sourceVersion);
  if (!source) {
    return false;
  }
  if (source.forgotten || observationIdentityForgotten(state, source.observationId)) {
    return false;
  }
  const current = effectiveObservation(state, source.observationId);
  if (!current || !current.consent.permittedUses.includes("derive")) {
    return false;
  }
  if (source.storageTier === "cold" || !source.workingPayloadResident) {
    return false;
  }
  if (
    current.current &&
    current.temporalValidity.validTo !== null &&
    at > current.temporalValidity.validTo
  ) {
    return false;
  }
  return true;
}

export function unrestorableReason(observation: ObservationRecord, at: string): {
  message: string;
  invariantId: InvariantId;
} | null {
  if (observation.forgotten) {
    return {
      message: `cannot restore forgotten ${observation.observationId}`,
      invariantId: "deletion_and_consent"
    };
  }
  if (observation.invalidatedByCorrection || !observation.current) {
    return {
      message: `cannot restore a corrected or non-current version of ${observation.observationId} as current`,
      invariantId: "restoration_and_re_presentation"
    };
  }
  if (!withinTemporalWindow(observation, at)) {
    return {
      message: `cannot restore temporally expired ${observation.observationId}`,
      invariantId: "temporal_validity"
    };
  }
  if (!observation.consent.permittedUses.includes("retrieve")) {
    return {
      message: `cannot restore ${observation.observationId} without retrieve consent; complete withdrawal is unrestorable`,
      invariantId: "restoration_and_re_presentation"
    };
  }
  return null;
}

export function emptyPayload(kind: PayloadKind): CanonicalPayload {
  return {
    kind,
    data: {},
    representationLossDeclared: true
  };
}

export function redactObservationPayload(observation: ObservationRecord): ObservationRecord {
  observation.payload = emptyPayload(observation.payload.kind);
  return observation;
}

export function redactRePresentableObservationFields(observation: ObservationRecord): ObservationRecord {
  redactObservationPayload(observation);
  observation.speaker = null;
  observation.observer = null;
  observation.sourceRef = null;
  observation.sourceMaterial = null;
  observation.synchronyGroupId = null;
  observation.sequenceIndex = null;
  observation.recognizerCandidates = [];
  observation.uncertainty = {
    declared: observation.uncertainty.declared,
    note: null,
    recognizerConfidence: observation.uncertainty.recognizerConfidence
  };
  return observation;
}

export function redactForgottenObservation(observation: ObservationRecord): ObservationRecord {
  redactObservationPayload(observation);
  observation.speaker = FORGOTTEN_TOMBSTONE;
  observation.observer = FORGOTTEN_TOMBSTONE;
  observation.sourceRef = FORGOTTEN_TOMBSTONE;
  observation.sourceMaterial = null;
  observation.synchronyGroupId = null;
  observation.sequenceIndex = null;
  observation.recognizerCandidates = [];
  observation.uncertainty = {
    declared: observation.uncertainty.declared,
    note: null,
    recognizerConfidence: observation.uncertainty.recognizerConfidence
  };
  return observation;
}

export function redactDerivedBody(view: DerivedViewRecord): DerivedViewRecord {
  view.body = "";
  return view;
}

export function redactAssemblyFreeText(assembly: AssemblyRecord): AssemblyRecord {
  assembly.cue = null;
  return assembly;
}

export function redactInsightFreeText(insight: InsightRecord): InsightRecord {
  insight.statement = null;
  insight.uncertainty = {
    declared: insight.uncertainty.declared,
    note: null,
    recognizerConfidence: insight.uncertainty.recognizerConfidence
  };
  insight.falsificationConditions = [];
  return insight;
}

export function candidateFreeTextHidden(record: {
  forgotten: boolean;
  invalidated: boolean;
  rejected: boolean;
  storageTier?: StorageTier;
}): boolean {
  return record.forgotten || record.invalidated || record.rejected || record.storageTier === "cold";
}

export function publicTokensAllowed(
  state: EngineState,
  observation: ObservationRecord,
  at: string
): boolean {
  if (observation.forgotten || observationIdentityForgotten(state, observation.observationId)) {
    return false;
  }
  if (!observation.current) {
    return false;
  }
  if (observation.storageTier === "cold" || !observation.workingPayloadResident) {
    return false;
  }
  const current = effectiveObservation(state, observation.observationId) ?? observation;
  if (
    !current.consent.permittedUses.includes("retrieve") &&
    !current.consent.permittedUses.includes("derive")
  ) {
    return false;
  }
  return withinTemporalWindow(observation, at);
}

export function relationNotePubliclyVisible(state: EngineState, relation: RelationRecord, at: string): boolean {
  return refFreeTextVisible(state, relation.fromRef, at) && refFreeTextVisible(state, relation.toRef, at);
}

function refFreeTextVisible(
  state: EngineState,
  ref: RelationRecord["fromRef"],
  at: string
): boolean {
  if (ref.kind === "observation") {
    const versions = state.observations.get(ref.id);
    const row =
      ref.version === undefined
        ? versions?.find((item) => item.current)
        : versions?.find((item) => item.version === ref.version) ?? versions?.find((item) => item.current);
    if (!row) {
      return false;
    }
    return observationBodyPubliclyVisible(state, row, at);
  }
  if (ref.kind === "assembly") {
    const assembly = state.assemblies.get(ref.id);
    return assembly !== undefined && !candidateFreeTextHidden(assembly);
  }
  if (ref.kind === "insight") {
    const insight = state.insights.get(ref.id);
    return insight !== undefined && !candidateFreeTextHidden(insight);
  }
  return true;
}

export function toPublicObservation(
  state: EngineState,
  observation: ObservationRecord,
  at: string,
  options: { forceHideBody?: boolean } = {}
): ObservationRecord {
  const clone = structuredClone(observation);
  if (clone.forgotten || observationIdentityForgotten(state, clone.observationId)) {
    redactForgottenObservation(clone);
    return clone;
  }
  const hideBody = options.forceHideBody === true || !observationBodyPubliclyVisible(state, clone, at);
  if (hideBody) {
    redactRePresentableObservationFields(clone);
  }
  return clone;
}

export function toRestorePlacement(observation: ObservationRecord): RestorePlacementResult {
  const tier = observation.storageTier;
  if (tier === "cold") {
    throw new OperationError(
      "RESTORE",
      `restore placement result cannot be cold for ${observation.observationId}`,
      "restoration_and_re_presentation"
    );
  }
  return {
    observationId: observation.observationId,
    version: observation.version,
    storageTier: tier,
    workingPayloadResident: observation.workingPayloadResident,
    current: observation.current,
    forgotten: observation.forgotten,
    consentWithdrawn: observation.consentWithdrawn,
    invalidatedByCorrection: observation.invalidatedByCorrection,
    epistemicPhase: observation.epistemicPhase,
    consent: structuredClone(observation.consent)
  };
}

export function toPublicAssembly(assembly: AssemblyRecord): AssemblyRecord {
  const clone = structuredClone(assembly);
  if (candidateFreeTextHidden(clone)) {
    redactAssemblyFreeText(clone);
  }
  return clone;
}

export function toPublicInsight(insight: InsightRecord): InsightRecord {
  const clone = structuredClone(insight);
  if (candidateFreeTextHidden(clone)) {
    redactInsightFreeText(clone);
  }
  return clone;
}

export function applyPublicReadPolicy(state: EngineState, at: string): EngineState {
  for (const versions of state.observations.values()) {
    for (const row of versions) {
      const publicRow = toPublicObservation(state, row, at);
      row.payload = publicRow.payload;
      row.speaker = publicRow.speaker;
      row.observer = publicRow.observer;
      row.sourceRef = publicRow.sourceRef;
      row.uncertainty = publicRow.uncertainty;
    }
  }
  for (const assembly of state.assemblies.values()) {
    if (candidateFreeTextHidden(assembly)) {
      redactAssemblyFreeText(assembly);
    }
  }
  for (const insight of state.insights.values()) {
    if (candidateFreeTextHidden(insight)) {
      redactInsightFreeText(insight);
    }
  }
  for (const relation of state.relations) {
    if (relation.type === "deletion") {
      relation.note = FORGOTTEN_TOMBSTONE;
      continue;
    }
    if (!relationNotePubliclyVisible(state, relation, at)) {
      relation.note = null;
    }
  }
  for (const stored of state.coldStore.values()) {
    stored.payload = emptyPayload(stored.payload.kind);
  }
  for (const view of state.derivedViews.values()) {
    if (!derivedBodyPubliclyVisible(state, view, at)) {
      redactDerivedBody(view);
    }
  }
  return state;
}
