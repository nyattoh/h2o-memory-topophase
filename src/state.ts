import type { EngineState } from "./types.js";

export function emptyState(): EngineState {
  return {
    observations: new Map(),
    relations: [],
    assemblies: new Map(),
    insights: new Map(),
    derivedViews: new Map(),
    coldStore: new Map(),
    audit: []
  };
}

export function cloneState(state: EngineState): EngineState {
  return structuredClone(state);
}

export function coldKey(observationId: string, version: number): string {
  return `${observationId}#${version}`;
}
