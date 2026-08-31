import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { derivedViewId } from "../src/derived.js";
import { MemoryEngine } from "../src/engine.js";
import { InvariantError, OperationError } from "../src/errors.js";
import { isInterpretationKind, isObservedRecordKind } from "../src/policy.js";
import type { ConsentUse } from "../src/types.js";
import { engine, observeEvidence, structuredPayload } from "./helpers.js";

function snapshotJson(mem: MemoryEngine): string {
  return JSON.stringify(mem.snapshot(), (_key, value: unknown) => {
    if (value instanceof Map) {
      return [...value.entries()];
    }
    return value;
  });
}

describe("P0/P1 measured defects", () => {
  it("defect-01: WITHDRAW_CONSENT cannot re-grant uses after reduction to []", () => {
    const mem = engine();
    observeEvidence(mem, "obs_consent", { secret: "alpha" });
    mem.withdrawConsent({ observationId: "obs_consent", permittedUses: [] });
    assert.deepEqual(mem.getObservation("obs_consent").consent.permittedUses, []);
    assert.throws(
      () =>
        mem.withdrawConsent({
          observationId: "obs_consent",
          permittedUses: ["retrieve", "present", "share", "derive", "assemble"]
        }),
      (error: unknown) =>
        error instanceof OperationError &&
        error.operation === "WITHDRAW_CONSENT" &&
        error.invariantId === "deletion_and_consent" &&
        error.message.includes("not implemented")
    );
    assert.deepEqual(mem.getObservation("obs_consent").consent.permittedUses, []);
  });

  it("defect-02: RESTORE refuses a fully withdrawn cold observation", () => {
    const mem = engine();
    observeEvidence(mem, "obs_cold_withdrawn", { secret: "alpha" });
    mem.moveTier({ target: { kind: "observation", id: "obs_cold_withdrawn" }, storageTier: "cold" });
    mem.withdrawConsent({ observationId: "obs_cold_withdrawn", permittedUses: [] });
    assert.throws(
      () => mem.restore({ observationId: "obs_cold_withdrawn", targetTier: "hot" }),
      (error: unknown) =>
        error instanceof InvariantError && error.invariantId === "restoration_and_re_presentation"
    );
    assert.equal(mem.getObservation("obs_cold_withdrawn").storageTier, "cold");
    assert.equal(mem.getObservation("obs_cold_withdrawn").consent.permittedUses.includes("present"), false);
  });

  it("defect-03: FORGET removes re-presentable body and tokens from public reads", () => {
    const mem = engine();
    observeEvidence(mem, "obs_forget", { secret: "alpha-secret" });
    mem.forget({ observationId: "obs_forget" });
    const row = mem.getObservation("obs_forget");
    assert.equal(row.forgotten, true);
    assert.equal(row.payload.data.secret, undefined);
    assert.equal(JSON.stringify(row.payload.data).includes("alpha"), false);
    const snap = snapshotJson(mem);
    assert.equal(snap.includes("alpha-secret"), false);
    const text = mem.getDerivedView(derivedViewId("text", "obs_forget", 1));
    assert.equal(text.stale, true);
    assert.equal(text.body.includes("alpha"), false);
    const index = mem.inspectSearchIndex("obs_forget");
    assert.ok(index);
    assert.equal(index.stale, true);
    assert.equal("body" in index, false);
    assert.deepEqual(mem.tokensOf("obs_forget"), []);
    assert.equal(mem.retrieve({ tokens: ["alpha"] }).length, 0);
  });

  it("defect-04: blocked TRACE does not increment accessCount", () => {
    const mem = engine();
    observeEvidence(mem, "obs_retrieve_only", { topic: "alpha-topic" }, {
      consent: { permittedUses: ["retrieve"] }
    });
    assert.equal(mem.getObservation("obs_retrieve_only").accessCount, 0);
    const plan = mem.trace({ from: { kind: "observation", id: "obs_retrieve_only" } });
    assert.equal(plan.usable, false);
    assert.equal(mem.getObservation("obs_retrieve_only").accessCount, 0);
  });

  it("defect-05: RELATE rejects a missing observation version 999", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { note: "A" });
    observeEvidence(mem, "obs_b", { note: "B" });
    assert.throws(
      () =>
        mem.relate({
          type: "simultaneity",
          fromRef: { kind: "observation", id: "obs_a", version: 999 },
          toRef: { kind: "observation", id: "obs_b", version: 1 }
        }),
      (error: unknown) =>
        error instanceof OperationError &&
        error.operation === "RELATE" &&
        error.invariantId === "identity" &&
        error.message.includes("999")
    );
    assert.equal(mem.snapshot().relations.some((rel) => rel.type === "simultaneity"), false);
  });

  it("defect-06: reopening one shared insight does not contradict another crystallized insight", () => {
    const mem = engine();
    observeEvidence(mem, "obs_shared", { fragment: "shared-evidence" });
    const first = mem.crystallize({
      insightId: "ins_one",
      evidenceIds: ["obs_shared"],
      uncertainty: { declared: true, note: "first", recognizerConfidence: null },
      falsificationConditions: ["counter-one"]
    });
    const second = mem.crystallize({
      insightId: "ins_two",
      evidenceIds: ["obs_shared"],
      uncertainty: { declared: true, note: "second", recognizerConfidence: null },
      falsificationConditions: ["counter-two"]
    });
    assert.equal(mem.getObservation("obs_shared").epistemicPhase, "crystallized");
    mem.reopen({ insightId: first.insightId, targetPhase: "dispersed" });
    assert.equal(mem.getInsight(first.insightId).epistemicPhase, "dispersed");
    assert.equal(mem.getInsight(second.insightId).epistemicPhase, "crystallized");
    assert.equal(mem.getObservation("obs_shared").epistemicPhase, "crystallized");
  });

  it("defect-07: stale derived views after derive withdrawal do not expose body", () => {
    const mem = engine();
    observeEvidence(mem, "obs_derive", { secret: "alpha-topic" });
    mem.withdrawConsent({
      observationId: "obs_derive",
      permittedUses: ["retrieve", "present", "share", "assemble"]
    });
    const view = mem.getDerivedView(derivedViewId("text", "obs_derive", 1));
    assert.equal(view.stale, true);
    assert.equal(view.body.includes("alpha"), false);
    const index = mem.inspectSearchIndex("obs_derive");
    assert.ok(index);
    assert.equal(index.stale, true);
    assert.equal("body" in index, false);
    const snapView = mem.snapshot().derivedViews.get(derivedViewId("text", "obs_derive", 1));
    assert.equal(snapView?.stale, true);
    assert.equal((snapView?.body ?? "").includes("alpha"), false);
  });
});

describe("consent, restore, forget, version, and phase policy", () => {
  it("WITHDRAW_CONSENT is monotonic and rejects duplicates and unknown uses", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { note: "held" });
    mem.withdrawConsent({
      observationId: "obs_a",
      permittedUses: ["retrieve", "present", "derive"]
    });
    assert.deepEqual(mem.getObservation("obs_a").consent.permittedUses, [
      "retrieve",
      "present",
      "derive"
    ]);
    assert.throws(
      () =>
        mem.withdrawConsent({
          observationId: "obs_a",
          permittedUses: ["retrieve", "present", "share", "derive"]
        }),
      (error: unknown) =>
        error instanceof OperationError && error.message.includes("not implemented")
    );
    assert.throws(
      () =>
        mem.withdrawConsent({
          observationId: "obs_a",
          permittedUses: ["retrieve", "retrieve"] as unknown as ConsentUse[]
        }),
      (error: unknown) =>
        error instanceof OperationError && error.message.includes("duplicate")
    );
    assert.throws(
      () =>
        mem.withdrawConsent({
          observationId: "obs_a",
          permittedUses: ["not-a-use" as ConsentUse]
        }),
      (error: unknown) =>
        error instanceof OperationError && error.message.includes("unknown consent use")
    );
    mem.withdrawConsent({ observationId: "obs_a", permittedUses: ["retrieve"] });
    assert.deepEqual(mem.getObservation("obs_a").consent.permittedUses, ["retrieve"]);
  });

  it("retrieve-only remaining may restore storage placement without granting present", () => {
    const mem = engine();
    observeEvidence(mem, "obs_cold", { topic: "alpha-topic" });
    mem.moveTier({ target: { kind: "observation", id: "obs_cold" }, storageTier: "cold" });
    mem.withdrawConsent({
      observationId: "obs_cold",
      permittedUses: ["retrieve", "derive", "assemble"]
    });
    const restored = mem.restore({ observationId: "obs_cold", targetTier: "hot" });
    assert.equal(restored.storageTier, "hot");
    assert.equal("payload" in restored, false);
    assert.equal(JSON.stringify(restored).includes("alpha-topic"), false);
    assert.equal(restored.consent.permittedUses.includes("present"), false);
    assert.equal(mem.getObservation("obs_cold").payload.data.topic, undefined);
    assert.equal(mem.retrieve({ tokens: ["alpha"] }).length, 1);
    assert.equal(mem.trace({ from: { kind: "observation", id: "obs_cold" } }).usable, false);
  });

  it("RESTORE refuses forgotten, corrected, and expired records", () => {
    const mem = engine();
    observeEvidence(mem, "obs_forget", { note: "gone" });
    mem.moveTier({ target: { kind: "observation", id: "obs_forget" }, storageTier: "cold" });
    mem.forget({ observationId: "obs_forget" });
    assert.throws(
      () => mem.restore({ observationId: "obs_forget", targetTier: "hot" }),
      (error: unknown) => error instanceof InvariantError && error.invariantId === "deletion_and_consent"
    );

    observeEvidence(mem, "obs_addr", { address: "old" });
    mem.moveTier({ target: { kind: "observation", id: "obs_addr" }, storageTier: "cold" });
    mem.correct({
      observationId: "obs_addr",
      payload: structuredPayload({ address: "new" })
    });
    assert.throws(
      () => mem.restore({ observationId: "obs_addr", version: 1, targetTier: "hot" }),
      (error: unknown) =>
        error instanceof InvariantError && error.invariantId === "restoration_and_re_presentation"
    );

    observeEvidence(mem, "obs_expired", { note: "old" }, {
      occurrenceTime: "2020-01-01T00:00:00.000Z",
      temporalValidity: { validFrom: "2020-01-01T00:00:00.000Z", validTo: "2020-12-31T00:00:00.000Z" }
    });
    mem.moveTier({ target: { kind: "observation", id: "obs_expired" }, storageTier: "cold" });
    assert.throws(
      () => mem.restore({ observationId: "obs_expired", targetTier: "hot" }),
      (error: unknown) => error instanceof InvariantError && error.invariantId === "temporal_validity"
    );
  });

  it("blocked TRACE leaves snapshot-equivalent state, clock, IDs, and audit unchanged", () => {
    const setup = (): MemoryEngine => {
      const mem = engine();
      observeEvidence(mem, "obs_a", { topic: "alpha-topic" }, {
        consent: { permittedUses: ["retrieve"] }
      });
      observeEvidence(mem, "obs_b", { topic: "peer" });
      return mem;
    };
    const untouched = setup();
    const probed = setup();
    const before = snapshotJson(probed);
    const beforeAudit = probed.auditLog();
    const plan = probed.trace({ from: { kind: "observation", id: "obs_a" } });
    assert.equal(plan.usable, false);
    assert.equal(snapshotJson(probed), before);
    assert.equal(snapshotJson(probed), snapshotJson(untouched));
    assert.deepEqual(probed.auditLog(), beforeAudit);
    assert.equal(probed.getObservation("obs_a").accessCount, 0);
    const relateInput = {
      type: "simultaneity" as const,
      fromRef: { kind: "observation" as const, id: "obs_a", version: 1 },
      toRef: { kind: "observation" as const, id: "obs_b", version: 1 }
    };
    assert.equal(probed.relate(relateInput).relationId, untouched.relate(relateInput).relationId);
  });

  it("version 999 is rejected on TRACE and MOVE_TIER", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { note: "A" });
    assert.throws(
      () => mem.trace({ from: { kind: "observation", id: "obs_a", version: 999 } }),
      (error: unknown) => error instanceof OperationError && error.invariantId === "identity"
    );
    assert.throws(
      () =>
        mem.moveTier({
          target: { kind: "observation", id: "obs_a", version: 999 },
          storageTier: "warm"
        }),
      (error: unknown) => error instanceof OperationError && error.invariantId === "identity"
    );
  });

  it("observed records stay distinct from interpretation records", () => {
    assert.equal(isObservedRecordKind("observed_evidence"), true);
    assert.equal(isInterpretationKind("system_inference"), true);
    const mem = engine();
    const observed = mem.observe({
      observationId: "obs_voice",
      kind: "observed_evidence",
      observer: "microphone-1",
      payload: {
        kind: "prosody",
        data: { voiceLevelChange: "drop" },
        representationLossDeclared: false
      }
    });
    const interpretation = mem.observe({
      observationId: "obs_interp",
      kind: "system_inference",
      observer: "interpreter-1",
      sourceRef: "session-voice",
      payload: {
        kind: "structured",
        data: { emotionLabel: "sad" },
        representationLossDeclared: true
      },
      uncertainty: { declared: true, note: "unverified interpretation", recognizerConfidence: null }
    });
    mem.relate({
      type: "derivation",
      fromRef: { kind: "observation", id: interpretation.observationId, version: 1 },
      toRef: { kind: "observation", id: observed.observationId, version: 1 }
    });
    assert.equal(mem.getObservation("obs_voice").kind, "observed_evidence");
    assert.equal(mem.getObservation("obs_voice").payload.data.emotionLabel, undefined);
    assert.equal(mem.getObservation("obs_interp").kind, "system_inference");
    assert.equal(mem.getObservation("obs_interp").payload.data.emotionLabel, "sad");
  });
});

describe("P0/P1 public-read, counterevidence, and rejection closure", () => {
  function assertNoTokens(label: string, haystack: string, tokens: readonly string[]): void {
    for (const token of tokens) {
      assert.equal(haystack.includes(token), false, `${label} leaked ${token}`);
    }
  }

  it("trace-01: TRACE does not ingest unrelated contradiction or falsifier relations", () => {
    const mem = engine();
    observeEvidence(mem, "obs_support", { fragment: "support-body" });
    observeEvidence(mem, "obs_related_counter", { fragment: "related-counter-body" });
    observeEvidence(mem, "obs_unrelated_a", { fragment: "UNRELATED_A_SECRET" });
    observeEvidence(mem, "obs_unrelated_b", { fragment: "UNRELATED_B_SECRET" });
    mem.relate({
      type: "contradiction",
      fromRef: { kind: "observation", id: "obs_support", version: 1 },
      toRef: { kind: "observation", id: "obs_related_counter", version: 1 }
    });
    mem.relate({
      type: "contradiction",
      fromRef: { kind: "observation", id: "obs_unrelated_a", version: 1 },
      toRef: { kind: "observation", id: "obs_unrelated_b", version: 1 },
      note: "UNRELATED_CONTRADICTION_SECRET"
    });
    mem.relate({
      type: "potential_falsifier",
      fromRef: { kind: "observation", id: "obs_unrelated_a", version: 1 },
      toRef: { kind: "observation", id: "obs_unrelated_b", version: 1 },
      note: "UNRELATED_FALSIFIER_SECRET"
    });
    const insight = mem.crystallize({
      insightId: "ins_target",
      evidenceIds: ["obs_support"],
      statement: "target claim",
      uncertainty: { declared: true, note: "open", recognizerConfidence: null },
      falsificationConditions: ["related counter holds"]
    });
    const plan = mem.trace({ from: { kind: "insight", id: insight.insightId } });
    assert.equal(plan.usable, true);
    const planJson = JSON.stringify(plan);
    assertNoTokens("evidence plan", planJson, [
      "UNRELATED_A_SECRET",
      "UNRELATED_B_SECRET",
      "UNRELATED_CONTRADICTION_SECRET",
      "UNRELATED_FALSIFIER_SECRET",
      "obs_unrelated_a",
      "obs_unrelated_b"
    ]);
    assert.equal(plan.canonicalEvents.some((row) => row.observationId === "obs_support"), true);
    assert.equal(
      plan.excludedCounterevidence.some((row) => row.observationId === "obs_related_counter"),
      true
    );
    assert.equal(
      plan.excludedCounterevidence.some((row) => row.observationId === "obs_support"),
      false
    );
  });

  it("cold-01: unrestored cold observation hides payload and re-presentable free text", () => {
    const mem = engine();
    mem.observe({
      observationId: "obs_cold_secret",
      kind: "observed_evidence",
      speaker: "COLD_SPEAKER_SENTINEL",
      observer: "COLD_OBSERVER_SENTINEL",
      sourceRef: "COLD_SOURCE_SENTINEL",
      payload: structuredPayload({ secret: "COLD_PAYLOAD_SENTINEL" }),
      uncertainty: { declared: true, note: "COLD_NOTE_SENTINEL", recognizerConfidence: null }
    });
    mem.moveTier({ target: { kind: "observation", id: "obs_cold_secret" }, storageTier: "cold" });
    const sentinels = [
      "COLD_SPEAKER_SENTINEL",
      "COLD_OBSERVER_SENTINEL",
      "COLD_SOURCE_SENTINEL",
      "COLD_PAYLOAD_SENTINEL",
      "COLD_NOTE_SENTINEL"
    ] as const;
    const row = mem.getObservation("obs_cold_secret");
    assert.equal(row.storageTier, "cold");
    assert.equal(row.observationId, "obs_cold_secret");
    assert.equal(row.version, 1);
    assertNoTokens("getObservation", JSON.stringify(row), sentinels);
    assertNoTokens("snapshot", snapshotJson(mem), sentinels);
    assert.equal(mem.retrieve({ tokens: ["cold"] }).length, 0);
    assert.equal(mem.retrieve({ tokens: ["payload"] }).length, 0);
    assert.deepEqual(mem.tokensOf("obs_cold_secret"), []);
    assertNoTokens(
      "text view",
      JSON.stringify(mem.getDerivedView(derivedViewId("text", "obs_cold_secret", 1))),
      sentinels
    );
    assertNoTokens(
      "search_index view",
      JSON.stringify(mem.getDerivedView(derivedViewId("search_index", "obs_cold_secret", 1))),
      sentinels
    );
    const restored = mem.restore({ observationId: "obs_cold_secret", targetTier: "hot" });
    assert.equal(restored.storageTier, "hot");
    assert.equal("payload" in restored, false);
    assert.equal("speaker" in restored, false);
    assert.equal("observer" in restored, false);
    assert.equal("sourceRef" in restored, false);
    assert.equal("uncertainty" in restored, false);
    assertNoTokens("RESTORE DTO", JSON.stringify(restored), sentinels);
  });

  it("cold-02: cold assembly and insight public reads hide cue, statement, uncertainty, and falsifiers", () => {
    const mem = engine();
    observeEvidence(mem, "obs_member", { fragment: "held" });
    const assembly = mem.assemble({
      memberIds: ["obs_member"],
      cue: "COLD_CUE_SENTINEL"
    });
    const insight = mem.crystallize({
      insightId: "ins_cold",
      assemblyId: assembly.assemblyId,
      evidenceIds: ["obs_member"],
      statement: "COLD_STATEMENT_SENTINEL",
      uncertainty: { declared: true, note: "COLD_INSIGHT_NOTE_SENTINEL", recognizerConfidence: null },
      falsificationConditions: ["COLD_FALSIFIER_SENTINEL"]
    });
    mem.moveTier({ target: { kind: "assembly", id: assembly.assemblyId }, storageTier: "cold" });
    mem.moveTier({ target: { kind: "insight", id: insight.insightId }, storageTier: "cold" });
    const publicAssembly = mem.getAssembly(assembly.assemblyId);
    const publicInsight = mem.getInsight(insight.insightId);
    assert.equal(publicAssembly.storageTier, "cold");
    assert.equal(publicAssembly.cue, null);
    assert.equal(publicInsight.storageTier, "cold");
    assert.equal(publicInsight.statement, null);
    assert.equal(publicInsight.uncertainty.note, null);
    assert.deepEqual(publicInsight.falsificationConditions, []);
    const snap = snapshotJson(mem);
    assertNoTokens("cold candidate snapshot", snap, [
      "COLD_CUE_SENTINEL",
      "COLD_STATEMENT_SENTINEL",
      "COLD_INSIGHT_NOTE_SENTINEL",
      "COLD_FALSIFIER_SENTINEL"
    ]);
  });

  it("cold-03: ASSEMBLE return of a created-cold assembly hides the cue sentinel", () => {
    const mem = engine();
    observeEvidence(mem, "obs_member", { fragment: "held" });
    const assembly = mem.assemble({
      assemblyId: "asm_cold_op",
      memberIds: ["obs_member"],
      cue: "OP_CUE_SENTINEL",
      storageTier: "cold"
    });
    assert.equal(assembly.assemblyId, "asm_cold_op");
    assert.deepEqual(assembly.memberIds, ["obs_member"]);
    assert.equal(assembly.epistemicPhase, "assembling");
    assert.equal(assembly.storageTier, "cold");
    assert.equal(assembly.rejected, false);
    assert.equal(assembly.invalidated, false);
    assert.equal(assembly.forgotten, false);
    assert.equal(assembly.cue, null);
    assertNoTokens("ASSEMBLE return", JSON.stringify(assembly), ["OP_CUE_SENTINEL"]);
    assembly.cue = "MUTATED_CUE";
    assert.equal(mem.getAssembly("asm_cold_op").cue, null);
    const insight = mem.crystallize({
      insightId: "ins_from_cold_assembly",
      assemblyId: assembly.assemblyId,
      evidenceIds: ["obs_member"],
      statement: "uses preserved assembly",
      uncertainty: { declared: true, note: "open", recognizerConfidence: null },
      falsificationConditions: ["counter"]
    });
    assert.equal(insight.assemblyId, "asm_cold_op");
    mem.moveTier({ target: { kind: "assembly", id: "asm_cold_op" }, storageTier: "hot" });
    assert.equal(mem.getAssembly("asm_cold_op").cue, "OP_CUE_SENTINEL");
    assert.equal(mem.getAssembly("asm_cold_op").epistemicPhase, "crystallized");
  });

  it("cold-04: CRYSTALLIZE return of a created-cold insight hides statement, note, and falsifiers", () => {
    const mem = engine();
    observeEvidence(mem, "obs_member", { fragment: "held" });
    const insight = mem.crystallize({
      insightId: "ins_cold_op",
      evidenceIds: ["obs_member"],
      statement: "OP_STATEMENT_SENTINEL",
      uncertainty: { declared: true, note: "OP_INSIGHT_NOTE_SENTINEL", recognizerConfidence: 0.4 },
      falsificationConditions: ["OP_FALSIFIER_SENTINEL"],
      storageTier: "cold"
    });
    assert.equal(insight.insightId, "ins_cold_op");
    assert.deepEqual(insight.evidenceIds, ["obs_member"]);
    assert.equal(insight.epistemicPhase, "crystallized");
    assert.equal(insight.storageTier, "cold");
    assert.equal(insight.rejected, false);
    assert.equal(insight.invalidated, false);
    assert.equal(insight.forgotten, false);
    assert.equal(insight.statement, null);
    assert.equal(insight.uncertainty.declared, true);
    assert.equal(insight.uncertainty.note, null);
    assert.equal(insight.uncertainty.recognizerConfidence, 0.4);
    assert.deepEqual(insight.falsificationConditions, []);
    assertNoTokens("CRYSTALLIZE return", JSON.stringify(insight), [
      "OP_STATEMENT_SENTINEL",
      "OP_INSIGHT_NOTE_SENTINEL",
      "OP_FALSIFIER_SENTINEL"
    ]);
    insight.statement = "MUTATED_STATEMENT";
    insight.uncertainty.note = "MUTATED_NOTE";
    insight.falsificationConditions = ["MUTATED_FALSIFIER"];
    const viaGetter = mem.getInsight("ins_cold_op");
    assert.equal(viaGetter.statement, null);
    assert.equal(viaGetter.uncertainty.note, null);
    assert.deepEqual(viaGetter.falsificationConditions, []);
    mem.moveTier({ target: { kind: "insight", id: "ins_cold_op" }, storageTier: "hot" });
    const internal = mem.getInsight("ins_cold_op");
    assert.equal(internal.statement, "OP_STATEMENT_SENTINEL");
    assert.equal(internal.uncertainty.note, "OP_INSIGHT_NOTE_SENTINEL");
    assert.deepEqual(internal.falsificationConditions, ["OP_FALSIFIER_SENTINEL"]);
    assert.equal(internal.epistemicPhase, "crystallized");
    assert.equal(internal.rejected, false);
  });

  it("cold-05: REOPEN return of a cold non-rejected insight stays redacted", () => {
    const mem = engine();
    observeEvidence(mem, "obs_member", { fragment: "held" });
    const created = mem.crystallize({
      insightId: "ins_cold_reopen",
      evidenceIds: ["obs_member"],
      statement: "OP_REOPEN_STATEMENT_SENTINEL",
      uncertainty: { declared: true, note: "OP_REOPEN_NOTE_SENTINEL", recognizerConfidence: null },
      falsificationConditions: ["OP_REOPEN_FALSIFIER_SENTINEL"],
      storageTier: "cold"
    });
    assert.equal(created.statement, null);
    const reopened = mem.reopen({ insightId: created.insightId, targetPhase: "assembling" });
    assert.equal(reopened.insightId, "ins_cold_reopen");
    assert.equal(reopened.epistemicPhase, "assembling");
    assert.equal(reopened.storageTier, "cold");
    assert.equal(reopened.rejected, false);
    assert.equal(reopened.invalidated, false);
    assert.equal(reopened.forgotten, false);
    assert.equal(reopened.statement, null);
    assert.equal(reopened.uncertainty.declared, true);
    assert.equal(reopened.uncertainty.note, null);
    assert.deepEqual(reopened.falsificationConditions, []);
    assertNoTokens("REOPEN return", JSON.stringify(reopened), [
      "OP_REOPEN_STATEMENT_SENTINEL",
      "OP_REOPEN_NOTE_SENTINEL",
      "OP_REOPEN_FALSIFIER_SENTINEL"
    ]);
    assert.equal(mem.getInsight("ins_cold_reopen").epistemicPhase, "assembling");
    assert.equal(mem.getObservation("obs_member").epistemicPhase, "assembling");
    mem.moveTier({ target: { kind: "insight", id: "ins_cold_reopen" }, storageTier: "hot" });
    const internal = mem.getInsight("ins_cold_reopen");
    assert.equal(internal.statement, "OP_REOPEN_STATEMENT_SENTINEL");
    assert.equal(internal.uncertainty.note, "OP_REOPEN_NOTE_SENTINEL");
    assert.deepEqual(internal.falsificationConditions, ["OP_REOPEN_FALSIFIER_SENTINEL"]);
    assert.equal(internal.epistemicPhase, "assembling");
    const dispersed = mem.reopen({ insightId: "ins_cold_reopen", targetPhase: "dispersed" });
    assert.equal(dispersed.epistemicPhase, "dispersed");
    assert.equal(dispersed.statement, "OP_REOPEN_STATEMENT_SENTINEL");
    assert.equal(mem.getObservation("obs_member").epistemicPhase, "dispersed");
  });

  it("reject-01: rejected insight cannot be REOPENED and public state does not change", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { fragment: "support" });
    mem.observe({
      observationId: "obs_user_no",
      kind: "user_self_report",
      speaker: "user-1",
      payload: structuredPayload({ verdict: "no" })
    });
    const insight = mem.crystallize({
      insightId: "ins_rejected",
      evidenceIds: ["obs_a"],
      statement: "REJECTED_SECRET",
      uncertainty: { declared: true, note: "REJECTED_NOTE_SECRET", recognizerConfidence: null },
      falsificationConditions: ["REJECTED_FALSIFIER_SECRET"]
    });
    mem.reject({
      fromRef: { kind: "observation", id: "obs_user_no" },
      toRef: { kind: "insight", id: insight.insightId }
    });
    const before = snapshotJson(mem);
    const beforeAudit = mem.auditLog();
    const beforeInsight = mem.getInsight("ins_rejected");
    assert.throws(
      () => mem.reopen({ insightId: "ins_rejected", targetPhase: "assembling" }),
      (error: unknown) =>
        error instanceof OperationError &&
        error.operation === "REOPEN" &&
        error.invariantId === "restoration_and_re_presentation"
    );
    assert.equal(snapshotJson(mem), before);
    assert.deepEqual(mem.auditLog(), beforeAudit);
    assert.deepEqual(mem.getInsight("ins_rejected"), beforeInsight);
    assert.equal(mem.getInsight("ins_rejected").rejected, true);
    assert.equal(mem.getInsight("ins_rejected").epistemicPhase, "crystallized");
    assert.equal(mem.getInsight("ins_rejected").statement, null);
    assertNoTokens("rejected reopen surfaces", snapshotJson(mem), [
      "REJECTED_SECRET",
      "REJECTED_NOTE_SECRET",
      "REJECTED_FALSIFIER_SECRET"
    ]);
  });

  it("reject-02: rejected insight cannot be re-crystallized with the same statement", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { fragment: "support" });
    observeEvidence(mem, "obs_extra", { fragment: "padding" });
    mem.observe({
      observationId: "obs_user_no",
      kind: "user_self_report",
      speaker: "user-1",
      payload: structuredPayload({ verdict: "no" })
    });
    const assembly = mem.assemble({ memberIds: ["obs_a"], cue: "group" });
    mem.crystallize({
      insightId: "ins_rejected",
      assemblyId: assembly.assemblyId,
      evidenceIds: ["obs_a"],
      statement: "same crystallized claim",
      uncertainty: { declared: true, note: "open", recognizerConfidence: null },
      falsificationConditions: ["counterexample"]
    });
    mem.reject({
      fromRef: { kind: "observation", id: "obs_user_no" },
      toRef: { kind: "insight", id: "ins_rejected" }
    });
    const sameStatement = {
      statement: "same crystallized claim",
      uncertainty: { declared: true as const, note: "retry", recognizerConfidence: null },
      falsificationConditions: ["still refused"]
    };
    assert.throws(
      () =>
        mem.crystallize({
          insightId: "ins_same_evidence",
          evidenceIds: ["obs_a"],
          ...sameStatement
        }),
      (error: unknown) =>
        error instanceof OperationError && error.invariantId === "restoration_and_re_presentation"
    );
    assert.throws(
      () =>
        mem.crystallize({
          insightId: "ins_superset",
          evidenceIds: ["obs_a", "obs_extra"],
          ...sameStatement
        }),
      (error: unknown) =>
        error instanceof OperationError && error.invariantId === "restoration_and_re_presentation"
    );
    const newAssembly = mem.assemble({ memberIds: ["obs_a", "obs_extra"], cue: "new group" });
    assert.throws(
      () =>
        mem.crystallize({
          insightId: "ins_new_assembly",
          assemblyId: newAssembly.assemblyId,
          evidenceIds: ["obs_a", "obs_extra"],
          ...sameStatement
        }),
      (error: unknown) =>
        error instanceof OperationError && error.invariantId === "restoration_and_re_presentation"
    );
    const other = mem.crystallize({
      insightId: "ins_different_statement",
      assemblyId: newAssembly.assemblyId,
      evidenceIds: ["obs_a", "obs_extra"],
      statement: "a different claim",
      uncertainty: { declared: true, note: "distinct", recognizerConfidence: null },
      falsificationConditions: ["other counterexample"]
    });
    assert.equal(other.statement, "a different claim");
    assert.equal(other.rejected, false);
  });

  it("reject-03: rejected assembly member set cannot be recreated", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { fragment: "one" });
    observeEvidence(mem, "obs_b", { fragment: "two" });
    mem.observe({
      observationId: "obs_user_no",
      kind: "user_self_report",
      speaker: "user-1",
      payload: structuredPayload({ verdict: "no" })
    });
    const assembly = mem.assemble({
      memberIds: ["obs_a", "obs_b"],
      cue: "original group"
    });
    mem.reject({
      fromRef: { kind: "observation", id: "obs_user_no" },
      toRef: { kind: "assembly", id: assembly.assemblyId }
    });
    assert.equal(mem.getAssembly(assembly.assemblyId).rejected, true);
    assert.throws(
      () => mem.assemble({ memberIds: ["obs_b", "obs_a"], cue: "reordered bypass" }),
      (error: unknown) =>
        error instanceof OperationError &&
        error.operation === "ASSEMBLE" &&
        error.invariantId === "restoration_and_re_presentation"
    );
    assert.throws(
      () => mem.assemble({ memberIds: ["obs_a", "obs_b"], cue: "same members" }),
      (error: unknown) =>
        error instanceof OperationError && error.invariantId === "restoration_and_re_presentation"
    );
    const other = mem.assemble({ memberIds: ["obs_a"], cue: "different set" });
    assert.equal(other.rejected, false);
    assert.equal(other.cue, "different set");
  });

  it("trace-02: excluded counterevidence stays pinned to v1 after correction to v2", () => {
    const mem = engine();
    observeEvidence(mem, "obs_support", { fragment: "support" });
    observeEvidence(mem, "obs_counter", { fragment: "COUNTER_V1_SECRET" });
    const insight = mem.crystallize({
      insightId: "ins_pinned",
      evidenceIds: ["obs_support"],
      excludedCounterevidenceIds: ["obs_counter"],
      uncertainty: { declared: true, note: "open", recognizerConfidence: null },
      falsificationConditions: ["counter holds"]
    });
    const pinned = mem.getInsight("ins_pinned").excludedCounterevidence;
    assert.equal(pinned[0]?.id, "obs_counter");
    assert.equal(pinned[0]?.version, 1);
    mem.correct({
      observationId: "obs_counter",
      payload: structuredPayload({ fragment: "COUNTER_V2_SECRET" })
    });
    const afterCorrect = mem.trace({ from: { kind: "insight", id: insight.insightId } });
    assert.equal(afterCorrect.usable, true);
    assert.equal(afterCorrect.excludedCounterevidence.length, 1);
    assert.equal(afterCorrect.excludedCounterevidence[0]?.observationId, "obs_counter");
    assert.equal(afterCorrect.excludedCounterevidence[0]?.version, 1);
    assert.equal(afterCorrect.excludedCounterevidence[0]?.payload.data.fragment, "COUNTER_V1_SECRET");
    const afterJson = JSON.stringify(afterCorrect);
    assert.equal(afterJson.includes("COUNTER_V2_SECRET"), false);
    mem.withdrawConsent({
      observationId: "obs_counter",
      permittedUses: ["retrieve", "derive", "assemble"]
    });
    const afterWithdraw = mem.trace({ from: { kind: "insight", id: insight.insightId } });
    assert.equal(afterWithdraw.usable, true);
    assert.equal(afterWithdraw.excludedCounterevidence[0]?.observationId, "obs_counter");
    assert.equal(afterWithdraw.excludedCounterevidence[0]?.version, 1);
    assert.equal(afterWithdraw.excludedCounterevidence[0]?.payload.data.fragment, undefined);
    assert.equal(JSON.stringify(afterWithdraw).includes("COUNTER_V1_SECRET"), false);
    assert.equal(JSON.stringify(afterWithdraw).includes("COUNTER_V2_SECRET"), false);
  });
});
