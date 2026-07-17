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

## Git Branch Names

Do **not** add generated prefixes to branch names, including agent/tool names like `codex/`,
`claude/`, `agent/`, or similar.

- Use clean feature branch names, e.g. `battery-bms-diagnostics`.
- Only add a prefix when the user explicitly asks for that exact prefix.

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

## Parity

`@parity` links code that must stay in sync across implementations. It is a navigation contract: a tag is a
promise that the peer is inspected before the edit is finished.

Format: `@parity /repo-root/path-to-peer` — optionally suffixed with a backtick symbol name when the link is
narrower than the whole file, e.g. `@parity /modules/vesc-ble/android/.../VescBleModule.kt `frontendActive``.

### Native ↔ native (iOS ↔ Android)

When both platforms implement the same capability, tag both sides — the pair is bidirectional.

- Tag near the module/class/function entry point on both platform implementations.
- Keep native API, event names, payload shapes, errors, lifecycle, threading, persistence, and unsupported-platform behavior aligned.
- Use `@platform-diff <reason>` next to the `@parity` tag only for intentional, accepted long-term platform differences.
- Do not add `@parity` to Expo-generated `android/` or `ios/` root folders; use durable source under `modules/`, config plugins, or shared source inputs.
- If parity cannot be completed now, leave a `TODO(<platform> parity): <reason>`, create/follow an issue, and call out the limitation in the final response.

### TS ↔ native

TS that mirrors a native contract carries the same tag. This makes the link a triangle: TS points to both
platforms, and each platform points back to the TS peer.

Tag TS when it duplicates a native definition:

- Enums and union types mirroring native enums.
- Event names and payload/prop types crossing the bridge.
- Contract constants (keys, limits, defaults, thresholds) that native also hardcodes.
- Small logic that native re-implements (formatting, thresholds, derivations).

Rules:

- A TS node mirroring both platforms carries two `@parity` lines — one per platform.
- Back-pointers to TS belong only on the native nodes the TS actually mirrors. Do not tag native implementation internals with a TS pointer; they have no TS peer.
- If TS is the only source of truth (native reads it, does not redefine it), no tag — there is nothing to drift.
- `@platform-diff` and `TODO(<platform> parity)` apply here identically.

## Dir layout

- `modules/vesc-ble/` — the core of the app: ~50% of all code (Swift + Kotlin, roughly equal to all of `src/`). Durable native source, owns BLE transport, board session, telemetry, recording, alerts, and Refloat config. `ios/` and `android/` subtrees are peer implementations linked by `@parity`. Treat it as a first-class part of the codebase, not a native detail hanging off the JS app.
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
Mapbox dependency patches and their native camera semantics live in `docs/agents/mapbox-patches.md`.
Generated native state (`ios/`, `android/`, Pods) is kept in sync by `bun run ios` / `bun run android`; see `docs/agents/native-sync.md`.

When adding or changing a reusable UI component (or a new visual variant/state of one), add or update its preview in the component showcase under `src/app/settings/components/` so every component stays browsable with live controls.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `KacperKozak/vesc-app-poc`. See `docs/agents/issue-tracker.md`.

### E2E tests

Use the local `/e2e` skill for Maestro E2E runs. It covers fresh-shell execution, Android device checks, app install rules, and env-vs-project boundaries.

### Triage labels

Use the default five-label triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo with root `CONTEXT.md` and root `docs/adr/`. See `docs/agents/domain.md`.
