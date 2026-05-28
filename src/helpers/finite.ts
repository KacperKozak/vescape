export function finite(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : value
}

export function absolute(value: number | null | undefined): number | null {
  const v = finite(value)
  return v == null ? null : Math.abs(v)
}
