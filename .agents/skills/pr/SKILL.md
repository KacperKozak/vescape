---
name: pr
description: Create a branch, commit, push, and open/update a PR on GitHub from the current working tree. Works with or without an issue — just needs changes and a prompt. Use when user invokes `/pr`, `/pr "title"`, says "open a PR", "push and create PR", or wants to ship current work to GitHub.
---

# PR

Branch, commit, push, and open/update a GitHub PR from the current working tree.

## Comms

Caveman full style. Code/commands/paths/labels/PR titles exact.

## Invocation

```text
/pr
/pr "Add dark mode support"
/pr --title "Add dark mode" --branch feature/dark-mode
```

No args -> infer title from changes. Quoted string -> use as PR title.

## Preflight (stop on fail, ask user)

1. `gh auth status` fail -> stop.
2. `git status --porcelain` empty (no changes, nothing to commit, already pushed) -> check if PR exists for current branch. If yes, report URL. If no changes to push, stop.
3. `gh pr list --head <branch>` returns >1 -> stop, ask which.

## Step 1 — Assess changes

```bash
git diff --stat
git diff --cached --stat
git status --porcelain
```

Understand what changed. Use this to infer commit message and PR title/body if not provided.

## Step 2 — Branch

- Already on feature branch (not `main`/`dev`) -> reuse.
- On `main` or `dev` -> create new branch. Derive name from title or changes: `<area-slug>-<short-desc>` (kebab, 2-4 words).

```bash
git checkout -b <branch-name>
```

If user passed `--branch`, use that exact name.

## Step 3 — Commit

Stage and commit all relevant changes. One commit.

```bash
git add <files>
git commit -m "<concise summary>"
```

Commit message: 1 line, imperative mood, focused on what changed. If an issue id is known (passed by caller), append `#<id>`.

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
gh pr create --base dev --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-4 lines describing what changed and why>
EOF
)"
```

Title: use user-provided title, or infer from commit/changes. Keep under 70 chars.

### PR exists -> update

Push new commits. If user provided context that should update the body, edit:

```bash
gh pr edit <number> --body "$(cat <<'EOF'
<updated body>
EOF
)"
```

Don't remove existing entries.

## Step 6 — Report

- PR url + number.
- Branch name.
- Files changed.
- Commit message.

## Caller protocol

Other skills (like `/to-pr`) can invoke `/pr` by following this skill's steps directly. When called by another skill:

- Branch name may be pre-determined by caller -> use it, skip Step 2 inference.
- Commit message may be pre-determined -> use it, skip inference.
- PR title and body may be pre-determined -> use them.
- Issue ids for `Closes #<id>` may be passed -> include in PR body.

## Refusal Triggers

Stop and ask when:

- `gh` not authed.
- Multiple PRs from same branch.
- Push rejected (non-fast-forward) -> surface, don't force.
- Dirty tree has mix of unrelated changes -> show diff, ask: commit all / select files / abort.

One question at a time.
