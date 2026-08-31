import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SequentialClock } from "../src/clock.js";
import { MemoryEngine } from "../src/engine.js";
import { InjectedFailureError, InvariantError, OperationError } from "../src/errors.js";
import { INVARIANTS } from "../src/invariants.js";
import { NEGATIVE_FIXTURES } from "./fixtures/negatives.js";
import { engine, observeEvidence, structuredPayload } from "./helpers.js";

function fixture(id: string) {
  const found = NEGATIVE_FIXTURES.find((row) => row.id === id);
  assert.ok(found, id);
  for (const invariantId of found.invariants) {
    assert.equal(INVARIANTS[invariantId].id, invariantId);
  }
  return found;
}

describe("required negative fixtures", () => {
  it("neg-01: restoring a cold representation cannot revive a corrected address", () => {
    const spec = fixture("neg-01-cold-restore-after-correction");
    const mem = engine();
    observeEvidence(mem, "obs_address", { address: "12 Old Street" });
    mem.moveTier({ target: { kind: "observation", id: "obs_address" }, storageTier: "cold" });
    mem.correct({
      observationId: "obs_address",
      payload: structuredPayload({ address: "90 New Avenue" }),
      note: "user supplied current address"
    });
    const currentCold = mem.getObservation("obs_address");
    const previousCold = mem.getObservation("obs_address", 1);
    assert.equal(currentCold.version, 2);
    assert.equal(currentCold.current, true);
    assert.equal(currentCold.storageTier, "cold");
    assert.equal(currentCold.payload.data.address, undefined);
    assert.equal(previousCold.current, false);
    assert.equal(previousCold.invalidatedByCorrection, true);
    assert.equal(previousCold.storageTier, "cold");
    assert.equal(previousCold.payload.data.address, undefined);
    assert.throws(
      () => mem.restore({ observationId: "obs_address", version: 1, targetTier: "hot" }),
      (error: unknown) => error instanceof InvariantError && spec.invariants.includes(error.invariantId)
    );
    const restored = mem.restore({ observationId: "obs_address", targetTier: "hot" });
    assert.equal(restored.version, 2);
    assert.equal(restored.current, true);
    assert.equal("payload" in restored, false);
    assert.equal(JSON.stringify(restored).includes("90 New Avenue"), false);
    assert.equal(JSON.stringify(restored).includes("12 Old Street"), false);
    assert.equal(mem.getObservation("obs_address").payload.data.address, "90 New Avenue");
    assert.equal(mem.getObservation("obs_address").current, true);
    assert.equal(mem.getObservation("obs_address", 1).current, false);
    assert.equal(mem.getObservation("obs_address", 1).invalidatedByCorrection, true);
    const currents = mem.snapshot().observations.get("obs_address")?.filter((row) => row.current) ?? [];
    assert.equal(currents.length, 1);
  });

  it("neg-02: stale derived index cannot contribute after consent withdrawal", () => {
    fixture("neg-02-stale-index-after-consent-withdrawal");
    const mem = engine();
    observeEvidence(mem, "obs_private", { topic: "alpha-topic" });
    const before = mem.retrieve({ tokens: ["alpha"] });
    assert.equal(before.length, 1);
    const index = mem.inspectSearchIndex("obs_private");
    assert.ok(index);
    mem.withdrawConsent({
      observationId: "obs_private",
      permittedUses: []
    });
    const after = mem.retrieve({ tokens: ["alpha"] });
    assert.equal(after.length, 0);
    const staleIndex = mem.inspectSearchIndex("obs_private");
    assert.ok(staleIndex);
    assert.equal(staleIndex.stale, true);
    assert.equal("body" in staleIndex, false);
    const staleView = mem.getDerivedView(staleIndex.viewId);
    assert.equal(staleView.stale, true);
    assert.equal(staleView.body.includes("alpha"), false);
    const plan = mem.trace({
      from: { kind: "derived_view", id: staleIndex.viewId }
    });
    assert.equal(plan.usable, false);
    assert.equal(plan.canonicalEvents.length, 0);
    assert.ok(plan.blockedReasons.length > 0);
  });

  it("neg-03: long-dispersed low-frequency fragments assemble on a delayed cue", () => {
    fixture("neg-03-delayed-cue-assembles-dispersed-fragments");
    const clock = new SequentialClock("2024-01-01T00:00:00.000Z");
    const mem = new MemoryEngine({ clock });
    mem.observe({
      observationId: "obs_old",
      kind: "observed_evidence",
      observer: "observer-1",
      sourceRef: "notebook",
      occurrenceTime: "2024-01-01T00:00:00.000Z",
      payload: structuredPayload({ fragment: "rare-note", frequency: 1 }),
      epistemicPhase: "dispersed"
    });
    clock.advance(1000 * 60 * 60 * 24 * 400);
    mem.observe({
      observationId: "obs_later",
      kind: "observed_evidence",
      observer: "observer-1",
      sourceRef: "notebook",
      occurrenceTime: clock.now(),
      payload: structuredPayload({ fragment: "matching-cue", frequency: 1 }),
      epistemicPhase: "dispersed"
    });
    assert.equal(mem.getObservation("obs_old").accessCount, 0);
    assert.equal(mem.getObservation("obs_old").epistemicPhase, "dispersed");
    const assembly = mem.assemble({
      memberIds: ["obs_old", "obs_later"],
      cue: "delayed matching cue after 400 days"
    });
    assert.equal(assembly.epistemicPhase, "assembling");
    assert.equal(mem.getObservation("obs_old").payload.data.fragment, "rare-note");
    assert.equal(mem.getObservation("obs_later").payload.data.fragment, "matching-cue");
    assert.equal(mem.getObservation("obs_old").epistemicPhase, "assembling");
  });

  it("neg-04: a voice-level drop does not become a self-reported sad fact", () => {
    fixture("neg-04-voice-drop-is-not-self-reported-sadness");
    const mem = engine();
    const observed = mem.observe({
      observationId: "obs_voice",
      kind: "observed_evidence",
      observer: "microphone-1",
      sourceRef: "session-voice",
      payload: {
        kind: "prosody",
        data: { voiceLevelChange: "drop" },
        representationLossDeclared: false
      }
    });
    assert.equal(observed.kind, "observed_evidence");
    assert.equal(observed.payload.data.voiceLevelChange, "drop");
    assert.throws(
      () =>
        mem.observe({
          observationId: "obs_voice_as_sad",
          kind: "observed_evidence",
          observer: "microphone-1",
          payload: {
            kind: "prosody",
            data: { voiceLevelChange: "drop", emotion: "sad" },
            representationLossDeclared: false
          }
        }),
      (error: unknown) =>
        error instanceof OperationError && error.invariantId === "representation_loss_declaration"
    );
    assert.throws(
      () =>
        mem.observe({
          observationId: "obs_voice_affect",
          kind: "observed_evidence",
          observer: "microphone-1",
          payload: {
            kind: "prosody",
            data: { voiceLevelChange: "drop", affect: "sad" },
            representationLossDeclared: false
          }
        }),
      (error: unknown) =>
        error instanceof OperationError && error.invariantId === "representation_loss_declaration"
    );
    assert.throws(
      () =>
        mem.observe({
          observationId: "obs_voice_sad_key",
          kind: "observed_evidence",
          observer: "microphone-1",
          payload: {
            kind: "prosody",
            data: { voiceLevelChange: "drop", sad: true },
            representationLossDeclared: false
          }
        }),
      (error: unknown) =>
        error instanceof OperationError && error.invariantId === "representation_loss_declaration"
    );
    assert.throws(
      () =>
        mem.observe({
          observationId: "obs_voice_emotion_label",
          kind: "observed_evidence",
          observer: "microphone-1",
          payload: {
            kind: "prosody",
            data: { voiceLevelChange: "drop", emotionLabel: "sad" },
            representationLossDeclared: false
          }
        }),
      (error: unknown) =>
        error instanceof OperationError && error.invariantId === "representation_loss_declaration"
    );
    assert.throws(
      () => mem.promoteToSelfReport("obs_voice", "I am sad"),
      (error: unknown) =>
        error instanceof InvariantError && error.invariantId === "representation_loss_declaration"
    );
    const text = mem.getDerivedView(`view_text_obs_voice_v1`);
    assert.equal(text.representationLossDeclared, true);
    assert.doesNotMatch(text.body.toLowerCase(), /sad/);
    const plan = mem.trace({ from: { kind: "observation", id: "obs_voice" } });
    assert.equal(plan.canonicalEvents[0]?.kind, "observed_evidence");
    assert.notEqual(plan.canonicalEvents[0]?.kind, "user_self_report");
  });

  it("neg-04b: structured observations cannot disguise multilingual interpretations or prosody", () => {
    const mem = engine();
    for (const [observationId, data] of [
      ["obs_structured_jp_key", { 感情: "悲しい" }],
      ["obs_structured_zh_key", { 情緒: "悲傷" }],
      ["obs_structured_jp_value", { note: "利用者は悲しい" }],
      ["obs_structured_zh_value", { topic: "用户很难过" }],
      ["obs_structured_fake_prosody", { voiceLevelChange: "drop" }]
    ] as const) {
      assert.throws(
        () =>
          mem.observe({
            observationId,
            kind: "observed_evidence",
            observer: "structured-adapter-1",
            payload: {
              kind: "structured",
              data,
              representationLossDeclared: false
            }
          }),
        (error: unknown) =>
          error instanceof OperationError && error.invariantId === "representation_loss_declaration"
      );
    }

    const interpretation = mem.observe({
      observationId: "obs_structured_interpretation",
      kind: "system_inference",
      observer: "interpreter-1",
      payload: {
        kind: "structured",
        data: { 感情: "悲しい" },
        representationLossDeclared: true
      },
      uncertainty: { declared: true, note: "unverified interpretation", recognizerConfidence: null }
    });
    assert.equal(interpretation.kind, "system_inference");
  });

  it("neg-05: a contradictory fragment is not deleted for low frequency or similarity", () => {
    fixture("neg-05-contradiction-survives-low-frequency");
    const mem = engine();
    observeEvidence(mem, "obs_claim", { value: "claimed-route" });
    observeEvidence(mem, "obs_counter", { value: "contradictory-route", frequency: 1, similarity: 0.01 });
    mem.relate({
      type: "contradiction",
      fromRef: { kind: "observation", id: "obs_claim" },
      toRef: { kind: "observation", id: "obs_counter" }
    });
    assert.throws(
      () => mem.considerPrune("obs_counter", "low_frequency"),
      (error: unknown) =>
        error instanceof OperationError && error.invariantId === "simultaneity_and_ordering"
    );
    assert.throws(
      () => mem.considerPrune("obs_counter", "low_similarity"),
      OperationError
    );
    assert.equal(mem.getObservation("obs_counter").forgotten, false);
    assert.equal(mem.getObservation("obs_counter").current, true);
    const plan = mem.trace({ from: { kind: "observation", id: "obs_counter" } });
    assert.equal(plan.usable, true);
  });

  it("neg-06: MOVE_TIER does not change epistemic phase", () => {
    fixture("neg-06-move-tier-does-not-change-phase");
    const mem = engine();
    observeEvidence(mem, "obs_a", { note: "held" });
    mem.assemble({ memberIds: ["obs_a"], cue: "group" });
    const before = mem.getObservation("obs_a");
    assert.equal(before.epistemicPhase, "assembling");
    for (const tier of ["warm", "cold", "hot"] as const) {
      mem.moveTier({ target: { kind: "observation", id: "obs_a" }, storageTier: tier });
      const after = mem.getObservation("obs_a");
      assert.equal(after.epistemicPhase, "assembling", `phase changed at ${tier}`);
      assert.equal(after.storageTier, tier);
      if (tier === "cold") {
        assert.equal(after.payload.data.note, undefined);
      } else {
        assert.equal(after.payload.data.note, "held");
      }
    }
  });

  it("neg-07: phase-only operations do not change canonical payload or storage tier", () => {
    fixture("neg-07-phase-only-does-not-change-payload-or-tier");
    const mem = engine();
    observeEvidence(mem, "obs_a", { note: "canonical-body" });
    mem.moveTier({ target: { kind: "observation", id: "obs_a" }, storageTier: "warm" });
    const baseline = mem.getObservation("obs_a");
    const assembly = mem.assemble({ memberIds: ["obs_a"], cue: "phase shift" });
    const assembled = mem.getObservation("obs_a");
    assert.equal(assembled.epistemicPhase, "assembling");
    assert.equal(assembled.storageTier, baseline.storageTier);
    assert.deepEqual(assembled.payload, baseline.payload);
    const insight = mem.crystallize({
      assemblyId: assembly.assemblyId,
      evidenceIds: ["obs_a"],
      uncertainty: { declared: true, note: "candidate", recognizerConfidence: null },
      falsificationConditions: ["a counterexample is dated"]
    });
    const crystallized = mem.getObservation("obs_a");
    assert.equal(crystallized.epistemicPhase, "crystallized");
    assert.equal(crystallized.storageTier, baseline.storageTier);
    assert.deepEqual(crystallized.payload, baseline.payload);
    mem.reopen({ insightId: insight.insightId, targetPhase: "dispersed" });
    const reopened = mem.getObservation("obs_a");
    assert.equal(reopened.epistemicPhase, "dispersed");
    assert.equal(reopened.storageTier, baseline.storageTier);
    assert.deepEqual(reopened.payload, baseline.payload);
    assert.equal(mem.getInsight(insight.insightId).storageTier, "hot");
  });

  it("neg-08: injected mid-operation failure leaves state and audit unchanged", () => {
    fixture("neg-08-injected-failure-is-atomic");
    const mem = engine();
    observeEvidence(mem, "obs_a", { address: "12 Old Street" });
    mem.assemble({ memberIds: ["obs_a"], cue: "keep phase assembling" });
    const before = mem.snapshot();
    const beforeAudit = mem.auditLog();
    mem.injectFailure("mid_correct_after_new_version");
    assert.throws(
      () =>
        mem.correct({
          observationId: "obs_a",
          payload: structuredPayload({ address: "90 New Avenue" })
        }),
      InjectedFailureError
    );
    const after = mem.snapshot();
    const currentVersions = after.observations.get("obs_a")?.filter((row) => row.current) ?? [];
    assert.equal(currentVersions.length, 1);
    assert.equal(currentVersions[0]?.payload.data.address, "12 Old Street");
    assert.equal(currentVersions[0]?.version, 1);
    assert.equal(currentVersions[0]?.epistemicPhase, "assembling");
    const phases = new Set((after.observations.get("obs_a") ?? []).filter((row) => row.current).map((row) => row.epistemicPhase));
    assert.equal(phases.size, 1);
    assert.equal(mem.auditLog().length, beforeAudit.length);
    assert.deepEqual(after.observations, before.observations);
    assert.deepEqual(after.relations, before.relations);
    assert.deepEqual(after.audit, before.audit);

    mem.injectFailure("mid_crystallize_after_insert");
    assert.throws(
      () =>
        mem.crystallize({
          insightId: "ins_fail",
          evidenceIds: ["obs_a"],
          uncertainty: { declared: true, note: "n", recognizerConfidence: null },
          falsificationConditions: ["counterexample"]
        }),
      InjectedFailureError
    );
    assert.equal(mem.snapshot().insights.size, 0);
    assert.equal(mem.getObservation("obs_a").epistemicPhase, "assembling");
    assert.equal(mem.auditLog().length, beforeAudit.length);
  });
});
