import type { TimedObservationSequence } from "../../src/multimodal.js";

const AUDIO_HASH = `sha256:${"a".repeat(64)}`;
const VIDEO_HASH = `sha256:${"b".repeat(64)}`;

export const MULTIMODAL_SEQUENCE: TimedObservationSequence = {
  sequenceId: "synthetic-session-001",
  observations: [
    {
      observationId: "obs_speech_segment",
      kind: "observed_evidence",
      observer: "synthetic-audio-feature-extractor",
      sourceMaterial: {
        mediaType: "audio",
        contentHash: AUDIO_HASH,
        locator: "fixture:audio/synthetic-session-001"
      },
      occurrenceTime: "2026-01-01T00:00:12.400Z",
      timeSpan: {
        start: "2026-01-01T00:00:12.400Z",
        end: "2026-01-01T00:00:13.300Z"
      },
      synchronyGroupId: "sync-utterance-001",
      sequenceIndex: 0,
      payload: {
        kind: "speech",
        data: { durationMs: 900 },
        representationLossDeclared: true
      }
    },
    {
      observationId: "obs_prosody_drop",
      kind: "observed_evidence",
      observer: "synthetic-audio-feature-extractor",
      sourceMaterial: {
        mediaType: "audio",
        contentHash: AUDIO_HASH,
        locator: "fixture:audio/synthetic-session-001"
      },
      occurrenceTime: "2026-01-01T00:00:12.400Z",
      timeSpan: {
        start: "2026-01-01T00:00:12.400Z",
        end: "2026-01-01T00:00:13.300Z"
      },
      synchronyGroupId: "sync-utterance-001",
      sequenceIndex: 1,
      payload: {
        kind: "prosody",
        data: { voiceLevelChange: "drop", intensityDb: -18.2, pitchHz: 171.4 },
        representationLossDeclared: true
      }
    },
    {
      observationId: "obs_head_turn",
      kind: "observed_evidence",
      observer: "synthetic-gesture-extractor",
      sourceMaterial: {
        mediaType: "video",
        contentHash: VIDEO_HASH,
        locator: "fixture:video/synthetic-session-001"
      },
      occurrenceTime: "2026-01-01T00:00:12.400Z",
      timeSpan: {
        start: "2026-01-01T00:00:12.600Z",
        end: "2026-01-01T00:00:13.100Z"
      },
      synchronyGroupId: "sync-utterance-001",
      sequenceIndex: 2,
      payload: {
        kind: "gesture",
        data: { movement: "head_turn", durationMs: 500 },
        representationLossDeclared: true
      }
    },
    {
      observationId: "obs_recognizer_candidates",
      kind: "recognizer_candidate",
      observer: "synthetic-speech-recognizer",
      sourceMaterial: {
        mediaType: "audio",
        contentHash: AUDIO_HASH,
        locator: "fixture:audio/synthetic-session-001"
      },
      occurrenceTime: "2026-01-01T00:00:12.400Z",
      timeSpan: {
        start: "2026-01-01T00:00:12.400Z",
        end: "2026-01-01T00:00:13.300Z"
      },
      synchronyGroupId: "sync-utterance-001",
      sequenceIndex: 3,
      payload: {
        kind: "speech",
        data: { durationMs: 900 },
        representationLossDeclared: true
      },
      recognizerCandidates: [
        { candidateId: "candidate-1", value: "betsu ni ii", confidence: 0.82 },
        { candidateId: "candidate-2", value: "betsu ni", confidence: 0.14 }
      ],
      uncertainty: {
        declared: true,
        note: "synthetic recognition alternatives",
        recognizerConfidence: 0.82
      }
    },
    {
      observationId: "obs_pause",
      kind: "observed_evidence",
      observer: "synthetic-audio-feature-extractor",
      sourceMaterial: {
        mediaType: "audio",
        contentHash: AUDIO_HASH,
        locator: "fixture:audio/synthetic-session-001"
      },
      occurrenceTime: "2026-01-01T00:00:13.300Z",
      timeSpan: {
        start: "2026-01-01T00:00:13.300Z",
        end: "2026-01-01T00:00:15.000Z"
      },
      synchronyGroupId: "sync-pause-001",
      sequenceIndex: 0,
      payload: {
        kind: "pause",
        data: { durationMs: 1700 },
        representationLossDeclared: true
      }
    },
    {
      observationId: "obs_overlap",
      kind: "observed_evidence",
      observer: "synthetic-audio-feature-extractor",
      sourceMaterial: {
        mediaType: "audio",
        contentHash: AUDIO_HASH,
        locator: "fixture:audio/synthetic-session-001"
      },
      occurrenceTime: "2026-01-01T00:00:14.200Z",
      timeSpan: {
        start: "2026-01-01T00:00:14.200Z",
        end: "2026-01-01T00:00:14.800Z"
      },
      synchronyGroupId: "sync-pause-001",
      sequenceIndex: 1,
      payload: {
        kind: "overlap",
        data: { durationMs: 600, participantCount: 2 },
        representationLossDeclared: true
      }
    }
  ]
};
