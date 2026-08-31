# Operation-level comparison with CogniFold-style cognitive folding

This note compares **explicit operation contracts**. It does not claim that this prototype is superior to CogniFold, does not claim novelty, and does not treat any CogniFold paper or implementation as independently verified here.

CogniFold v5 already describes immutable event traces, provenance edges, user reactions, and rejected/deferred states. Those descriptions are not treated as absent. This table does not create a difference by saying a CogniFold feature "does not exist" or that this note "does not assume" it. The only comparison axis is whether this prototype exposes a named, machine-checked operation contract for the concern.

Keenable is **unreviewed (未査読)**. It is not a dependency of this prototype and is not used as evidence for any comparison.

| Concern | This prototype (explicit operation contract) | CogniFold-style cognitive folding (public description) |
| --- | --- | --- |
| Immutable episodic traces | Versioned canonical observations remain in lineage. `CORRECT` appends a version and a correction relation; it does not overwrite identity. `TRACE` returns an evidence plan. | CogniFold v5 already describes an immutable event trace. The comparison is that this prototype binds the concern to `OBSERVE` / `CORRECT` / `TRACE` contracts. |
| Provenance | `OBSERVE` requires speaker, observer, and/or sourceRef and an explicit kind (observed evidence, recognizer candidate, user self-report, system inference). | CogniFold v5 already describes provenance edges. The comparison is the explicit `OBSERVE` provenance contract. |
| Crystallization target | `CRYSTALLIZE` builds an insight candidate and requires evidence, declared uncertainty, and falsification conditions. | Folding is publicly described as compacting traces into a denser working representation. The comparison is this prototype's named insight-candidate operation. |
| Bidirectional reopening | `REOPEN` is a named operation that returns a crystallized candidate to `assembling` or `dispersed` and keeps audit history. | The comparison is the presence of that named reopen operation in this prototype's contract. |
| User correction and refusal | `CORRECT` invalidates the previous current value. `REJECT` refuses an insight or assembly from a user self-report. Generic `RELATE` cannot create `rejection`. Rejection blocks re-presentation, `REOPEN`, and fingerprint-matching re-crystallization or re-assembly without rewriting canonical observations, and is distinct from correction, deletion, and consent withdrawal. Explicit re-permission is not implemented. | CogniFold v5 already describes user reactions and rejected/deferred states. The comparison is this prototype's explicit `CORRECT` / `REJECT` operation contract. |
| Consent withdrawal | `WITHDRAW_CONSENT` monotonically reduces permitted uses. Search (`retrieve`) and re-presentation (`present`) are separate uses; `TRACE` usability requires `present`. Re-granting is not implemented. | The comparison is this prototype's named consent-withdrawal operation and per-use contract. |
| Non-text observations | Typed payloads (`prosody`, `pause`, `gesture`, and others) stay canonical as closed measurements. Observed voice-level drop cannot be stored as the user's self-reported sadness; interpretation is a separate record kind. | The comparison is this prototype's explicit payload-kind and observation-kind contract. |
| Storage-tier independence | `MOVE_TIER` changes `hot` / `warm` / `cold` without changing `epistemic_phase`. Phase operations do not change payload or tier. Restore success is a separate safety boundary from re-presentation permission. | The comparison is this prototype's named `MOVE_TIER` / `RESTORE` contract and its independence from epistemic phase. |

No row in this table is a performance result. No row is a claim that either design has been shown to reduce tokens, physical RAM, or energy.
