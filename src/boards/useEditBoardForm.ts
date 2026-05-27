import { useCallback, useEffect, useRef, useState } from 'react'
import type { BatteryConfig } from 'vesc-ble'

import {
  type BatteryMode,
  buildBatteryConfig,
  getBatterySummary,
  parseVoltage,
} from '@/boards/boardSetup'
import { DEFAULT_BATTERY_CONFIG, deriveBatteryConfig } from '@/helpers/battery'
import type { Board } from '@/store/boardStore'

type SaveKind = 'info' | 'battery' | 'pairing'

export interface BoardInfoDraft {
  name: string
  description: string
}

export interface BoardBatteryDraft {
  batteryMode: BatteryMode
  cellPresetId: string
  seriesCount: number
  parallelCount: number
  manualMinVoltage: string
  manualMaxVoltage: string
}

export function useEditBoardForm({
  board,
  routeBleId,
  routeBleName,
  updateBoard,
}: {
  board: Board | undefined
  routeBleId?: string
  routeBleName?: string
  updateBoard: (board: Board) => Promise<void>
}) {
  const boardRef = useRef<Board | undefined>(board)
  const syncedBoardIdRef = useRef<string | null>(null)
  const [name, setName] = useState(board?.name ?? '')
  const [description, setDescription] = useState(board?.description ?? '')
  const [pairedBleId, setPairedBleId] = useState(board?.bleId ?? routeBleId ?? '')
  const [pairedBleName, setPairedBleName] = useState(routeBleName ?? '')
  const [battery, setBattery] = useState(() => batteryDraftFromConfig(board?.batteryConfig))
  const [batteryTouched, setBatteryTouched] = useState(false)
  const [saving, setSaving] = useState<SaveKind | null>(null)

  useEffect(() => {
    boardRef.current = board
    if (!board || syncedBoardIdRef.current === board.id) return

    setName(board.name)
    setDescription(board.description ?? '')
    setPairedBleId(board.bleId ?? routeBleId ?? '')
    setPairedBleName(routeBleName ?? '')
    setBattery(batteryDraftFromConfig(board.batteryConfig))
    setBatteryTouched(false)
    syncedBoardIdRef.current = board.id
  }, [board, routeBleId, routeBleName])

  const saveBoard = useCallback(
    async (
      patch: Partial<Pick<Board, 'name' | 'description' | 'batteryConfig' | 'bleId'>>,
      kind: SaveKind,
    ) => {
      const current = boardRef.current
      if (!current) return
      const next = { ...current, ...patch }
      boardRef.current = next
      setSaving(kind)
      try {
        await updateBoard(next)
      } finally {
        setSaving(null)
      }
    },
    [updateBoard],
  )

  useEffect(() => {
    if (!routeBleId || !boardRef.current) return
    if (boardRef.current.bleId === routeBleId) return
    setPairedBleId(routeBleId)
    setPairedBleName(routeBleName ?? '')
    void saveBoard({ bleId: routeBleId }, 'pairing')
  }, [routeBleId, routeBleName, saveBoard])

  const previewConfig: BatteryConfig =
    battery.batteryMode === 'preset'
      ? {
          mode: 'preset',
          cellPresetId: battery.cellPresetId,
          seriesCount: battery.seriesCount,
          parallelCount: battery.parallelCount,
        }
      : {
          mode: 'manual',
          minVoltage: parseVoltage(battery.manualMinVoltage) ?? 0,
          maxVoltage: parseVoltage(battery.manualMaxVoltage) ?? 0,
        }
  const derivedBattery = deriveBatteryConfig(previewConfig)
  const keepMissingBatteryConfig = Boolean(board && board.batteryConfig == null && !batteryTouched)
  const batterySummary = getBatterySummary(
    keepMissingBatteryConfig,
    derivedBattery,
    battery.batteryMode,
    battery.cellPresetId,
    battery.seriesCount,
    battery.parallelCount,
  )

  const saveInfo = useCallback(
    async (value: BoardInfoDraft) => {
      setName(value.name)
      setDescription(value.description)
      await saveBoard(
        {
          name: value.name.trim(),
          description: value.description.trim() || null,
        },
        'info',
      )
    },
    [saveBoard],
  )

  const saveBattery = useCallback(
    async (value: BoardBatteryDraft) => {
      const batteryConfig = buildBatteryConfig(
        value.batteryMode,
        value.cellPresetId,
        value.seriesCount,
        value.parallelCount,
        value.manualMinVoltage,
        value.manualMaxVoltage,
      )
      if (!batteryConfig) return false

      setBattery(value)
      setBatteryTouched(true)
      await saveBoard({ batteryConfig }, 'battery')
      return true
    },
    [saveBoard],
  )

  const clearPairing = useCallback(async () => {
    setPairedBleId('')
    setPairedBleName('')
    await saveBoard({ bleId: null }, 'pairing')
  }, [saveBoard])

  return {
    name,
    description,
    pairedBleId,
    pairedBleName,
    battery,
    batterySummary,
    keepMissingBatteryConfig,
    saving,
    saveInfo,
    saveBattery,
    clearPairing,
  }
}

function batteryDraftFromConfig(config: BatteryConfig | null | undefined): BoardBatteryDraft {
  const batteryConfig = config ?? DEFAULT_BATTERY_CONFIG
  const preset = batteryConfig.mode === 'preset' ? batteryConfig : DEFAULT_BATTERY_CONFIG
  const manual =
    batteryConfig.mode === 'manual'
      ? batteryConfig
      : { mode: 'manual' as const, minVoltage: 60, maxVoltage: 84 }

  return {
    batteryMode: batteryConfig.mode,
    cellPresetId: preset.cellPresetId,
    seriesCount: preset.seriesCount,
    parallelCount: preset.parallelCount,
    manualMinVoltage: String(manual.minVoltage),
    manualMaxVoltage: String(manual.maxVoltage),
  }
}
