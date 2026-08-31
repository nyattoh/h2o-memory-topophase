# Contributing

Thank you for considering a contribution to the H2O Memory TopoPhase reference prototype.

## Research and safety boundaries

Contributions must preserve the following boundaries:

- canonical observations and events remain separate from derived text, summary, vector, graph, token, and index views;
- `epistemic_phase` and `storage_tier` remain independent;
- system inference must not be stored as a user's self-report;
- correction, refusal, consent withdrawal, deletion, uncertainty, and counterevidence remain traceable;
- vectors are optional derived indices, not the source of record;
- no contribution may claim demonstrated novelty, token reduction, physical-memory reduction, energy reduction, therapeutic benefit, or mathematical topology without separate evidence;
- tests must use synthetic or anonymised fixtures and must not contain raw personal dialogue.

The fixed H2O Memory v0.5-v0.7 experiments are outside this repository. Do not copy, edit, or reinterpret their artefacts, thresholds, exclusion rules, or preregistered conditions here.

## Development

Requirements: Node.js 22 and npm.

```bash
npm install
npm test
npm run typecheck
npm run build
```

All tests must pass without network access. New behaviour requires tests, including a negative test when the change affects an invariant, rejection path, stale view, restoration, correction, consent, or deletion.

## Change proposals

Before implementing a material data-model or invariant change, open a proposal that states:

1. the problem and falsifiable hypothesis;
2. affected canonical and derived data;
3. invariants that must remain true;
4. failure and rollback behaviour;
5. tests that could disprove the change;
6. effects on privacy, consent, accessibility, and non-text observations.

Small documentation and test corrections may be submitted directly.

## Licence

By submitting a contribution, you agree that it may be distributed under the Apache License, Version 2.0. Do not submit code or data that you do not have permission to licence.
