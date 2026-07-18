export function formatRideTime(startMs: number, endMs: number): string {
  const start = new Date(startMs)
  const end = new Date(endMs)
  const h = (d: Date) => d.getHours().toString().padStart(2, '0')
  const m = (d: Date) => d.getMinutes().toString().padStart(2, '0')
  return `${h(start)}:${m(start)} – ${h(end)}:${m(end)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatRideDate(startMs: number, endMs: number): string {
  const s = new Date(startMs)
  const e = new Date(endMs)
  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate()
  if (sameDay) {
    return `${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`
  }
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`
  }
  return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`
}

export function formatRideMeta(startAtMs: number, endAtMs: number, deviceName: string): string {
  return deviceName
    ? `${formatRideDate(startAtMs, endAtMs)} · ${deviceName}`
    : formatRideDate(startAtMs, endAtMs)
}
