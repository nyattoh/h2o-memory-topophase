import { MemoryEngine } from "./engine.js";

const engine = new MemoryEngine();

const first = engine.observe({
  observationId: "obs_demo_speech",
  kind: "observed_evidence",
  observer: "microphone-1",
  sourceRef: "session-demo",
  payload: {
    kind: "speech",
    data: { transcript: "the late cue still matters" },
    representationLossDeclared: false
  }
});

const second = engine.observe({
  observationId: "obs_demo_pause",
  kind: "observed_evidence",
  observer: "microphone-1",
  sourceRef: "session-demo",
  payload: {
    kind: "pause",
    data: { durationMs: 900 },
    representationLossDeclared: false
  }
});

const assembly = engine.assemble({
  memberIds: [first.observationId, second.observationId],
  cue: "delayed reminder"
});

const insight = engine.crystallize({
  assemblyId: assembly.assemblyId,
  evidenceIds: [first.observationId, second.observationId],
  uncertainty: { declared: true, note: "cue may be coincidental", recognizerConfidence: null },
  falsificationConditions: ["a dated source shows the pause belonged to another speaker"]
});

const plan = engine.trace({ from: { kind: "insight", id: insight.insightId } });

process.stdout.write(
  JSON.stringify(
    {
      operations: ["OBSERVE", "ASSEMBLE", "CRYSTALLIZE", "TRACE"],
      insightId: insight.insightId,
      phase: insight.epistemicPhase,
      storageTier: insight.storageTier,
      evidenceCount: plan.canonicalEvents.length,
      usable: plan.usable
    },
    null,
    2
  ) + "\n"
);
