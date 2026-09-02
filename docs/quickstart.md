# Five-minute local quick start

This isolated prototype has no network, LLM, embedding, or paid-API dependency. Node.js 22 is required.

## Install and check

```bash
npm install
npm test
npm run typecheck
npm run build
```

`npm test` compiles TypeScript and runs the Node.js test runner against `dist/test`. Tests are deterministic and offline.

## Minimal walkthrough

```bash
npm run demo
```

The demo, in `src/demo.ts`, does the following:

1. `OBSERVE` two canonical events (speech and pause). These are the source of record.
2. `ASSEMBLE` them under a delayed cue without rewriting the events.
3. `CRYSTALLIZE` an insight candidate with uncertainty and a falsification condition.
4. `TRACE` from the insight back to canonical events.

Expected shape of the printed JSON:

- `phase` is `crystallized`
- `storageTier` is `hot`
- `usable` is `true`

Those two axes are independent: you can later `MOVE_TIER` without changing phase, or `REOPEN` without changing storage placement.

## Stage A multimodal observation test

The deterministic fixture in `test/fixtures/multimodal-sequence.ts` contains
time-aligned synthetic speech, prosody, gesture, pause, overlap, and recognizer
alternatives. It verifies that these observations remain separate canonical
records before transcription and that their declared synchrony and provenance
survive a round trip.

```bash
npm test
```

This test does not process media. `sourceMaterial.locator` is opaque and its
SHA-256 digest is validated syntactically; the referenced bytes are not read.

## Stage B delayed-cue test

`test/association-stage-b.test.ts` uses old, low-frequency synthetic fragments,
newer unrelated fillers, and a late typed cue. It verifies automatic assembly,
unrelated-cue abstention, contradiction preservation, consent enforcement, and
the outputs of simple recent-window and lexical-overlap controls.

The controller relies on pre-existing typed relations. It is the fixed baseline
for later learning experiments, not evidence that relation discovery or a
learned association policy is complete.

## Stage C sudden-crystallisation metric test

`test/crystallization-stage-c.test.ts` uses fixed synthetic support-density and
prediction-error sequences. It checks gradual accumulation, abrupt threshold
crossing, counterevidence traceability, correction invalidation, and timing
errors. `npm test` runs this test with all other offline checks.

## Use from code

```ts
import { MemoryEngine } from "./dist/src/index.js";

const engine = new MemoryEngine();
engine.observe({
  kind: "observed_evidence",
  observer: "notebook",
  sourceRef: "local",
  payload: { kind: "structured", data: { address: "12 Old Street" }, representationLossDeclared: false }
});
```

Derived text, summary, vector stubs, graph, token, and search-index views are generated only when `derive` is permitted (the default consent includes it). They record source versions and become unusable when stale. No embedding is computed. Search (`retrieve`) and re-presentation (`present`) are separate; `TRACE` usability requires `present`.

## What not to do here

Do not import H2O Memory v0.5-v0.7 artifacts, measurements, or thresholds. Do not treat this walkthrough as evidence of novelty, token reduction, physical-memory reduction, or energy reduction.
