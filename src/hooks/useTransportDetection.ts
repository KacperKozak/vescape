import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { detectBoardTransport, type BoardTransport } from 'vesc-ble'

import { pickDefaultTransport } from '@/lib/boardTransport'
import { useBleStore } from '@/store/bleStore'
import { useBoardStore } from '@/store/boardStore'

type TransportDetectionPhase = 'detecting' | 'picking' | 'failed'

export interface TransportDetection {
  phase: TransportDetectionPhase
  candidates: BoardTransport[]
  selected: BoardTransport | null
  saving: boolean
  select: (transport: BoardTransport) => void
  confirm: () => Promise<boolean>
  retry: () => void
}

/**
 * Drives a Board Transport detection session for one Board: ends any live Board
 * Session, invokes the native detect intent, and tracks the confirmed candidates
 * plus the user's pick. `confirm` persists the chosen transport via the upsert path.
 */
export function useTransportDetection(boardId: string): TransportDetection {
  const { board, updateBoard } = useBoardStore(
    useShallow((s) => ({
      board: s.boards.find((b) => b.id === boardId),
      updateBoard: s.updateBoard,
    })),
  )

  const [phase, setPhase] = useState<TransportDetectionPhase>('detecting')
  const [candidates, setCandidates] = useState<BoardTransport[]>([])
  const [selected, setSelected] = useState<BoardTransport | null>(null)
  const [saving, setSaving] = useState(false)
  const runRef = useRef(0)

  const runDetection = useCallback(() => {
    const run = ++runRef.current
    // End any live Board Session before probing so the detect session owns the BLE link.
    void useBleStore
      .getState()
      .disconnect()
      .then(() => detectBoardTransport(boardId))
      .then((result) => {
        if (run !== runRef.current) return
        if (result.candidates.length === 0) {
          setPhase('failed')
          return
        }
        setCandidates(result.candidates)
        setSelected(pickDefaultTransport(result.candidates))
        setPhase('picking')
      })
      .catch(() => {
        if (run !== runRef.current) return
        setCandidates([])
        setSelected(null)
        setPhase('failed')
      })
  }, [boardId])

  useEffect(() => {
    // A fresh screen mounts per detection; the run guard handles overlapping retries.
    runDetection()
  }, [runDetection])

  const confirm = useCallback(async () => {
    if (!board || selected == null) return false
    setSaving(true)
    try {
      await updateBoard({ ...board, transport: selected })
      return true
    } finally {
      setSaving(false)
    }
  }, [board, selected, updateBoard])

  const retry = useCallback(() => {
    setPhase('detecting')
    setCandidates([])
    setSelected(null)
    void runDetection()
  }, [runDetection])

  return { phase, candidates, selected, saving, select: setSelected, confirm, retry }
}
