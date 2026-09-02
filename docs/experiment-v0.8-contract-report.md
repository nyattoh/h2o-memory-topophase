# v0.8 contract benchmark report

## Status

This report records the first implementation and execution associated with the fixed v0.8 contract-benchmark pre-registration. It does not alter the pre-registration, configuration, or any fixed v0.5-v0.7 artefact or result.

- Execution time: `2026-09-01T22:32:39+09:00`
- Pre-registration commit: `dcac71fc6e0cf12aba8b0f524a238075592802ad`
- Fixed configuration SHA-256: `102889a3045019919ad0f6b854164da5b42d956f6ddb942facdfc6c8fa947f8e`
- Result SHA-256: `e8698342655607aeee7cde3f7c269269a9a0c7950494101f94095bc42b66025c`
- Network and paid APIs: not used
- Randomness: none
- Machine result: `FAIL`

## Implementation

Four condition-specific adapters replay the same operation tapes and are evaluated by the same evaluator:

- `CompleteAdapter`;
- `DerivedAuthorityAdapter`;
- `CoupledAxesAdapter`;
- `DelayedGovernanceAdapter`.

The adapters are mechanism-removal constructions, not implementations of named external systems. In particular, `DerivedAuthorityAdapter` includes a materialised copy of complete observation records; it is not a general result for vector databases, RAG, GraphRAG, or graph memory.

## Results

| Condition | Contracts | Ordinary controls | Failed contracts | Failed controls | Admissible |
| --- | ---: | ---: | --- | --- | --- |
| `h2o_complete` | 10/10 | 6/6 | none | none | yes |
| `derived_authority` | 8/10 | 6/6 | C01, C02 | none | yes |
| `coupled_axes` | 7/10 | 5/6 | C06, C07, C10 | O03 | no |
| `delayed_governance` | 7/10 | 6/6 | C02, C09, C10 | none | yes |

The complete condition recorded zero stale-authority, cross-axis-mutation, public-disclosure, and trace-mismatch events.

`derived_authority` recorded five stale-authority events. `delayed_governance` recorded six stale-authority events and eleven public-surface/sentinel disclosures after forgetting: one in assemblies, one in derived views, three in insights, one in tokens, and five in traces.

`coupled_axes` retained the fixed bidirectional mapping `dispersed`/`hot`, `assembling`/`warm`, and `crystallized`/`cold`. Crystallisation therefore moved evidence into cold storage. This broke the ordinary O03 evidence-trace control. It also made C10 unevaluable because none of its nine sentinels was publicly observable before forgetting. The condition consequently recorded eight cross-axis mutations and one trace mismatch. The mapping and acceptance rule were not changed to repair this negative result.

## Interpretation

The machine-readable implementation applies the fixed statement that every ordinary positive control must pass. Under the six implemented ordinary controls, `coupled_axes` is inadmissible and the overall result is `FAIL`.

There is an important confirmatory limitation. The pre-registration named the ordinary-control metric and required every ordinary positive control to pass, but it did not freeze the identifiers, operation tapes, or evaluation expressions for O01-O06. Those controls were operationalised during implementation. The fixed contract table did identify C03, C04, C05, and C08 as positive controls, and all four passed under `coupled_axes`. Therefore:

- the extended implemented decision is `FAIL`;
- the run does not provide a clean confirmatory acceptance or rejection of the joint three-mechanism claim;
- O03 must not be presented as though its exact operation and threshold had been fixed before implementation.

The mechanism trace is also an implementation-internal consistency check. Adapters emit mechanism-labelled events, and the evaluator verifies that failed-contract events are restricted to declared causal steps and entities and contain one declared mechanism label. This is not an independent causal estimator.

The delayed-governance condition implements delayed propagation for correction, rejection, consent withdrawal, and forgetting. The present contract set directly exercises the target failures for consent withdrawal, rejection, and forgetting. It does not contain a dedicated post-correction stale-view contract, so this run cannot establish the necessity of immediate correction propagation.

## Strongest defensible conclusion

> In ten fixed synthetic contract cases, the complete condition satisfied all contracts. Materialised-record authority and delayed governance produced their specified failures while retaining six implemented ordinary controls. The fixed phase-tier coupling also produced its specified C06 and C07 failures, but it broke an implementation-time ordinary control and made the C10 precondition false. The pre-registered joint mechanism conclusion was therefore not supported by this run.

This result does not establish novelty, superiority, general utility, retrieval quality, multimodal benefit, accessibility benefit, or reductions in tokens, latency, physical memory, cost, or energy.

## Reproduction

```powershell
npm ci
npm test
npm run benchmark:v08 -- --output artifacts/benchmarks/v0.8-contract/result.json
Get-FileHash -Algorithm SHA256 artifacts/benchmarks/v0.8-contract/result.json
```

The benchmark command returns a non-success status when the machine result is `FAIL`; the result and manifest are still written for preservation.

## Next confirmatory version

A later benchmark version must use a new pre-registration and new result path. It should freeze:

1. every ordinary-control identifier, operation tape, and evaluation expression;
2. a dedicated stale-view contract after correction;
3. state-difference evidence that does not depend only on adapter-supplied mechanism labels;
4. the required pre-forgetting exposure for every C10 sentinel;
5. whether cold-storage restoration is part of ordinary crystallised-insight tracing.

The present configuration and result must not be overwritten.

## Internal cross-tool checks before freezing

Read-only internal checks by separate Codex, Claude, and Grok processes identified issues before the canonical result was generated. The implementation was corrected before freezing to:

- replace an invalid C10 fixture field and require every setup operation to succeed;
- restore the fixed `crystallized`/`cold` coupling instead of preserving a favourable ordinary-control result;
- keep materialised views stale after correction in the delayed-governance condition;
- collect public snapshots through the active adapter rather than bypassing it;
- restrict failure traces by causal step and entity;
- require all ten public-surface groups and all nine C10 sentinels to be observable before forgetting.

The checks also identified the remaining confirmatory limitations stated above. Agreement among these internal checks is not treated as experimental evidence or independent peer review.
