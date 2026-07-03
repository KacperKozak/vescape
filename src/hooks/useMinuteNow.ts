import { useEffect, useState } from 'react'

/** Current time, refreshed once a minute while enabled — paces relative-age labels. */
export function useMinuteNow(enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [enabled])
  return now
}
