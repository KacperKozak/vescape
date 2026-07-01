import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useState } from 'react'
import {
  ArrowLeftIcon,
  CloudCheckIcon,
  CubeIcon,
  DownloadSimpleIcon,
  GearSixIcon,
  GhostIcon,
  PackageIcon,
  PlugIcon,
  TrashIcon,
  UsersThreeIcon,
} from 'phosphor-react-native'

import { Banner } from '@/components/ui/base/Banner'
import { IconHero } from '@/components/ui/settings/IconHero'
import { Button } from '@/components/ui/base/Button'
import { DeviceRow } from '@/components/ui/base/DeviceRow'
import { IconButton } from '@/components/ui/base/IconButton'
import { InfoBadge } from '@/components/ui/base/InfoBadge'
import { Placeholder } from '@/components/ui/base/Placeholder'
import { ScreenTitle } from '@/components/ui/base/ScreenTitle'
import { StepTimeline, type StepState, type TimelineStep } from '@/components/ui/base/StepTimeline'
import { ShowcaseCard } from '@/components/ui/dev/ShowcaseCard'
import { ChipRow, ToggleRow } from '@/components/ui/dev/ShowcaseControls'
import { theme } from '@/constants/theme'

function IconButtonShowcase() {
  const [loading, setLoading] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [dot, setDot] = useState(true)

  return (
    <ShowcaseCard
      name="IconButton"
      controls={
        <>
          <ToggleRow label="loading" value={loading} onToggle={setLoading} />
          <ToggleRow label="disabled" value={disabled} onToggle={setDisabled} />
          <ToggleRow label="dot" value={dot} onToggle={setDot} />
        </>
      }
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ gap: 8, alignItems: 'center' }}>
          <IconButton
            icon={ArrowLeftIcon}
            onPress={() => {}}
            loading={loading}
            disabled={disabled}
          />
          <IconButton
            icon={GearSixIcon}
            size="lg"
            onPress={() => {}}
            loading={loading}
            disabled={disabled}
          />
        </View>
        <View style={{ gap: 8, alignItems: 'center' }}>
          <IconButton
            icon={TrashIcon}
            destructive
            onPress={() => {}}
            loading={loading}
            disabled={disabled}
          />
          <IconButton
            icon={TrashIcon}
            size="lg"
            destructive
            onPress={() => {}}
            loading={loading}
            disabled={disabled}
          />
        </View>
        <View style={{ gap: 8, alignItems: 'center' }}>
          <IconButton
            icon={UsersThreeIcon}
            dot={dot ? theme.palette.groupRide.color : undefined}
            accessibilityLabel="Nearby ride"
            onPress={() => {}}
            loading={loading}
            disabled={disabled}
          />
          <IconButton
            icon={UsersThreeIcon}
            size="lg"
            dot={dot ? theme.palette.groupRide.color : undefined}
            accessibilityLabel="Nearby ride"
            onPress={() => {}}
            loading={loading}
            disabled={disabled}
          />
        </View>
      </View>
    </ShowcaseCard>
  )
}

function ButtonShowcase() {
  const [loading, setLoading] = useState(false)
  const [disabled, setDisabled] = useState(false)

  return (
    <ShowcaseCard
      name="Button"
      controls={
        <>
          <ToggleRow label="loading" value={loading} onToggle={setLoading} />
          <ToggleRow label="disabled" value={disabled} onToggle={setDisabled} />
        </>
      }
    >
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            style={{ flex: 1 }}
            label="Primary"
            variant="primary"
            onPress={() => {}}
            loading={loading}
            disabled={disabled}
          />
          <Button
            style={{ flex: 1 }}
            label="Secondary"
            variant="secondary"
            onPress={() => {}}
            loading={loading}
            disabled={disabled}
          />
          <Button
            style={{ flex: 1 }}
            label="Delete"
            variant="destructive"
            onPress={() => {}}
            loading={loading}
            disabled={disabled}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            style={{ flex: 1 }}
            label="With icon"
            variant="primary"
            icon={TrashIcon}
            size="sm"
            onPress={() => {}}
            loading={loading}
            disabled={disabled}
          />
          <Button
            style={{ flex: 1 }}
            label="Secondary sm"
            variant="secondary"
            size="sm"
            onPress={() => {}}
            loading={loading}
            disabled={disabled}
          />
        </View>
      </View>
    </ShowcaseCard>
  )
}

function PlaceholderShowcase() {
  const [showTitle, setShowTitle] = useState(true)
  const [color, setColor] = useState<string>(theme.palette.slate.textMuted)

  return (
    <ShowcaseCard
      name="Placeholder"
      controls={
        <>
          <ToggleRow label="showTitle" value={showTitle} onToggle={setShowTitle} />
          <ChipRow
            label="iconColor"
            options={[
              theme.palette.slate.textMuted,
              theme.palette.sky.color,
              theme.status.error.color,
            ]}
            selected={color}
            onSelect={setColor}
          />
        </>
      }
    >
      <View style={{ height: 140 }}>
        <Placeholder
          icon={GhostIcon}
          title={showTitle ? 'No data yet' : undefined}
          description="Connect board to start streaming telemetry"
          iconColor={color}
        />
      </View>
    </ShowcaseCard>
  )
}

function BannerShowcase() {
  const [variant, setVariant] = useState<'info' | 'warning' | 'error'>('warning')
  const [showTitle, setShowTitle] = useState(true)

  return (
    <ShowcaseCard
      name="Banner"
      controls={
        <>
          <ChipRow
            label="variant"
            options={['info', 'warning', 'error']}
            selected={variant}
            onSelect={(v) => setVariant(v as typeof variant)}
          />
          <ToggleRow label="title" value={showTitle} onToggle={setShowTitle} />
        </>
      }
    >
      <Banner
        variant={variant}
        title={showTitle ? 'Work in progress' : undefined}
        message="Tune editing is experimental. Do not sync changes to the board until this feature is stable."
      />
    </ShowcaseCard>
  )
}

function DeviceRowShowcase() {
  const [rssi, setRssi] = useState('-65')

  return (
    <ShowcaseCard
      name="DeviceRow"
      controls={
        <ChipRow label="rssi" options={['-45', '-65', '-80']} selected={rssi} onSelect={setRssi} />
      }
    >
      <DeviceRow
        id="AA:BB:CC:DD:EE:FF"
        name="VESC Onewheel"
        rssi={Number(rssi)}
        onPress={() => {}}
      />
    </ShowcaseCard>
  )
}

function InfoBadgeShowcase() {
  return (
    <ShowcaseCard name="InfoBadge">
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <InfoBadge label="Motor temp" onPress={() => {}} />
        <InfoBadge label="Overcurrent" danger onPress={() => {}} />
      </View>
    </ShowcaseCard>
  )
}

const TIMELINE_ICONS = [PlugIcon, DownloadSimpleIcon, PackageIcon, CloudCheckIcon]
const TIMELINE_LABELS = ['Connect', 'Download', 'Install', 'Verify']
const TIMELINE_CAPTIONS = [
  'Opening the connection',
  'Fetching the payload',
  'Writing files to disk',
  'Checking the signature',
]

/** Build a 4-step list where everything before `reach` is done, the step at
 *  `reach` is active, and the rest pending. A negative `reach` fails the last
 *  done step instead, to show the error state. */
function buildDemoSteps(reach: number, failed: boolean): TimelineStep[] {
  return TIMELINE_LABELS.map((label, i): TimelineStep => {
    let state: StepState = i < reach ? 'done' : i === reach ? 'active' : 'pending'
    if (failed && i === reach) state = 'failed'
    else if (failed && i > reach) state = 'absent'
    return {
      key: label,
      icon: TIMELINE_ICONS[i],
      label,
      caption: state === 'done' ? 'Done' : TIMELINE_CAPTIONS[i],
      state,
    }
  })
}

function StepTimelineShowcase() {
  const [reach, setReach] = useState('2')
  const [failed, setFailed] = useState(false)

  return (
    <ShowcaseCard
      name="StepTimeline"
      controls={
        <>
          <ChipRow
            label="reach"
            options={['0', '1', '2', '3', '4']}
            selected={reach}
            onSelect={setReach}
          />
          <ToggleRow label="failed" value={failed} onToggle={setFailed} />
        </>
      }
    >
      <StepTimeline steps={buildDemoSteps(Number(reach), failed)} />
    </ShowcaseCard>
  )
}

function ScreenTitleShowcase() {
  return (
    <ShowcaseCard name="ScreenTitle">
      <ScreenTitle title="Dashboard" />
    </ShowcaseCard>
  )
}

export default function BaseComponentsPage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={CubeIcon}
          description="Button, IconButton, Banner, DeviceRow, InfoBadge, StepTimeline, Placeholder, ScreenTitle."
        />
        <IconButtonShowcase />
        <ButtonShowcase />
        <PlaceholderShowcase />
        <BannerShowcase />
        <DeviceRowShowcase />
        <InfoBadgeShowcase />
        <StepTimelineShowcase />
        <ScreenTitleShowcase />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.palette.slate.bg },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
})
