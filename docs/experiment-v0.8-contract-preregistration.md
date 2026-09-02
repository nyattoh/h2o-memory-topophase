# v0.8 contract benchmark pre-registration

## Status

This document fixes the contract cases, comparison conditions, measurements, and acceptance rule before benchmark implementation and execution. The benchmark is a new v0.8 experiment. It does not alter or reinterpret fixed H2O Memory v0.5-v0.7 artefacts, results, thresholds, exclusion rules, or pre-registered conditions.

## Research question

For the ten synthetic memory-failure cases below, are canonical authority, independent epistemic and storage axes, and immediate governance propagation required for all specified contracts to hold under the same operation sequence?

This question concerns contract conformance only. It does not test retrieval quality, human usefulness, scale, latency, token use, physical memory, cost, energy, accessibility, architectural novelty, or superiority over an external system.

## Fixed conditions

| ID | Condition | Removed mechanism |
| --- | --- | --- |
| `h2o_complete` | Complete TopoPhase engine | None |
| `derived_authority` | Derived views may remain authoritative after canonical invalidation | Canonical-source authority |
| `coupled_axes` | `dispersed` maps to `hot`, `assembling` to `warm`, and `crystallized` to `cold` in both directions | Independence of epistemic phase and storage tier |
| `delayed_governance` | Canonical governance state changes immediately, but existing derived views, assemblies, and insights remain usable until explicit rebuilding | Immediate propagation of correction, rejection, consent withdrawal, and forgetting |

The three counterfactual conditions are mechanism removals, not implementations of named external systems. They must not be presented as representative results for RAG, vector databases, graph memory, CogniFold, or any other system.

## Fixed contract cases

| ID | Contract | Primary target condition |
| --- | --- | --- |
| `C01` | A corrected address cannot become current again when an old cold representation is restored. | `derived_authority` |
| `C02` | A stale index cannot contribute after consent withdrawal. | `derived_authority`, `delayed_governance` |
| `C03` | Long-dispersed, low-frequency fragments can assemble after a delayed cue. | positive control |
| `C04` | An observed voice-level drop cannot become a user self-report of sadness. | positive control |
| `C05` | A low-frequency contradictory fragment is not deleted merely because it is infrequent or dissimilar. | positive control |
| `C06` | Moving a record between storage tiers does not change epistemic phase. | `coupled_axes` |
| `C07` | Assembly or crystallisation does not change canonical payload or storage tier. | `coupled_axes` |
| `C08` | A forced mid-operation failure leaves no partial canonical or phase mutation. | positive control |
| `C09` | A user-rejected insight cannot be reopened or recreated with the same semantic fingerprint. | `delayed_governance` |
| `C10` | Forgotten text is absent from derived views, relations, assemblies, insights, traces, tokens, retrieval, and public snapshots. | `delayed_governance` |

## Fixed measurements

For each condition, record:

- `contract_pass_count` out of 10;
- `ordinary_control_pass_count` and `ordinary_control_total`;
- `stale_authority_count`;
- `cross_axis_mutation_count`;
- `public_disclosure_count`;
- `trace_mismatch_count`;
- per-contract Boolean result and an invariant-linked diagnostic.

One contract case, rather than one assertion, is the unit of analysis. Additional assertions within a case do not increase its weight.

## Acceptance rule

The complete condition passes only if all of the following hold:

- `contract_pass_count = 10`;
- every ordinary positive control passes;
- `stale_authority_count = 0`;
- `cross_axis_mutation_count = 0`;
- `public_disclosure_count = 0`;
- `trace_mismatch_count = 0`.

A counterfactual condition is admissible only if every ordinary positive control passes, every contract outside its declared removal scope passes, at least one pre-specified target contract fails, and every failure can be traced to the removed mechanism. A counterfactual that breaks unrelated contracts is invalid rather than evidence for H2O.

The overall benchmark supports the mechanism claim only if the complete condition passes and all three counterfactuals are admissible. Otherwise the overall result is `FAIL`.

## Reproducibility and freezing

- Runtime: Node.js 22 and TypeScript with the repository lockfile.
- Network and paid APIs: prohibited.
- Randomness: none; if introduced, the fixed seed is `20260901`.
- Output: one canonical JSON result plus SHA-256 manifest.
- Implementation and execution occur only after this document and the machine-readable configuration are committed on the dedicated local branch.
- Any later correction creates a new benchmark version and must not overwrite the original configuration or result.

## Permitted conclusion

If the benchmark passes, the strongest permitted conclusion is:

> In the ten pre-specified synthetic contract cases, canonical authority, independent epistemic and storage axes, and immediate governance propagation were jointly necessary for the complete condition to satisfy all contracts while the targeted mechanism-removal conditions retained ordinary operation controls.

This conclusion is not evidence of general utility, novelty, superiority, retrieval quality, multimodal benefit, token reduction, physical-memory reduction, or energy reduction.
