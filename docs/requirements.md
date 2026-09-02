# TopoPhase v0.8 minimum falsifiable prototype

## Status and boundary

This is an isolated prototype specification. It does not modify or reinterpret fixed H2O Memory v0.5-v0.7 experiments. It must not contain those artifacts, measurements, thresholds, exclusion rules, or preregistered conditions.

The prototype tests a design hypothesis: a memory system can separate epistemic formation from storage placement while preserving identity, provenance, temporal validity, correction, deletion, consent, uncertainty, and traceability.

## Technical baseline

- TypeScript on Node.js 22.
- Strict type checking.
- Minimal dependencies.
- Deterministic offline tests.
- No LLM, embedding, vector-database, browser, cloud, or network dependency.
- A small in-memory reference engine is sufficient. Use transactional copy-on-write or an equivalent mechanism so a failed operation cannot partially mutate canonical state.

## Canonical source model

The canonical source is an observation or event, not text, an embedding, a summary, a graph, or an index. At minimum it records:

- stable observation ID and version;
- occurrence time, optional time span, and temporal validity;
- speaker, observer, source reference, and consent scope;
- an explicit distinction among observed evidence, recognizer candidate, user self-report, and system inference;
- correction, rejection, consent withdrawal, deletion, and derivation relations;
- typed payloads that can retain speech, pause, overlap, prosody, gesture, and other non-text observations without turning them into emotions or intentions;
- uncertainty and recognizer confidence where applicable.

Derived text, summary, vector, graph, token, and search-index views must record their source versions and become unusable when stale. The reference implementation does not need to calculate embeddings.

## Independent state axes

`epistemic_phase`:

- `dispersed`: unresolved fragments remain meaningful and available for later recombination;
- `assembling`: multiple fragments are being grouped by a cue or typed relation;
- `crystallized`: an explicit insight candidate has evidence, uncertainty, and falsification conditions.

`storage_tier`:

- `hot`: immediately usable representation;
- `warm`: structured or partly externalized representation;
- `cold`: canonical evidence or a restorable representation resides outside the resident working set.

Neither axis may implicitly modify the other. Neither axis represents value, secrecy, importance, or truth.

## Required operations

- `OBSERVE`: append a canonical event with provenance and consent.
- `RELATE`: append a typed relation such as correction, simultaneity, branch, contradiction, or potential falsifier.
- `ASSEMBLE`: create an assembly candidate from existing events without rewriting them.
- `CRYSTALLIZE`: create an insight candidate with evidence, uncertainty, and falsification conditions.
- `REOPEN`: return a crystallized candidate to `assembling` or `dispersed` while retaining its audit history.
- `MOVE_TIER`: change storage placement without changing epistemic phase.
- `CORRECT`: invalidate an old value and propagate invalidation to derived views and insight candidates.
- `WITHDRAW_CONSENT`: reduce permitted uses and block stale retrieval, presentation, or sharing.
- `FORGET`: apply a deletion contract and prevent regeneration from stale derived views.
- `TRACE`: return an evidence plan from a derived view or insight candidate to canonical events, including excluded counterevidence and uncertainty.

Operation names may be idiomatic TypeScript identifiers, but their semantics must remain explicit.

## Machine-readable invariants

Define one exported invariant catalog and reuse its stable identifiers in implementation errors, validation results, tests, and documentation:

- `identity`
- `provenance`
- `temporal_validity`
- `correction_lineage`
- `deletion_and_consent`
- `uncertainty`
- `simultaneity_and_ordering`
- `representation_loss_declaration`
- `restoration_and_re_presentation`

## Required negative tests

1. After a current address is corrected, restoring a cold representation cannot revive the old address as current.
2. After consent withdrawal, a stale derived index cannot contribute to retrieval or an answer plan.
3. Long-dispersed, low-frequency fragments can assemble when a delayed cue arrives.
4. An observed drop in voice level cannot become the user's self-reported fact that they are sad.
5. A contradictory fragment is not deleted merely because frequency or similarity is low.
6. A storage-tier-only operation does not change epistemic phase.
7. An epistemic-phase-only operation does not change the canonical payload or storage tier.
8. A forced mid-operation failure leaves neither multiple current values nor multiple active phase states.

Add positive tests for each operation and invariant where needed. Map every negative fixture to at least one invariant identifier.

## Required documentation

- A five-minute local quick start.
- A concise architecture note showing canonical source, derived views, the two independent axes, operations, and data flow.
- A comparison note that states only operation-level hypotheses versus CogniFold-style cognitive folding. It must not claim superiority or novelty. At minimum compare immutable episodic traces, crystallization target, bidirectional reopening, user correction and refusal, consent withdrawal, non-text observations, and storage-tier independence.
- A limitations section covering the in-memory prototype, missing concurrency and durability guarantees, untested scale, untested resource effects, and absence of independent review.

## v0.8 contract benchmark

The repository may include one deterministic, offline mechanism-removal benchmark that evaluates the operation contracts above. It is a separate v0.8 experiment and must not modify or reinterpret any fixed v0.5-v0.7 artefact, measurement, threshold, exclusion rule, or pre-registered condition.

The benchmark must compare the complete engine with exactly three counterfactual conditions:

- `derived_authority`: derived text, summary, or index state remains authoritative when the canonical source has become invalid;
- `coupled_axes`: epistemic phase and storage tier form one coupled lifecycle;
- `delayed_governance`: correction, rejection, consent withdrawal, and forgetting reach existing derived views, assemblies, and insights only after explicit rebuilding.

All four conditions must receive the same fixture inputs, clock sequence, identifiers, and public operation sequence. A counterfactual condition is admissible only when its ordinary positive controls pass, every contract outside its declared removal scope passes, at least one pre-specified target contract fails, and the failure is attributable to the removed mechanism.

The benchmark must contain ten semantically distinct contracts: the eight required negative tests above, rejected-insight non-revival, and forgotten-text non-disclosure across public surfaces. It must report contract passes, positive-control passes, stale-authority uses, cross-axis mutations, public disclosures, and trace mismatches. Results are evidence only for the specified synthetic contracts. They must not be described as evidence of general utility, novelty, superiority, token reduction, physical-memory reduction, or energy reduction.

## Objective completion gates

- `npm test` succeeds offline.
- `npm run typecheck` succeeds.
- `npm run build` succeeds.
- All eight required negative tests exist and pass.
- The invariant catalog is exported once and referenced by tests.
- A repository search finds no credentials, fixed v0.5-v0.7 artifacts, or claims of proven novelty, token reduction, physical-memory reduction, or energy reduction.
- Work is committed and pushed only to a dedicated feature branch. No pull request or merge is created.
