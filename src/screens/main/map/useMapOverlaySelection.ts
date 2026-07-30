import { useCallback, useEffect, useState } from 'react'

import type { SelectedHistoryMarker } from '@/modules/history/lib/historyMapMarkerInfo'
import type { LegalLimitCountry } from '@/modules/legal/lib/legalLimits'

export function useMapOverlaySelection(legalLimitsActive: boolean) {
  const [selectedHistoryMarker, setSelectedHistoryMarker] = useState<SelectedHistoryMarker | null>(
    null,
  )
  const [selectedLegalCountry, setSelectedLegalCountry] = useState<LegalLimitCountry | null>(null)

  useEffect(() => {
    if (legalLimitsActive) return
    const frame = requestAnimationFrame(() => setSelectedLegalCountry(null))
    return () => cancelAnimationFrame(frame)
  }, [legalLimitsActive])

  const handleSelectLegalCountry = useCallback(
    (country: LegalLimitCountry) => {
      if (legalLimitsActive) setSelectedLegalCountry(country)
    },
    [legalLimitsActive],
  )
  const dismissHistoryMarker = useCallback(() => setSelectedHistoryMarker(null), [])
  const closeLegalCountry = useCallback(() => setSelectedLegalCountry(null), [])

  return {
    selectedHistoryMarker,
    selectedLegalCountry,
    setSelectedHistoryMarker,
    handleSelectLegalCountry,
    dismissHistoryMarker,
    closeLegalCountry,
  }
}
