import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState, type ReactNode } from 'react'

import {
  BroadcastIcon,
  ChartLineUpIcon,
  GaugeIcon,
  MapPinIcon,
  StackIcon,
} from 'phosphor-react-native'
import { Button } from '@/components/ui/base/Button'
import { Placeholder } from '@/components/ui/base/Placeholder'
import { CanvasWidget } from '@/components/widgets/CanvasWidget'
import { DialWidget } from '@/components/widgets/DialWidget'
import { InputWidget } from '@/components/widgets/InputWidget'
import { LinkWidget } from '@/components/widgets/LinkWidget'
import { SwitchWidget } from '@/components/widgets/SwitchWidget'
import { IconHero } from '@/components/ui/settings/IconHero'
import { ShowcaseCard } from '@/components/ui/dev/ShowcaseCard'
import { theme } from '@/constants/theme'

/** A horizontal grid row — each `Cell` child takes an equal fraction of the width. */
function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>
}

function Cell({ children }: { children?: ReactNode }) {
  return <View style={styles.cell}>{children}</View>
}

function SizeLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sizeLabel}>{children}</Text>
}

function InputWidgetShowcase() {
  const [full, setFull] = useState<string | null>('Kacper')
  const [half, setHalf] = useState<string | null>('Sunset')
  const [square, setSquare] = useState<string | null>('42')

  return (
    <ShowcaseCard name="InputWidget">
      <SizeLabel>full (1×4)</SizeLabel>
      <InputWidget
        label="Your name"
        value={full}
        placeholder="Add a display name"
        maxLength={32}
        onCommit={setFull}
      />
      <SizeLabel>half (1×2)</SizeLabel>
      <Row>
        <Cell>
          <InputWidget label="Crew" value={half} size="half" onCommit={setHalf} />
        </Cell>
        <Cell />
      </Row>
      <SizeLabel>square (1×1)</SizeLabel>
      <Row>
        <Cell>
          <InputWidget label="Bib" value={square} size="square" onCommit={setSquare} />
        </Cell>
        <Cell />
        <Cell />
        <Cell />
      </Row>
    </ShowcaseCard>
  )
}

function LinkWidgetShowcase() {
  return (
    <ShowcaseCard name="LinkWidget">
      <SizeLabel>full (1×4)</SizeLabel>
      <LinkWidget
        icon={ChartLineUpIcon}
        accent={theme.palette.sky.color}
        label="Profile stats"
        hint="All-time & monthly riding totals"
        onPress={() => {}}
      />
      <SizeLabel>half (1×2)</SizeLabel>
      <Row>
        <Cell>
          <LinkWidget
            icon={ChartLineUpIcon}
            accent={theme.palette.sky.color}
            label="Stats"
            size="half"
            onPress={() => {}}
          />
        </Cell>
        <Cell>
          <LinkWidget
            icon={MapPinIcon}
            accent={theme.palette.green.color}
            label="Routes"
            size="half"
            onPress={() => {}}
          />
        </Cell>
      </Row>
      <SizeLabel>square (1×1)</SizeLabel>
      <Row>
        <Cell>
          <LinkWidget
            icon={ChartLineUpIcon}
            accent={theme.palette.sky.color}
            label="Stats"
            size="square"
            onPress={() => {}}
          />
        </Cell>
        <Cell>
          <LinkWidget
            icon={MapPinIcon}
            accent={theme.palette.green.color}
            label="Routes"
            size="square"
            onPress={() => {}}
          />
        </Cell>
        <Cell>
          <LinkWidget
            icon={BroadcastIcon}
            accent={theme.palette.groupRide.color}
            label="Group"
            size="square"
            onPress={() => {}}
          />
        </Cell>
        <Cell />
      </Row>
    </ShowcaseCard>
  )
}

function SwitchWidgetShowcase() {
  const [full, setFull] = useState(true)
  const [a, setA] = useState(false)
  const [b, setB] = useState(true)
  const [c, setC] = useState(false)

  return (
    <ShowcaseCard name="SwitchWidget">
      <SizeLabel>full (1×4)</SizeLabel>
      <SwitchWidget
        icon={BroadcastIcon}
        accent={theme.palette.groupRide.color}
        label="Broadcast presence"
        hint="Share your live position with the group"
        value={full}
        onValueChange={setFull}
      />
      <SizeLabel>half (1×2)</SizeLabel>
      <Row>
        <Cell>
          <SwitchWidget label="Haptics" value={a} size="half" onValueChange={setA} />
        </Cell>
        <Cell>
          <SwitchWidget
            icon={MapPinIcon}
            accent={theme.palette.green.color}
            label="GPS"
            value={b}
            size="half"
            onValueChange={setB}
          />
        </Cell>
      </Row>
      <SizeLabel>square (1×1)</SizeLabel>
      <Row>
        <Cell>
          <SwitchWidget
            icon={BroadcastIcon}
            accent={theme.palette.groupRide.color}
            label="Live"
            value={c}
            size="square"
            onValueChange={setC}
          />
        </Cell>
        <Cell />
        <Cell />
        <Cell />
      </Row>
    </ShowcaseCard>
  )
}

function DialWidgetShowcase() {
  const [full, setFull] = useState(80)
  const [half, setHalf] = useState(6)

  return (
    <ShowcaseCard name="DialWidget">
      <SizeLabel>full (1×4)</SizeLabel>
      <DialWidget
        label="Alert threshold"
        accent={theme.palette.orange.color}
        value={full}
        previousValue={65}
        min={0}
        max={100}
        step={1}
        unit="%"
        onValueChange={setFull}
      />
      <SizeLabel>half (1×2)</SizeLabel>
      <Row>
        <Cell>
          <DialWidget
            label="Gain"
            value={half}
            min={0}
            max={10}
            step={0.5}
            size="half"
            onValueChange={setHalf}
          />
        </Cell>
        <Cell />
      </Row>
      <SizeLabel>square (1×1)</SizeLabel>
      <Row>
        <Cell>
          <DialWidget
            label="Gain"
            value={half}
            min={0}
            max={10}
            step={0.5}
            unit="x"
            size="square"
            help="Tap the tile to scrub the value in a popover editor."
            onValueChange={setHalf}
          />
        </Cell>
        <Cell />
        <Cell />
        <Cell />
      </Row>
    </ShowcaseCard>
  )
}

function CanvasWidgetShowcase() {
  const [active, setActive] = useState(false)

  return (
    <ShowcaseCard name="CanvasWidget">
      <SizeLabel>full (1×4)</SizeLabel>
      <CanvasWidget
        icon={BroadcastIcon}
        title="Group Ride"
        accent={theme.palette.groupRide.color}
        active={active}
        height={200}
        footer={
          <Button
            label={active ? 'Stop' : 'Create'}
            variant={active ? 'secondary' : 'primary'}
            onPress={() => setActive((v) => !v)}
            style={styles.fill}
          />
        }
      >
        {active ? (
          <>
            <Text style={styles.name}>Sunset cruise</Text>
            <Text style={styles.meta}>4 riders · live now</Text>
          </>
        ) : (
          <Placeholder icon={BroadcastIcon} description="No group rides near you right now." />
        )}
      </CanvasWidget>
      <SizeLabel>half (1×2)</SizeLabel>
      <Row>
        <Cell>
          <CanvasWidget
            icon={GaugeIcon}
            title="Top speed"
            accent={theme.palette.sky.color}
            active
            size="half"
            height={120}
          >
            <Text style={styles.name}>42 km/h</Text>
            <Text style={styles.meta}>this ride</Text>
          </CanvasWidget>
        </Cell>
        <Cell />
      </Row>
      <SizeLabel>square (1×1)</SizeLabel>
      <Row>
        <Cell>
          <CanvasWidget
            icon={GaugeIcon}
            title="Top speed"
            accent={theme.palette.sky.color}
            active
            size="square"
          >
            <Text style={styles.squareValue}>42</Text>
            <Text style={styles.meta}>km/h</Text>
          </CanvasWidget>
        </Cell>
        <Cell />
        <Cell />
        <Cell />
      </Row>
    </ShowcaseCard>
  )
}

export default function WidgetsPage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={StackIcon}
          description="InputWidget, LinkWidget, SwitchWidget, DialWidget, CanvasWidget — each at full, half and square footprints."
        />
        <InputWidgetShowcase />
        <LinkWidgetShowcase />
        <SwitchWidgetShowcase />
        <DialWidgetShowcase />
        <CanvasWidgetShowcase />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.palette.slate.bg },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  cell: { flex: 1 },
  sizeLabel: {
    color: theme.palette.slate.textMuted,
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginTop: 4,
  },
  fill: { flex: 1 },
  name: { color: theme.palette.slate.textPrimary, fontSize: 17, fontWeight: '700' },
  squareValue: {
    color: theme.palette.slate.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  meta: { color: theme.palette.slate.textSecondary, fontSize: 13 },
})
