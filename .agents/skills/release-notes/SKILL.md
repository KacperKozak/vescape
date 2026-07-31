---
name: release-notes
description: Draft and review canonical rider-facing Vescape release notes. Use when authoring notes for a release candidate, revising a generated release-note draft, or checking release-note editorial policy before publishing.
---

# Release Notes

Run the repository authoring loop:

```bash
bun run release-notes:author
```

Pass `--sha=<ref>` or `--version=<x.y.z>` only when overriding the defaults. The command resolves and shows the previous published release, target SHA, marketing version, and comparison range before invoking local Codex. It keeps drafts temporary and writes `release-notes/<version>.md` only after explicit acceptance.

## Editorial policy

- Write for riders. Describe user-visible behavior and outcomes, not implementation.
- State only claims verified from the compared source diff. Inspect real changes; never infer behavior from commit titles alone.
- Put safety-related changes first and explain their rider impact plainly.
- Omit internal refactors, dependency churn, test-only work, release plumbing, and developer tooling unless riders experience a direct change.
- Use concise Markdown only: headings, paragraphs, and lists. Do not use HTML, code blocks, images, tables, or a document-level title.
- Prefer sections such as `## Safety`, `## New`, `## Improved`, and `## Fixed`; include only sections supported by the changes.
- Do not include the version as a heading. The app supplies version metadata.
- Do not add promises, marketing filler, commit hashes, issue numbers, or contributor notes.

After manual canonical edits, run:

```bash
bun run release-notes:build
bun run release-notes:check
```
