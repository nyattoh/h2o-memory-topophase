# Publication manifest for v0.1.0-alpha

This manifest defines the intended contents of the first public source repository. It is a review document, not permission to publish.

## Include in the public source repository

| Path | Reason | Rights and privacy status |
| --- | --- | --- |
| `src/` | Minimum reference implementation | Authored for this prototype; no credentials or personal dialogue |
| `test/` | Deterministic positive and negative verification | Synthetic fixtures only; no external dataset |
| `docs/architecture.md` | Inspectable data model and operation flow | Authored documentation |
| `docs/comparison.md` | Bounded comparison hypotheses | Authored documentation; no copied paper text |
| `docs/limitations.md` | Evidential and implementation limits | Authored documentation |
| `docs/quickstart.md` | Reproduction procedure | Authored documentation |
| `docs/requirements.md` | Approved falsifiable prototype requirements | Authored documentation |
| `docs/release-checklist.md` | Publication gates | Authored documentation |
| `docs/publication-manifest.md` | Inclusion and exclusion record | Authored documentation |
| `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md` | Public project operation | Authored documentation |
| `LICENSE`, `NOTICE`, `CITATION.cff`, `THIRD_PARTY_NOTICES.md` | Licence, attribution, and citation metadata | Author identity approved for publication candidate |
| `package.json`, `package-lock.json`, `tsconfig.json` | Reproducible build metadata | Dependency licences recorded separately |

## Exclude from the public source repository

| Item | Reason | Public replacement |
| --- | --- | --- |
| Current local `.git/` history | Commit metadata is not approved for publication | Create a fresh history using a privacy-safe commit identity after final approval |
| `AGENTS.md` | Internal agent-operation rules, not product documentation | Public contribution and security policies above |
| `node_modules/` | Reproducible third-party installation output | `package-lock.json` |
| `dist/` from source history | Reproducible generated build output | Build locally; a later release archive may contain compiled files after verification |
| Raw H2O Memory v0.5-v0.7 artefacts and records | Fixed research evidence is outside this prototype and is not copied here | Cite the separately governed research record when published |
| Raw personal dialogue, personal identifiers, API keys, tokens, and local configuration | Privacy and security boundary | Synthetic fixtures and documented interfaces |
| Non-redistributable datasets, model weights, images, papers, and copied excerpts | No redistribution permission has been established | Acquisition instructions or primary-source citations added only when needed |

## Generated release content

The later software archive may contain compiled `dist/src/` files, `README.md`, `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `CITATION.cff`, `CHANGELOG.md`, and `package.json`. It must be generated from the approved source candidate, inspected with `npm pack --dry-run`, and compared against the source commit before publication.

`private: true` remains intentional in `package.json`; npm publication is outside the first release.
