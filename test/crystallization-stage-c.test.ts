import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateCrystallizationTiming,
  MemoryEngine,
  SequentialClock,
  SequentialIds,
  SuddenCrystallizationController
} from "../src/index.js";

function engine(): MemoryEngine {
  return new MemoryEngine({
    clock: new SequentialClock("2026-01-01T00:00:00.000Z"),
    ids: new SequentialIds()
  });
}

function observe(mem: MemoryEngine, observationId: string): void {
  mem.observe({
    observationId,
    kind: "observed_evidence",
    observer: "synthetic-stage-c",
    payload: {
      kind: "structured",
      data: { fragment: observationId },
      representationLossDeclared: false
    }
  });
}

function fixture(): {
  mem: MemoryEngine;
  controller: SuddenCrystallizationController;
} {
  const mem = engine();
  observe(mem, "obs_a");
  observe(mem, "obs_b");
  observe(mem, "obs_c");
  observe(mem, "obs_counter");
  mem.relate({
    type: "contradiction",
    fromRef: { kind: "observation", id: "obs_b" },
    toRef: { kind: "observation", id: "obs_counter" }
  });
  mem.assemble({
    assemblyId: "asm_stage_c",
    memberIds: ["obs_a", "obs_b", "obs_c"],
    cue: "synthetic metric sequence"
  });
  return {
    mem,
    controller: new SuddenCrystallizationController(mem, {
      minEvidence: 3,
      minSupportDensity: 0.75,
      minDensityDelta: 0.25,
      minPredictionErrorDrop: 0.2
    })
  };
}

const plan = {
  assemblyId: "asm_stage_c",
  insightId: "ins_stage_c",
  statement: "synthetic candidate conclusion",
  uncertainty: {
    declared: true,
    note: "fixed metric baseline",
    recognizerConfidence: null
  },
  falsificationConditions: ["counterevidence remains unresolved"]
};

describe("H2O Core Stage C sudden crystallization metric baseline", () => {
  it("does not label gradual accumulation as a sudden crystallization", () => {
    const { mem, controller } = fixture();
    const samples = [
      ["2026-01-01T00:00:01.000Z", 0.4, 0.7],
      ["2026-01-01T00:00:02.000Z", 0.55, 0.6],
      ["2026-01-01T00:00:03.000Z", 0.7, 0.5],
      ["2026-01-01T00:00:04.000Z", 0.8, 0.4]
    ] as const;
    for (const [at, supportDensity, predictionError] of samples) {
      const decision = controller.observe(
        { at, evidenceIds: ["obs_a", "obs_b", "obs_c"], supportDensity, predictionError },
        plan
      );
      assert.equal(decision.status, "accumulating");
      assert.equal(decision.sudden, false);
    }
    assert.equal(mem.snapshot().insights.size, 0);
  });

  it("forms an insight exactly when density jumps and prediction error drops", () => {
    const { controller } = fixture();
    controller.observe(
      {
        at: "2026-01-01T00:00:01.000Z",
        evidenceIds: ["obs_a", "obs_b", "obs_c"],
        supportDensity: 0.45,
        predictionError: 0.72
      },
      plan
    );
    const decision = controller.observe(
      {
        at: "2026-01-01T00:00:02.000Z",
        evidenceIds: ["obs_a", "obs_b", "obs_c"],
        supportDensity: 0.8,
        predictionError: 0.42
      },
      plan
    );

    assert.equal(decision.status, "crystallized");
    assert.equal(decision.sudden, true);
    assert.deepEqual(decision.insight?.formation, {
      mode: "sudden_metric",
      at: "2026-01-01T00:00:02.000Z",
      supportDensity: 0.8,
      densityDelta: 0.35000000000000003,
      predictionError: 0.42,
      predictionErrorDrop: 0.3
    });
  });

  it("holds when evidence is insufficient and leaves canonical state unchanged", () => {
    const { mem, controller } = fixture();
    const before = mem.snapshot();
    const decision = controller.observe(
      {
        at: "2026-01-01T00:00:01.000Z",
        evidenceIds: ["obs_a", "obs_b"],
        supportDensity: 0.9,
        predictionError: 0.1
      },
      plan
    );
    assert.equal(decision.status, "held");
    assert.equal(decision.reason, "insufficient_evidence");
    assert.deepEqual(mem.snapshot(), before);
  });

  it("keeps source evidence and linked counterevidence traceable", () => {
    const { mem, controller } = fixture();
    controller.observe(
      {
        at: "2026-01-01T00:00:01.000Z",
        evidenceIds: ["obs_a", "obs_b", "obs_c"],
        supportDensity: 0.4,
        predictionError: 0.75
      },
      plan
    );
    const decision = controller.observe(
      {
        at: "2026-01-01T00:00:02.000Z",
        evidenceIds: ["obs_a", "obs_b", "obs_c"],
        supportDensity: 0.82,
        predictionError: 0.35
      },
      plan
    );
    const trace = mem.trace({ from: { kind: "insight", id: decision.insight!.insightId } });
    assert.deepEqual(
      trace.canonicalEvents.map((row) => row.observationId).sort(),
      ["obs_a", "obs_b", "obs_c"]
    );
    assert.deepEqual(
      trace.excludedCounterevidence.map((row) => row.observationId),
      ["obs_counter"]
    );
  });

  it("invalidates a formed insight when supporting evidence is corrected", () => {
    const { mem, controller } = fixture();
    controller.observe(
      {
        at: "2026-01-01T00:00:01.000Z",
        evidenceIds: ["obs_a", "obs_b", "obs_c"],
        supportDensity: 0.4,
        predictionError: 0.75
      },
      plan
    );
    controller.observe(
      {
        at: "2026-01-01T00:00:02.000Z",
        evidenceIds: ["obs_a", "obs_b", "obs_c"],
        supportDensity: 0.82,
        predictionError: 0.35
      },
      plan
    );
    mem.correct({
      observationId: "obs_b",
      payload: {
        kind: "structured",
        data: { fragment: "corrected synthetic fragment" },
        representationLossDeclared: false
      }
    });
    assert.equal(mem.getInsight("ins_stage_c").invalidated, true);
  });

  it("separates premature, late, missed, and on-time detection", () => {
    assert.deepEqual(evaluateCrystallizationTiming(2, 3), {
      expectedIndex: 3,
      detectedIndex: 2,
      premature: true,
      late: false,
      missed: false,
      onTime: false,
      timingError: -1
    });
    assert.equal(evaluateCrystallizationTiming(5, 3).late, true);
    assert.equal(evaluateCrystallizationTiming(null, 3).missed, true);
    assert.equal(evaluateCrystallizationTiming(3, 3).onTime, true);
  });

  it("rejects invalid samples before changing controller or engine state", () => {
    const { mem, controller } = fixture();
    const before = mem.snapshot();
    assert.throws(
      () =>
        controller.observe(
          {
            at: "not-a-time",
            evidenceIds: ["obs_a", "obs_b", "obs_c"],
            supportDensity: 1.2,
            predictionError: 0.4
          },
          plan
        ),
      /sample time/
    );
    assert.deepEqual(mem.snapshot(), before);
  });
});
