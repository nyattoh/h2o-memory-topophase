import { MemoryEngine } from "../src/engine.js";
import type { CanonicalPayload, ObserveInput } from "../src/types.js";

export function publicJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (inner instanceof Map) {
      return [...inner.entries()];
    }
    return inner;
  });
}

export function engine(): MemoryEngine {
  return new MemoryEngine();
}

export function structuredPayload(
  data: CanonicalPayload["data"],
  kind: CanonicalPayload["kind"] = "structured"
): CanonicalPayload {
  return { kind, data, representationLossDeclared: false };
}

export function observeEvidence(
  mem: MemoryEngine,
  observationId: string,
  data: CanonicalPayload["data"],
  extra: Partial<ObserveInput> = {}
) {
  const { payload: extraPayload, ...rest } = extra;
  return mem.observe({
    observationId,
    kind: extra.kind ?? "observed_evidence",
    observer: extra.observer ?? "observer-1",
    sourceRef: extra.sourceRef ?? "source-1",
    speaker: extra.speaker ?? null,
    payload: extraPayload ?? structuredPayload(data),
    ...rest
  });
}
