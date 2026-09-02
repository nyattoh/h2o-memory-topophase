# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0-alpha] - 2026-09-02

### Added

- Stage A canonical pre-transcription observations for synthetic speech candidates, prosody, pauses, overlap, gestures, synchrony, and source-material digests.
- Stage B deterministic delayed-cue assembly with contradiction protection, a recent-window control, and a lexical-overlap control.
- Stage C deterministic sudden-crystallisation metric with timing evaluation and pinned counterevidence.
- English technical report with a Japanese abstract, reproducible PDF renderer, and Zenodo metadata worksheet.
- Fixed v0.8 contract-ablation result and its negative evidence boundary.

### Verification

- 92 deterministic offline tests pass.
- Type checking, build, demonstration, and the repository gate pass.
- No language model, embedding provider, vector database, network call, or paid API is required by the tests.

### Evidence boundary

- Stages B and C use fixed typed relations, supplied measurements, and fixed thresholds; they do not learn.
- The prototype does not process media bytes and is not integrated into model computation.
- The v0.8 contract-ablation benchmark returns `FAIL` and does not establish joint mechanism necessity.
- No claim of demonstrated novelty, superiority, accessibility benefit, or general reduction in tokens, latency, physical memory, cost, or energy.

## [0.1.0-alpha] - 2026-08-31

### Added

- Canonical typed observation and event model.
- Independent epistemic-phase and storage-tier state axes.
- Derived-view invalidation and provenance tracing.
- Correction, consent withdrawal, forgetting, restoration, reopening, and counterevidence operations.
- Deterministic offline positive and negative tests.
- Five-minute quick start, architecture, comparison, limitations, contribution, citation, and security documentation.

### Evidence boundary

- No claim of demonstrated novelty or superiority.
- No general claim of reduced tokens, latency, physical memory, cost, or energy.
- Keenable independent review is not complete.
