# Design Language

Visual design principles for the Vibe Wheel app. Follow these when building or modifying UI.

## Theme

Dark-first. All screens use dark backgrounds with light text.

| Role           | Color     |
| -------------- | --------- |
| Background     | `#111827` |
| Card / surface | `#1e293b` |
| Deep surface   | `#0f172a` |
| Border         | `#334155` |
| Primary text   | `#f1f5f9` |
| Secondary text | `#94a3b8` |
| Muted text     | `#64748b` |
| Dim text       | `#475569` |

## Layout Principles

- **No decorative boxes.** Cards wrap only interactive groups (rows with inputs, switches, buttons). Do not wrap static info or labels in bordered containers.
- **Flat rows.** Settings-style rows are icon + label + control, no background box around the icon.
- **Breathing room.** Use padding and gap, not borders, to separate content sections.
- **Section titles** are uppercase, small (`12–13px`), muted (`#64748b`), with letter-spacing.

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

Neutral row icons use `#94a3b8` (not in theme — it's a surface-level slate).

## Icons

Use `phosphor-react-native` with `weight="duotone"` as default weight. Each icon gets a distinct accent color from `theme` — do not reuse the same color for adjacent icons.

Icon sizing:

- `14` — inline metadata, header stats
- `16–18` — row icons in settings/lists
- `20` — row icons inside icon boxes (legacy card rows)

## Cards

Use cards (`backgroundColor: #1e293b`, `borderRadius: 12`, `borderColor: #334155`) only for grouping interactive elements (switches, steppers, pressable rows). A card groups related controls — not labels or read-only info.

Inside cards, separate rows with a thin `#334155` line indented past the icon (`marginLeft: 58`).

## Info Headers

For screen headers showing metadata (version, OS, DB size), use centered text without card wrappers:

- App name large and bold
- Stats in a horizontal row with colored icons + small muted text
- No background, no border — sits directly on screen background

## Typography

| Role          | Size  | Weight | Color     |
| ------------- | ----- | ------ | --------- |
| Screen title  | 20    | 700    | `#f1f5f9` |
| Row label     | 15    | 600    | `#f1f5f9` |
| Row hint      | 12    | 400    | `#64748b` |
| Section title | 12–13 | 700    | `#64748b` |
| Metadata      | 12    | 600    | `#94a3b8` |
| Stepper value | 15    | 700    | `#f1f5f9` |

## Avoid

- Wrapping non-interactive content in cards or bordered boxes
- Using the same icon color for adjacent items
- `Alert.alert` — use `ConfirmModal` instead
- Ad-hoc `Pressable` + `Text` — use `Button` or `IconButton`
- Emoji or unicode as icon substitutes
