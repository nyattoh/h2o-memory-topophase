# H2O Memory: TopoPhase reference prototype

[![Archived v0.1 DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22212460.svg)](https://doi.org/10.5281/zenodo.22212460)

H2O Memory explores an AI memory architecture in which canonical observations remain auditable while epistemic formation and storage placement are controlled independently. This repository contains the minimum falsifiable TypeScript reference prototype for that research direction.

The current public release is `v0.1.0-alpha`. This branch is the verified
`v0.2.0-alpha` candidate that adds the bounded H2O Core Stage A-C baselines.
It is experimental software, not a production database and not evidence that
the proposed architecture is novel or resource-efficient.

## Why this exists

Most application-level memory systems begin with text, summaries, embeddings, or graph nodes. TopoPhase instead treats typed observations and events as the source of record. Text, summaries, vectors, graphs, tokens, and search indices are replaceable derived views.

The design separates two axes:

- `epistemic_phase`: `dispersed`, `assembling`, or `crystallized`;
- `storage_tier`: `hot`, `warm`, or `cold`.

Changing storage placement must not silently change epistemic status. Corrections, consent withdrawal, deletion, uncertainty, provenance, temporal validity, and excluded counterevidence must propagate through derived views.

## Current status

- H2O Core Stage A implemented: synthetic, time-aligned speech, prosody, pause,
  overlap, gesture, and recognizer-candidate observations can be retained before
  transcription as canonical records.
- H2O Core Stage B fixed baseline implemented: a newly arrived typed cue can
  automatically assemble old canonical fragments, while preserving linked
  contradiction evidence and respecting current consent.
- H2O Core Stage C fixed metric baseline implemented: a controller distinguishes
  gradual accumulation from a simultaneous jump in support density and drop in
  prediction error, then records formation metrics and counterevidence.
- In-memory TypeScript reference engine on Node.js 22.
- Deterministic offline tests; no LLM, embedding service, vector database, browser, cloud, or network dependency.
- Canonical observation and event model with typed non-text evidence.
- Independent epistemic and storage axes.
- Append-only audit history for correction, refusal, consent, forgetting, reopening, and restoration operations.
- Explicit negative tests for stale views, revived corrections, inferred emotion, lost contradiction, and partial mutation.

Stage A stores typed observation metadata and an opaque reference plus digest for
the original material. It does not store or recognise media bytes. Stage B uses
pre-existing typed cue relations; it does not learn cue representations or infer
relations from raw observations. Stage C uses fixed thresholds supplied by the
experiment and does not learn what to gather or when to crystallise. Learned
phase control and model-internal memory remain next-phase work, not current results.

Keenable independent review is **not complete**. Keenable is not a dependency of this prototype.

## Five-minute quick start

Requirements: Node.js 22 and npm.

```bash
npm install
npm test
npm run typecheck
npm run build
npm run demo
```

The test suite runs without network access. See [`docs/quickstart.md`](docs/quickstart.md) for expected output and troubleshooting.

## Research boundary

This repository does not contain or reinterpret the fixed H2O Memory v0.5-v0.7 experiments, measurements, artefacts, thresholds, exclusion rules, or preregistered conditions.

It does not claim:

- a demonstrated new foundation-model architecture;
- superiority over CogniFold or another memory system;
- a general reduction in input tokens, latency, physical memory, cost, or energy;
- a physical phase transition or a mathematical topological invariant;
- verified accessibility or multimodal benefits;
- publication readiness or independent review.

The intended contribution is presently a falsifiable design hypothesis and an inspectable reference implementation.

In the next phase, the architecture may also be applicable
to a separate synthetic safety simulator for testing how provenance confusion,
confirmation-biased retrieval, premature crystallisation, or failed correction
propagation can stabilise false conclusions. That is a future research possibility,
not a clinical simulation or a demonstrated application.

## Documents

- [`docs/requirements.md`](docs/requirements.md) — approved prototype requirements
- [`docs/architecture.md`](docs/architecture.md) — canonical source, derived views, axes, operations, and data flow
- [`docs/comparison.md`](docs/comparison.md) — operation-level hypotheses versus CogniFold-style cognitive folding
- [`docs/limitations.md`](docs/limitations.md) — known technical and evidential limits
- [`docs/release-checklist.md`](docs/release-checklist.md) — local gates and publication boundaries
- [`docs/publication-manifest.md`](docs/publication-manifest.md) — reviewed public inclusion and exclusion scope
- [`paper/h2o-memory-new-ai-memory-architecture-v0.2.0-alpha.md`](paper/h2o-memory-new-ai-memory-architecture-v0.2.0-alpha.md) — technical report source with English and Japanese abstracts
- [`output/pdf/h2o-memory-new-ai-memory-architecture-v0.2.0-alpha.pdf`](output/pdf/h2o-memory-new-ai-memory-architecture-v0.2.0-alpha.pdf) — rendered technical report candidate
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution rules and verification gates
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) — dependency and material provenance ledger
- [`SECURITY.md`](SECURITY.md) — private vulnerability-reporting policy

## Citation

Use the metadata in [`CITATION.cff`](CITATION.cff):

> Ryoko Sakakibara. *H2O Memory: TopoPhase Reference Prototype*. Version 0.2.0-alpha. Independent Researcher. ORCID: [0009-0009-9544-6315](https://orcid.org/0009-0009-9544-6315).

The badge DOI identifies the archived `v0.1.0-alpha` software release. A new
version DOI and a paper DOI have not yet been assigned; neither is invented in
the candidate metadata.

## Licence

Copyright 2026 Ryoko Sakakibara.

Licensed under the Apache License, Version 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
