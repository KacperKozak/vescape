import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { CheckIcon, XIcon } from 'phosphor-react-native'

import { Dropdown } from '@/components/Dropdown'
import { clamp, snapValue } from '@/tune/sliderDefinitions'
import type { LinkedFieldPreview } from '@/tune/sliderDefinitions'
import { formatTuneValue } from '@/tune/fields'

export interface FieldEditorTarget {
  triggerRef: React.RefObject<View | null>
  label: string
  fieldId: string
  value: number
  min: number
  max: number
  step: number
  unit: string | null
  help: string
  linkedFields?: LinkedFieldPreview[]
}

interface FieldEditorPopoverProps {
  target: FieldEditorTarget | null
  onCancel: () => void
  onApply: (value: number) => void
}

export function FieldEditorPopover({ target, onCancel, onApply }: FieldEditorPopoverProps) {
  const [draftValue, setDraftValue] = useState(0)
  const [draftText, setDraftText] = useState('')
  const [trackWidth, setTrackWidth] = useState(1)
  const [trackLeft, setTrackLeft] = useState(0)
  const trackRef = useRef<View>(null)

  useEffect(() => {
    if (!target) return
    setDraftValue(target.value)
    setDraftText(formatTuneValue(target.value))
  }, [target])

  const progress = target
    ? clamp(((draftValue - target.min) / (target.max - target.min)) * 100, 0, 100)
    : 0

  const measureTrack = useCallback(() => {
    trackRef.current?.measureInWindow((x, _y, width) => {
      setTrackLeft(x)
      setTrackWidth(width > 0 ? width : 1)
    })
  }, [])

  const setValueFromLocalX = useCallback(
    (localX: number) => {
      if (!target || trackWidth <= 0) return
      const rawValue =
        target.min + (clamp(localX, 0, trackWidth) / trackWidth) * (target.max - target.min)
      const next = snapValue(rawValue, target.min, target.max, target.step)
      setDraftValue(next)
      setDraftText(formatTuneValue(next))
    },
    [target, trackWidth],
  )

  const setValueFromPageX = useCallback(
    (pageX: number) => setValueFromLocalX(pageX - trackLeft),
    [setValueFromLocalX, trackLeft],
  )

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          measureTrack()
          setValueFromLocalX(event.nativeEvent.locationX)
        },
        onPanResponderMove: (event) => setValueFromPageX(event.nativeEvent.pageX),
      }),
    [measureTrack, setValueFromLocalX, setValueFromPageX],
  )

  if (!target) return null

  return (
    <Dropdown
      visible
      triggerRef={target.triggerRef}
      onClose={onCancel}
      matchTriggerWidth={false}
      minWidth={300}
      maxHeight={380}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {target.label}
            </Text>
            <Text style={styles.fieldId}>{target.fieldId}</Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onCancel}>
            <XIcon size={14} color="#cbd5e1" weight="bold" />
          </Pressable>
        </View>

        <Text style={styles.help} numberOfLines={2}>
          {target.help}
        </Text>

        <TextInput
          style={styles.input}
          value={draftText}
          keyboardType="numeric"
          selectTextOnFocus
          onChangeText={(text) => {
            const parsed = Number.parseFloat(text)
            setDraftText(text)
            if (Number.isFinite(parsed)) {
              setDraftValue(snapValue(parsed, target.min, target.max, target.step))
            }
          }}
        />

        <View
          ref={trackRef}
          style={styles.track}
          onLayout={measureTrack}
          {...panResponder.panHandlers}
        >
          <View style={[styles.fill, { width: `${progress}%` }]} />
          <View style={[styles.thumb, { left: `${progress}%` }]} />
        </View>

        <View style={styles.range}>
          <Text style={styles.rangeText}>
            {formatTuneValue(target.min)}
            {target.unit ? ` ${target.unit}` : ''}
          </Text>
          <Text style={styles.rangeText}>
            {formatTuneValue(target.max)}
            {target.unit ? ` ${target.unit}` : ''}
          </Text>
        </View>

        {target.linkedFields && target.linkedFields.length > 0 ? (
          <View style={styles.linkedSection}>
            <Text style={styles.linkedTitle}>Linked fields</Text>
            {target.linkedFields.map((lf) => (
              <View key={lf.id} style={styles.linkedRow}>
                <Text style={styles.linkedLabel} numberOfLines={1}>
                  {lf.label}
                </Text>
                <Text style={styles.linkedValue}>
                  {formatTuneValue(lf.computeValue(draftValue))}
                  {lf.unit ? ` ${lf.unit}` : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={styles.applyBtn}
            onPress={() => onApply(snapValue(draftValue, target.min, target.max, target.step))}
          >
            <CheckIcon size={14} color="#020617" weight="bold" />
            <Text style={styles.applyText}>Apply</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Dropdown>
  )
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 380,
  },
  content: {
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
  },
  fieldId: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  help: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    paddingHorizontal: 12,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    overflow: 'visible',
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#38bdf8',
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    marginLeft: -12,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 3,
    borderColor: '#38bdf8',
  },
  range: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  rangeText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  linkedSection: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 10,
    gap: 6,
  },
  linkedTitle: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  linkedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  linkedLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  linkedValue: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 4,
  },
  cancelBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  applyBtn: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#38bdf8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  applyText: {
    color: '#020617',
    fontSize: 13,
    fontWeight: '900',
  },
})
