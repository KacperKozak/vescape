# Design Language

Visual design principles for the Vibe Wheel app. Follow these when building or modifying UI.

> **Every color in the app must come from the `theme` object in `src/constants/theme.ts`.**
> Never hardcode a hex value (`#...`), rgba literal, or any color string directly in a component file.
> If you need a new color, add a token to `theme.ts` first — then use it everywhere via `theme.*`.

> **No large solid bright fills — anywhere in the app.**
> Bright accent colours (`theme.*.color`) are for **thin borders, icons, and text**, not for filling large areas. Avoid `weight="fill"` glyphs, bright filled discs/badges/blocks, and bright-coloured backgrounds behind content. State and emphasis come from thin borders + coloured icons/text on the dark surface.
> Permitted fills: dark surfaces (`theme.neutral.surface`/`surfaceDeep`), dark tinted pill backgrounds (`theme.*.bg`), and the primary `Button`. Small bright accents (a thin underline, a dot, a 1–2px border) are fine; large bright planes are not.

## Theme

Dark-first. All screens use dark backgrounds with light text.

| Role           | Token                               |
| -------------- | ----------------------------------- |
| Background     | `theme.palette.slate.bg`            |
| Card / surface | `theme.palette.slate.surface`       |
| Deep surface   | `theme.palette.slate.surfaceDeep`   |
| Border         | `theme.palette.slate.border`        |
| Primary text   | `theme.palette.slate.textPrimary`   |
| Secondary text | `theme.palette.slate.textSecondary` |
| Muted text     | `theme.palette.slate.textMuted`     |
| Dim text       | `theme.palette.slate.textDim`       |

## Layout Principles

- **No decorative boxes.** Cards wrap only interactive groups (rows with inputs, switches, buttons). Do not wrap static info or labels in bordered containers.
- **Flat rows.** Settings-style rows are icon + label + control, no background box around the icon.
- **Breathing room.** Use padding and gap, not borders, to separate content sections.
- **Section titles** are uppercase, small (`12–13px`), muted (`theme.neutral.textMuted`), with letter-spacing.

## Semantic Colors

Use `src/constants/theme.ts` for all accent colors. Never hardcode a hex value, `rgba(...)` literal, or any color string directly in a component.

The theme is organized into domains:

### `palette`

Named hue swatches. Every hue exposes `.color`, `.alt` (alias of `.light`), `.light`, `.text`, `.bg`, and `.border`.

| Hue       | Purpose                                        |
| --------- | ---------------------------------------------- |
| `cyan`    | Brand / primary accents                        |
| `sky`     | Board data, version, distance, speed           |
| `green`   | GPS, Android platform, success, battery        |
| `purple`  | Time, iOS platform, profiles                   |
| `amber`   | Weather sun, diagnostic indicators             |
| `orange`  | Warnings, motor and controller temperatures    |
| `red`     | Destructive actions, errors                    |
| `yellow`  | Stars, achievements, gauges                    |
| `blue`    | Currents, info states                          |
| `fuchsia` | Roll telemetry                                 |
| `pink`    | Balance pitch telemetry                        |
| `violet`  | Map trail / marker accents                     |
| `slate`   | Neutral surfaces, text, borders, map buildings |
| `mono`    | Pure black and white                           |

### `telemetry`

Single-color tokens for every metric. Use these for charts, sparklines, gauges, and live readouts so the same metric always has the same color.

| Token            | Source hue              |
| ---------------- | ----------------------- |
| `speed`          | `palette.sky.light`     |
| `duty`           | `palette.teal.color`    |
| `motorCurrent`   | `palette.blue.color`    |
| `battCurrent`    | `palette.blue.alt`      |
| `motorTemp`      | `palette.red.color`     |
| `controllerTemp` | `palette.orange.color`  |
| `battVoltage`    | `palette.green.light`   |
| `footpad1`       | `palette.slate.light`   |
| `footpad2`       | `palette.slate.color`   |
| `pitch`          | `palette.purple.color`  |
| `roll`           | `palette.fuchsia.light` |
| `balancePitch`   | `palette.pink.color`    |

### `map`

| Token           | Purpose              |
| --------------- | -------------------- |
| `user`          | Current GPS position |
| `target`        | Destination / target |
| `buildingDark`  | Dark map buildings   |
| `buildingLight` | Light map buildings  |

### `status`

Semantic UI-state tokens. Each exposes `.color`, `.text`, `.bg`, and `.border`.

| Token      | Meaning                |
| ---------- | ---------------------- |
| `info`     | Informational callouts |
| `success`  | Success / connected    |
| `warning`  | Warnings               |
| `error`    | Errors / destructive   |
| `favorite` | Favorites / stars      |

### `alpha`

Every translucent value (overlays, backdrops, zone tints, glow gradients, vignettes) must be created with `theme.alpha(color, level)` using one of the typed levels:

```ts
type AlphaLevel = 0 | 0.12 | 0.3 | 0.4 | 0.6 | 0.7 | 0.8 | 0.85 | 1
```

Neutral row icons use `theme.palette.slate.textSecondary`.

## Icons

Use `phosphor-react-native` with `weight="duotone"` as default weight. Each icon gets a distinct accent color from `theme` — do not reuse the same color for adjacent icons.

Icon sizing:

- `14` — inline metadata, header stats
- `16–18` — row icons in settings/lists
- `20` — row icons inside icon boxes (legacy card rows)

## Status & Selection Indicators

A specific application of the no-bright-fills rule. Status and selection states (checklist steps, radios, progress milestones) use **thin-bordered outline circles**:

- Wrap the indicator in a generous circle (`40–44px`, `borderWidth: 1.5`, transparent background). State is carried by the **thin border colour + the icon colour**, both from `theme.*` — done in `gps`, active in `wheel`, error in `error`, idle in `theme.neutral.border`/`textMuted`.
- Never a `weight="fill"` disc or filled dot — a bright filled glyph reads as a heavy blob on the dark surface.
- **Bigger is calmer.** Prefer large outline circles with breathing room over small dense glyphs.

## Cards

Use cards (`backgroundColor: theme.neutral.surface`, `borderRadius: 12`, `borderColor: theme.neutral.border`) only for grouping interactive elements (switches, steppers, pressable rows). A card groups related controls — not labels or read-only info.

Inside cards, separate rows with a thin `theme.neutral.border` line indented past the icon (`marginLeft: 58`).

## Info Headers

For screen headers showing metadata (version, OS, DB size), use centered text without card wrappers:

- App name large and bold
- Stats in a horizontal row with colored icons + small muted text
- No background, no border — sits directly on screen background

## Typography

| Role          | Size  | Weight | Token                         |
| ------------- | ----- | ------ | ----------------------------- |
| Screen title  | 20    | 700    | `theme.neutral.textPrimary`   |
| Row label     | 15    | 600    | `theme.neutral.textPrimary`   |
| Row hint      | 12    | 400    | `theme.neutral.textMuted`     |
| Section title | 12–13 | 700    | `theme.neutral.textMuted`     |
| Metadata      | 12    | 600    | `theme.neutral.textSecondary` |
| Stepper value | 15    | 700    | `theme.neutral.textPrimary`   |

## Avoid

- Wrapping non-interactive content in cards or bordered boxes
- Using the same icon color for adjacent items
- Solid bright fills for status/selection (filled check discs, `weight="fill"` dots) — use thin-bordered outline circles instead
- `Alert.alert` — use `ConfirmModal` instead
- Ad-hoc `Pressable` + `Text` — use `Button` or `IconButton`
- Emoji or unicode as icon substitutes
