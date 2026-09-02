# Publication manifest for v0.2.0-alpha

This manifest defines the intended contents of the second public source release.
It records the verified local candidate; it does not invent a DOI or imply that
the GitHub tag or Zenodo records already exist.

## Include in the public source repository

| Path | Reason | Rights and privacy status |
| --- | --- | --- |
| `src/` | Reference engine and Stage A-C mechanisms | Authored code; no credentials or personal dialogue |
| `test/` | Deterministic positive and negative verification | Synthetic fixtures only; no external dataset |
| `docs/architecture.md` | Canonical model, two axes, operations, and Stage A-C contracts | Authored documentation |
| `docs/comparison.md` | Bounded operation-level comparison | Authored summary; primary papers linked, not copied |
| `docs/experiment-v0.8-contract-*` | Fixed preregistration, result, and report | Existing frozen research evidence; unchanged by release preparation |
| `docs/limitations.md`, `docs/quickstart.md`, `docs/requirements.md` | Limits, reproduction, and accepted scope | Authored documentation |
| `paper/*.md` | Technical report source | Authored report; CC BY 4.0 stated in the report |
| `scripts/render-paper-pdf.py` | Reproducible report rendering | Authored script; uses ReportLab and an installed Japanese font |
| `output/pdf/*.pdf` | Human-readable technical report release asset | Generated from the tracked report source |
| `docs/release-notes-v0.2.0-alpha.md` | Exact GitHub release notes | Authored documentation |
| `docs/zenodo-paper-metadata.md` | Exact no-cost publication worksheet | Authored metadata; includes approved public identity |
| `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md` | Public project operation | Authored documentation |
| `LICENSE`, `NOTICE`, `CITATION.cff`, `THIRD_PARTY_NOTICES.md` | Licence, attribution, and citation metadata | Author identity approved; new DOI intentionally absent until assigned |
| `package.json`, `package-lock.json`, `tsconfig.json`, `gate.sh` | Reproducible build and release gate | Dependency licences recorded separately |

## Exclude from this release

| Item | Reason | Public replacement |
| --- | --- | --- |
| `.workspace/` | Local shared control-plane state | None; operational state is not product content |
| `artifacts/benchmarks/v0.8.1/` | Untracked next-version work outside the frozen candidate | Continue in the next phase after separate review |
| `docs/experiment-v0.8.1-preregistration.md` | Untracked next-version preregistration | Continue in the next phase; do not mix into v0.2.0-alpha |
| `node_modules/` and `dist/` | Reproducible generated output | `package-lock.json` and build commands |
| Raw personal dialogue, personal identifiers beyond approved authorship, API keys, tokens, and local configuration | Privacy and security boundary | Synthetic fixtures and documented interfaces |
| Non-redistributable datasets, model weights, images, papers, and copied excerpts | No redistribution permission established | Primary-source links only |

## Release boundary

The `v0.2.0-alpha` release freezes Stage A-C as deterministic baselines. Learned
selection and crystallisation control, model-internal memory, real media
processing, direct comparative experiments, and the synthetic epistemic-safety
simulator are next-phase work. Fixed v0.5-v0.8 artefacts, values, thresholds,
exclusions, and preregistered rules are not retroactively changed.

`private: true` remains intentional in `package.json`; npm publication is outside
this release.
