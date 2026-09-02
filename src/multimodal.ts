import type { MemoryEngine } from "./engine.js";
import type { ObservationRecord, ObserveInput } from "./types.js";

export interface TimedObservationSequence {
  sequenceId: string;
  observations: ObserveInput[];
}

/**
 * Deterministic adapter for canonical pre-transcription observation fixtures.
 * Each append keeps its own audit entry; the returned view is time-aligned.
 */
export function ingestTimedObservationSequence(
  engine: Pick<MemoryEngine, "observe" | "relate" | "timeline">,
  sequence: TimedObservationSequence
): ObservationRecord[] {
  const firstByGroup = new Map<string, ObservationRecord>();
  const insertedIds = new Set<string>();
  for (const input of sequence.observations) {
    const row = engine.observe(input);
    insertedIds.add(row.observationId);
    if (row.synchronyGroupId === null) {
      continue;
    }
    const first = firstByGroup.get(row.synchronyGroupId);
    if (!first) {
      firstByGroup.set(row.synchronyGroupId, row);
      continue;
    }
    engine.relate({
      type: "simultaneity",
      fromRef: { kind: "observation", id: first.observationId, version: first.version },
      toRef: { kind: "observation", id: row.observationId, version: row.version },
      note: `synchrony group ${row.synchronyGroupId}`
    });
  }
  return engine.timeline().filter((row) => insertedIds.has(row.observationId));
}
