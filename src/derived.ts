import type {
  DerivedKind,
  DerivedViewRecord,
  EngineState,
  EntityRef,
  ObservationRecord
} from "./types.js";

const DERIVED_KINDS: Exclude<DerivedKind, "graph">[] = [
  "text",
  "summary",
  "vector",
  "token",
  "search_index"
];

export function derivedViewId(kind: DerivedKind, observationId: string, version: number): string {
  return `view_${kind}_${observationId}_v${version}`;
}

export function tokenize(observation: ObservationRecord): string[] {
  const parts = [
    observation.kind,
    observation.payload.kind,
    ...Object.values(observation.payload.data).map((value) => String(value))
  ];
  return parts
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

export function materializeDerivedViews(
  state: EngineState,
  observation: ObservationRecord,
  ids: { next(prefix: string): string }
): DerivedViewRecord[] {
  if (!canDeriveFrom(observation)) {
    refreshGraphView(state, ids);
    return [];
  }
  const created: DerivedViewRecord[] = [];
  const tokens = tokenize(observation);
  const textBody = Object.entries(observation.payload.data)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
  const bodies: Record<Exclude<DerivedKind, "graph">, string> = {
    text: textBody.length > 0 ? textBody : observation.payload.kind,
    summary: `summary of ${observation.observationId}@${observation.version} (${observation.kind})`,
    vector: JSON.stringify({
      scheme: "none",
      sourceObservationId: observation.observationId,
      sourceVersion: observation.version,
      note: "No embedding is computed in this prototype."
    }),
    token: tokens.join(" "),
    search_index: JSON.stringify({ tokens, observationId: observation.observationId, version: observation.version })
  };

  for (const kind of DERIVED_KINDS) {
    const view: DerivedViewRecord = {
      viewId: derivedViewId(kind, observation.observationId, observation.version),
      kind,
      sourceObservationId: observation.observationId,
      sourceVersion: observation.version,
      sourceRefs: [{ kind: "observation", id: observation.observationId, version: observation.version }],
      body: bodies[kind],
      stale: false,
      representationLossDeclared: true
    };
    state.derivedViews.set(view.viewId, view);
    created.push(view);
  }

  refreshGraphView(state, ids);
  return created;
}

export function staleViewsFor(state: EngineState, observationId: string, version?: number): void {
  for (const view of state.derivedViews.values()) {
    if (view.sourceObservationId !== observationId) {
      continue;
    }
    if (version === undefined || view.sourceVersion === version) {
      view.stale = true;
      view.body = "";
    }
  }
  const graph = state.derivedViews.get("view_graph_global");
  if (graph) {
    graph.stale = true;
    graph.body = "";
  }
}

export function refreshGraphView(state: EngineState, ids: { next(prefix: string): string }): void {
  const existing = state.derivedViews.get("view_graph_global");
  const refs: EntityRef[] = [];
  const allowedObservationIds = new Set<string>();
  for (const [observationId, versions] of state.observations) {
    const current = versions.find((row) => row.current);
    if (current && canDeriveFrom(current)) {
      allowedObservationIds.add(observationId);
      refs.push({ kind: "observation", id: observationId, version: current.version });
    }
  }
  const allowedInsightIds = new Set(
    [...state.insights.values()]
      .filter((insight) => !insight.forgotten && !insight.rejected)
      .map((insight) => insight.insightId)
  );
  const allowedAssemblyIds = new Set(
    [...state.assemblies.values()]
      .filter((assembly) => !assembly.forgotten && !assembly.rejected)
      .map((assembly) => assembly.assemblyId)
  );
  const edges = state.relations
    .filter((rel) => graphRefAllowed(rel.fromRef, allowedObservationIds, allowedInsightIds, allowedAssemblyIds))
    .filter((rel) => graphRefAllowed(rel.toRef, allowedObservationIds, allowedInsightIds, allowedAssemblyIds))
    .map((rel) => ({
      type: rel.type,
      from: rel.fromRef,
      to: rel.toRef
    }));
  const view: DerivedViewRecord = {
    viewId: "view_graph_global",
    kind: "graph",
    sourceObservationId: null,
    sourceVersion: null,
    sourceRefs: refs,
    body: JSON.stringify({ edges, generatedFrom: refs }),
    stale: false,
    representationLossDeclared: true
  };
  if (!existing) {
    ids.next("graph");
  }
  state.derivedViews.set(view.viewId, view);
}

function graphRefAllowed(
  ref: EntityRef,
  observations: Set<string>,
  insights: Set<string>,
  assemblies: Set<string>
): boolean {
  if (ref.kind === "observation") {
    return observations.has(ref.id);
  }
  if (ref.kind === "insight") {
    return insights.has(ref.id);
  }
  if (ref.kind === "assembly") {
    return assemblies.has(ref.id);
  }
  return true;
}

export function viewIsUsable(state: EngineState, view: DerivedViewRecord, at: string): boolean {
  return viewMeetsSourcePolicy(state, view, at, sourceIsPresentable);
}

export function viewIsRetrievable(state: EngineState, view: DerivedViewRecord, at: string): boolean {
  return viewMeetsSourcePolicy(state, view, at, sourceIsRetrievable);
}

function viewMeetsSourcePolicy(
  state: EngineState,
  view: DerivedViewRecord,
  at: string,
  policy: (observation: ObservationRecord, at: string) => boolean
): boolean {
  if (view.stale) {
    return false;
  }
  if (view.sourceObservationId === null) {
    return view.sourceRefs.every((ref) => {
      if (ref.kind !== "observation") {
        return true;
      }
      const versions = state.observations.get(ref.id);
      const current = versions?.find((row) => row.current);
      return current !== undefined && policy(current, at);
    });
  }
  const versions = state.observations.get(view.sourceObservationId);
  const source = versions?.find((row) => row.version === view.sourceVersion);
  if (!source) {
    return false;
  }
  if (!source.current || source.version !== view.sourceVersion) {
    return false;
  }
  return policy(source, at);
}

export function withinTemporalWindow(observation: ObservationRecord, at: string): boolean {
  if (at < observation.temporalValidity.validFrom) {
    return false;
  }
  if (observation.temporalValidity.validTo !== null && at > observation.temporalValidity.validTo) {
    return false;
  }
  return true;
}

export function sourceIsPresentable(observation: ObservationRecord, at: string): boolean {
  if (observation.forgotten) {
    return false;
  }
  if (!observation.current) {
    return false;
  }
  if (observation.storageTier === "cold" || !observation.workingPayloadResident) {
    return false;
  }
  if (!observation.consent.permittedUses.includes("present")) {
    return false;
  }
  return withinTemporalWindow(observation, at);
}

export function sourceIsRetrievable(observation: ObservationRecord, at: string): boolean {
  if (observation.forgotten) {
    return false;
  }
  if (!observation.current) {
    return false;
  }
  if (observation.storageTier === "cold" || !observation.workingPayloadResident) {
    return false;
  }
  if (!observation.consent.permittedUses.includes("retrieve")) {
    return false;
  }
  return withinTemporalWindow(observation, at);
}

export function canDeriveFrom(observation: ObservationRecord): boolean {
  return (
    !observation.forgotten &&
    observation.current &&
    observation.consent.permittedUses.includes("derive")
  );
}
