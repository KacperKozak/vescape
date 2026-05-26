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
- Keep trivial local predicates inline with their component/module. Do not create standalone helper
  files for one-line booleans or tiny component-local decisions, but use existing utility functions when available.
- Do not add tests for trivial predicates that TypeScript and the surrounding behavior already
  cover. Add tests for meaningful behavior, edge cases, contracts, or regressions.
- Files under `src/components/` should be React components or component-owned assets. Put
  non-component shared logic in an appropriate domain folder only when it is genuinely shared.
- Files under `src/app/` are Expo Router route/layout files only. Do not put hooks,
  non-route components, helpers, or other shared logic there; move them to `src/hooks/`,
  `src/components/`, or the relevant domain folder such as `src/tune/`.

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
