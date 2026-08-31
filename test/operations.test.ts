import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OperationError } from "../src/errors.js";
import { derivedViewId } from "../src/derived.js";
import { engine, observeEvidence, structuredPayload } from "./helpers.js";

describe("required operations", () => {
  it("OBSERVE appends a canonical event with provenance and consent", () => {
    const mem = engine();
    const row = observeEvidence(mem, "obs_address", { address: "12 Old Street" });
    assert.equal(row.observationId, "obs_address");
    assert.equal(row.version, 1);
    assert.equal(row.kind, "observed_evidence");
    assert.equal(row.epistemicPhase, "dispersed");
    assert.equal(row.storageTier, "hot");
    assert.equal(row.current, true);
    assert.ok(row.observer);
    assert.ok(row.consent.permittedUses.includes("retrieve"));
    const view = mem.getDerivedView(derivedViewId("text", "obs_address", 1));
    assert.equal(view.representationLossDeclared, true);
    assert.equal(view.stale, false);
  });

  it("RELATE appends a typed relation without rewriting events", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { note: "A" });
    observeEvidence(mem, "obs_b", { note: "B" }, { occurrenceTime: "2026-01-01T00:00:01.000Z" });
    const related = mem.relate({
      type: "simultaneity",
      fromRef: { kind: "observation", id: "obs_a", version: 1 },
      toRef: { kind: "observation", id: "obs_b", version: 1 }
    });
    const afterA = mem.getObservation("obs_a");
    const afterB = mem.getObservation("obs_b");
    assert.equal(afterA.payload.data.note, "A");
    assert.equal(afterB.payload.data.note, "B");
    assert.ok(related.relationId.startsWith("rel_"));
    const graph = mem.getDerivedView("view_graph_global");
    assert.equal(graph.kind, "graph");
    assert.match(graph.body, /simultaneity/);
  });

  it("ASSEMBLE groups existing events without rewriting them", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { fragment: "one" });
    observeEvidence(mem, "obs_b", { fragment: "two" });
    const assembly = mem.assemble({
      memberIds: ["obs_a", "obs_b"],
      cue: "later reminder"
    });
    assert.equal(assembly.epistemicPhase, "assembling");
    assert.equal(mem.getObservation("obs_a").payload.data.fragment, "one");
    assert.equal(mem.getObservation("obs_b").payload.data.fragment, "two");
    assert.equal(mem.getObservation("obs_a").epistemicPhase, "assembling");
  });

  it("CRYSTALLIZE requires evidence, uncertainty, and falsification conditions", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { fragment: "one" });
    const insight = mem.crystallize({
      evidenceIds: ["obs_a"],
      uncertainty: { declared: true, note: "single source", recognizerConfidence: null },
      falsificationConditions: ["a dated counterexample appears"]
    });
    assert.equal(insight.epistemicPhase, "crystallized");
    assert.equal(mem.getObservation("obs_a").epistemicPhase, "crystallized");
    assert.throws(
      () =>
        mem.crystallize({
          insightId: "ins_bad",
          evidenceIds: ["obs_a"],
          uncertainty: { declared: false, note: null, recognizerConfidence: null },
          falsificationConditions: ["x"]
        }),
      OperationError
    );
  });

  it("REOPEN returns a crystallized candidate while retaining audit history", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { fragment: "one" });
    const insight = mem.crystallize({
      insightId: "ins_1",
      evidenceIds: ["obs_a"],
      uncertainty: { declared: true, note: "n", recognizerConfidence: null },
      falsificationConditions: ["counterexample"]
    });
    const before = mem.auditLog().length;
    const reopened = mem.reopen({ insightId: insight.insightId, targetPhase: "assembling" });
    assert.equal(reopened.epistemicPhase, "assembling");
    assert.equal(mem.getObservation("obs_a").epistemicPhase, "assembling");
    const audit = mem.auditLog();
    assert.ok(audit.length > before);
    assert.ok(audit.some((entry) => entry.operation === "CRYSTALLIZE"));
    assert.ok(audit.some((entry) => entry.operation === "REOPEN"));
  });

  it("MOVE_TIER changes storage placement only", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { address: "12 Old Street" });
    const before = mem.getObservation("obs_a");
    mem.moveTier({ target: { kind: "observation", id: "obs_a" }, storageTier: "warm" });
    const after = mem.getObservation("obs_a");
    assert.equal(after.storageTier, "warm");
    assert.equal(after.epistemicPhase, before.epistemicPhase);
    assert.deepEqual(after.payload.data, before.payload.data);
  });

  it("CORRECT invalidates the old value and derived views", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { address: "12 Old Street" });
    mem.correct({
      observationId: "obs_a",
      payload: structuredPayload({ address: "90 New Avenue" }),
      note: "user correction"
    });
    const current = mem.getObservation("obs_a");
    const old = mem.getObservation("obs_a", 1);
    assert.equal(current.version, 2);
    assert.equal(current.payload.data.address, "90 New Avenue");
    assert.equal(old.current, false);
    assert.equal(old.invalidatedByCorrection, true);
    const stale = mem.getDerivedView(derivedViewId("text", "obs_a", 1));
    assert.equal(stale.stale, true);
    const fresh = mem.getDerivedView(derivedViewId("text", "obs_a", 2));
    assert.equal(fresh.stale, false);
  });

  it("WITHDRAW_CONSENT blocks retrieval from derived indexes", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { secret: "alpha" });
    assert.equal(mem.retrieve({ tokens: ["alpha"] }).length, 1);
    mem.withdrawConsent({ observationId: "obs_a", permittedUses: ["derive"] });
    assert.equal(mem.retrieve({ tokens: ["alpha"] }).length, 0);
    const plan = mem.trace({ from: { kind: "observation", id: "obs_a" } });
    assert.equal(plan.usable, false);
  });

  it("FORGET applies a deletion contract and blocks regeneration", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { secret: "alpha" });
    mem.forget({ observationId: "obs_a" });
    assert.equal(mem.getObservation("obs_a").forgotten, true);
    assert.equal(mem.retrieve({ tokens: ["alpha"] }).length, 0);
    assert.throws(() => mem.regenerateDerived("obs_a"), OperationError);
  });

  it("TRACE returns evidence, excluded counterevidence, and uncertainty", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { fragment: "support" });
    observeEvidence(mem, "obs_b", { fragment: "counter" });
    mem.relate({
      type: "contradiction",
      fromRef: { kind: "observation", id: "obs_a" },
      toRef: { kind: "observation", id: "obs_b" }
    });
    const insight = mem.crystallize({
      evidenceIds: ["obs_a"],
      excludedCounterevidenceIds: ["obs_b"],
      uncertainty: { declared: true, note: "open", recognizerConfidence: null },
      falsificationConditions: ["obs_b is independently confirmed"]
    });
    const plan = mem.trace({ from: { kind: "insight", id: insight.insightId } });
    assert.equal(plan.canonicalEvents[0]?.observationId, "obs_a");
    assert.equal(plan.excludedCounterevidence[0]?.observationId, "obs_b");
    assert.equal(plan.uncertainty[0]?.declared, true);
    assert.equal(plan.usable, true);
    assert.equal(mem.getObservation("obs_a").accessCount, 1);
  });

  it("recognizer candidates require confidence and do not become self-reports", () => {
    const mem = engine();
    const row = mem.observe({
      observationId: "obs_rec",
      kind: "recognizer_candidate",
      observer: "prosody-recognizer",
      sourceRef: "audio-1",
      payload: { kind: "prosody", data: { voiceLevelChange: "drop" }, representationLossDeclared: false },
      uncertainty: { declared: true, note: "acoustic candidate", recognizerConfidence: 0.41 }
    });
    assert.equal(row.kind, "recognizer_candidate");
    assert.equal(row.uncertainty.recognizerConfidence, 0.41);
  });

  it("REJECT records a typed user refusal of an insight candidate", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { fragment: "support" });
    mem.observe({
      observationId: "obs_user",
      kind: "user_self_report",
      speaker: "user-1",
      payload: structuredPayload({ verdict: "reject" })
    });
    const insight = mem.crystallize({
      insightId: "ins_a",
      evidenceIds: ["obs_a"],
      uncertainty: { declared: true, note: "n", recognizerConfidence: null },
      falsificationConditions: ["user refuses"]
    });
    const result = mem.reject({
      fromRef: { kind: "observation", id: "obs_user" },
      toRef: { kind: "insight", id: insight.insightId }
    });
    assert.ok(result.relationId.startsWith("rel_"));
    assert.equal(mem.getInsight("ins_a").rejected, true);
    assert.equal(mem.trace({ from: { kind: "insight", id: "ins_a" } }).usable, false);
  });

  it("rejects missing provenance and expired temporal validity for presentation", () => {
    const mem = engine();
    assert.throws(
      () =>
        mem.observe({
          observationId: "obs_noprov",
          kind: "observed_evidence",
          payload: structuredPayload({ note: "orphan" })
        }),
      (error: unknown) => error instanceof OperationError && error.invariantId === "provenance"
    );
    observeEvidence(mem, "obs_expired", { note: "old" }, {
      occurrenceTime: "2020-01-01T00:00:00.000Z",
      temporalValidity: { validFrom: "2020-01-01T00:00:00.000Z", validTo: "2020-12-31T00:00:00.000Z" }
    });
    const plan = mem.trace({ from: { kind: "observation", id: "obs_expired" } });
    assert.equal(plan.usable, false);
    assert.ok(plan.blockedReasons.some((reason) => reason.includes("not presentable")));
  });
});
