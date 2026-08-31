# v0.1.0-alpha release checklist

This checklist governs the first public candidate. Completing local preparation does not authorise publication.

## Fixed identity and licence

- [x] Author: Ryoko Sakakibara
- [x] Affiliation: Independent Researcher
- [x] ORCID: 0009-0009-9544-6315
- [x] Licence: Apache-2.0
- [x] Candidate version: v0.1.0-alpha

## Required local gates

- [x] All 63 deterministic tests pass without network access.
- [x] Type checking and build pass.
- [x] The five-minute quick start is reproduced from a clean installation.
- [x] The distributable file list contains only intended public files.
- [x] Licence, secret, personal-information, and prohibited-claim scans pass.
- [x] `docs/publication-manifest.md` and `THIRD_PARTY_NOTICES.md` match the candidate contents.
- [x] The public candidate preserves the fixed v0.5-v0.7 evidence boundary.
- [x] Keenable status is stated accurately as incomplete.

Local verification was completed on 2026-09-01 JST from a Git-free copy with freshly installed locked dependencies. `npm test`, `npm run typecheck`, `npm run build`, `npm run demo`, and `npm pack --dry-run` all completed successfully. External publication gates below remain open.

## Publication boundaries

- [ ] Create a fresh public history with a privacy-safe commit identity; do not publish the current local Git history.
- [ ] Re-run all gates against the fresh-history export and compare its content hashes with this candidate.
- [ ] Obtain the author's final explicit approval before creating a public repository or pushing any content.
- [ ] Add a public repository URL only after the repository exists.
- [ ] Add a release date, archive record, or DOI only after the corresponding publication exists.
- [ ] Keep npm publication deferred; `private: true` is intentional for this candidate.

## Evidence and submission cautions

- Keenable independent review is incomplete and must not be represented as complete.
- The prototype does not establish novelty, superiority, a physical phase transition, a mathematical topological invariant, or general reductions in tokens, latency, physical memory, cost, or energy.
- Any later anonymous submission package must be prepared separately from this named public candidate and checked against the selected venue's current policy.
