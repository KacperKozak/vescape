import { useCallback, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { CaretDownIcon, CheckIcon } from 'phosphor-react-native'

import { interaction, theme } from '@/constants/theme'
import { Dropdown } from './Dropdown'

const MAX_DROPDOWN_HEIGHT = 280

export interface SelectOption<T extends string = string> {
  label: string
  value: T
}

interface SelectProps<T extends string = string> {
  options: SelectOption<T>[]
  value: T
  onChange: (value: T) => void
  placeholder?: string
  style?: View['props']['style']
}

export function Select<T extends string = string>({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  style,
}: SelectProps<T>) {
  const triggerRef = useRef<View>(null)
  const [open, setOpen] = useState(false)

  const selectedOption = options.find((o) => o.value === value)

  const handleSelect = useCallback(
    (optionValue: T) => {
      onChange(optionValue)
      setOpen(false)
    },
    [onChange],
  )

  return (
    <>
      <Pressable ref={triggerRef} style={[styles.trigger, style]} onPress={() => setOpen(true)}>
        <Text style={[styles.triggerText, !selectedOption && styles.placeholderText]}>
          {selectedOption?.label ?? placeholder}
        </Text>
        <CaretDownIcon size={14} color="#64748b" weight="bold" />
      </Pressable>

      <Dropdown
        visible={open}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        maxHeight={MAX_DROPDOWN_HEIGHT}
      >
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          {options.map((option, index) => {
            const selected = option.value === value
            return (
              <Pressable
                key={option.value}
                style={({ pressed }) => [
                  styles.option,
                  index < options.length - 1 && styles.optionBorder,
                  selected && styles.optionSelected,
                  pressed && styles.optionPressed,
                ]}
                onPress={() => handleSelect(option.value)}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {option.label}
                </Text>
                {selected ? <CheckIcon size={14} color={theme.wheel.color} weight="bold" /> : null}
              </Pressable>
            )
          })}
        </ScrollView>
      </Dropdown>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.neutral.surface,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  triggerText: {
    color: theme.neutral.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  placeholderText: {
    color: theme.neutral.textMuted,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.neutral.border,
  },
  optionSelected: {
    backgroundColor: theme.wheel.bg,
  },
  optionPressed: {
    backgroundColor: interaction.pressedBg,
  },
  optionText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: theme.wheel.color,
    fontWeight: '600',
  },
})
