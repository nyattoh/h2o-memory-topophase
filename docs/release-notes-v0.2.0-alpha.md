# H2O Memory TopoPhase v0.2.0-alpha

This pre-release freezes the first three bounded H2O Core mechanisms as an
inspectable, deterministic reference baseline.

## Implemented

- **Stage A - observations before transcription:** synthetic time-aligned speech candidates, prosody, pauses, overlap, gestures, synchrony, and source-material digests remain canonical without automatic emotion or intention labels.
- **Stage B - delayed-cue assembly:** a new typed cue can gather old canonical fragments without a recency cut-off, while linked contradiction evidence is protected.
- **Stage C - sudden crystallisation metric:** one fixed abrupt crossing in support density and prediction error is recorded with timing and counterevidence.
- Independent `epistemic_phase` and `storage_tier` axes remain enforced.
- Correction, rejection, consent withdrawal, forgetting, restoration, reopening, provenance, and re-presentation remain audited.

## Verification

- 92 deterministic offline tests passed.
- Type checking, build, demonstration, and `gate.sh` passed.
- No language model, embedding service, vector database, network connection, or paid API is required by the core verification.

## Research boundary

Stages B and C use fixed relations, supplied measurements, and fixed thresholds.
They do not learn which memories to gather or when to crystallise. The prototype
does not process media bytes and is not integrated into model computation. The
fixed v0.8 contract-ablation benchmark returns `FAIL`; this release does not
establish joint mechanism necessity, novelty, superiority, or general reductions
in tokens, latency, physical memory, cost, or energy.

Learned phase control, model-internal memory, and a neutral synthetic
epistemic-safety simulator are explicitly deferred to the next phase.

## Licence

Source code: Apache-2.0.
Technical report: CC BY 4.0.
