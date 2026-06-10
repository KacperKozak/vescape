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

## Environment Fixes

Do not fix local machine, shell, PATH, Java, Android SDK, Maestro, or other CLI/tooling environment problems in project code, package scripts, Expo config, or source files.

- Fix user or agent environment files instead, such as shell rc/profile files.
- Keep project scripts portable and free of machine-specific paths.
- If a tool is missing from non-interactive shells, repair the shell/agent environment, not `package.json`.

## Architecture Discipline

This is a PoC, but keep it sharp:

- Native owns durable truth and long-lived work; JS renders state and sends intents.
- Prefer clear architecture over compatibility, shortcuts, or hidden assumptions.
- Remove unused code! Not keep dead code for later.
- No duplicate code! We do not want to repeat ourselves.
- Do not add tests for trivial predicates. Add tests for meaningful behavior, edge cases, contracts, or regressions.

## Dir layout

- `android/`, `ios/` — Expo-generated native folders. They are gitignored and not durable source; do not make lasting changes there. Update Expo config, modules, plugins, or source inputs instead.
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

### E2E tests

Use the local `/e2e` skill for Maestro E2E runs. It covers fresh-shell execution, Android device checks, app install rules, and env-vs-project boundaries.

### Triage labels

Use the default five-label triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo with root `CONTEXT.md` and root `docs/adr/`. See `docs/agents/domain.md`.
