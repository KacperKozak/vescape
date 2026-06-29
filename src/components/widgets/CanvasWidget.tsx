import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Icon } from 'phosphor-react-native'

import { widgetSurface } from '@/components/widgets/widgetSurface'
import { theme } from '@/constants/theme'

interface CanvasWidgetProps {
  icon: Icon
  title: string
  /** Accent for the icon, the active border and the status dot. */
  accent?: string
  /** Raise the border to `accent` and show a status dot. */
  active?: boolean
  /** Fixed widget height — content is centred within it. */
  height?: number
  /** Pinned bottom area, e.g. an action button. */
  footer?: ReactNode
  /** Free-form body content, vertically centred. */
  children?: ReactNode
}

/** A free-canvas widget: header (icon + title + status) over any body, with an optional pinned footer. */
export function CanvasWidget({
  icon: IconComponent,
  title,
  accent = theme.palette.slate.textSecondary,
  active = false,
  height,
  footer,
  children,
}: CanvasWidgetProps) {
  return (
    <View style={[styles.widget, { height }, active && { borderColor: accent }]}>
      <View style={styles.header}>
        <IconComponent size={20} color={accent} weight="duotone" />
        <Text style={styles.title}>{title}</Text>
        {active ? <View style={[styles.dot, { backgroundColor: accent }]} /> : null}
      </View>
      <View style={styles.body}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  widget: {
    ...widgetSurface,
    padding: 16,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: theme.palette.slate.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  footer: {
    flexDirection: 'row',
  },
})
