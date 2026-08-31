import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { derivedViewId } from "../src/derived.js";
import { OperationError } from "../src/errors.js";
import { INVARIANTS } from "../src/invariants.js";
import type { ConsentUse, DerivedKind } from "../src/types.js";
import { engine, observeEvidence, structuredPayload } from "./helpers.js";

const DERIVED_KINDS: Exclude<DerivedKind, "graph">[] = [
  "text",
  "summary",
  "vector",
  "token",
  "search_index"
];

describe("consent search vs re-presentation", () => {
  it("retrieve-only consent allows search but TRACE usable requires present", () => {
    assert.equal(INVARIANTS.deletion_and_consent.id, "deletion_and_consent");
    const mem = engine();
    observeEvidence(mem, "obs_retrieve_only", { topic: "alpha-topic" }, {
      consent: { permittedUses: ["retrieve"] }
    });
    const hits = mem.retrieve({ tokens: ["alpha"] });
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.observationId, "obs_retrieve_only");
    const plan = mem.trace({ from: { kind: "observation", id: "obs_retrieve_only" } });
    assert.equal(plan.usable, false);
    assert.equal(plan.canonicalEvents.length, 0);
    assert.ok(plan.blockedReasons.some((reason) => reason.includes("present")));
    assert.equal(mem.getObservation("obs_retrieve_only").accessCount, 0);
  });

  it("present without derive does not materialize derived views or leak into graph", () => {
    assert.equal(INVARIANTS.deletion_and_consent.id, "deletion_and_consent");
    const mem = engine();
    observeEvidence(mem, "obs_present_only", { topic: "secret-note" }, {
      consent: { permittedUses: ["present"] }
    });
    for (const kind of DERIVED_KINDS) {
      assert.equal(mem.snapshot().derivedViews.has(derivedViewId(kind, "obs_present_only", 1)), false, kind);
    }
    const graph = mem.snapshot().derivedViews.get("view_graph_global");
    if (graph) {
      assert.equal(graph.body.includes("obs_present_only"), false);
      assert.equal(graph.sourceRefs.some((ref) => ref.id === "obs_present_only"), false);
    }
    observeEvidence(mem, "obs_present_peer", { topic: "peer-note" }, {
      consent: { permittedUses: ["present"] }
    });
    mem.relate({
      type: "simultaneity",
      fromRef: { kind: "observation", id: "obs_present_only" },
      toRef: { kind: "observation", id: "obs_present_peer" }
    });
    const afterGraph = mem.getDerivedView("view_graph_global");
    assert.equal(afterGraph.body.includes("obs_present_only"), false);
    assert.equal(afterGraph.body.includes("obs_present_peer"), false);
    assert.equal(afterGraph.body.includes("simultaneity"), false);
    const plan = mem.trace({ from: { kind: "observation", id: "obs_present_only" } });
    assert.equal(plan.usable, true);
  });
});

describe("user rejection of insight and assembly", () => {
  it("user rejection from a user observation blocks re-presentation without using correction semantics", () => {
    assert.equal(INVARIANTS.restoration_and_re_presentation.id, "restoration_and_re_presentation");
    const mem = engine();
    observeEvidence(mem, "obs_evidence", { claim: "candidate-fact" });
    const user = mem.observe({
      observationId: "obs_user_no",
      kind: "user_self_report",
      speaker: "user-1",
      observer: "observer-1",
      sourceRef: "session-refuse",
      payload: structuredPayload({ verdict: "reject this candidate" })
    });
    const assembly = mem.assemble({ memberIds: ["obs_evidence"], cue: "candidate group" });
    const insight = mem.crystallize({
      insightId: "ins_refused",
      assemblyId: assembly.assemblyId,
      evidenceIds: ["obs_evidence"],
      uncertainty: { declared: true, note: "open", recognizerConfidence: null },
      falsificationConditions: ["user refuses the candidate"]
    });
    const related = mem.reject({
      fromRef: { kind: "observation", id: user.observationId, version: user.version },
      toRef: { kind: "insight", id: insight.insightId },
      note: "user refusal"
    });
    assert.ok(related.relationId.startsWith("rel_"));
    const afterInsight = mem.getInsight(insight.insightId);
    assert.equal(afterInsight.rejected, true);
    assert.equal(afterInsight.invalidated, false);
    assert.equal(afterInsight.forgotten, false);
    assert.equal(mem.getAssembly(assembly.assemblyId).rejected, true);
    const plan = mem.trace({ from: { kind: "insight", id: insight.insightId } });
    assert.equal(plan.usable, false);
    assert.ok(plan.blockedReasons.some((reason) => reason.includes("rejected")));
    const assemblyPlan = mem.trace({ from: { kind: "assembly", id: assembly.assemblyId } });
    assert.equal(assemblyPlan.usable, false);
    const audit = mem.auditLog();
    assert.ok(audit.some((entry) => entry.operation === "REJECT" && entry.summary.includes("insight")));
  });

  it("REJECT typed API blocks re-crystallization and does not revive via frequency, similarity, or restore", () => {
    const mem = engine();
    observeEvidence(mem, "obs_evidence", { claim: "candidate-fact" });
    mem.observe({
      observationId: "obs_user_no",
      kind: "user_self_report",
      speaker: "user-1",
      observer: "observer-1",
      payload: structuredPayload({ verdict: "no" })
    });
    const assembly = mem.assemble({ memberIds: ["obs_evidence"], cue: "group" });
    const insight = mem.crystallize({
      insightId: "ins_refused",
      assemblyId: assembly.assemblyId,
      evidenceIds: ["obs_evidence"],
      uncertainty: { declared: true, note: "open", recognizerConfidence: null },
      falsificationConditions: ["user refuses the candidate"]
    });
    mem.reject({
      fromRef: { kind: "observation", id: "obs_user_no" },
      toRef: { kind: "insight", id: insight.insightId },
      note: "typed user refusal"
    });
    assert.equal(mem.getInsight(insight.insightId).rejected, true);
    assert.equal(mem.getInsight(insight.insightId).invalidated, false);
    assert.ok(mem.auditLog().some((entry) => entry.operation === "REJECT"));
    assert.throws(
      () =>
        mem.crystallize({
          insightId: "ins_again",
          assemblyId: assembly.assemblyId,
          evidenceIds: ["obs_evidence"],
          uncertainty: { declared: true, note: "retry", recognizerConfidence: null },
          falsificationConditions: ["still refused"]
        }),
      (error: unknown) =>
        error instanceof OperationError && error.invariantId === "restoration_and_re_presentation"
    );
    assert.throws(
      () => mem.considerPrune("obs_evidence", "low_frequency"),
      (error: unknown) =>
        error instanceof OperationError && error.invariantId === "restoration_and_re_presentation"
    );
    assert.throws(
      () => mem.considerPrune("obs_evidence", "low_similarity"),
      OperationError
    );
    mem.moveTier({ target: { kind: "observation", id: "obs_evidence" }, storageTier: "cold" });
    const restored = mem.restore({ observationId: "obs_evidence", targetTier: "hot" });
    assert.equal(restored.current, true);
    assert.equal("payload" in restored, false);
    assert.equal(JSON.stringify(restored).includes("candidate-fact"), false);
    assert.equal(mem.getObservation("obs_evidence").payload.data.claim, "candidate-fact");
    assert.equal(mem.getInsight(insight.insightId).rejected, true);
    assert.equal(mem.trace({ from: { kind: "insight", id: insight.insightId } }).usable, false);
    const graph = mem.getDerivedView("view_graph_global");
    assert.equal(graph.body.includes("ins_refused"), false);
  });

  it("rejection is distinct from correction, deletion, and consent withdrawal", () => {
    const mem = engine();
    observeEvidence(mem, "obs_a", { claim: "keep-canonical" });
    mem.observe({
      observationId: "obs_user_no",
      kind: "user_self_report",
      speaker: "user-1",
      payload: structuredPayload({ verdict: "no" })
    });
    const insight = mem.crystallize({
      insightId: "ins_a",
      evidenceIds: ["obs_a"],
      uncertainty: { declared: true, note: "n", recognizerConfidence: null },
      falsificationConditions: ["counterexample"]
    });
    mem.reject({
      fromRef: { kind: "observation", id: "obs_user_no" },
      toRef: { kind: "insight", id: insight.insightId }
    });
    const evidence = mem.getObservation("obs_a");
    assert.equal(evidence.forgotten, false);
    assert.equal(evidence.consentWithdrawn, false);
    assert.equal(evidence.invalidatedByCorrection, false);
    assert.equal(evidence.payload.data.claim, "keep-canonical");
    assert.equal(mem.getInsight("ins_a").invalidated, false);
    assert.equal(mem.getInsight("ins_a").forgotten, false);
    assert.equal(mem.getInsight("ins_a").rejected, true);
  });
});

describe("restore success vs re-presentation permission", () => {
  it("restore of a cold current record does not grant present", () => {
    assert.equal(INVARIANTS.restoration_and_re_presentation.id, "restoration_and_re_presentation");
    const mem = engine();
    const uses: ConsentUse[] = ["retrieve", "present", "derive", "assemble"];
    observeEvidence(mem, "obs_cold", { topic: "alpha-topic" }, { consent: { permittedUses: uses } });
    mem.moveTier({ target: { kind: "observation", id: "obs_cold" }, storageTier: "cold" });
    mem.withdrawConsent({
      observationId: "obs_cold",
      permittedUses: ["retrieve", "derive", "assemble"]
    });
    const restored = mem.restore({ observationId: "obs_cold", targetTier: "hot" });
    assert.equal(restored.current, true);
    assert.equal(restored.storageTier, "hot");
    assert.equal("payload" in restored, false);
    assert.equal(JSON.stringify(restored).includes("alpha-topic"), false);
    assert.equal(restored.consent.permittedUses.includes("present"), false);
    assert.equal(mem.getObservation("obs_cold").payload.data.topic, undefined);
    assert.equal(mem.retrieve({ tokens: ["alpha"] }).length, 1);
    const plan = mem.trace({ from: { kind: "observation", id: "obs_cold" } });
    assert.equal(plan.usable, false);
    assert.ok(plan.blockedReasons.some((reason) => reason.includes("present")));
  });
});
