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
  files for one-line booleans or tiny component-local decisions.
- Do not add tests for trivial predicates that TypeScript and the surrounding behavior already
  cover. Add tests for meaningful behavior, edge cases, contracts, or regressions.
- Files under `src/components/` should be React components or component-owned assets. Put
  non-component shared logic in an appropriate domain folder only when it is genuinely shared.

## Icons

Use **`phosphor-react-native`** for all icons. Do **not** use emoji or unicode characters as icon substitutes.

```tsx
import { LightningIcon, WarningCircleIcon } from 'phosphor-react-native'

<LightningIcon size={16} color="#4ade80" weight="fill" />
```

- Always use the **`Icon`-suffixed** export (e.g. `LightningIcon`, not `Lightning`). The un-suffixed names are deprecated and will produce warnings.
- The `type Icon` export (for typing icon props) is **not** suffixed — import it as `type Icon` as-is.
- `size` is typically `10`–`16` for inline/label icons, larger for standalone UI elements
