---
name: to-code
description: Turn a tracked issue into focused code changes with local docs, code exploration, implementation, and verification. Use when user invokes `/to-code <issue-id>`, says "implement issue #...", or asks to pick up a GitHub/local issue for coding.
---

# To Code

Use this skill to implement one tracked VESC app issue end-to-end.

## Communication

Use `caveman` full style for progress and final responses unless user explicitly says normal mode. Keep code, commands, issue titles, file paths, errors, and GitHub labels exact.

## Invocation

```text
/to-code 123
/to-code #123
/to-code https://github.com/OWNER/REPO/issues/123
```

Extract issue id from prompt. If missing, ask for it.

## Read Order

1. Read repo instructions:
   - `AGENTS.md`
   - `docs/agents/issue-tracker.md`
   - `docs/agents/domain.md`
   - `docs/agents/react.md` if touching React Native UI
   - `docs/agents/posthog.md` if touching PostHog/debugging flows
2. Read domain docs:
   - `CONTEXT.md` if present
   - `docs/tune.md` if touching tune read/write behavior
   - relevant `docs/adr/*.md` if present
3. Fetch issue using configured tracker docs.
   - For this repo's GitHub setup, use `gh issue view <id> --json number,title,body,state,labels,assignees,comments,url --jq '.'`.
   - Do not fetch private GitHub issue content with unauthenticated HTTP.
4. Explore relevant code and tests locally.

## Workflow

1. **Understand**
   - Summarize issue goal, acceptance criteria, and unknowns.
   - If issue is vague or blocked, stop and ask one precise question.
   - If issue contradicts `CONTEXT.md` or ADRs, surface conflict before editing.

2. **Plan**
   - Identify smallest coherent implementation.
   - Name files likely touched.
   - Start from issue `## Likely files` when present, then verify locally.
   - Prefer existing architecture and repo conventions.

3. **Implement**
   - Make focused edits only.
   - Keep native durable truth / JS presentation split when relevant.
   - Use `bun` for package scripts and JS tests.
   - Use repo-specific native test commands only when issue touches native code.
   - Keep Expo Router route/layout files under `src/app/`; move hooks/helpers/components elsewhere.
   - Do not broaden scope into unrelated refactors.

4. **Verify**
   - Run focused tests first.
   - Run broader checks when blast radius warrants it.
   - If verification cannot run, state exact reason.

5. **Report**
   - Mention issue id.
   - Summarize changed files and behavior.
   - List verification commands and results.
   - Mention remaining risks or follow-up issues only when real.

6. **Commit when requested**
   - If the user asks to commit, include the issue id in the commit message.
   - Preferred format: `<concise summary> #<issue-id>`.
   - Example: `Move avg filtering into sanitizer #25`.
   - If multiple issues are intentionally covered, include all ids in the first line.

## GitHub Issue Handling

When tracker is GitHub:

```bash
gh issue view <id> --json number,title,body,state,labels,assignees,comments,url --jq '.'
```

Do not use plain `gh issue view --comments` as primary fetch. It can return empty formatted output in non-interactive shells while JSON works.

Use `gh issue comment <id> --body "..."` only when user asks, when issue workflow requires it, or when leaving useful implementation notes. Do not close issues unless user asks.

## When To Refuse To Continue Without Clarification

Ask before editing when:

- Issue has no concrete expected behavior.
- Multiple incompatible product directions are possible.
- Change could alter safety-sensitive board behavior.
- Issue requires credentials, hardware, or environment state not available locally.

Ask one question at a time.
