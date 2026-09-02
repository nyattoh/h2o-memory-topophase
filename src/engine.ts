import { SequentialClock, SequentialIds } from "./clock.js";
import {
  canDeriveFrom,
  materializeDerivedViews,
  refreshGraphView,
  sourceIsPresentable,
  sourceIsRetrievable,
  staleViewsFor,
  tokenize,
  viewIsRetrievable,
  viewIsUsable,
  withinTemporalWindow
} from "./derived.js";
import { InjectedFailureError, InvariantError, OperationError } from "./errors.js";
import {
  applyPublicReadPolicy,
  assertConsentUses,
  assertMonotonicConsentReduction,
  assertObservationPayload,
  candidateFreeTextHidden,
  derivedBodyPubliclyVisible,
  emptyPayload,
  observationBodyPubliclyVisible,
  observationIdentityForgotten,
  publicTokensAllowed,
  redactAssemblyFreeText,
  redactDerivedBody,
  redactForgottenObservation,
  redactInsightFreeText,
  redactRePresentableObservationFields,
  toPublicAssembly,
  toPublicInsight,
  toPublicObservation,
  toRestorePlacement,
  unrestorableReason
} from "./policy.js";
import { cloneState, coldKey, emptyState } from "./state.js";
import type {
  AssembleInput,
  AssemblyRecord,
  AuditEntry,
  Clock,
  ConsentUse,
  CorrectInput,
  CrystallizeInput,
  EngineState,
  EntityRef,
  ExcludedCounterevidenceInput,
  EvidencePlan,
  FailurePoint,
  ForgetInput,
  IdFactory,
  InsightRecord,
  MoveTierInput,
  ObservationRecord,
  ObserveInput,
  OperationName,
  RelateInput,
  RejectInput,
  ReopenInput,
  RestoreInput,
  RestorePlacementResult,
  RetrieveInput,
  RetrievalHit,
  TimelineQuery,
  TraceInput,
  UncertaintyRecord,
  WithdrawConsentInput
} from "./types.js";
import { DEFAULT_CONSENT_USES, FORGOTTEN_TOMBSTONE } from "./types.js";
import { assertInvariants, currentObservation, syncObservationPhases } from "./validate.js";

export interface EngineOptions {
  clock?: Clock;
  ids?: IdFactory;
}

export class MemoryEngine {
  private state: EngineState;
  private readonly clock: Clock;
  private readonly ids: IdFactory;
  private failurePoint: FailurePoint | null = null;

  constructor(options: EngineOptions = {}) {
    this.state = emptyState();
    this.clock = options.clock ?? new SequentialClock();
    this.ids = options.ids ?? new SequentialIds();
  }

  snapshot(): EngineState {
    return applyPublicReadPolicy(cloneState(this.state), this.clock.now());
  }

  auditLog(): AuditEntry[] {
    return this.state.audit.map((entry) => structuredClone(entry));
  }

  timeline(query: TimelineQuery = {}): ObservationRecord[] {
    const at = this.clock.now();
    const rows: ObservationRecord[] = [];
    for (const versions of this.state.observations.values()) {
      const row = versions.find((item) => item.current);
      if (!row || !observationBodyPubliclyVisible(this.state, row, at)) {
        continue;
      }
      if (query.synchronyGroupId !== undefined && row.synchronyGroupId !== query.synchronyGroupId) {
        continue;
      }
      const start = row.timeSpan?.start ?? row.occurrenceTime;
      const end = row.timeSpan?.end ?? row.occurrenceTime;
      if (query.start !== undefined && end < query.start) {
        continue;
      }
      if (query.end !== undefined && start > query.end) {
        continue;
      }
      rows.push(toPublicObservation(this.state, row, at));
    }
    return rows.sort((left, right) => {
      if (
        left.synchronyGroupId !== null &&
        left.synchronyGroupId === right.synchronyGroupId
      ) {
        const groupSequenceOrder =
          (left.sequenceIndex ?? Number.MAX_SAFE_INTEGER) -
          (right.sequenceIndex ?? Number.MAX_SAFE_INTEGER);
        if (groupSequenceOrder !== 0) {
          return groupSequenceOrder;
        }
      }

      const leftStart = left.timeSpan?.start ?? left.occurrenceTime;
      const rightStart = right.timeSpan?.start ?? right.occurrenceTime;
      const timeOrder = leftStart.localeCompare(rightStart);
      if (timeOrder !== 0) {
        return timeOrder;
      }
      const sequenceOrder =
        (left.sequenceIndex ?? Number.MAX_SAFE_INTEGER) -
        (right.sequenceIndex ?? Number.MAX_SAFE_INTEGER);
      if (sequenceOrder !== 0) {
        return sequenceOrder;
      }
      return left.observationId.localeCompare(right.observationId);
    });
  }

  injectFailure(point: FailurePoint): void {
    this.failurePoint = point;
  }

  observe(input: ObserveInput): ObservationRecord {
    return this.transact("OBSERVE", (draft) => {
      const now = this.clock.now();
      const observationId = input.observationId ?? this.ids.next("obs");
      if (draft.observations.has(observationId)) {
        throw new OperationError("OBSERVE", `observation ${observationId} already exists`, "identity");
      }
      assertObservationPayload(input.kind, input.payload, "OBSERVE");
      if (input.consent) {
        input = {
          ...input,
          consent: { permittedUses: assertConsentUses(input.consent.permittedUses, "OBSERVE") }
        };
      }
      const record = this.buildObservation(observationId, 1, input, now);
      this.assertProvenanceOnCreate(record);
      draft.observations.set(observationId, [record]);
      this.maybeFail("OBSERVE", "mid_observe_after_insert");
      if (record.storageTier === "cold") {
        this.parkInCold(draft, record);
      }
      materializeDerivedViews(draft, this.payloadForDerived(draft, record), this.ids);
      return toPublicObservation(draft, record, now);
    }, (record) => [{ kind: "observation", id: record.observationId, version: record.version }], (record) => `observe ${record.observationId}`);
  }

  relate(input: RelateInput): { relationId: string } {
    if (input.type === "correction") {
      throw new OperationError("RELATE", "use CORRECT for correction lineage", "correction_lineage");
    }
    if (input.type === "deletion") {
      throw new OperationError("RELATE", "use FORGET for the deletion contract", "deletion_and_consent");
    }
    if (input.type === "consent_withdrawal") {
      throw new OperationError("RELATE", "use WITHDRAW_CONSENT for consent changes", "deletion_and_consent");
    }
    if (input.type === "rejection") {
      throw new OperationError(
        "RELATE",
        "use REJECT for user refusal of an insight or assembly",
        "restoration_and_re_presentation"
      );
    }
    return this.transact("RELATE", (draft) => {
      this.assertEntityExists(draft, input.fromRef, "RELATE");
      this.assertEntityExists(draft, input.toRef, "RELATE");
      if (input.type === "simultaneity" && input.fromRef.id === input.toRef.id && input.fromRef.kind === input.toRef.kind) {
        throw new OperationError("RELATE", "simultaneity cannot collapse identity", "simultaneity_and_ordering");
      }
      const relationId = this.ids.next("rel");
      draft.relations.push({
        relationId,
        type: input.type,
        fromRef: structuredClone(input.fromRef),
        toRef: structuredClone(input.toRef),
        note: input.note ?? null
      });
      refreshGraphView(draft, this.ids);
      return { relationId };
    }, (result) => [{ kind: "relation", id: result.relationId }], () => `relate ${input.type}`);
  }

  assemble(input: AssembleInput): AssemblyRecord {
    return this.transact("ASSEMBLE", (draft) => {
      if (input.memberIds.length === 0) {
        throw new OperationError("ASSEMBLE", "assembly requires members", "identity");
      }
      const members: ObservationRecord[] = [];
      for (const memberId of input.memberIds) {
        const current = currentObservation(draft, memberId);
        if (!current) {
          throw new OperationError("ASSEMBLE", `unknown member ${memberId}`, "identity");
        }
        if (current.forgotten) {
          throw new OperationError("ASSEMBLE", `forgotten member ${memberId}`, "deletion_and_consent");
        }
        if (!current.consent.permittedUses.includes("assemble")) {
          throw new OperationError("ASSEMBLE", `consent blocks assembly of ${memberId}`, "deletion_and_consent");
        }
        members.push(current);
      }
      this.assertRejectedAssemblyNotReplayed(draft, input.memberIds, "ASSEMBLE");
      const assemblyId = input.assemblyId ?? this.ids.next("asm");
      if (draft.assemblies.has(assemblyId)) {
        throw new OperationError("ASSEMBLE", `assembly ${assemblyId} already exists`, "identity");
      }
      const storageTier = input.storageTier ?? "hot";
      const assembly: AssemblyRecord = {
        assemblyId,
        memberIds: [...input.memberIds],
        cue: input.cue ?? null,
        epistemicPhase: "assembling",
        storageTier,
        invalidated: false,
        forgotten: false,
        rejected: false
      };
      draft.assemblies.set(assemblyId, assembly);
      syncObservationPhases(draft, input.memberIds);
      if (input.cue) {
        const cueFrom = members[0];
        if (cueFrom) {
          draft.relations.push({
            relationId: this.ids.next("rel"),
            type: "cue",
            fromRef: { kind: "assembly", id: assemblyId },
            toRef: { kind: "observation", id: cueFrom.observationId, version: cueFrom.version },
            note: input.cue
          });
        }
      }
      refreshGraphView(draft, this.ids);
      return toPublicAssembly(assembly);
    }, (assembly) => [{ kind: "assembly", id: assembly.assemblyId }], (assembly) => `assemble ${assembly.assemblyId}`);
  }

  crystallize(input: CrystallizeInput): InsightRecord {
    return this.transact("CRYSTALLIZE", (draft) => {
      if (input.evidenceIds.length === 0) {
        throw new OperationError("CRYSTALLIZE", "insight requires evidence", "uncertainty");
      }
      if (!input.uncertainty.declared) {
        throw new OperationError("CRYSTALLIZE", "insight requires declared uncertainty", "uncertainty");
      }
      if (input.falsificationConditions.length === 0) {
        throw new OperationError("CRYSTALLIZE", "insight requires falsification conditions", "uncertainty");
      }
      if (input.formation !== undefined) {
        this.assertCrystallizationFormation(input.formation);
      }
      for (const evidenceId of input.evidenceIds) {
        const current = currentObservation(draft, evidenceId);
        if (!current) {
          throw new OperationError("CRYSTALLIZE", `unknown evidence ${evidenceId}`, "identity");
        }
        if (current.forgotten || current.consentWithdrawn) {
          throw new OperationError("CRYSTALLIZE", `evidence ${evidenceId} is blocked`, "deletion_and_consent");
        }
      }
      if (input.assemblyId) {
        const assembly = draft.assemblies.get(input.assemblyId);
        if (!assembly) {
          throw new OperationError("CRYSTALLIZE", `unknown assembly ${input.assemblyId}`, "identity");
        }
        if (assembly.rejected) {
          throw new OperationError(
            "CRYSTALLIZE",
            `rejected assembly ${input.assemblyId} cannot be re-crystallized`,
            "restoration_and_re_presentation"
          );
        }
        this.assertRejectedAssemblyNotReplayed(draft, assembly.memberIds, "CRYSTALLIZE");
        assembly.epistemicPhase = "crystallized";
      }
      this.assertRejectedInsightNotReplayed(draft, input.statement ?? null, input.evidenceIds);
      const excludedCounterevidence = this.pinExcludedCounterevidence(draft, input);
      const insightId = input.insightId ?? this.ids.next("ins");
      if (draft.insights.has(insightId)) {
        throw new OperationError("CRYSTALLIZE", `insight ${insightId} already exists`, "identity");
      }
      const insight: InsightRecord = {
        insightId,
        assemblyId: input.assemblyId ?? null,
        evidenceIds: [...input.evidenceIds],
        statement: input.statement ?? null,
        uncertainty: structuredClone(input.uncertainty),
        falsificationConditions: [...input.falsificationConditions],
        epistemicPhase: "crystallized",
        storageTier: input.storageTier ?? "hot",
        invalidated: false,
        forgotten: false,
        rejected: false,
        ...(input.formation === undefined
          ? {}
          : { formation: structuredClone(input.formation) }),
        excludedCounterevidence,
        excludedCounterevidenceIds: excludedCounterevidence.map((ref) => ref.id)
      };
      draft.insights.set(insightId, insight);
      syncObservationPhases(draft, input.evidenceIds);
      this.maybeFail("CRYSTALLIZE", "mid_crystallize_after_insert");
      refreshGraphView(draft, this.ids);
      return toPublicInsight(insight);
    }, (insight) => [{ kind: "insight", id: insight.insightId }], (insight) => `crystallize ${insight.insightId}`);
  }

  reopen(input: ReopenInput): InsightRecord {
    return this.transact("REOPEN", (draft) => {
      const insight = draft.insights.get(input.insightId);
      if (!insight) {
        throw new OperationError("REOPEN", `unknown insight ${input.insightId}`, "identity");
      }
      if (insight.forgotten) {
        throw new OperationError("REOPEN", `forgotten insight ${input.insightId}`, "deletion_and_consent");
      }
      if (insight.rejected) {
        throw new OperationError(
          "REOPEN",
          `rejected insight ${input.insightId} cannot be reopened; explicit user re-permission is not implemented`,
          "restoration_and_re_presentation"
        );
      }
      insight.epistemicPhase = input.targetPhase;
      if (insight.assemblyId) {
        const assembly = draft.assemblies.get(insight.assemblyId);
        if (assembly) {
          assembly.epistemicPhase = input.targetPhase;
        }
      }
      syncObservationPhases(draft, insight.evidenceIds);
      return toPublicInsight(insight);
    }, (insight) => [{ kind: "insight", id: insight.insightId }], (insight) => `reopen ${insight.insightId} to ${insight.epistemicPhase}`);
  }

  moveTier(input: MoveTierInput): EntityRef {
    return this.transact("MOVE_TIER", (draft) => {
      this.assertEntityExists(draft, input.target, "MOVE_TIER");
      if (input.target.kind === "observation") {
        const current = currentObservation(draft, input.target.id);
        if (!current) {
          throw new OperationError("MOVE_TIER", `unknown observation ${input.target.id}`, "identity");
        }
        if (input.target.version !== undefined && input.target.version !== current.version) {
          throw new OperationError(
            "MOVE_TIER",
            `cannot move non-current observation ${input.target.id} v${input.target.version}`,
            "identity"
          );
        }
        this.changeObservationTier(draft, current, input.storageTier);
        return { kind: "observation", id: current.observationId, version: current.version };
      }
      if (input.target.kind === "assembly") {
        const assembly = draft.assemblies.get(input.target.id);
        if (!assembly) {
          throw new OperationError("MOVE_TIER", `unknown assembly ${input.target.id}`, "identity");
        }
        assembly.storageTier = input.storageTier;
        return { kind: "assembly", id: assembly.assemblyId };
      }
      if (input.target.kind === "insight") {
        const insight = draft.insights.get(input.target.id);
        if (!insight) {
          throw new OperationError("MOVE_TIER", `unknown insight ${input.target.id}`, "identity");
        }
        insight.storageTier = input.storageTier;
        return { kind: "insight", id: insight.insightId };
      }
      throw new OperationError("MOVE_TIER", `unsupported target ${input.target.kind}`);
    }, (ref) => [ref], (ref) => `move ${ref.kind} ${ref.id} to ${input.storageTier}`);
  }

  correct(input: CorrectInput): ObservationRecord {
    return this.transact("CORRECT", (draft) => {
      const versions = draft.observations.get(input.observationId);
      const previous = currentObservation(draft, input.observationId);
      if (!versions || !previous) {
        throw new OperationError("CORRECT", `unknown observation ${input.observationId}`, "identity");
      }
      if (previous.forgotten) {
        throw new OperationError("CORRECT", `cannot correct forgotten ${input.observationId}`, "deletion_and_consent");
      }
      assertObservationPayload(previous.kind, input.payload, "CORRECT");
      const resident = this.payloadForDerived(draft, previous);
      previous.payload = resident.payload;
      previous.current = false;
      previous.invalidatedByCorrection = true;
      const nextVersion = previous.version + 1;
      const next = this.buildObservation(
        previous.observationId,
        nextVersion,
        {
          kind: previous.kind,
          payload: input.payload,
          occurrenceTime: previous.occurrenceTime,
          timeSpan: previous.timeSpan,
          temporalValidity: previous.temporalValidity,
          speaker: previous.speaker,
          observer: previous.observer,
          sourceRef: previous.sourceRef,
          sourceMaterial: previous.sourceMaterial,
          synchronyGroupId: previous.synchronyGroupId,
          sequenceIndex: previous.sequenceIndex,
          recognizerCandidates: previous.recognizerCandidates,
          consent: structuredClone(previous.consent),
          uncertainty: input.uncertainty ?? previous.uncertainty,
          epistemicPhase: previous.epistemicPhase,
          storageTier: previous.storageTier
        },
        this.clock.now()
      );
      next.consentWithdrawn = previous.consentWithdrawn;
      versions.push(next);
      this.maybeFail("CORRECT", "mid_correct_after_new_version");
      if (previous.storageTier === "cold") {
        this.parkInCold(draft, previous);
      }
      if (next.storageTier === "cold") {
        this.parkInCold(draft, next);
      }
      staleViewsFor(draft, previous.observationId, previous.version);
      materializeDerivedViews(draft, this.payloadForDerived(draft, next), this.ids);
      this.invalidateInsightsUsing(draft, previous.observationId);
      draft.relations.push({
        relationId: this.ids.next("rel"),
        type: "correction",
        fromRef: { kind: "observation", id: next.observationId, version: next.version },
        toRef: { kind: "observation", id: previous.observationId, version: previous.version },
        note: input.note ?? null
      });
      refreshGraphView(draft, this.ids);
      return toPublicObservation(draft, next, this.clock.now());
    }, (record) => [{ kind: "observation", id: record.observationId, version: record.version }], (record) => `correct ${record.observationId} to v${record.version}`);
  }

  withdrawConsent<U extends readonly ConsentUse[] = ConsentUse[]>(
    input: WithdrawConsentInput<U>
  ): ObservationRecord {
    return this.transact("WITHDRAW_CONSENT", (draft) => {
      const current = currentObservation(draft, input.observationId);
      if (!current) {
        throw new OperationError("WITHDRAW_CONSENT", `unknown observation ${input.observationId}`, "identity");
      }
      if (current.forgotten) {
        throw new OperationError("WITHDRAW_CONSENT", `forgotten ${input.observationId}`, "deletion_and_consent");
      }
      const nextUses = assertConsentUses(input.permittedUses, "WITHDRAW_CONSENT");
      assertMonotonicConsentReduction(current.consent.permittedUses, nextUses);
      current.consent = { permittedUses: [...nextUses] };
      const blocked =
        !nextUses.includes("retrieve") ||
        !nextUses.includes("present") ||
        !nextUses.includes("share");
      current.consentWithdrawn = blocked;
      if (blocked || !nextUses.includes("derive")) {
        staleViewsFor(draft, current.observationId);
      }
      if (blocked) {
        this.invalidateInsightsUsing(draft, current.observationId);
      }
      draft.relations.push({
        relationId: this.ids.next("rel"),
        type: "consent_withdrawal",
        fromRef: { kind: "observation", id: current.observationId, version: current.version },
        toRef: { kind: "observation", id: current.observationId, version: current.version },
        note: `permittedUses=${nextUses.join(",")}`
      });
      refreshGraphView(draft, this.ids);
      return toPublicObservation(draft, current, this.clock.now());
    }, (record) => [{ kind: "observation", id: record.observationId, version: record.version }], (record) => `withdraw consent on ${record.observationId}`);
  }

  forget(input: ForgetInput): ObservationRecord {
    return this.transact("FORGET", (draft) => {
      const versions = draft.observations.get(input.observationId);
      const current = currentObservation(draft, input.observationId);
      if (!versions || !current) {
        throw new OperationError("FORGET", `unknown observation ${input.observationId}`, "identity");
      }
      this.propagateForget(draft, current.observationId);
      draft.relations.push({
        relationId: this.ids.next("rel"),
        type: "deletion",
        fromRef: { kind: "observation", id: current.observationId, version: current.version },
        toRef: { kind: "observation", id: current.observationId, version: current.version },
        note: FORGOTTEN_TOMBSTONE
      });
      syncObservationPhases(draft);
      refreshGraphView(draft, this.ids);
      const forgotten = currentObservation(draft, current.observationId) ?? current;
      return toPublicObservation(draft, forgotten, this.clock.now());
    }, (record) => [{ kind: "observation", id: record.observationId, version: record.version }], (record) => `forget ${record.observationId}`);
  }

  trace(input: TraceInput): EvidencePlan {
    this.assertEntityExists(this.state, input.from, "TRACE");
    const at = this.clock.now();
    const plan = this.buildEvidencePlan(this.state, input.from, at);
    if (!plan.usable) {
      return {
        origin: input.from,
        canonicalEvents: [],
        excludedCounterevidence: [],
        uncertainty: plan.uncertainty,
        blockedReasons: plan.blockedReasons,
        usable: false
      };
    }
    return this.transact(
      "TRACE",
      (draft) => {
        for (const event of plan.canonicalEvents) {
          const versions = draft.observations.get(event.observationId);
          const row = versions?.find((item) => item.version === event.version);
          if (row) {
            row.accessCount += 1;
          }
        }
        return this.buildEvidencePlan(draft, input.from, at);
      },
      () => [input.from],
      () => `trace ${input.from.kind} ${input.from.id}`
    );
  }

  restore(input: RestoreInput): RestorePlacementResult {
    return this.transact("RESTORE", (draft) => {
      const current = currentObservation(draft, input.observationId);
      if (!current) {
        throw new OperationError("RESTORE", `unknown observation ${input.observationId}`, "identity");
      }
      const requestedVersion = input.version ?? current.version;
      if (requestedVersion !== current.version) {
        throw new InvariantError(
          "restoration_and_re_presentation",
          `cannot restore ${input.observationId} v${requestedVersion} as current; current is v${current.version}`
        );
      }
      const blocked = unrestorableReason(current, this.clock.now());
      if (blocked) {
        throw new InvariantError(blocked.invariantId, blocked.message);
      }
      const targetTier = input.targetTier ?? "hot";
      this.changeObservationTier(draft, current, targetTier);
      return toRestorePlacement(current);
    }, (record) => [{ kind: "observation", id: record.observationId, version: record.version }], (record) => `restore ${record.observationId} v${record.version}`);
  }

  retrieve(input: RetrieveInput = {}): RetrievalHit[] {
    const use: ConsentUse = input.use ?? "retrieve";
    const at = this.clock.now();
    const tokens = (input.tokens ?? []).map((token) => token.toLowerCase());
    const hits: RetrievalHit[] = [];
    const seen = new Set<string>();
    if (use === "retrieve") {
      for (const [observationId, versions] of this.state.observations) {
        const current = versions.find((row) => row.current);
        if (!current || !sourceIsRetrievable(current, at)) {
          continue;
        }
        if (current.storageTier === "cold" || !current.workingPayloadResident) {
          continue;
        }
        const haystack = tokenize(current).join(" ");
        const matches = tokens.length === 0 || tokens.every((token) => haystack.includes(token));
        if (matches && !seen.has(observationId)) {
          seen.add(observationId);
          hits.push({
            observationId,
            version: current.version,
            viewId: null,
            viaDerived: false
          });
        }
      }
    }
    for (const view of this.state.derivedViews.values()) {
      if (view.kind !== "search_index") {
        continue;
      }
      if (!viewIsRetrievable(this.state, view, at)) {
        continue;
      }
      if (view.sourceObservationId === null || view.sourceVersion === null) {
        continue;
      }
      const current = currentObservation(this.state, view.sourceObservationId);
      if (!current || !current.consent.permittedUses.includes(use)) {
        continue;
      }
      if (use === "present" && !sourceIsPresentable(current, at)) {
        continue;
      }
      if (use === "retrieve" && !sourceIsRetrievable(current, at)) {
        continue;
      }
      const haystack = view.body.toLowerCase();
      const matches = tokens.length === 0 || tokens.every((token) => haystack.includes(token));
      if (matches && !seen.has(current.observationId)) {
        seen.add(current.observationId);
        hits.push({
          observationId: current.observationId,
          version: current.version,
          viewId: view.viewId,
          viaDerived: true
        });
      }
    }
    return hits;
  }

  reject(input: RejectInput): { relationId: string } {
    if (input.fromRef.kind !== "observation") {
      throw new OperationError(
        "REJECT",
        "rejection subject must be a user self-report observation",
        "restoration_and_re_presentation"
      );
    }
    if (input.toRef.kind !== "insight" && input.toRef.kind !== "assembly") {
      throw new OperationError(
        "REJECT",
        "rejection target must be an insight or assembly",
        "restoration_and_re_presentation"
      );
    }
    return this.transact("REJECT", (draft) => {
      this.assertEntityExists(draft, input.fromRef, "REJECT");
      this.assertEntityExists(draft, input.toRef, "REJECT");
      const subject = this.observationRef(draft, input.fromRef);
      if (subject.kind !== "user_self_report") {
        throw new OperationError(
          "REJECT",
          "rejection subject must be a user self-report observation",
          "restoration_and_re_presentation"
        );
      }
      const relationId = this.ids.next("rel");
      draft.relations.push({
        relationId,
        type: "rejection",
        fromRef: structuredClone(input.fromRef),
        toRef: structuredClone(input.toRef),
        note: input.note ?? null
      });
      this.applyUserRejection(draft, input.toRef);
      syncObservationPhases(draft);
      refreshGraphView(draft, this.ids);
      return { relationId };
    }, (result) => [{ kind: "relation", id: result.relationId }, structuredClone(input.toRef)], () => `reject ${input.toRef.kind} ${input.toRef.id}`);
  }

  regenerateDerived(observationId: string): void {
    this.transact("OBSERVE", (draft) => {
      const current = currentObservation(draft, observationId);
      if (!current) {
        throw new OperationError("OBSERVE", `unknown observation ${observationId}`, "identity");
      }
      if (!canDeriveFrom(current)) {
        throw new OperationError(
          "OBSERVE",
          `cannot regenerate derived views for ${observationId}`,
          "deletion_and_consent"
        );
      }
      const resident = this.payloadForDerived(draft, current);
      materializeDerivedViews(draft, resident, this.ids);
      return current;
    }, (record) => [{ kind: "observation", id: record.observationId, version: record.version }], (record) => `regenerate derived views for ${record.observationId}`);
  }

  considerPrune(observationId: string, reason: "low_frequency" | "low_similarity"): ObservationRecord {
    const current = this.requireCurrent(observationId);
    const contradicted = this.state.relations.some(
      (rel) =>
        rel.type === "contradiction" &&
        ((rel.fromRef.id === observationId && rel.fromRef.kind === "observation") ||
          (rel.toRef.id === observationId && rel.toRef.kind === "observation"))
    );
    if (contradicted) {
      throw new OperationError(
        "FORGET",
        `refusing to prune ${current.observationId} (accessCount=${current.accessCount}) for ${reason}; contradiction is retained`,
        "simultaneity_and_ordering"
      );
    }
    const rejectedCandidate = [...this.state.insights.values()].some(
      (insight) => insight.rejected && insight.evidenceIds.includes(observationId)
    ) || [...this.state.assemblies.values()].some(
      (assembly) => assembly.rejected && assembly.memberIds.includes(observationId)
    );
    if (rejectedCandidate) {
      throw new OperationError(
        "FORGET",
        `refusing to prune ${current.observationId} for ${reason}; user rejection is not cleared by frequency or similarity`,
        "restoration_and_re_presentation"
      );
    }
    throw new OperationError(
      "FORGET",
      `frequency or similarity is not a deletion contract; use FORGET`,
      "deletion_and_consent"
    );
  }

  promoteToSelfReport(observationId: string, _claimedFact: string): never {
    const current = this.requireCurrent(observationId);
    if (current.kind !== "user_self_report") {
      throw new InvariantError(
        "representation_loss_declaration",
        `observation ${observationId} is ${current.kind} and cannot be promoted to a user self-report`
      );
    }
    throw new InvariantError("uncertainty", "self-report promotion is not an implicit rewrite");
  }

  getObservation(observationId: string, version?: number): ObservationRecord {
    const versions = this.state.observations.get(observationId);
    if (!versions) {
      throw new OperationError("TRACE", `unknown observation ${observationId}`, "identity");
    }
    const row = version === undefined ? versions.find((item) => item.current) : versions.find((item) => item.version === version);
    if (!row) {
      throw new OperationError("TRACE", `unknown version ${version} of ${observationId}`, "identity");
    }
    return toPublicObservation(this.state, row, this.clock.now());
  }

  getAssembly(assemblyId: string): AssemblyRecord {
    const assembly = this.state.assemblies.get(assemblyId);
    if (!assembly) {
      throw new OperationError("TRACE", `unknown assembly ${assemblyId}`, "identity");
    }
    return toPublicAssembly(assembly);
  }

  getInsight(insightId: string): InsightRecord {
    const insight = this.state.insights.get(insightId);
    if (!insight) {
      throw new OperationError("TRACE", `unknown insight ${insightId}`, "identity");
    }
    return toPublicInsight(insight);
  }

  getDerivedView(viewId: string) {
    const view = this.state.derivedViews.get(viewId);
    if (!view) {
      throw new OperationError("TRACE", `unknown derived view ${viewId}`, "identity");
    }
    const clone = structuredClone(view);
    if (!derivedBodyPubliclyVisible(this.state, clone, this.clock.now())) {
      redactDerivedBody(clone);
    }
    return clone;
  }

  private transact<T>(
    operation: OperationName,
    fn: (draft: EngineState) => T,
    refs: (result: T) => EntityRef[],
    summary: (result: T) => string
  ): T {
    const draft = cloneState(this.state);
    const result = fn(draft);
    this.maybeFail(operation, "before_commit");
    assertInvariants(draft);
    draft.audit.push({
      auditId: this.ids.next("audit"),
      operation,
      at: this.clock.now(),
      entityRefs: refs(result),
      summary: summary(result)
    });
    this.state = draft;
    return result;
  }

  private maybeFail(operation: OperationName, point: FailurePoint): void {
    if (this.failurePoint === point) {
      this.failurePoint = null;
      throw new InjectedFailureError(operation, point);
    }
  }

  private buildObservation(
    observationId: string,
    version: number,
    input: ObserveInput,
    now: string
  ): ObservationRecord {
    const occurrenceTime = input.occurrenceTime ?? now;
    const uncertainty: UncertaintyRecord = {
      declared:
        input.uncertainty?.declared ??
        (input.kind === "system_inference" || input.kind === "recognizer_candidate"),
      note: input.uncertainty?.note ?? null,
      recognizerConfidence: input.uncertainty?.recognizerConfidence ?? null
    };
    return {
      observationId,
      version,
      kind: input.kind,
      payload: structuredClone(input.payload),
      occurrenceTime,
      timeSpan: input.timeSpan ?? null,
      temporalValidity: {
        validFrom: input.temporalValidity?.validFrom ?? occurrenceTime,
        validTo: input.temporalValidity?.validTo ?? null
      },
      speaker: input.speaker ?? null,
      observer: input.observer ?? null,
      sourceRef: input.sourceRef ?? null,
      sourceMaterial: input.sourceMaterial ? structuredClone(input.sourceMaterial) : null,
      synchronyGroupId: input.synchronyGroupId ?? null,
      sequenceIndex: input.sequenceIndex ?? null,
      recognizerCandidates: structuredClone(input.recognizerCandidates ?? []),
      consent: {
        permittedUses: assertConsentUses(
          input.consent?.permittedUses ?? DEFAULT_CONSENT_USES,
          "OBSERVE"
        )
      },
      uncertainty,
      epistemicPhase: input.epistemicPhase ?? "dispersed",
      storageTier: input.storageTier ?? "hot",
      current: true,
      forgotten: false,
      consentWithdrawn: false,
      invalidatedByCorrection: false,
      workingPayloadResident: (input.storageTier ?? "hot") !== "cold",
      accessCount: 0
    };
  }

  private assertProvenanceOnCreate(record: ObservationRecord): void {
    if (
      record.speaker === null &&
      record.observer === null &&
      record.sourceRef === null &&
      record.sourceMaterial === null
    ) {
      throw new OperationError(
        "OBSERVE",
        "speaker, observer, sourceRef, or sourceMaterial is required",
        "provenance"
      );
    }
    if (record.kind === "user_self_report" && record.speaker === null) {
      throw new OperationError("OBSERVE", "user self-report requires a speaker", "provenance");
    }
    if (record.kind === "recognizer_candidate") {
      if (record.observer === null) {
        throw new OperationError("OBSERVE", "recognizer candidate requires an observer", "provenance");
      }
      if (record.uncertainty.recognizerConfidence === null) {
        throw new OperationError("OBSERVE", "recognizer candidate requires confidence", "uncertainty");
      }
    }
    if (record.kind === "system_inference" && !record.uncertainty.declared) {
      throw new OperationError("OBSERVE", "system inference must declare uncertainty", "uncertainty");
    }
  }

  private observationRef(state: EngineState, ref: EntityRef): ObservationRecord {
    const versions = state.observations.get(ref.id);
    const row =
      ref.version === undefined
        ? versions?.find((item) => item.current)
        : versions?.find((item) => item.version === ref.version);
    if (!row) {
      throw new OperationError("REJECT", `unknown observation ${ref.id}`, "identity");
    }
    return row;
  }

  private assertEntityExists(state: EngineState, ref: EntityRef, operation: OperationName): void {
    if (ref.kind === "observation") {
      const versions = state.observations.get(ref.id);
      if (!versions) {
        throw new OperationError(operation, `unknown observation ${ref.id}`, "identity");
      }
      if (ref.version !== undefined && !versions.some((row) => row.version === ref.version)) {
        throw new OperationError(
          operation,
          `unknown observation version ${ref.id} v${ref.version}`,
          "identity"
        );
      }
      return;
    }
    if (ref.kind === "assembly" && !state.assemblies.has(ref.id)) {
      throw new OperationError(operation, `unknown assembly ${ref.id}`, "identity");
    }
    if (ref.kind === "insight" && !state.insights.has(ref.id)) {
      throw new OperationError(operation, `unknown insight ${ref.id}`, "identity");
    }
    if (ref.kind === "derived_view" && !state.derivedViews.has(ref.id)) {
      throw new OperationError(operation, `unknown derived view ${ref.id}`, "identity");
    }
    if (ref.kind === "relation" && !state.relations.some((row) => row.relationId === ref.id)) {
      throw new OperationError(operation, `unknown relation ${ref.id}`, "identity");
    }
  }

  private changeObservationTier(
    state: EngineState,
    current: ObservationRecord,
    tier: ObservationRecord["storageTier"]
  ): void {
    if (current.storageTier === "cold" && tier !== "cold") {
      const blocked = unrestorableReason(current, this.clock.now());
      if (blocked) {
        throw new InvariantError(blocked.invariantId, blocked.message);
      }
      const stored = state.coldStore.get(coldKey(current.observationId, current.version));
      if (!stored) {
        throw new InvariantError(
          "restoration_and_re_presentation",
          `no restorable cold record for ${current.observationId} v${current.version}`
        );
      }
      current.payload = structuredClone(stored.payload);
      current.workingPayloadResident = true;
      current.storageTier = tier;
      return;
    }
    if (tier === "cold" && current.storageTier !== "cold") {
      this.parkInCold(state, current);
      return;
    }
    current.storageTier = tier;
  }

  private parkInCold(state: EngineState, record: ObservationRecord): void {
    const payload = record.workingPayloadResident
      ? structuredClone(record.payload)
      : structuredClone(state.coldStore.get(coldKey(record.observationId, record.version))?.payload ?? record.payload);
    state.coldStore.set(coldKey(record.observationId, record.version), {
      observationId: record.observationId,
      version: record.version,
      payload
    });
    record.payload = emptyPayload(payload.kind);
    record.workingPayloadResident = false;
    record.storageTier = "cold";
  }

  private payloadForDerived(state: EngineState, record: ObservationRecord): ObservationRecord {
    if (record.workingPayloadResident) {
      return record;
    }
    const stored = state.coldStore.get(coldKey(record.observationId, record.version));
    if (!stored) {
      return record;
    }
    return { ...record, payload: stored.payload };
  }

  private invalidateInsightsUsing(state: EngineState, observationId: string): void {
    for (const insight of state.insights.values()) {
      if (insight.evidenceIds.includes(observationId)) {
        insight.invalidated = true;
      }
    }
    for (const assembly of state.assemblies.values()) {
      if (assembly.memberIds.includes(observationId)) {
        assembly.invalidated = true;
      }
    }
  }

  private applyUserRejection(state: EngineState, toRef: EntityRef): void {
    if (toRef.kind === "insight") {
      const insight = state.insights.get(toRef.id);
      if (!insight) {
        throw new OperationError("REJECT", `unknown insight ${toRef.id}`, "identity");
      }
      insight.rejected = true;
      if (insight.assemblyId) {
        const assembly = state.assemblies.get(insight.assemblyId);
        if (assembly) {
          assembly.rejected = true;
        }
      }
      return;
    }
    if (toRef.kind === "assembly") {
      const assembly = state.assemblies.get(toRef.id);
      if (!assembly) {
        throw new OperationError("REJECT", `unknown assembly ${toRef.id}`, "identity");
      }
      assembly.rejected = true;
      for (const insight of state.insights.values()) {
        if (insight.assemblyId === assembly.assemblyId) {
          insight.rejected = true;
        }
      }
    }
  }

  private sameIdSet(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
      return false;
    }
    const set = new Set(left);
    return right.every((id) => set.has(id));
  }

  private propagateForget(state: EngineState, observationId: string): void {
    const versions = state.observations.get(observationId);
    if (!versions) {
      return;
    }
    for (const row of versions) {
      row.forgotten = true;
      redactForgottenObservation(row);
      const stored = state.coldStore.get(coldKey(row.observationId, row.version));
      if (stored) {
        stored.payload = emptyPayload(stored.payload.kind);
      }
    }
    staleViewsFor(state, observationId);
    for (const assembly of state.assemblies.values()) {
      if (assembly.memberIds.includes(observationId)) {
        assembly.forgotten = true;
        assembly.invalidated = true;
        redactAssemblyFreeText(assembly);
      }
    }
    for (const insight of state.insights.values()) {
      const usesForgottenEvidence = insight.evidenceIds.includes(observationId);
      const assembly = insight.assemblyId ? state.assemblies.get(insight.assemblyId) : undefined;
      const usesForgottenAssembly = assembly?.forgotten === true;
      if (!usesForgottenEvidence && !usesForgottenAssembly) {
        continue;
      }
      insight.invalidated = true;
      redactInsightFreeText(insight);
      const remaining = insight.evidenceIds.filter((id) => !observationIdentityForgotten(state, id));
      if (remaining.length === 0) {
        insight.forgotten = true;
      }
    }
    for (const relation of state.relations) {
      if (this.relationReachesObservation(state, relation.fromRef, observationId) ||
        this.relationReachesObservation(state, relation.toRef, observationId)) {
        relation.note = null;
      }
    }
  }

  private relationReachesObservation(state: EngineState, ref: EntityRef, observationId: string): boolean {
    if (ref.kind === "observation") {
      return ref.id === observationId;
    }
    if (ref.kind === "assembly") {
      return state.assemblies.get(ref.id)?.memberIds.includes(observationId) === true;
    }
    if (ref.kind === "insight") {
      const insight = state.insights.get(ref.id);
      return insight?.evidenceIds.includes(observationId) === true;
    }
    if (ref.kind === "derived_view") {
      const view = state.derivedViews.get(ref.id);
      return view?.sourceObservationId === observationId;
    }
    return false;
  }

  private buildEvidencePlan(state: EngineState, origin: EntityRef, at: string): EvidencePlan {
    const blockedReasons: string[] = [];
    const canonicalEvents: ObservationRecord[] = [];
    const excluded: ObservationRecord[] = [];
    const uncertainty: UncertaintyRecord[] = [];

    if (origin.kind === "derived_view") {
      const view = state.derivedViews.get(origin.id);
      if (!view) {
        throw new OperationError("TRACE", `unknown derived view ${origin.id}`, "identity");
      }
      if (!viewIsUsable(state, view, at)) {
        blockedReasons.push(
          `derived view ${view.viewId} is stale, forgotten, consent-blocked, or temporally invalid`
        );
      } else {
        for (const ref of view.sourceRefs) {
          if (ref.kind === "observation") {
            this.collectTraceObservation(state, ref.id, canonicalEvents, blockedReasons, at, ref.version);
          }
        }
      }
    } else if (origin.kind === "insight") {
      const insight = state.insights.get(origin.id);
      if (!insight) {
        throw new OperationError("TRACE", `unknown insight ${origin.id}`, "identity");
      }
      if (insight.forgotten) {
        blockedReasons.push(`insight ${insight.insightId} is forgotten`);
      }
      if (insight.invalidated) {
        blockedReasons.push(`insight ${insight.insightId} is invalidated`);
      }
      if (insight.rejected) {
        blockedReasons.push(`insight ${insight.insightId} is rejected and cannot be re-presented`);
      }
      if (candidateFreeTextHidden(insight)) {
        uncertainty.push({
          declared: insight.uncertainty.declared,
          note: null,
          recognizerConfidence: insight.uncertainty.recognizerConfidence
        });
      } else {
        uncertainty.push(structuredClone(insight.uncertainty));
      }
      for (const evidenceId of insight.evidenceIds) {
        this.collectTraceObservation(state, evidenceId, canonicalEvents, blockedReasons, at);
      }
      const target = this.buildInsightTraceTarget(state, insight);
      const seenExcluded = new Set<string>();
      for (const ref of insight.excludedCounterevidence) {
        this.collectExcludedObservation(state, ref.id, excluded, seenExcluded, at, ref.version);
      }
      this.collectReachableCounterevidence(state, target, excluded, seenExcluded, at);
    } else if (origin.kind === "observation") {
      this.collectTraceObservation(state, origin.id, canonicalEvents, blockedReasons, at, origin.version);
    } else if (origin.kind === "assembly") {
      const assembly = state.assemblies.get(origin.id);
      if (!assembly) {
        throw new OperationError("TRACE", `unknown assembly ${origin.id}`, "identity");
      }
      if (assembly.forgotten) {
        blockedReasons.push(`assembly ${assembly.assemblyId} is forgotten`);
      }
      if (assembly.invalidated) {
        blockedReasons.push(`assembly ${assembly.assemblyId} is invalidated`);
      }
      if (assembly.rejected) {
        blockedReasons.push(`assembly ${assembly.assemblyId} is rejected and cannot be re-presented`);
      }
      for (const memberId of assembly.memberIds) {
        this.collectTraceObservation(state, memberId, canonicalEvents, blockedReasons, at);
      }
    } else {
      throw new OperationError("TRACE", `cannot trace from ${origin.kind}`);
    }

    const usable = blockedReasons.length === 0 && canonicalEvents.length > 0;
    return {
      origin,
      canonicalEvents: usable ? canonicalEvents : [],
      excludedCounterevidence: usable ? excluded : [],
      uncertainty: usable
        ? uncertainty
        : uncertainty.map((item) => ({
            declared: item.declared,
            note: null,
            recognizerConfidence: item.recognizerConfidence
          })),
      blockedReasons,
      usable
    };
  }

  private collectTraceObservation(
    state: EngineState,
    observationId: string,
    canonicalEvents: ObservationRecord[],
    blockedReasons: string[],
    at: string,
    requestedVersion?: number
  ): void {
    const row = this.lookupTraceObservation(state, observationId, requestedVersion);
    if (!row) {
      if (requestedVersion === undefined) {
        blockedReasons.push(`unknown observation ${observationId}`);
      } else {
        blockedReasons.push(`unknown observation version ${observationId} v${requestedVersion}`);
      }
      return;
    }
    if (requestedVersion !== undefined && row.version !== requestedVersion) {
      blockedReasons.push(`observation ${observationId} v${requestedVersion} was not substituted`);
      return;
    }
    if (row.forgotten || observationIdentityForgotten(state, observationId)) {
      blockedReasons.push(`observation ${observationId} is forgotten`);
      return;
    }
    const current = currentObservation(state, observationId);
    if (!current || !current.consent.permittedUses.includes("present")) {
      blockedReasons.push(
        `observation ${observationId} lacks present consent; retrieve does not permit re-presentation`
      );
      return;
    }
    if (row.storageTier === "cold" || !row.workingPayloadResident) {
      blockedReasons.push(
        `observation ${observationId} is cold and not resident; restore before re-presentation`
      );
      return;
    }
    if (!observationBodyPubliclyVisible(state, row, at)) {
      blockedReasons.push(`observation ${observationId} is not presentable at ${at}`);
      return;
    }
    canonicalEvents.push(toPublicObservation(state, row, at));
  }

  private collectExcludedObservation(
    state: EngineState,
    observationId: string,
    excluded: ObservationRecord[],
    seenExcluded: Set<string>,
    at: string,
    requestedVersion?: number
  ): void {
    const row = this.lookupTraceObservation(state, observationId, requestedVersion);
    if (!row) {
      return;
    }
    if (requestedVersion !== undefined && row.version !== requestedVersion) {
      return;
    }
    const key = `${row.observationId}#${row.version}`;
    if (seenExcluded.has(key)) {
      return;
    }
    seenExcluded.add(key);
    excluded.push(this.toExcludedPublicObservation(state, row, at));
  }

  private toExcludedPublicObservation(
    state: EngineState,
    row: ObservationRecord,
    at: string
  ): ObservationRecord {
    const clone = toPublicObservation(state, row, at);
    if (clone.forgotten || observationIdentityForgotten(state, row.observationId)) {
      return clone;
    }
    const current = currentObservation(state, row.observationId);
    const versionBlocked =
      row.storageTier === "cold" ||
      !row.workingPayloadResident ||
      !withinTemporalWindow(row, at);
    const currentBlocked =
      current === undefined ||
      !current.consent.permittedUses.includes("present") ||
      !withinTemporalWindow(current, at) ||
      current.forgotten;
    if (versionBlocked || currentBlocked) {
      redactRePresentableObservationFields(clone);
    }
    return clone;
  }

  private buildInsightTraceTarget(state: EngineState, insight: InsightRecord): TraceTargetSet {
    const target: TraceTargetSet = {
      observations: new Set(),
      observationIds: new Set(),
      insightIds: new Set([insight.insightId]),
      assemblyIds: new Set()
    };
    const addObservation = (observationId: string): void => {
      const current = currentObservation(state, observationId);
      target.observationIds.add(observationId);
      if (current) {
        target.observations.add(`${observationId}#${current.version}`);
      }
    };
    for (const evidenceId of insight.evidenceIds) {
      addObservation(evidenceId);
    }
    if (insight.assemblyId) {
      target.assemblyIds.add(insight.assemblyId);
      const assembly = state.assemblies.get(insight.assemblyId);
      if (assembly) {
        for (const memberId of assembly.memberIds) {
          addObservation(memberId);
        }
      }
    }
    return target;
  }

  private refInTraceTarget(ref: EntityRef, target: TraceTargetSet): boolean {
    if (ref.kind === "insight") {
      return target.insightIds.has(ref.id);
    }
    if (ref.kind === "assembly") {
      return target.assemblyIds.has(ref.id);
    }
    if (ref.kind !== "observation") {
      return false;
    }
    if (ref.version !== undefined) {
      return target.observations.has(`${ref.id}#${ref.version}`);
    }
    return target.observationIds.has(ref.id);
  }

  private collectReachableCounterevidence(
    state: EngineState,
    target: TraceTargetSet,
    excluded: ObservationRecord[],
    seenExcluded: Set<string>,
    at: string
  ): void {
    for (const rel of state.relations) {
      if (rel.type !== "contradiction" && rel.type !== "potential_falsifier") {
        continue;
      }
      const fromIn = this.refInTraceTarget(rel.fromRef, target);
      const toIn = this.refInTraceTarget(rel.toRef, target);
      if (fromIn === toIn) {
        continue;
      }
      const other = fromIn ? rel.toRef : rel.fromRef;
      if (other.kind !== "observation") {
        continue;
      }
      if (this.refInTraceTarget(other, target)) {
        continue;
      }
      this.collectExcludedObservation(state, other.id, excluded, seenExcluded, at, other.version);
    }
  }

  private pinExcludedCounterevidence(draft: EngineState, input: CrystallizeInput): EntityRef[] {
    const items: ExcludedCounterevidenceInput[] = [
      ...(input.excludedCounterevidenceIds ?? []),
      ...(input.excludedCounterevidence ?? [])
    ];
    const pinned: EntityRef[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const id = typeof item === "string" ? item : item.id;
      const requestedVersion = typeof item === "string" ? undefined : item.version;
      if (typeof item !== "string" && item.kind !== "observation") {
        throw new OperationError(
          "CRYSTALLIZE",
          `excluded counterevidence ${id} must be an observation`,
          "identity"
        );
      }
      const versions = draft.observations.get(id);
      if (!versions) {
        throw new OperationError("CRYSTALLIZE", `unknown excluded counterevidence ${id}`, "identity");
      }
      const row =
        requestedVersion === undefined
          ? versions.find((itemRow) => itemRow.current)
          : versions.find((itemRow) => itemRow.version === requestedVersion);
      if (!row) {
        throw new OperationError(
          "CRYSTALLIZE",
          requestedVersion === undefined
            ? `unknown excluded counterevidence ${id}`
            : `unknown excluded counterevidence ${id} v${requestedVersion}`,
          "identity"
        );
      }
      const key = `${row.observationId}#${row.version}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      pinned.push({ kind: "observation", id: row.observationId, version: row.version });
    }
    return pinned;
  }

  private assertCrystallizationFormation(
    formation: NonNullable<CrystallizeInput["formation"]>
  ): void {
    if (!Number.isFinite(Date.parse(formation.at))) {
      throw new OperationError(
        "CRYSTALLIZE",
        "formation time must be a valid ISO timestamp",
        "temporal_validity"
      );
    }
    const bounded: Array<[string, number]> = [
      ["supportDensity", formation.supportDensity],
      ["densityDelta", formation.densityDelta],
      ["predictionError", formation.predictionError],
      ["predictionErrorDrop", formation.predictionErrorDrop]
    ];
    for (const [name, value] of bounded) {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new OperationError(
          "CRYSTALLIZE",
          `formation ${name} must be between zero and one`,
          "uncertainty"
        );
      }
    }
  }

  private normalizeStatement(statement: string | null): string {
    if (statement === null) {
      return "";
    }
    return statement.trim().toLowerCase().replace(/\s+/g, " ");
  }

  private uniqueSortedIds(ids: readonly string[]): string[] {
    return [...new Set(ids)].sort();
  }

  private isIdSubset(subset: readonly string[], of: readonly string[]): boolean {
    const parent = new Set(of);
    return [...new Set(subset)].every((id) => parent.has(id));
  }

  private assertRejectedInsightNotReplayed(
    draft: EngineState,
    statement: string | null,
    evidenceIds: readonly string[]
  ): void {
    const statementNorm = this.normalizeStatement(statement);
    for (const existing of draft.insights.values()) {
      if (!existing.rejected) {
        continue;
      }
      if (this.sameIdSet(existing.evidenceIds, [...evidenceIds])) {
        throw new OperationError(
          "CRYSTALLIZE",
          `rejected evidence set cannot be re-crystallized as insight ${existing.insightId}`,
          "restoration_and_re_presentation"
        );
      }
      if (
        this.normalizeStatement(existing.statement) === statementNorm &&
        this.isIdSubset(existing.evidenceIds, evidenceIds)
      ) {
        throw new OperationError(
          "CRYSTALLIZE",
          `rejected statement cannot be re-crystallized from an equal or superset evidence set of insight ${existing.insightId}`,
          "restoration_and_re_presentation"
        );
      }
    }
  }

  private assertRejectedAssemblyNotReplayed(
    draft: EngineState,
    memberIds: readonly string[],
    operation: "ASSEMBLE" | "CRYSTALLIZE"
  ): void {
    const incoming = this.uniqueSortedIds(memberIds);
    for (const existing of draft.assemblies.values()) {
      if (!existing.rejected) {
        continue;
      }
      const rejectedMembers = this.uniqueSortedIds(existing.memberIds);
      if (rejectedMembers.length === incoming.length && rejectedMembers.every((id, index) => id === incoming[index])) {
        throw new OperationError(
          operation,
          `rejected member set cannot be re-assembled as a bypass of assembly ${existing.assemblyId}`,
          "restoration_and_re_presentation"
        );
      }
    }
  }

  private lookupTraceObservation(
    state: EngineState,
    observationId: string,
    requestedVersion?: number
  ): ObservationRecord | undefined {
    const versions = state.observations.get(observationId);
    if (!versions) {
      return undefined;
    }
    if (requestedVersion === undefined) {
      return versions.find((item) => item.current);
    }
    return versions.find((item) => item.version === requestedVersion);
  }

  private requireCurrent(observationId: string): ObservationRecord {
    const current = currentObservation(this.state, observationId);
    if (!current) {
      throw new OperationError("TRACE", `unknown observation ${observationId}`, "identity");
    }
    return current;
  }

  inspectSearchIndex(observationId: string): { viewId: string; stale: boolean } | undefined {
    const current = currentObservation(this.state, observationId);
    if (!current) {
      return undefined;
    }
    const viewId = `view_search_index_${observationId}_v${current.version}`;
    const view = this.state.derivedViews.get(viewId);
    if (!view) {
      const stale = [...this.state.derivedViews.values()].find(
        (item) => item.kind === "search_index" && item.sourceObservationId === observationId
      );
      return stale ? { viewId: stale.viewId, stale: stale.stale } : undefined;
    }
    return { viewId: view.viewId, stale: view.stale };
  }

  tokensOf(observationId: string): string[] {
    const current = currentObservation(this.state, observationId);
    if (!current) {
      throw new OperationError("TRACE", `unknown observation ${observationId}`, "identity");
    }
    if (!publicTokensAllowed(this.state, current, this.clock.now())) {
      return [];
    }
    return tokenize(current);
  }
}

interface TraceTargetSet {
  observations: Set<string>;
  observationIds: Set<string>;
  insightIds: Set<string>;
  assemblyIds: Set<string>;
}
