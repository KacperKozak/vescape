import { useState } from 'react'
import { router } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'
import type { BatteryConfig } from 'vesc-ble'

import { DEFAULT_BATTERY_CONFIG, deriveBatteryConfig } from '@/lib/battery'
import {
  type BatteryMode,
  type BatterySummary,
  buildBatteryConfig,
  getBatterySummary,
  parseVoltage,
} from '@/lib/boardSetup'
import { useBoardStore } from '@/store/boardStore'

export const WIZARD_STEPS = ['scan', 'name', 'battery', 'confirm'] as const
export type WizardStepId = (typeof WIZARD_STEPS)[number]

interface AddBoardWizardState {
  step: number
  stepId: WizardStepId
  bleId: string
  bleName: string
  name: string
  description: string
  batteryMode: BatteryMode
  cellPresetId: string
  seriesCount: number
  parallelCount: number
  manualMinVoltage: string
  manualMaxVoltage: string
  batteryWarning: string | null
  batterySummary: BatterySummary
  canSave: boolean
}

interface AddBoardWizardActions {
  setStep: (step: number) => void
  next: () => void
  back: () => void
  selectDevice: (id: string, deviceName: string) => void
  clearDevice: () => void
  setName: (v: string) => void
  setDescription: (v: string) => void
  setBatteryMode: (v: BatteryMode) => void
  setCellPresetId: (v: string) => void
  setSeriesCount: (v: number) => void
  setParallelCount: (v: number) => void
  setManualMinVoltage: (v: string) => void
  setManualMaxVoltage: (v: string) => void
  save: () => void
}

export type UseAddBoardWizard = AddBoardWizardState & AddBoardWizardActions

export function useAddBoardWizard(): UseAddBoardWizard {
  const { addBoard, setActiveBoard } = useBoardStore(
    useShallow((s) => ({ addBoard: s.addBoard, setActiveBoard: s.setActiveBoard })),
  )

  const [step, setStep] = useState(0)
  const [bleId, setBleId] = useState('')
  const [bleName, setBleName] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [batteryMode, setBatteryMode] = useState<BatteryMode>(DEFAULT_BATTERY_CONFIG.mode)
  const [cellPresetId, setCellPresetId] = useState(DEFAULT_BATTERY_CONFIG.cellPresetId)
  const [seriesCount, setSeriesCount] = useState(DEFAULT_BATTERY_CONFIG.seriesCount)
  const [parallelCount, setParallelCount] = useState(DEFAULT_BATTERY_CONFIG.parallelCount)
  const [manualMinVoltage, setManualMinVoltage] = useState('60')
  const [manualMaxVoltage, setManualMaxVoltage] = useState('84')

  const previewConfig: BatteryConfig =
    batteryMode === 'preset'
      ? { mode: 'preset', cellPresetId, seriesCount, parallelCount }
      : {
          mode: 'manual',
          minVoltage: parseVoltage(manualMinVoltage) ?? 0,
          maxVoltage: parseVoltage(manualMaxVoltage) ?? 0,
        }
  const derivedBattery = deriveBatteryConfig(previewConfig)
  const batteryWarning = derivedBattery.warning
  const canSave = Boolean(name.trim()) && batteryWarning == null
  const batterySummary = getBatterySummary(
    false,
    derivedBattery,
    batteryMode,
    cellPresetId,
    seriesCount,
    parallelCount,
  )

  const next = () => setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  const selectDevice = (id: string, deviceName: string) => {
    setBleId(id)
    setBleName(deviceName)
    if (!name.trim()) setName(deviceName)
    next()
  }

  const clearDevice = () => {
    setBleId('')
    setBleName('')
  }

  const save = () => {
    if (!canSave) return
    const batteryConfig = buildBatteryConfig(
      batteryMode,
      cellPresetId,
      seriesCount,
      parallelCount,
      manualMinVoltage,
      manualMaxVoltage,
    )
    const board = addBoard({
      name: name.trim(),
      description: description.trim() || undefined,
      bleId: bleId.trim() || undefined,
      batteryConfig,
    })
    setActiveBoard(board.id)
    router.dismissAll()
  }

  return {
    step,
    stepId: WIZARD_STEPS[step],
    bleId,
    bleName,
    name,
    description,
    batteryMode,
    cellPresetId,
    seriesCount,
    parallelCount,
    manualMinVoltage,
    manualMaxVoltage,
    batteryWarning,
    batterySummary,
    canSave,
    setStep,
    next,
    back,
    selectDevice,
    clearDevice,
    setName,
    setDescription,
    setBatteryMode,
    setCellPresetId,
    setSeriesCount,
    setParallelCount,
    setManualMinVoltage,
    setManualMaxVoltage,
    save,
  }
}
