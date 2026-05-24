import {
  ArrowLeftIcon,
  BellIcon,
  GaugeIcon,
  GhostIcon,
  GearSixIcon,
  MoonIcon,
  TrashIcon,
  UserIcon,
  WifiHighIcon,
} from 'phosphor-react-native'
import { useCallback, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Banner } from '@/components/Banner'
import { Button } from '@/components/Button'
import { IconButton } from '@/components/IconButton'
import { ConfirmModal } from '@/components/ConfirmModal'
import { DeviceRow } from '@/components/DeviceRow'
import { InfoModal } from '@/components/InfoModal'
import { Placeholder } from '@/components/Placeholder'
import { Select, type SelectOption } from '@/components/Select'
import { SingleGauge } from '@/components/charts/DualGauge'
import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { StatsRow } from '@/components/control/StatsRow'
import { ShowcaseCard } from '@/components/dev/ShowcaseCard'
import { ChipRow, OpenButton, ToggleRow, ValueRow } from '@/components/dev/ShowcaseControls'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/settings/SettingsSectionTitle'
import { Stepper } from '@/components/settings/Stepper'
import { TuneDial } from '@/components/tune/TuneDial'
import { telemetry } from '@/constants/telemetry'

function generateSparklineData(count: number, base: number, variance: number): SparklinePoint[] {
  const now = Date.now()
  const points: SparklinePoint[] = []
  let value = base
  for (let i = 0; i < count; i++) {
    value += (Math.random() - 0.48) * variance
    value = Math.max(base - variance * 3, Math.min(base + variance * 3, value))
    points.push({ ts: now - (count - i) * 1000, value })
  }
  return points
}

// ─── Individual showcases ──────────────────────────────────────────────

function IconButtonShowcase() {
  const [loading, setLoading] = useState(false)
  const [disabled, setDisabled] = useState(false)

  return (
    <ShowcaseCard
      name="IconButton"
      controls={
        <>
          <ToggleRow label="loading" value={loading} onToggle={setLoading} />
          <ToggleRow label="disabled" value={disabled} onToggle={setDisabled} />
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
  const [color, setColor] = useState('#64748b')

  return (
    <ShowcaseCard
      name="Placeholder"
      controls={
        <>
          <ToggleRow label="showTitle" value={showTitle} onToggle={setShowTitle} />
          <ChipRow
            label="iconColor"
            options={['#64748b', '#38bdf8', '#f87171']}
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

function ConfirmModalShowcase() {
  const [visible, setVisible] = useState(false)
  const [destructive, setDestructive] = useState(false)

  return (
    <ShowcaseCard
      name="ConfirmModal"
      controls={
        <>
          <ToggleRow label="destructive" value={destructive} onToggle={setDestructive} />
          <OpenButton onPress={() => setVisible(true)} />
        </>
      }
    >
      <Text style={styles.previewHint}>Tap &quot;Open Modal&quot; below</Text>
      <ConfirmModal
        visible={visible}
        title={destructive ? 'Delete profile?' : 'Apply changes?'}
        message={
          destructive ? 'This action cannot be undone.' : 'New settings will be synced to board.'
        }
        confirmLabel={destructive ? 'Delete' : 'Apply'}
        destructive={destructive}
        onConfirm={() => setVisible(false)}
        onCancel={() => setVisible(false)}
      />
    </ShowcaseCard>
  )
}

function InfoModalShowcase() {
  const [visible, setVisible] = useState(false)

  return (
    <ShowcaseCard name="InfoModal" controls={<OpenButton onPress={() => setVisible(true)} />}>
      <Text style={styles.previewHint}>Tap &quot;Open Modal&quot; below</Text>
      <InfoModal
        visible={visible}
        title="Motor Temperature"
        message="Measures heat at the motor stator. High temperatures reduce magnet strength and can damage winding insulation. Keep below 150°C for longevity."
        onDismiss={() => setVisible(false)}
      />
    </ShowcaseCard>
  )
}

function SelectShowcase() {
  const options: SelectOption[] = useMemo(
    () => [
      { label: 'Speed', value: 'speed' },
      { label: 'Duty Cycle', value: 'duty' },
      { label: 'Current', value: 'current' },
      { label: 'Temperature', value: 'temperature' },
    ],
    [],
  )
  const [value, setValue] = useState('speed')

  return (
    <ShowcaseCard name="Select">
      <Select options={options} value={value} onChange={setValue} placeholder="Choose metric…" />
    </ShowcaseCard>
  )
}

function SparklineShowcase() {
  const [showMax, setShowMax] = useState(true)
  const [maxPosition, setMaxPosition] = useState<'left' | 'right'>('right')
  const [color, setColor] = useState('#38bdf8')
  const points = useMemo(() => generateSparklineData(120, 42, 2), [])

  return (
    <ShowcaseCard
      name="Sparkline"
      controls={
        <>
          <ToggleRow label="showMaxBadge" value={showMax} onToggle={setShowMax} />
          <ChipRow
            label="maxPosition"
            options={['left', 'right']}
            selected={maxPosition}
            onSelect={(v) => setMaxPosition(v as 'left' | 'right')}
          />
          <ChipRow
            label="color"
            options={['#38bdf8', '#4ade80', '#f87171', '#facc15']}
            selected={color}
            onSelect={setColor}
          />
        </>
      }
    >
      <Sparkline
        points={points}
        color={color}
        height={32}
        fmtMax={(v) => `${v.toFixed(1)} V`}
        showMaxBadge={showMax}
        maxPosition={maxPosition}
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

function StatsRowShowcase() {
  return (
    <ShowcaseCard name="StatsRow">
      <StatsRow current="28.4 km/h" min="0.0" max="42.1" avg="18.7" />
    </ShowcaseCard>
  )
}

function SingleGaugeShowcase() {
  const [metricKey, setMetricKey] = useState<'speed' | 'duty' | 'battVoltage'>('speed')
  const value = useSharedValue<number | null>(34)
  const metric = telemetry[metricKey]

  const handleMetricChange = useCallback(
    (next: string) => {
      const key = next as typeof metricKey
      setMetricKey(key)
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value
      value.value = key === 'speed' ? 34 : key === 'duty' ? 68 : 42.5
    },
    [value],
  )

  return (
    <ShowcaseCard
      name="SingleGauge"
      controls={
        <ChipRow
          label="metric"
          options={['speed', 'duty', 'battVoltage']}
          selected={metricKey}
          onSelect={handleMetricChange}
        />
      }
    >
      <SingleGauge
        value={value}
        min={metric.chartRange.min}
        max={metric.chartRange.max}
        color={metric.color}
        unit={metric.unit}
        decimals={metric.decimals}
        label={metric.label.toUpperCase()}
        alerts={[
          { id: 'warn', threshold: metric.chartRange.max * 0.75, thresholdMax: null },
          {
            id: 'range',
            threshold: metric.chartRange.max * 0.88,
            thresholdMax: metric.chartRange.max * 0.98,
          },
        ]}
      />
    </ShowcaseCard>
  )
}

const RANGE_CONFIGS = {
  tune: { min: -5, max: 5, step: 1 },
  small: { min: 0, max: 10, step: 0.5 },
  medium: { min: 0, max: 100, step: 1 },
  large: { min: -50, max: 50, step: 5 },
} as const

type RangeKey = keyof typeof RANGE_CONFIGS

function TuneDialShowcase() {
  const [value, setValue] = useState(5.0)
  const [range, setRange] = useState<RangeKey>('small')
  const config = RANGE_CONFIGS[range]

  const handleRangeChange = useCallback((r: string) => {
    const key = r as RangeKey
    const c = RANGE_CONFIGS[key]
    setRange(key)
    setValue((prev) => Math.max(c.min, Math.min(c.max, prev)))
  }, [])

  return (
    <ShowcaseCard
      name="TuneDial"
      controls={
        <>
          <ValueRow label="value" value={value} />
          <ChipRow
            label="range"
            options={['tune', 'small', 'medium', 'large']}
            selected={range}
            onSelect={handleRangeChange}
          />
        </>
      }
    >
      <TuneDial
        value={value}
        previousValue={config.min + (config.max - config.min) * 0.3}
        min={config.min}
        max={config.max}
        step={config.step}
        onValueChange={setValue}
      />
    </ShowcaseCard>
  )
}

function CompactTuneDialShowcase() {
  const [value, setValue] = useState(0.5)

  return (
    <ShowcaseCard name="TuneDial Compact" controls={<ValueRow label="value" value={value} />}>
      <View style={styles.compactDial}>
        <TuneDial
          value={value}
          previousValue={0.3}
          min={0}
          max={1}
          step={0.01}
          onValueChange={setValue}
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

function SettingsComponentsShowcase() {
  const [darkMode, setDarkMode] = useState(true)
  const [notifications, setNotifications] = useState(false)
  const [threshold, setThreshold] = useState(3)

  return (
    <ShowcaseCard name="Settings components">
      <SettingsSectionTitle>Account</SettingsSectionTitle>
      <SettingsCard>
        <SettingsRow
          icon={UserIcon}
          label="Profile"
          hint="Edit your profile information"
          onPress={() => {}}
        />
        <SettingsRow
          icon={GearSixIcon}
          label="Preferences"
          hint="App settings and defaults"
          onPress={() => {}}
        />
      </SettingsCard>

      <SettingsSectionTitle>Appearance</SettingsSectionTitle>
      <SettingsCard>
        <SettingsRow
          icon={MoonIcon}
          iconWeight="fill"
          label="Dark mode"
          hint="Use dark theme throughout the app"
          right={
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: '#334155', true: '#1d4ed8' }}
              thumbColor={darkMode ? '#3b82f6' : '#64748b'}
            />
          }
        />
      </SettingsCard>

      <SettingsSectionTitle>Ride stats</SettingsSectionTitle>
      <SettingsCard>
        <SettingsRow
          icon={GaugeIcon}
          label="Moving speed threshold"
          hint="Speeds below this are treated as stopped"
          right={
            <Stepper
              value={`${threshold} km/h`}
              onDecrement={() => setThreshold((value) => Math.max(0, value - 1))}
              onIncrement={() => setThreshold((value) => Math.min(20, value + 1))}
            />
          }
        />
      </SettingsCard>

      <SettingsSectionTitle>Notifications</SettingsSectionTitle>
      <SettingsCard>
        <SettingsRow
          icon={BellIcon}
          label="Push notifications"
          hint="Receive alerts about your board"
          right={
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: '#334155', true: '#1d4ed8' }}
              thumbColor={notifications ? '#3b82f6' : '#64748b'}
            />
          }
        />
        <SettingsRow
          icon={WifiHighIcon}
          label="Connection alerts"
          hint="Notify when board connects or disconnects"
          onPress={() => {}}
        />
      </SettingsCard>
    </ShowcaseCard>
  )
}

// ─── Main screen ───────────────────────────────────────────────────────

export default function ComponentsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconButtonShowcase />
        <ButtonShowcase />
        <PlaceholderShowcase />
        <SelectShowcase />
        <SparklineShowcase />
        <DeviceRowShowcase />
        <StatsRowShowcase />
        <SingleGaugeShowcase />
        <TuneDialShowcase />
        <CompactTuneDialShowcase />
        <SettingsComponentsShowcase />
        <BannerShowcase />
        <ConfirmModalShowcase />
        <InfoModalShowcase />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 12,
    gap: 12,
    paddingBottom: 40,
  },
  previewHint: {
    color: '#475569',
    fontSize: 12,
    fontStyle: 'italic',
  },
  compactDial: {
    width: 180,
  },
})
