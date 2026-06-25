import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMemo, useState } from 'react'
import {
  ArrowUpIcon,
  ArrowsClockwiseIcon,
  CameraIcon,
  HeartIcon,
  NavigationArrowIcon,
  PencilSimpleIcon,
  RecordIcon,
  StopIcon,
  SwatchesIcon,
  TrashIcon,
} from 'phosphor-react-native'

import { IconHero } from '@/components/ui/settings/IconHero'
import { CircleButton } from '@/components/ui/controls/CircleButton'
import {
  FloatingActionPill,
  FloatingBarFrame,
  FloatingStatusPill,
  type FloatingStatusPillModel,
} from '@/components/ui/controls/FloatingBar'
import { HistoryNavigator } from '@/components/ui/controls/HistoryNavigator'
import { HPill, HPillAdd, HPillDot, HPillMenuItem, HPills } from '@/components/ui/controls/HPills'
import { MapOptionSelector } from '@/components/ui/controls/MapOptionSelector'
import { ShowcaseCard } from '@/components/ui/dev/ShowcaseCard'
import { ChipRow } from '@/components/ui/dev/ShowcaseControls'
import { theme } from '@/constants/theme'

function ZonePillsShowcase() {
  const [selectedId, setSelectedId] = useState('home')

  return (
    <ShowcaseCard name="HPills (zone)">
      <HPills activeId={selectedId}>
        <HPill
          id="home"
          label="Home"
          badge={<HPillDot status="enabled" />}
          color={theme.palette.green}
          onPress={() => setSelectedId('home')}
        >
          <HPillMenuItem icon={TrashIcon} label="Delete" onPress={() => undefined} danger />
        </HPill>
        <HPill
          id="work"
          label="Work"
          badge={<HPillDot status="disabled" />}
          color={theme.palette.green}
          onPress={() => setSelectedId('work')}
        >
          <HPillMenuItem icon={TrashIcon} label="Delete" onPress={() => undefined} danger />
        </HPill>
        <HPill
          id="custom"
          label="Custom"
          badge={<HPillDot status="draft" />}
          color={theme.palette.green}
          onPress={() => setSelectedId('custom')}
        >
          <HPillMenuItem icon={PencilSimpleIcon} label="Rename" onPress={() => undefined} />
          <HPillMenuItem
            icon={TrashIcon}
            label="Delete"
            onPress={() => undefined}
            danger
            separator
          />
        </HPill>
        <HPillAdd onPress={() => undefined} />
      </HPills>
    </ShowcaseCard>
  )
}

function CircleButtonShowcase() {
  return (
    <ShowcaseCard name="CircleButton">
      <View style={styles.buttonRow}>
        <CircleButton icon={PencilSimpleIcon} accessibilityLabel="Edit" onPress={() => undefined} />
        <CircleButton
          icon={TrashIcon}
          accessibilityLabel="Delete"
          variant="outline"
          onPress={() => undefined}
        />
        <CircleButton
          icon={ArrowUpIcon}
          accessibilityLabel="Move up"
          variant="ghost"
          onPress={() => undefined}
        />
        <CircleButton
          icon={ArrowsClockwiseIcon}
          accessibilityLabel="Loading"
          loading
          onPress={() => undefined}
        />
        <CircleButton
          icon={NavigationArrowIcon}
          accessibilityLabel="Disabled"
          disabled
          onPress={() => undefined}
        />
      </View>
      <View style={styles.buttonRow}>
        <CircleButton
          icon={CameraIcon}
          accessibilityLabel="Add photo"
          tone="purple"
          size="xs"
          onPress={() => undefined}
        />
        <CircleButton
          icon={HeartIcon}
          accessibilityLabel="Favorite"
          tone="amber"
          size="sm"
          variant="soft"
          onPress={() => undefined}
        />
        <CircleButton
          icon={RecordIcon}
          accessibilityLabel="Record"
          tone="red"
          size="md"
          variant="outline"
          onPress={() => undefined}
        />
        <CircleButton
          icon={StopIcon}
          accessibilityLabel="Stop recording"
          tone="red"
          size="lg"
          variant="solid"
          onPress={() => undefined}
        />
      </View>
    </ShowcaseCard>
  )
}

function FloatingBarShowcase() {
  const [kind, setKind] = useState<'spinner' | 'action'>('spinner')

  const pill: FloatingStatusPillModel =
    kind === 'spinner'
      ? {
          kind: 'spinner',
          text: 'Searching...',
          color: theme.palette.sky.color,
          onPress: () => undefined,
        }
      : {
          kind: 'action',
          text: 'Board not connected',
          buttonText: 'Connect',
          bg: theme.status.warning.bg,
          border: theme.status.warning.border,
          textColor: theme.status.warning.text,
          buttonBg: theme.status.warning.color,
          onPress: () => undefined,
        }

  return (
    <ShowcaseCard
      name="FloatingBar"
      controls={
        <ChipRow
          label="state"
          options={['spinner', 'action']}
          selected={kind}
          onSelect={(v) => setKind(v as typeof kind)}
        />
      }
    >
      <View style={styles.floatingPreview}>
        <FloatingBarFrame bottomOffset={18}>
          <FloatingStatusPill pill={pill} />
        </FloatingBarFrame>
      </View>
    </ShowcaseCard>
  )
}

function FloatingActionPillShowcase() {
  const [active, setActive] = useState(false)

  return (
    <ShowcaseCard
      name="FloatingActionPill"
      controls={
        <ChipRow
          label="state"
          options={['REC', 'STOP']}
          selected={active ? 'STOP' : 'REC'}
          onSelect={(v) => setActive(v === 'STOP')}
        />
      }
    >
      <View style={styles.centeredPreview}>
        <FloatingActionPill
          icon={active ? StopIcon : RecordIcon}
          label={active ? 'STOP' : 'REC'}
          active={active}
          onPress={() => setActive((v) => !v)}
        />
      </View>
    </ShowcaseCard>
  )
}

function HistoryNavigatorShowcase() {
  const [index, setIndex] = useState(1)
  const labels = ['Ride 08:12', 'Ride 12:47', 'Ride 18:05']

  return (
    <ShowcaseCard name="HistoryNavigator">
      <View style={styles.centeredPreview}>
        <HistoryNavigator
          label={labels[index]}
          previousDisabled={index === 0}
          nextDisabled={index === labels.length - 1}
          onPrevious={() => setIndex((v) => Math.max(0, v - 1))}
          onNext={() => setIndex((v) => Math.min(labels.length - 1, v + 1))}
          onSelect={() => undefined}
        />
      </View>
    </ShowcaseCard>
  )
}

function MapOptionSelectorShowcase() {
  const [expanded, setExpanded] = useState(false)
  const [active, setActive] = useState('north')

  const options = useMemo(
    () => [
      {
        key: 'north',
        label: 'North',
        icon: (
          <ArrowUpIcon
            size={20}
            color={active === 'north' ? theme.palette.green.text : theme.palette.slate.textDim}
            weight="bold"
          />
        ),
      },
      {
        key: 'gps',
        label: 'GPS',
        icon: (
          <NavigationArrowIcon
            size={20}
            color={active === 'gps' ? theme.palette.green.text : theme.palette.slate.textDim}
            weight="fill"
          />
        ),
      },
      {
        key: 'free',
        label: 'Free',
        icon: (
          <ArrowsClockwiseIcon
            size={20}
            color={active === 'free' ? theme.palette.green.text : theme.palette.slate.textDim}
            weight="bold"
          />
        ),
      },
    ],
    [active],
  )

  const activeIcon = useMemo(() => {
    if (active === 'north')
      return <ArrowUpIcon size={21} color={theme.palette.green.text} weight="bold" />
    if (active === 'gps')
      return <NavigationArrowIcon size={21} color={theme.palette.green.text} weight="fill" />
    return <ArrowsClockwiseIcon size={21} color={theme.palette.green.text} weight="bold" />
  }, [active])

  return (
    <ShowcaseCard
      name="MapOptionSelector"
      controls={
        <ChipRow
          label="mode"
          options={['north', 'gps', 'free']}
          selected={active}
          onSelect={(v) => {
            setActive(v)
            setExpanded(false)
          }}
        />
      }
    >
      <View style={{ alignItems: 'center', paddingVertical: 12 }}>
        <MapOptionSelector
          activeKey={active}
          activeIcon={activeIcon}
          activeColor={theme.palette.green.text}
          activeBackground={theme.palette.green.bg}
          collapsedAccessibilityLabel="Navigation mode"
          expanded={expanded}
          options={options}
          onToggle={() => setExpanded((p) => !p)}
          onSelect={(k) => {
            setActive(k)
            setExpanded(false)
          }}
        />
      </View>
    </ShowcaseCard>
  )
}

export default function ControlsPage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={SwatchesIcon}
          description="CircleButton, FloatingBar, HistoryNavigator, HPills, MapOptionSelector."
        />
        <CircleButtonShowcase />
        <FloatingBarShowcase />
        <FloatingActionPillShowcase />
        <HistoryNavigatorShowcase />
        <ZonePillsShowcase />
        <MapOptionSelectorShowcase />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.palette.slate.bg },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  floatingPreview: {
    height: 150,
    position: 'relative',
  },
  centeredPreview: {
    alignItems: 'center',
    paddingVertical: 12,
  },
})
