import { ScrollView, StyleSheet, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState } from 'react'

import { BroadcastIcon, ChartLineUpIcon, StackIcon } from 'phosphor-react-native'
import { Button } from '@/components/ui/base/Button'
import { Placeholder } from '@/components/ui/base/Placeholder'
import { CanvasWidget } from '@/components/widgets/CanvasWidget'
import { InputWidget } from '@/components/widgets/InputWidget'
import { LinkWidget } from '@/components/widgets/LinkWidget'
import { IconHero } from '@/components/ui/settings/IconHero'
import { ShowcaseCard } from '@/components/ui/dev/ShowcaseCard'
import { ToggleRow } from '@/components/ui/dev/ShowcaseControls'
import { theme } from '@/constants/theme'

function InputWidgetShowcase() {
  const [value, setValue] = useState<string | null>('Kacper')

  return (
    <ShowcaseCard name="InputWidget">
      <InputWidget
        label="Your name"
        value={value}
        placeholder="Add a display name"
        maxLength={32}
        onCommit={setValue}
      />
    </ShowcaseCard>
  )
}

function LinkWidgetShowcase() {
  return (
    <ShowcaseCard name="LinkWidget">
      <LinkWidget
        icon={ChartLineUpIcon}
        accent={theme.palette.sky.color}
        label="Profile stats"
        hint="All-time & monthly riding totals"
        onPress={() => {}}
      />
    </ShowcaseCard>
  )
}

function CanvasWidgetShowcase() {
  const [active, setActive] = useState(false)
  const [empty, setEmpty] = useState(false)

  return (
    <ShowcaseCard
      name="CanvasWidget"
      controls={
        <>
          <ToggleRow label="active" value={active} onToggle={setActive} />
          <ToggleRow label="empty body" value={empty} onToggle={setEmpty} />
        </>
      }
    >
      <CanvasWidget
        icon={BroadcastIcon}
        title="Group Ride"
        accent={theme.palette.groupRide.color}
        active={active}
        height={240}
        footer={
          <Button
            label={active ? 'Stop' : 'Create'}
            variant={active ? 'secondary' : 'primary'}
            onPress={() => setActive((v) => !v)}
            style={styles.fill}
          />
        }
      >
        {empty ? (
          <Placeholder icon={BroadcastIcon} description="No group rides near you right now." />
        ) : (
          <>
            <Text style={styles.name}>Sunset cruise</Text>
            <Text style={styles.meta}>4 riders · live now</Text>
          </>
        )}
      </CanvasWidget>
    </ShowcaseCard>
  )
}

export default function WidgetsPage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero icon={StackIcon} description="InputWidget, LinkWidget, CanvasWidget." />
        <InputWidgetShowcase />
        <LinkWidgetShowcase />
        <CanvasWidgetShowcase />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.palette.slate.bg },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
  fill: { flex: 1 },
  name: { color: theme.palette.slate.textPrimary, fontSize: 17, fontWeight: '700' },
  meta: { color: theme.palette.slate.textSecondary, fontSize: 13 },
})
