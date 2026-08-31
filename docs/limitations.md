# Limitations

This is an in-memory reference prototype. It is not a release candidate and not a research result.

- **In-memory only.** Canonical state, the cold store, derived views, and audit history live in process memory. There is no durable log, snapshot file, or crash recovery. `cold` is an in-process mock tier: the full payload is still held in the same process. This prototype does not persist cold data independently and does not reduce physical memory.
- **No concurrency guarantee.** The engine is single-threaded and not safe for concurrent callers. Transactional copy-on-write (draft then commit) applies to one mutating operation at a time.
- **Untested scale.** Fixtures use a handful of events. There is no measurement of latency, cardinality, or working-set size.
- **Untested resource effects.** This repository does not measure or claim token reduction, physical RAM reduction, energy reduction, or any phase-specific resource effect.
- **No independent review.** The prototype has not been independently reviewed. **Keenable is unreviewed (未査読)** and is not used here as a reviewer, oracle, or dependency.
- **No embeddings or recognizers.** Vector views are explicit non-computed stubs. Prosody and gesture fields are stored as typed data, not recognized by a model.
- **RESTORE is current-version only.** Historical cold payloads remain for lineage and cannot be promoted to current. Restore may rehydrate when `retrieve` remains; it refuses forgotten, corrected, expired, and fully withdrawn records. A successful restore does not grant re-presentation permission and returns a placement DTO rather than an `ObservationRecord`.
- **Assembly and insight candidate restore is unimplemented.** Moving those candidates to `cold` hides free text on public reads and keeps `storageTier` as a diagnostic. There is no restore operation for them in this prototype.
- **Consent re-grant is unimplemented.** `WITHDRAW_CONSENT` only reduces the current use set. Public reads apply that effective set to every version of the observation.
- **Explicit user re-permission after REJECT is unimplemented.** Rejected insights cannot be `REOPEN`ed. Rejection fingerprints block the same normalized statement with an equal or superset evidence set, and block re-assembly of the same member set. This is not a general blacklist of other statements.
- **FORGET is a deletion contract, not certified erasure.** Reachable re-presentable free text is removed from public reads and from derived indexes. Tombstones and audit remain. Physical erasure is not guaranteed.
- **Cold is an in-process mock.** Public `getObservation` / `snapshot` do not expand cold payloads. Restore is required before a resident body can be re-presented.
- **Fixed v0.5-v0.7 experiments are absent.** This workspace must not import or reinterpret those artifacts, thresholds, exclusion rules, or preregistered conditions.
- **No topological or phase-physics claim.** The name TopoPhase is a project label. This code does not demonstrate mathematical phase invariants or physical phase-state effects.
