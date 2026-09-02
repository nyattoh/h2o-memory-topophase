import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryEngine } from "../src/engine.js";
import { InvariantError, OperationError } from "../src/errors.js";
import { ingestTimedObservationSequence } from "../src/multimodal.js";
import type { ObserveInput } from "../src/types.js";
import { MULTIMODAL_SEQUENCE } from "./fixtures/multimodal-sequence.js";

const VALID_HASH = `sha256:${"c".repeat(64)}`;

function baseObservation(overrides: Partial<ObserveInput> = {}): ObserveInput {
  return {
    observationId: "obs_base",
    kind: "observed_evidence",
    observer: "synthetic-observer",
    sourceMaterial: {
      mediaType: "audio",
      contentHash: VALID_HASH,
      locator: "fixture:audio/base"
    },
    occurrenceTime: "2026-01-01T00:00:00.000Z",
    payload: {
      kind: "prosody",
      data: { voiceLevelChange: "drop" },
      representationLossDeclared: true
    },
    ...overrides
  };
}

describe("H2O Core Stage A canonical multimodal observations", () => {
  it("round-trips time-aligned pre-transcription observations and recognizer alternatives", () => {
    const mem = new MemoryEngine();
    const rows = ingestTimedObservationSequence(mem, MULTIMODAL_SEQUENCE);

    assert.deepEqual(
      rows.map((row) => row.observationId),
      [
        "obs_speech_segment",
        "obs_prosody_drop",
        "obs_head_turn",
        "obs_recognizer_candidates",
        "obs_pause",
        "obs_overlap"
      ]
    );
    const utterance = mem.timeline({ synchronyGroupId: "sync-utterance-001" });
    assert.equal(utterance.length, 4);
    assert.deepEqual(utterance.map((row) => row.sequenceIndex), [0, 1, 2, 3]);

    const prosody = mem.getObservation("obs_prosody_drop");
    assert.equal(prosody.payload.kind, "prosody");
    assert.equal(prosody.payload.data.voiceLevelChange, "drop");
    assert.equal(prosody.sourceMaterial?.mediaType, "audio");
    assert.equal(prosody.sourceMaterial?.contentHash, `sha256:${"a".repeat(64)}`);

    const candidate = mem.getObservation("obs_recognizer_candidates");
    assert.equal(candidate.kind, "recognizer_candidate");
    assert.deepEqual(candidate.recognizerCandidates, [
      { candidateId: "candidate-1", value: "betsu ni ii", confidence: 0.82 },
      { candidateId: "candidate-2", value: "betsu ni", confidence: 0.14 }
    ]);

    const simultaneity = mem.snapshot().relations.filter((relation) => relation.type === "simultaneity");
    assert.equal(simultaneity.length, 4);
  });

  it("filters the canonical timeline by an overlapping time window", () => {
    const mem = new MemoryEngine();
    ingestTimedObservationSequence(mem, MULTIMODAL_SEQUENCE);
    const rows = mem.timeline({
      start: "2026-01-01T00:00:14.000Z",
      end: "2026-01-01T00:00:14.500Z"
    });
    assert.deepEqual(rows.map((row) => row.observationId), ["obs_pause", "obs_overlap"]);
  });

  it("rejects invalid source digests without mutating canonical state", () => {
    const mem = new MemoryEngine();
    assert.throws(
      () =>
        mem.observe(
          baseObservation({
            sourceMaterial: {
              mediaType: "audio",
              contentHash: "sha256:not-a-digest",
              locator: "fixture:audio/base"
            }
          })
        ),
      (error: unknown) => error instanceof InvariantError && error.invariantId === "provenance"
    );
    assert.equal(mem.snapshot().observations.size, 0);
  });

  it("rejects reversed time ranges", () => {
    const mem = new MemoryEngine();
    assert.throws(
      () =>
        mem.observe(
          baseObservation({
            timeSpan: {
              start: "2026-01-01T00:00:02.000Z",
              end: "2026-01-01T00:00:01.000Z"
            }
          })
        ),
      (error: unknown) => error instanceof InvariantError && error.invariantId === "temporal_validity"
    );
  });

  it("rejects candidate metadata attached to observed evidence", () => {
    const mem = new MemoryEngine();
    assert.throws(
      () =>
        mem.observe(
          baseObservation({
            recognizerCandidates: [
              { candidateId: "candidate-1", value: "possible transcript", confidence: 0.7 }
            ]
          })
        ),
      (error: unknown) =>
        error instanceof InvariantError && error.invariantId === "representation_loss_declaration"
    );
  });

  it("rejects recognizer confidence outside the closed interval", () => {
    const mem = new MemoryEngine();
    assert.throws(
      () =>
        mem.observe(
          baseObservation({
            kind: "recognizer_candidate",
            recognizerCandidates: [
              { candidateId: "candidate-1", value: "possible transcript", confidence: 1.2 }
            ],
            uncertainty: {
              declared: true,
              note: "synthetic invalid candidate",
              recognizerConfidence: 0.9
            }
          })
        ),
      (error: unknown) => error instanceof InvariantError && error.invariantId === "uncertainty"
    );
  });

  it("rejects emotion or intention fields on non-verbal observed evidence", () => {
    const mem = new MemoryEngine();
    assert.throws(
      () =>
        mem.observe(
          baseObservation({
            payload: {
              kind: "prosody",
              data: { voiceLevelChange: "drop", emotion: "sad" },
              representationLossDeclared: true
            }
          })
        ),
      (error: unknown) =>
        error instanceof OperationError && error.invariantId === "representation_loss_declaration"
    );
  });

  it("redacts source locators and recognizer alternatives when presentation consent is withdrawn", () => {
    const mem = new MemoryEngine();
    ingestTimedObservationSequence(mem, MULTIMODAL_SEQUENCE);
    mem.withdrawConsent({
      observationId: "obs_recognizer_candidates",
      permittedUses: ["retrieve", "derive"]
    });
    const row = mem.getObservation("obs_recognizer_candidates");
    assert.equal(row.sourceMaterial, null);
    assert.deepEqual(row.recognizerCandidates, []);
    assert.equal(
      mem.timeline().some((item) => item.observationId === "obs_recognizer_candidates"),
      false
    );
  });
});
