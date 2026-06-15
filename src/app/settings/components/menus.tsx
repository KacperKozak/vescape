import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMemo, useState } from 'react'
import {
  ArrowUpIcon,
  ArrowsClockwiseIcon,
  NavigationArrowIcon,
  PencilSimpleIcon,
  SwatchesIcon,
  TrashIcon,
} from 'phosphor-react-native'

import { IconHero } from '@/components/ui/settings/IconHero'
import { HPill, HPillAdd, HPillDot, HPillMenuItem, HPills } from '@/components/ui/menus/HPills'
import { MapOptionSelector } from '@/components/ui/menus/MapOptionSelector'
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
          color={theme.gps}
          onPress={() => setSelectedId('home')}
        >
          <HPillMenuItem icon={TrashIcon} label="Delete" onPress={() => undefined} danger />
        </HPill>
        <HPill
          id="work"
          label="Work"
          badge={<HPillDot status="disabled" />}
          color={theme.gps}
          onPress={() => setSelectedId('work')}
        >
          <HPillMenuItem icon={TrashIcon} label="Delete" onPress={() => undefined} danger />
        </HPill>
        <HPill
          id="custom"
          label="Custom"
          badge={<HPillDot status="draft" />}
          color={theme.gps}
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
            color={active === 'north' ? theme.gps.text : theme.neutral.textDim}
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
            color={active === 'gps' ? theme.gps.text : theme.neutral.textDim}
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
            color={active === 'free' ? theme.gps.text : theme.neutral.textDim}
            weight="bold"
          />
        ),
      },
    ],
    [active],
  )

  const activeIcon = useMemo(() => {
    if (active === 'north') return <ArrowUpIcon size={21} color={theme.gps.text} weight="bold" />
    if (active === 'gps')
      return <NavigationArrowIcon size={21} color={theme.gps.text} weight="fill" />
    return <ArrowsClockwiseIcon size={21} color={theme.gps.text} weight="bold" />
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
          activeColor={theme.gps.text}
          activeBackground={theme.gps.bg}
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

export default function MenusPage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={SwatchesIcon}
          description="HPills, MapOptionSelector, MapNavigationSelector."
        />
        <ZonePillsShowcase />
        <MapOptionSelectorShowcase />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.neutral.bg },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
})
