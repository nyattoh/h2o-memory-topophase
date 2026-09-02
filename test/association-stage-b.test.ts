import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AssociativeAssemblyController,
  lexicalOverlapBaseline,
  MemoryEngine,
  recentWindowBaseline,
  SequentialClock,
  SequentialIds
} from "../src/index.js";

function engine(): MemoryEngine {
  return new MemoryEngine({
    clock: new SequentialClock("2026-01-01T00:00:00.000Z"),
    ids: new SequentialIds()
  });
}

function observe(mem: MemoryEngine, observationId: string, occurrenceTime: string, code: string): void {
  mem.observe({
    observationId,
    kind: "observed_evidence",
    observer: "synthetic-stage-b",
    occurrenceTime,
    payload: {
      kind: "structured",
      data: { fragment: code },
      representationLossDeclared: false
    }
  });
}

function delayedCueFixture(): MemoryEngine {
  const mem = engine();
  observe(mem, "obs_old_a", "2020-01-01T00:00:00.000Z", "amber-mark");
  observe(mem, "obs_old_b", "2021-01-01T00:00:00.000Z", "three-beats");
  observe(mem, "obs_counter", "2021-06-01T00:00:00.000Z", "counter-example");
  for (let index = 0; index < 5; index += 1) {
    observe(
      mem,
      `obs_filler_${index}`,
      `2025-12-0${index + 1}T00:00:00.000Z`,
      `unrelated-${index}`
    );
  }
  observe(mem, "obs_late_cue", "2026-01-01T00:00:00.000Z", "lattice-key");
  mem.relate({
    type: "cue",
    fromRef: { kind: "observation", id: "obs_late_cue" },
    toRef: { kind: "observation", id: "obs_old_a" }
  });
  mem.relate({
    type: "cue",
    fromRef: { kind: "observation", id: "obs_late_cue" },
    toRef: { kind: "observation", id: "obs_old_b" }
  });
  mem.relate({
    type: "contradiction",
    fromRef: { kind: "observation", id: "obs_old_b" },
    toRef: { kind: "observation", id: "obs_counter" }
  });
  return mem;
}

describe("H2O Core Stage B delayed-cue associative assembly", () => {
  it("automatically assembles old weak fragments when a typed delayed cue arrives", () => {
    const mem = delayedCueFixture();
    const decision = new AssociativeAssemblyController(mem).onCue("obs_late_cue", {
      assemblyId: "asm_delayed"
    });

    assert.equal(decision.triggered, true);
    assert.deepEqual(decision.selectedIds, ["obs_old_a", "obs_old_b", "obs_counter"]);
    assert.equal(decision.assembly?.assemblyId, "asm_delayed");
    assert.equal(mem.getObservation("obs_old_a").epistemicPhase, "assembling");
  });

  it("does not assemble on an unrelated cue and leaves the canonical state unchanged", () => {
    const mem = delayedCueFixture();
    observe(mem, "obs_unrelated_cue", "2026-01-02T00:00:00.000Z", "blue-window");
    const before = mem.snapshot();
    const decision = new AssociativeAssemblyController(mem).onCue("obs_unrelated_cue");

    assert.equal(decision.triggered, false);
    assert.deepEqual(decision.selectedIds, []);
    assert.deepEqual(mem.snapshot(), before);
  });

  it("retains contradictory evidence as a protected candidate", () => {
    const decision = new AssociativeAssemblyController(delayedCueFixture()).onCue("obs_late_cue");
    assert.deepEqual(decision.candidates, [
      { observationId: "obs_old_a", reason: "direct_cue", score: 1 },
      { observationId: "obs_old_b", reason: "direct_cue", score: 1 },
      { observationId: "obs_counter", reason: "contradiction_guard", score: 0.5 }
    ]);
  });

  it("recovers evidence missed by a simple recent window", () => {
    const mem = delayedCueFixture();
    assert.deepEqual(recentWindowBaseline(mem, "obs_late_cue", 3), [
      "obs_filler_2",
      "obs_filler_3",
      "obs_filler_4"
    ]);
    const decision = new AssociativeAssemblyController(mem).onCue("obs_late_cue");
    assert.equal(decision.selectedIds.includes("obs_old_a"), true);
    assert.equal(decision.selectedIds.includes("obs_old_b"), true);
  });

  it("recovers typed associations missed by lexical overlap", () => {
    const mem = delayedCueFixture();
    assert.deepEqual(lexicalOverlapBaseline(mem, "obs_late_cue"), []);
    assert.deepEqual(
      new AssociativeAssemblyController(mem).onCue("obs_late_cue").selectedIds,
      ["obs_old_a", "obs_old_b", "obs_counter"]
    );
  });

  it("does not bypass consent withdrawal through an old cue relation", () => {
    const mem = delayedCueFixture();
    mem.withdrawConsent({ observationId: "obs_old_b", permittedUses: ["assemble"] });
    const decision = new AssociativeAssemblyController(mem).onCue("obs_late_cue");
    assert.equal(decision.triggered, false);
    assert.deepEqual(decision.selectedIds, ["obs_old_a"]);
    assert.deepEqual(decision.excludedIds, ["obs_old_b"]);
  });
});
