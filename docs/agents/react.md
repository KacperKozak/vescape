# React Native

React Native UI conventions for this repo. Add component, styling, navigation, animation, and Expo Router guidance here when it becomes stable enough to apply across the app.

For visual design principles (colors, layout, typography, when to use cards), see [`docs/design.md`](../design.md).

## Component Gallery

When creating or significantly changing a reusable UI component, add or update its showcase in
`src/app/settings/components.tsx` in the same change.

- Use existing `ShowcaseCard` and controls from `@/components/dev/ShowcaseControls`.
- Include useful variants, states, and props that future agents/design checks need to see.
- Keep showcase data local and deterministic enough for quick visual inspection.
- Skip only components that are route-specific screens or tiny private sub-components with no reuse surface.

## Icons

Use **`phosphor-react-native`** for all icons. Do **not** use emoji or unicode characters as icon substitutes.

```tsx
import { LightningIcon, WarningCircleIcon } from 'phosphor-react-native'

;<LightningIcon size={16} color="#4ade80" weight="fill" />
```

- Always use the **`Icon`-suffixed** export, for example `LightningIcon`, not `Lightning`. The un-suffixed names are deprecated and will produce warnings.
- The `type Icon` export for typing icon props is **not** suffixed; import it as `type Icon` as-is.
- `size` is typically `10`-`16` for inline or label icons, larger for standalone UI elements.

## Icon buttons

Use **`IconButton`** (`@/components/IconButton`) for all circular icon-only pressables. Do not build ad-hoc `Pressable` + icon combinations.

```tsx
import { IconButton } from '@/components/IconButton'
import { ArrowLeftIcon, TrashIcon } from 'phosphor-react-native'

<IconButton icon={ArrowLeftIcon} onPress={handleBack} />
<IconButton icon={TrashIcon} destructive onPress={handleDelete} disabled={!canDelete} />
<IconButton icon={ArrowsClockwiseIcon} size="lg" loading={syncing} onPress={handleSync} />
```

- `size`: `'sm'` (default, 38×38 — headers, overlays) | `'lg'` (54×54 — bottom/content area)
- `destructive` shifts border to red-tinted and auto-tints icon to `#f87171` — no manual color needed
- `loading` disables the button and shows an `ActivityIndicator` in the icon color
- `style` accepts layout-level `ViewStyle` (position, margin, bottom/top/left/right)
- One visual style only: `rgba(15,23,42,0.72)` bg + `rgba(148,163,184,0.28)` border

## Buttons

Use **`Button`** (`@/components/Button`) for all tappable button actions. Do not build ad-hoc `Pressable` + `Text` combinations for buttons.

```tsx
import { Button } from '@/components/Button'
import { TrashIcon } from 'phosphor-react-native'

<Button label="Save" onPress={handleSave} />
<Button label="Cancel" variant="secondary" onPress={handleCancel} />
<Button label="Delete" variant="destructive" icon={TrashIcon} onPress={handleDelete} />
<Button label="Saving…" loading={isSaving} onPress={handleSave} />
```

- `variant`: `'primary'` (default, blue fill) | `'secondary'` (ghost/outline) | `'destructive'` (red fill)
- `size`: `'md'` (default, h40) | `'sm'` (h32)
- `icon`: phosphor `Icon` type — rendered left of the label
- `loading` disables the button and shows an `ActivityIndicator`
- `style` accepts layout-level `ViewStyle` (e.g. `flex: 1`, margins) — do not use it for visual overrides

## Confirmation dialogs

Use **`ConfirmModal`** (`@/components/ConfirmModal`) instead of `Alert.alert` for all confirmation prompts. `Alert.alert` renders a plain OS dialog that looks out of place in the dark-themed UI.

```tsx
import { ConfirmModal } from '@/components/ConfirmModal'

const [confirmVisible, setConfirmVisible] = useState(false)

<ConfirmModal
  visible={confirmVisible}
  title="Delete item"
  message="This cannot be undone."
  confirmLabel="Delete"
  destructive
  onConfirm={() => { deleteItem(); setConfirmVisible(false) }}
  onCancel={() => setConfirmVisible(false)}
/>
```

- Drive visibility with state (`useState<boolean>` or `useState<T | null>` when you need to remember _what_ to confirm).
- Set `destructive` for irreversible actions — it renders the confirm button in red.
- `confirmLabel` and `cancelLabel` default to "Confirm" / "Cancel"; override when a specific verb is clearer.
