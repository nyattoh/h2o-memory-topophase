import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { derivedViewId } from "../src/derived.js";
import { OperationError } from "../src/errors.js";
import { FORGOTTEN_TOMBSTONE } from "../src/types.js";
import { engine, observeEvidence, publicJson, structuredPayload } from "./helpers.js";

const SENTINELS = [
  "private-source-alpha",
  "private-speaker-alpha",
  "private-observer-alpha",
  "alpha-relation-secret",
  "alpha-cue-secret",
  "alpha-assembly-candidate-secret",
  "alpha-uncertainty-secret",
  "alpha-falsifier-secret",
  "alpha-insight-body-secret",
  "alpha-counter-secret",
  "alpha-graph-relation-secret",
  "alpha-payload-secret"
] as const;

const KEEP_SENTINEL = "keep-visible-beta";

function assertNoSentinel(label: string, haystack: string, extra: readonly string[] = []): void {
  for (const sentinel of [...SENTINELS, ...extra]) {
    assert.equal(haystack.includes(sentinel), false, `${label} leaked ${sentinel}`);
  }
}

function publicSurfaces(mem: ReturnType<typeof engine>, observationId: string, assemblyId: string, insightId: string): string {
  const parts = [
    publicJson(mem.snapshot()),
    publicJson(mem.getObservation(observationId)),
    publicJson(mem.getObservation(observationId, 1)),
    publicJson(mem.getAssembly(assemblyId)),
    publicJson(mem.getInsight(insightId)),
    publicJson(mem.inspectSearchIndex(observationId)),
    publicJson(mem.tokensOf(observationId))
  ];
  for (const kind of ["text", "summary", "vector", "token", "search_index"] as const) {
    parts.push(publicJson(mem.getDerivedView(derivedViewId(kind, observationId, 1))));
  }
  const graph = mem.snapshot().derivedViews.get("view_graph_global");
  if (graph) {
    parts.push(publicJson(mem.getDerivedView("view_graph_global")));
  }
  return parts.join("\n");
}

function seedForgetGraph(mem: ReturnType<typeof engine>, options: { includeKeep?: boolean } = {}) {
  observeEvidence(
    mem,
    "obs_secret",
    { secret: "alpha-payload-secret", counter: "alpha-counter-secret" },
    {
      speaker: "private-speaker-alpha",
      observer: "private-observer-alpha",
      sourceRef: "private-source-alpha"
    }
  );
  observeEvidence(mem, "obs_counter", { fragment: "peer-counter" });
  if (options.includeKeep) {
    observeEvidence(mem, "obs_keep", { fragment: KEEP_SENTINEL });
  }
  mem.relate({
    type: "simultaneity",
    fromRef: { kind: "observation", id: "obs_secret", version: 1 },
    toRef: { kind: "observation", id: "obs_counter", version: 1 },
    note: "alpha-relation-secret"
  });
  mem.relate({
    type: "potential_falsifier",
    fromRef: { kind: "observation", id: "obs_counter", version: 1 },
    toRef: { kind: "observation", id: "obs_secret", version: 1 },
    note: "alpha-graph-relation-secret"
  });
  const members = options.includeKeep ? ["obs_secret", "obs_keep"] : ["obs_secret"];
  const assembly = mem.assemble({
    memberIds: members,
    cue: "alpha-cue-secret alpha-assembly-candidate-secret"
  });
  const evidenceIds = options.includeKeep ? ["obs_secret", "obs_keep"] : ["obs_secret"];
  const insight = mem.crystallize({
    insightId: "ins_secret",
    assemblyId: assembly.assemblyId,
    evidenceIds,
    statement: "alpha-insight-body-secret",
    uncertainty: { declared: true, note: "alpha-uncertainty-secret", recognizerConfidence: null },
    falsificationConditions: ["alpha-falsifier-secret"],
    excludedCounterevidenceIds: ["obs_counter"]
  });
  return { assembly, insight };
}

describe("FORGET deletion propagation", () => {
  it("hides every sentinel from public reads after forgetting the source observation", () => {
    const mem = engine();
    const { assembly, insight } = seedForgetGraph(mem);
    mem.forget({ observationId: "obs_secret", note: "alpha-payload-secret" });
    const forgotten = mem.getObservation("obs_secret");
    assert.equal(forgotten.forgotten, true);
    assert.equal(forgotten.observationId, "obs_secret");
    assert.equal(forgotten.speaker, FORGOTTEN_TOMBSTONE);
    assert.equal(forgotten.observer, FORGOTTEN_TOMBSTONE);
    assert.equal(forgotten.sourceRef, FORGOTTEN_TOMBSTONE);
    assert.equal(mem.getAssembly(assembly.assemblyId).forgotten, true);
    assert.equal(mem.getAssembly(assembly.assemblyId).invalidated, true);
    assert.equal(mem.getAssembly(assembly.assemblyId).cue, null);
    assert.equal(mem.getInsight(insight.insightId).forgotten, true);
    assert.equal(mem.getInsight(insight.insightId).invalidated, true);
    assert.equal(mem.getInsight(insight.insightId).statement, null);
    assert.equal(mem.getInsight(insight.insightId).uncertainty.note, null);
    assert.deepEqual(mem.getInsight(insight.insightId).falsificationConditions, []);
    assert.ok(mem.snapshot().relations.some((rel) => rel.type === "deletion"));
    assert.ok(mem.auditLog().some((entry) => entry.operation === "FORGET"));
    assertNoSentinel("public surfaces", publicSurfaces(mem, "obs_secret", assembly.assemblyId, insight.insightId));
    const counter = mem.getObservation("obs_counter");
    assert.equal(counter.forgotten, false);
    assert.equal(counter.payload.data.fragment, "peer-counter");
  });

  it("partial evidence forget invalidates candidates and hides forgotten free text without dropping remaining evidence", () => {
    const mem = engine();
    const { assembly, insight } = seedForgetGraph(mem, { includeKeep: true });
    mem.forget({ observationId: "obs_secret" });
    assert.equal(mem.getObservation("obs_keep").payload.data.fragment, KEEP_SENTINEL);
    assert.equal(mem.getObservation("obs_keep").forgotten, false);
    assert.equal(mem.getAssembly(assembly.assemblyId).forgotten, true);
    assert.equal(mem.getAssembly(assembly.assemblyId).invalidated, true);
    assert.equal(mem.getAssembly(assembly.assemblyId).cue, null);
    assert.equal(mem.getInsight(insight.insightId).forgotten, false);
    assert.equal(mem.getInsight(insight.insightId).invalidated, true);
    assert.equal(mem.getInsight(insight.insightId).statement, null);
    assert.equal(mem.getInsight(insight.insightId).uncertainty.note, null);
    assertNoSentinel(
      "partial forget",
      publicSurfaces(mem, "obs_secret", assembly.assemblyId, insight.insightId)
    );
    assert.equal(publicJson(mem.getObservation("obs_keep")).includes(KEEP_SENTINEL), true);
  });

  it("forgetting every evidence item marks the insight forgotten", () => {
    const mem = engine();
    const { assembly, insight } = seedForgetGraph(mem, { includeKeep: true });
    mem.forget({ observationId: "obs_secret" });
    mem.forget({ observationId: "obs_keep" });
    assert.equal(mem.getInsight(insight.insightId).forgotten, true);
    assert.equal(mem.getInsight(insight.insightId).invalidated, true);
    assertNoSentinel(
      "full evidence forget",
      publicSurfaces(mem, "obs_secret", assembly.assemblyId, insight.insightId),
      [KEEP_SENTINEL]
    );
  });
});

describe("public-policy negatives", () => {
  it("withdrawn consent hides every version body, including pre-withdrawal history", () => {
    const mem = engine();
    observeEvidence(mem, "obs_hist", { address: "12 Old Street" });
    mem.correct({
      observationId: "obs_hist",
      payload: structuredPayload({ address: "90 New Avenue" })
    });
    assert.equal(mem.getObservation("obs_hist", 1).payload.data.address, "12 Old Street");
    mem.withdrawConsent({ observationId: "obs_hist", permittedUses: [] });
    assert.equal(mem.getObservation("obs_hist").payload.data.address, undefined);
    assert.equal(mem.getObservation("obs_hist", 1).payload.data.address, undefined);
    assert.equal(mem.getObservation("obs_hist", 2).payload.data.address, undefined);
    assert.equal(publicJson(mem.snapshot()).includes("12 Old Street"), false);
    assert.equal(publicJson(mem.snapshot()).includes("90 New Avenue"), false);
    assert.equal(mem.getObservation("obs_hist", 1).version, 1);
    assert.equal(mem.getObservation("obs_hist", 1).current, false);
  });

  it("TRACE excluded counterevidence and relation-derived falsifiers follow present, forget, and validity policy", () => {
    const mem = engine();
    observeEvidence(mem, "obs_support", { fragment: "support" });
    observeEvidence(mem, "obs_excluded", { fragment: "alpha-counter-secret" }, {
      consent: { permittedUses: ["retrieve"] }
    });
    observeEvidence(mem, "obs_falsifier", { fragment: "alpha-graph-relation-secret" });
    mem.relate({
      type: "potential_falsifier",
      fromRef: { kind: "observation", id: "obs_falsifier", version: 1 },
      toRef: { kind: "observation", id: "obs_support", version: 1 },
      note: "alpha-relation-secret"
    });
    const insight = mem.crystallize({
      evidenceIds: ["obs_support"],
      uncertainty: { declared: true, note: "open", recognizerConfidence: null },
      falsificationConditions: ["counterexample"],
      excludedCounterevidenceIds: ["obs_excluded"]
    });
    mem.withdrawConsent({
      observationId: "obs_falsifier",
      permittedUses: ["retrieve", "derive", "assemble"]
    });
    const plan = mem.trace({ from: { kind: "insight", id: insight.insightId } });
    assert.equal(plan.usable, true);
    assert.equal(plan.canonicalEvents[0]?.observationId, "obs_support");
    const excludedJson = publicJson(plan.excludedCounterevidence);
    assert.equal(excludedJson.includes("obs_excluded"), true);
    assert.equal(excludedJson.includes("alpha-counter-secret"), false);
    assert.equal(excludedJson.includes("alpha-graph-relation-secret"), false);
    assert.equal(excludedJson.includes("alpha-relation-secret"), false);
  });

  it("RESTORE returns only placement diagnostics and does not grant present", () => {
    const mem = engine();
    observeEvidence(mem, "obs_restore", { topic: "alpha-payload-secret" });
    mem.moveTier({ target: { kind: "observation", id: "obs_restore" }, storageTier: "cold" });
    mem.withdrawConsent({
      observationId: "obs_restore",
      permittedUses: ["retrieve", "derive", "assemble"]
    });
    const restored = mem.restore({ observationId: "obs_restore", targetTier: "hot" });
    assert.equal(restored.storageTier, "hot");
    assert.equal(restored.current, true);
    assertNoSentinel("restore result", publicJson(restored));
    assert.equal(mem.getObservation("obs_restore").payload.data.topic, undefined);
    assert.equal(mem.retrieve({ tokens: ["alpha"] }).length, 1);
    assert.equal(mem.trace({ from: { kind: "observation", id: "obs_restore" } }).usable, false);
  });

  it("versioned TRACE keeps the requested version and does not substitute current", () => {
    const mem = engine();
    observeEvidence(mem, "obs_version", { address: "12 Old Street" });
    mem.correct({
      observationId: "obs_version",
      payload: structuredPayload({ address: "90 New Avenue" })
    });
    const currentPlan = mem.trace({ from: { kind: "observation", id: "obs_version" } });
    assert.equal(currentPlan.canonicalEvents[0]?.version, 2);
    assert.equal(currentPlan.canonicalEvents[0]?.payload.data.address, "90 New Avenue");
    const v1 = mem.trace({ from: { kind: "observation", id: "obs_version", version: 1 } });
    assert.equal(v1.usable, true);
    assert.equal(v1.canonicalEvents.length, 1);
    assert.equal(v1.canonicalEvents[0]?.version, 1);
    assert.equal(v1.canonicalEvents[0]?.payload.data.address, "12 Old Street");
    assert.notEqual(publicJson(v1), publicJson(currentPlan));
  });

  it("generic RELATE cannot create rejection and REJECT keeps subject and target constraints", () => {
    const mem = engine();
    observeEvidence(mem, "obs_evidence", { claim: "keep-canonical" });
    mem.observe({
      observationId: "obs_user",
      kind: "user_self_report",
      speaker: "user-1",
      payload: structuredPayload({ verdict: "no" })
    });
    const insight = mem.crystallize({
      insightId: "ins_a",
      evidenceIds: ["obs_evidence"],
      uncertainty: { declared: true, note: "n", recognizerConfidence: null },
      falsificationConditions: ["counterexample"]
    });
    assert.throws(
      () =>
        mem.relate({
          type: "rejection",
          fromRef: { kind: "observation", id: "obs_user" },
          toRef: { kind: "insight", id: insight.insightId }
        }),
      (error: unknown) =>
        error instanceof OperationError &&
        error.operation === "RELATE" &&
        error.invariantId === "restoration_and_re_presentation"
    );
    assert.throws(
      () =>
        mem.reject({
          fromRef: { kind: "observation", id: "obs_evidence" },
          toRef: { kind: "insight", id: insight.insightId }
        }),
      (error: unknown) =>
        error instanceof OperationError &&
        error.operation === "REJECT" &&
        error.message.includes("user self-report")
    );
    assert.throws(
      () =>
        mem.reject({
          fromRef: { kind: "observation", id: "obs_user" },
          toRef: { kind: "observation", id: "obs_evidence" }
        }),
      (error: unknown) =>
        error instanceof OperationError &&
        error.operation === "REJECT" &&
        error.message.includes("insight or assembly")
    );
    assert.equal(mem.getInsight("ins_a").rejected, false);
    assert.equal(mem.snapshot().relations.some((rel) => rel.type === "rejection"), false);
  });

  it("non-verbal observations reject Japanese interpretive keys and interpretive values on measurement fields", () => {
    const mem = engine();
    assert.throws(
      () =>
        mem.observe({
          observationId: "obs_jp_key",
          kind: "observed_evidence",
          observer: "microphone-1",
          payload: {
            kind: "prosody",
            data: { 感情: "悲しい" },
            representationLossDeclared: false
          }
        }),
      (error: unknown) =>
        error instanceof OperationError && error.invariantId === "representation_loss_declaration"
    );
    assert.throws(
      () =>
        mem.observe({
          observationId: "obs_value_interp",
          kind: "observed_evidence",
          observer: "microphone-1",
          payload: {
            kind: "prosody",
            data: { voiceLevelChange: "the user is sad" },
            representationLossDeclared: false
          }
        }),
      (error: unknown) =>
        error instanceof OperationError && error.invariantId === "representation_loss_declaration"
    );
    const interpretation = mem.observe({
      observationId: "obs_interp",
      kind: "system_inference",
      observer: "interpreter-1",
      payload: {
        kind: "structured",
        data: { emotionLabel: "sad" },
        representationLossDeclared: true
      },
      uncertainty: { declared: true, note: "unverified interpretation", recognizerConfidence: null }
    });
    assert.equal(interpretation.kind, "system_inference");
    assert.equal(interpretation.payload.data.emotionLabel, "sad");
  });

  it("cold unrestored public reads do not expand resident body", () => {
    const mem = engine();
    observeEvidence(mem, "obs_cold", { topic: "alpha-payload-secret" });
    mem.moveTier({ target: { kind: "observation", id: "obs_cold" }, storageTier: "cold" });
    const cold = mem.getObservation("obs_cold");
    assert.equal(cold.storageTier, "cold");
    assert.equal(cold.payload.data.topic, undefined);
    assert.deepEqual(mem.tokensOf("obs_cold"), []);
    assertNoSentinel("cold snapshot", publicJson(mem.snapshot()));
    assertNoSentinel("cold getObservation", publicJson(cold));
    const restored = mem.restore({ observationId: "obs_cold", targetTier: "hot" });
    assertNoSentinel("restore result before presentable read", publicJson(restored));
    assert.equal(mem.getObservation("obs_cold").payload.data.topic, "alpha-payload-secret");
  });
});
