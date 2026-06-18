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

| Role           | Token                         |
| -------------- | ----------------------------- |
| Background     | `theme.neutral.bg`            |
| Card / surface | `theme.neutral.surface`       |
| Deep surface   | `theme.neutral.surfaceDeep`   |
| Border         | `theme.neutral.border`        |
| Primary text   | `theme.neutral.textPrimary`   |
| Secondary text | `theme.neutral.textSecondary` |
| Muted text     | `theme.neutral.textMuted`     |
| Dim text       | `theme.neutral.textDim`       |

## Layout Principles

- **No decorative boxes.** Cards wrap only interactive groups (rows with inputs, switches, buttons). Do not wrap static info or labels in bordered containers.
- **Flat rows.** Settings-style rows are icon + label + control, no background box around the icon.
- **Breathing room.** Use padding and gap, not borders, to separate content sections.
- **Section titles** are uppercase, small (`12–13px`), muted (`theme.neutral.textMuted`), with letter-spacing.

## Semantic Colors

Use `src/constants/theme.ts` for all accent colors. Never hardcode a color that belongs to one of these categories directly in a component.

| Token       | `.color`  | Purpose                        |
| ----------- | --------- | ------------------------------ |
| `wheel`     | `#38bdf8` | Board data, version, distance  |
| `bran`      | `#06b6d4` | Brand / primary accents        |
| `gps`       | `#22c55e` | GPS, Android platform, success |
| `target`    | `#a855f7` | Time, iOS platform, profiles   |
| `warning`   | `#f97316` | Database, speed, warnings      |
| `error`     | `#ef4444` | Destructive, errors            |
| `highlight` | `#facc15` | Stars, achievements, gauges    |
| `teal`      | `#14b8a6` | Secondary data, avg metrics    |

Each token also provides `.bg`, `.text`, and `.border` variants for pills, cards, and badges.

Neutral row icons use `theme.neutral.textSecondary`.

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
