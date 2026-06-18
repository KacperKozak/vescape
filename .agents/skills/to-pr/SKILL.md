---
name: to-pr
description: Implement a tracked issue end-to-end and open/update a PR on GitHub. Combines `/to-code` for implementation with `/pr` for branch/PR lifecycle. Use when user invokes `/to-pr <issue-id>`, says "implement issue and open PR", or asks to ship an issue into a feature PR.
---

# To PR

`/to-code` + `/pr`. One issue at a time, multi-issue PR per feature.

## Comms

Caveman full style. Code/commands/paths/labels/PR titles exact.

## Invocation

```text
/to-pr 123
/to-pr #123
/to-pr https://github.com/OWNER/REPO/issues/123
```

Missing id -> ask.

## Preflight (stop on fail, ask user)

- Dirty tree (`git status --porcelain` non-empty with unrelated changes) -> show diff, ask: stash / commit first / abort.
- `gh auth status` fail -> stop.
- `gh pr list --head <branch>` returns >1 -> stop, ask which.
- Issue area mismatch (see Branch rules) -> stop, ask.

## Step 1 — Run `/to-code` workflow

Follow `/to-code` SKILL.md sections **Read Order** + **Workflow** steps 1-5 (Understand, Plan, Implement, Verify, Report). Verify gate from `/to-code` is authoritative — no double-verify here. Tests fail -> stop, don't push.

## Step 2 — Determine feature scope + branch

Resolve feature scope from issue:

1. Parent PRD link in issue body -> use PRD title.
2. `[Area] N - ...` prefix -> group with sibling issues sharing same `[Area]`. Title from PRD if exists, else `[Area] <feature noun>`.
3. No parent + single issue -> use issue title.
4. Ambiguous -> ask one question.

Branch name: `<area-slug>-<short-desc>` (kebab, 2-4 words). Match `area:<slug>` label when present.

Branch rules:

- On `main` or `dev` -> create new branch from current.
- On feature branch matching current `[Area]` group -> reuse.
- On feature branch for different area -> stop, ask: switch / new branch / proceed.

## Step 3 — Delegate to `/pr`

Follow `/pr` SKILL.md using the caller protocol. Pass:

- **Branch name**: determined in Step 2 (skip `/pr` Step 2 inference).
- **Commit message**: `<concise summary> #<issue-id>`. Ex: `Move avg filtering into sanitizer #25`.
- **PR title**: feature scope (PRD title or `[Area]` group label), NOT single-issue title.
- **PR body**: use the issue-aware template below.
- **Issue ids**: for `Closes #<id>` lines.

`/pr` handles: commit, push, PR create/update, report.

### PR body — new PR

```markdown
## Issues

- Closes #<id>

## Summary

<2-3 lines feature scope>

## Implementation notes

- #<id>: <note if any, omit section if none>
```

Use bare `#<id>` refs. GitHub auto-renders them as live links with current title + state icon.

### PR body — existing PR

Fetch current body, append:

- `Closes #<id>` line under `## Issues`.
- `- #<id>: <note>` under `## Implementation notes` if findings present. Create section if missing.

Don't remove existing entries.

## Implementation Notes — when to add

Add entry when discovered:

- Surprising coupling or fragile invariant near edit.
- TODO worth tracking but out of scope.
- Test gap that real bug could slip through.
- Native/JS contract assumption that could break later.

Skip noise (style nits, obvious refactors).

If note = actionable follow-up issue -> propose creating sibling issue instead of body note. Default to body note.

## Refusal Triggers (additive to `/to-code`)

Stop and ask when:

- Dirty tree with unrelated changes.
- `gh` not authed.
- Area mismatch vs current branch.
- Multiple PRs from same branch.
- Push rejected (non-fast-forward) -> surface, don't force.

One question at a time.
