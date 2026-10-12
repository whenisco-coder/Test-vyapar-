# Project Context — Vyapar OS / Ajrakhika Business OS

This file records how the source archives are to be used as working context for future development.

## Inputs
- `vyaparos-v0.zip` is the base application source.
- `ajrakhika-docs.zip` is the supplemental documentation archive.
- `MERGE-NOTES.md` records the files added and the conflicting files preserved.

## Working rules
1. Start from the actual implementation in `src/`, tests in `tests/`, and the base project instructions in `AGENTS.md`.
2. Before implementing a task, read `AGENTS.md`, `docs/decisions.md`, `docs/architecture.md`, `docs/schema.md`, and the relevant task in `docs/tasks/v0.1-tasks.md`.
3. Supplemental documents that did not conflict with existing paths are merged into `docs/`.
4. Conflicting supplemental versions are preserved under `incoming-ajrakhika-docs/`. Do not silently overwrite either version. Compare them when a task depends on a conflicting topic and record any reconciliation decision in `docs/decisions.md` or `docs/assumptions.md` as appropriate.
5. Treat unresolved decisions explicitly listed as open in the decision documents as undecided; do not invent a decision.
6. Do not claim phone, Wi-Fi, Cloudflare, production, or real Tally verification unless it has actually been performed. Report unavailable verification honestly.
7. Preserve the strict UI/domain/data layer boundary, integer-paise money arithmetic, append-only ledgers, and existing test conventions described in `AGENTS.md`.
8. Run tests, type checking, and production build when dependencies are installed. If they cannot be run, state that clearly rather than implying success.

## Important scope note
The base README describes tyre retail and auto spare parts, while supplemental documentation describes Ajrakhika handicrafts and clothing. Treat this as a product-scope discrepancy to reconcile deliberately before making domain-specific UI or data-model changes; do not assume the two business profiles are interchangeable.

## Current validation status
The source and documentation archives have been merged into this working package. Dependencies are not installed in this environment, so automated tests, type checking, and production build have not yet been run.
