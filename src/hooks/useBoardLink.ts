import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addBoardProbeProgressListener,
  probeBoardLink,
  type BoardCandidate,
  type BoardLink,
  type BoardProbeProgressEvent,
} from 'vesc-ble'

import { pickDefaultCandidate } from '@/lib/boardTransport'
import { useBleStore } from '@/store/bleStore'

/**
 * UI-facing phase of a linking run. "linking" covers the live connect/probe
 * sequence; "picking" exposes the confirmed transports; "failed" means no
 * transport returned telemetry. The underlying domain operation is a Board Probe
 * (see CONTEXT.md) — the UI just calls it "linking".
 */
export type BoardLinkPhase = 'linking' | 'picking' | 'failed'

export interface UseBoardLink {
  phase: BoardLinkPhase
  candidates: BoardCandidate[]
  selected: BoardCandidate | null
  progress: BoardProbeProgressEvent | null
  /** Draft Board Link for the current selection, or null while linking/failed. */
  selectedLink: BoardLink | null
  select: (candidate: BoardCandidate) => void
  retry: () => void
}

/**
 * Drives a Board Probe of one BLE peripheral: ends any live Board Session, runs
 * the native probe, and tracks live progress plus the confirmed candidates and
 * the rider's pick. Persistence (saving or clearing a Board Link) is the
 * caller's responsibility — this hook only resolves a draft link.
 */
export function useBoardLink(bleId: string | null): UseBoardLink {
  const [phase, setPhase] = useState<BoardLinkPhase>('linking')
  const [candidates, setCandidates] = useState<BoardCandidate[]>([])
  const [selected, setSelected] = useState<BoardCandidate | null>(null)
  const [progress, setProgress] = useState<BoardProbeProgressEvent | null>(null)
  const runRef = useRef(0)

  const runProbe = useCallback(() => {
    // A missing peripheral isn't probeable; callers handle the no-device case in
    // their UI, so there's nothing to run here.
    if (!bleId) return
    const run = ++runRef.current
    // End any live Board Session before probing so the probe owns the BLE link.
    void useBleStore
      .getState()
      .disconnect()
      .then(() => probeBoardLink(bleId))
      .then((result) => {
        if (run !== runRef.current) return
        if (result.candidates.length === 0) {
          setPhase('failed')
          return
        }
        setCandidates(result.candidates)
        setSelected(pickDefaultCandidate(result.candidates))
        setPhase('picking')
      })
      .catch(() => {
        if (run !== runRef.current) return
        setCandidates([])
        setSelected(null)
        setPhase('failed')
      })
  }, [bleId])

  useEffect(() => {
    const subscription = addBoardProbeProgressListener((event) => setProgress(event))
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    runProbe()
    return () => {
      runRef.current += 1
    }
  }, [runProbe])

  const select = useCallback((candidate: BoardCandidate) => setSelected(candidate), [])

  const retry = useCallback(() => {
    setPhase('linking')
    setCandidates([])
    setSelected(null)
    setProgress(null)
    runProbe()
  }, [runProbe])

  const selectedLink: BoardLink | null =
    bleId != null && selected != null
      ? { bleId, transport: selected.transport, hasBms: selected.hasBms }
      : null

  return { phase, candidates, selected, progress, selectedLink, select, retry }
}
