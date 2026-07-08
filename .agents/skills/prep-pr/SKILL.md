---
name: prep-pr
description: Prepare or refresh an initial feature PR from a PRD/issues/PR context, including empty-branch placeholder PRs. Use when the user wants a long-running implementation PR set up with future-facing title/body, linked PRD/issues, and navigation for follow-up task branches.
---

# Prep PR

Prepare a feature PR as the stable landing place for a PRD or issue group. This skill is for the "initial PR" before or during task-by-task implementation, so it must work even when the branch has no code changes yet.

## Core rules

- The PR title/body describe the **finished feature**, not the current diff.
- Never write copy like "this PR sets up docs" unless the feature really is only docs. Use final-feature language such as "This PR adds..." or "This PR implements...".
- If the branch has no changes or no commits ahead of base, create an empty commit so GitHub can host the PR.
- New initial feature PRs start as draft PRs. Use `gh pr create --draft` unless the user explicitly asks for a ready PR.
- If a PR already exists for the current branch, update that PR instead of creating a duplicate.
- Keep the PR useful for navigation: link the PRD, all implementation issues, and any tracking parent issue.
- Do not close or modify the PRD/issues unless the user explicitly asks.
- Use `gh` for GitHub operations. This repo is private; do not fetch GitHub issue/PR pages over unauthenticated HTTP.
- Follow repo branch rules from `AGENTS.md`: do not add generated prefixes to branch names.

## Inputs to discover

Prefer discovery before asking:

1. Current branch and base branch.
2. Existing PR for the current branch: `gh pr view --json number,title,body,baseRefName,headRefName,url`.
3. PRD and implementation issues:
   - From user-provided issue/PR numbers.
   - From current PR body.
   - From issue references in recent conversation if available.
   - From GitHub issue labels/titles only if needed.
4. Current local diff and branch-ahead status:
   - `git status --short --branch`
   - `git diff --stat`
   - `git log --oneline <base>..HEAD`

Ask one concise question only if no PRD/issues/PR context can be inferred.

## Empty branch handling

If the user wants a PR prepared but there are no file changes and no commits ahead of base:

1. Create or switch to the intended feature branch.
2. Run:
   ```bash
   git commit --allow-empty -m "Prepare <feature-name> work"
   ```
3. Push the branch.
4. Create the draft PR with the future-facing feature title/body.

If there are staged or unstaged changes, commit the actual changes instead of making an empty commit.

## PR title

Use a short feature title, not a task title.

Good:

```text
Add link integrity
Implement Refloat-scoped tunes
Add ride export
```

Bad:

```text
Document link integrity plan
Set up initial docs
WIP
```

If an existing PR title is too focused on current setup/docs, update it to the finished feature.

## PR body

Use this shape by default:

```md
This PR implements <feature outcome>.

What this lands:

- <final user-visible or system behavior>
- <important technical contract>
- <important UI/state behavior>

Navigation:

- PRD: #<id>
- #<issue>, <what this task contributes beyond its title>
- #<issue>, <what this task contributes beyond its title>
```

Keep the body short. It should help future agents navigate, not duplicate the PRD.

## Issue links

When implementation issues exist, include them in dependency order if known. GitHub already renders issue titles for bare refs, so do not repeat the issue title after the ref. Add a short task description only when it helps explain the role of the task in the feature branch.

```md
- #193, durable Board Link v3 storage and old-link normalization
- #194, probe-time controller identity for each selectable transport
```

If the PR is a feature parent where all tasks will merge into it, say that explicitly:

```md
All implementation work is tracked in the issues above and can merge back into this branch.
```

## Existing PR refresh

If a PR already exists:

1. Read its body.
2. Preserve any useful links/comments.
3. Replace stale current-diff wording with future-facing feature wording.
4. Keep PRD/issues navigation.
5. Update title/body with `gh pr edit`.

## Final response

Return the PR URL first, then one short summary of what was prepared:

```text
PR ready: <url>

Updated the draft feature PR with linked PRD/issues.
```
