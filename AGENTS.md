# Agent Guidelines

## Package Manager

Always use **bun** for all package management and script execution:

- Install dependencies: `bun install`
- Add packages: `bun add <package>`
- Remove packages: `bun remove <package>`
- Run scripts: `bun run <script>`
- Execute binaries: `bunx <binary>`
- Run tests: `bun test`

Do **not** use `npm`, `yarn`, `npx`, or `pnpm`.

## Architecture Discipline

This is a PoC, but keep it sharp:

- Native owns durable truth and long-lived work; JS renders state and sends intents.
- Design for lifecycle breaks: reloads, backgrounding, process death, and restart.
- Prefer clear architecture over compatibility, shortcuts, or hidden assumptions.
- Make one focused stability change at a time when isolating bugs.
- Remove unused code when replacing a path; do not keep dead code for later.
- Keep trivial local predicates inline with their component/module. Extract to a separate file only when logic is genuinely shared across multiple call sites. Single-use helpers belong in the same file as their consumer.
- Do not add tests for trivial predicates that TypeScript and the surrounding behavior already
  cover. Add tests for meaningful behavior, edge cases, contracts, or regressions.

## Dir layout

- `src/app/` — Expo Router routes only. No hooks, components, logic.
- `src/lib/` — Pure domain logic. No React, no native calls.
- `src/helpers/` — Single-source pure utilities (finite, id, error, format).
- `src/store/` — Zustand stores. Plain data only, no React elements.
- `src/components/` — React components only. No pure logic, no native calls.
- `src/hooks/` — React hooks only. Bridge between store & UI.
- `src/screens/` — Screen-level component subtrees (center screen).
- `src/constants/`, `src/config/`, `src/navigation/` — Static defs.

## React Native

React Native UI conventions, including icon usage, live in `docs/agents/react.md`.
Visual design language (colors, layout, typography) lives in `docs/design.md`.
PostHog agent debugging commands live in `docs/agents/posthog.md`.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `KacperKozak/vesc-app-poc`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo with root `CONTEXT.md` and root `docs/adr/`. See `docs/agents/domain.md`.
