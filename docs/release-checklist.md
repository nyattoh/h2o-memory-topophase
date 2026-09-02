# v0.2.0-alpha release checklist

This checklist governs the Stage A-C OSS and technical-report boundary.

## Fixed identity and licences

- [x] Author: Ryoko Sakakibara
- [x] Affiliation: Independent Researcher
- [x] ORCID: 0009-0009-9544-6315
- [x] Source-code licence: Apache-2.0
- [x] Technical-report licence: CC BY 4.0
- [x] Candidate version: v0.2.0-alpha

## Required local gates

- [x] All 92 deterministic tests pass without network access.
- [x] Type checking and build pass.
- [x] The demonstration passes.
- [x] `gate.sh` returns exit code zero.
- [x] The v0.2.0-alpha distributable file list is inspected with `npm pack --dry-run`.
- [x] The generated five-page PDF is rendered to images and visually inspected.
- [x] Licence, secret, personal-information, and prohibited-claim scans pass.
- [x] The fixed v0.8 `FAIL` result and its limitations remain explicit.
- [x] The untracked v0.8.1 material remains outside this release.

## External publication actions

- [ ] Push the verified branch or equivalent release commit to the existing public repository.
- [ ] Create the GitHub pre-release tag `v0.2.0-alpha` using `docs/release-notes-v0.2.0-alpha.md`.
- [ ] Confirm that Zenodo archives the new software version and assigns its version DOI.
- [ ] Create a separate Zenodo Publication / Technical note record using `docs/zenodo-paper-metadata.md` and upload the verified PDF.
- [ ] Add assigned DOIs only after each Zenodo record exists.

## Evidence and submission cautions

- The prototype has not completed independent review.
- The report is a technical report and falsifiable design baseline, not a claim of peer review.
- The prototype does not establish novelty, superiority, a physical phase transition, a mathematical topological invariant, accessibility benefit, or general reductions in tokens, latency, physical memory, cost, or energy.
- Any future anonymous venue submission must be prepared separately and checked against that venue's then-current policy.
