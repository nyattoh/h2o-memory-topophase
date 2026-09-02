# Architecture

This note describes the isolated TopoPhase v0.8 reference engine. It is a design sketch for a falsifiable prototype, not a system claim about production memory, topology, or resource use.

## Canonical source

The source of record is a versioned observation or event. It is not text, a summary, a vector, a graph, or an index.

A canonical observation stores:

- stable `observationId` and integer `version`
- occurrence time, optional time span, and temporal validity
- speaker, observer, source reference, consent scope, and an optional opaque
  `sourceMaterial` reference (`mediaType`, SHA-256 digest, locator)
- optional `synchronyGroupId` and non-negative `sequenceIndex` for preserving
  aligned observations without flattening them into a transcript
- kind: `observed_evidence` | `recognizer_candidate` | `user_self_report` | `system_inference`
- typed payload (`speech`, `pause`, `overlap`, `prosody`, `gesture`, `structured`, `other`); non-verbal kinds are closed measurements, and interpretation is a separate record kind
- uncertainty and optional recognizer alternatives; each alternative has a
  stable candidate ID, candidate value, and confidence in the closed interval
  from zero to one
- independent `epistemic_phase` and `storage_tier` (observation phase is derived from assembly/insight candidates)
- current / corrected / forgotten / consent-withdrawn flags

Corrections append a new version and a `correction` relation. Old versions remain in lineage and cannot become current by implication.

## H2O Core Stage A boundary

`ingestTimedObservationSequence` accepts already measured synthetic observation
records and appends `simultaneity` relations for members of the same synchrony
group. `timeline` returns current, presentable canonical observations, filters by
an overlapping time window or synchrony group, and preserves the declared order
inside a group. It does not transcribe, classify, or infer emotion or intention.

The original media bytes are outside this prototype. The canonical record keeps
an opaque locator and SHA-256 digest so a later storage implementation can verify
identity without treating a transcript, summary, vector, or graph as the source
of record. Fixtures are synthetic and contain no personal dialogue.

Stage A does not implement autonomous fragment gathering, sudden insight
crystallisation, learned phase control, or integration into model computation.
The existing deterministic `ASSEMBLE` and `CRYSTALLIZE` operations are explicit
test controls, not evidence that those later mechanisms have been built.

## H2O Core Stage B fixed baseline

`AssociativeAssemblyController.onCue` is invoked when a new canonical cue
observation arrives. It traverses typed `cue` relations without a recency cutoff,
selects eligible old observations, adds linked `contradiction` observations as
protected candidates, and invokes the existing audited `ASSEMBLE` operation only
when the minimum direct-evidence count is met. Its decision exposes candidate
IDs, selection reasons, scores, exclusions, and the resulting assembly ID.

This is a deterministic comparison mechanism, not a learned controller. It
requires cue relations to exist already and does not infer them from content.
`recentWindowBaseline` and `lexicalOverlapBaseline` provide deliberately simple
controls for the fixed synthetic case. No embedding model, LLM, vector database,
network call, or paid API is used.

## Derived views

`text`, `summary`, `vector`, `graph`, `token`, and `search_index` are replaceable indexes. They are generated only when the source observation permits `derive`. Each view records source versions and declares representation loss. A view is unusable when stale, forgotten, consent-blocked, or outside its temporal window. The vector view is a non-computed stub (`scheme: "none"`).

Search (`retrieve`) and re-presentation (`present`) are separate consent uses. `retrieve` may search canonical records. `TRACE` / EvidencePlan `usable` requires `present`; retrieve alone does not permit re-presentation. Public read APIs (`getObservation`, `getAssembly`, `getInsight`, `getDerivedView`, `inspectSearchIndex`, `tokensOf`, `snapshot`) apply one policy. They hide forgotten, invalidated, rejected, consent-blocked, stale, cold-unrestored, and temporally invalid re-presentable free text, including payload, speaker, observer, sourceRef, uncertainty notes, assembly cues, and insight statements / falsifiers. `snapshot` is that public view, not a raw clone of internal canonical state. Diagnostic fields may remain (stable IDs, versions, tier, mechanical flags) without user content.

Cold or non-resident observations are excluded from `retrieve`, including via derived `search_index` views, from the moment `MOVE_TIER` parks them in `cold`. After `RESTORE`, consent, freshness, and version are re-checked before the record can contribute again. Cold assembly and insight public reads hide free text and keep `storageTier` as a diagnostic. Candidate restore for assemblies and insights is not implemented.

Consent withdrawal is an effective policy for every version of the observation. Historical records need not be rewritten, but public reads must not use an old version's stale consent. After a full withdrawal, no version body is publicly readable.

`TRACE` excluded counterevidence and relation-derived falsifiers use the same version identity, present consent, forget, correction, and validity policy as evidence. If an excluded item cannot be re-presented, the plan keeps the ID on a redacted stub.

Versioned `TRACE` uses the requested observation version only. It does not substitute the current version.

`WITHDRAW_CONSENT` is a monotonic reduction of currently permitted uses. Duplicate and unknown uses are rejected. Re-granting consent is not implemented.

## Independent axes

```
epistemic_phase:  dispersed | assembling | crystallized
storage_tier:     hot | warm | cold
```

Neither axis writes the other. Neither axis means value, secrecy, importance, or truth.

- `dispersed`: unresolved fragments remain available for later recombination.
- `assembling`: fragments are grouped by a cue or typed relation without rewriting payloads.
- `crystallized`: an insight candidate has evidence, declared uncertainty, and falsification conditions.
- `hot`: immediately usable resident representation.
- `warm`: structured or partly externalized representation still in the working set.
- `cold`: in this prototype, an in-process mock tier. The full payload remains in the same process `Map` (`coldStore`); it is not independent persistence and is not a physical-memory reduction.

Canonical epistemic phase lives on assembly and insight candidates. An observation that is still current carries a derived phase: the highest phase among non-forgotten, non-rejected candidates that reference it (`crystallized` > `assembling` > `dispersed`). Reopening one shared insight cannot mark the observation `dispersed` while another insight remains `crystallized`.

`RESTORE` rehydrates storage placement of the current version and is separate from re-presentation. It returns a placement-diagnosis DTO (stable ID, version, tier, mechanical flags), not an `ObservationRecord` and not re-presentable body. Body reads go through the public read APIs after restore. It is allowed when `retrieve` remains, including retrieve-only consent; it does not grant `present`. It is refused for forgotten, correction-invalidated or non-current, temporally expired, or fully withdrawn (no `retrieve`) records.

Cold public reads stay consistent with the storage-tier contract. `getObservation` and `snapshot` do not expand a cold mock payload or other re-presentable free text into resident body. Until `RESTORE`, they return redacted diagnostics. The cold store remains an in-process mock.

## Operations and data flow

```
OBSERVE --> canonical event (v1, dispersed, hot by default)
              \-> derived views only if derive is permitted

RELATE  --> typed relation (simultaneity, contradiction, cue, ...)
              \-> type rejection is refused; use REJECT
              \-> graph view refresh within derive consent

ASSEMBLE --> assembly candidate; member phase -> assembling
             payload and storage_tier unchanged

CRYSTALLIZE --> insight candidate; phase -> crystallized
                requires evidence, uncertainty, falsifiers
                pins excluded counterevidence to {id, version} at crystallize time
                rejected assembly, rejected evidence set, same statement with
                equal/superset evidence, or same rejected member set cannot re-crystallize

REOPEN --> phase -> assembling | dispersed; audit retained; rejected candidates cannot reopen
            explicit user re-permission after REJECT is not implemented

MOVE_TIER --> storage_tier only; cold parks payload in the in-process cold mock

CORRECT --> invalidate vN, append vN+1, stale derived views, invalidate insights

REJECT  --> typed user refusal of an insight or assembly
            subject must be a user_self_report observation
            distinct from CORRECT, FORGET, and WITHDRAW_CONSENT
            keeps a rejection fingerprint (normalized statement + evidence set,
            or assembly member set) and blocks semantic bypass
            public reads hide free text; REOPEN is refused

WITHDRAW_CONSENT --> monotonic reduction of uses; retrieve and present remain independent
                     re-granting is not implemented

FORGET --> deletion contract; propagate removal of reachable re-presentable free text
           (payload, speaker, observer, sourceRef, relation notes, assembly cues,
           insight statement / uncertainty notes / falsifiers, derived tokens)
           keep stable IDs, audit, and tombstones; physical erasure is not guaranteed
           assembly with any forgotten member: forgotten + invalidated, cue removed
           insight with any forgotten evidence: invalidated, free text removed
           insight with no remaining evidence: also forgotten
           remaining-evidence revalidation of a conclusion is not attempted (safe side)

TRACE --> evidence plan: canonical events, excluded counterevidence, uncertainty
          usable means re-presentation is allowed (requires present, not merely retrieve)
          accessCount and audit change only when usable; blocked TRACE is a no-op on state, clock, IDs, and audit
          counterevidence relations are followed only from the target insight, its evidence refs,
          and its assembly member refs, version-pinned; unrelated relations are not ingested
          pinned excluded versions are not rewritten to a later current version
          consent, forget, and validity apply to both the pinned version and the current effective policy
```

Mutating operations use transactional copy-on-write. The engine clones canonical state into a draft, applies the operation to that draft, and commits by replacing canonical state only after invariant checks succeed. A failed operation discards the draft; canonical state and audit are unchanged. The live store is not mutated and then rolled back.

## Invariant catalog

One exported catalog in `src/invariants.ts` is reused by errors, validation, tests, and this documentation:

`identity`, `provenance`, `temporal_validity`, `correction_lineage`, `deletion_and_consent`, `uncertainty`, `simultaneity_and_ordering`, `representation_loss_declaration`, `restoration_and_re_presentation`.
