---
name: to-pr
description: Implement a tracked issue end-to-end and manage the branch/PR lifecycle on GitHub. Use when user invokes `/to-pr <issue-id>`, says "implement issue and open PR", or asks to ship an issue into an existing/new feature PR.
---

# To PR

`/to-code` + branch/PR mgmt. One issue at a time, multi-issue PR per feature.

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

```bash
git checkout -b <area-slug>-<short-desc>
```

## Step 3 — Commit

One commit per issue. Format from `/to-code`:

```
<concise summary> #<issue-id>
```

Example: `Move avg filtering into sanitizer #25`.

## Step 4 — Push

First push: `git push -u origin <branch>`. Later: `git push`. No rebase. No force.

## Step 5 — PR

Detect existing:

```bash
gh pr list --head <branch> --base dev --json number,url,body --jq '.[0]'
```

### No PR -> create

Always ready (not draft). Base = `dev`.

```bash
gh pr create --base dev --title "<feature title>" --body "$(cat <<'EOF'
## Issues
- Closes #<id>

## Summary
<2-3 lines feature scope>

## Implementation notes
- #<id>: <note if any, omit section if none>
EOF
)"
```

PR title = feature scope (PRD title or `[Area]` group label), NOT single-issue title.

Use bare `#<id>` refs. GitHub auto-renders them as live links with current title + state icon — no manual link/title needed, and stays in sync if issue title changes.

### PR exists -> edit body

Fetch current body, append:

- `Closes #<id>` line under `## Issues`.
- `- #<id>: <note>` under `## Implementation notes` if findings present. Create section if missing.

```bash
gh pr edit <number> --body "$(cat <<'EOF'
<updated body>
EOF
)"
```

Don't remove existing entries.

## Step 6 — Report

- PR url + number.
- Issue id(s) closed by this run.
- Files changed.
- Notes appended.

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
