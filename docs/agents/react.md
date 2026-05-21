# React Native

React Native UI conventions for this repo. Add component, styling, navigation, animation, and Expo Router guidance here when it becomes stable enough to apply across the app.

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
