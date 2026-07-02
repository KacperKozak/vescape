interface PreviewRouteSample {
  latitude: number | null
  longitude: number | null
}

export function getHistoryPreviewRoute(samples: PreviewRouteSample[]): [number, number][] {
  return samples.flatMap((sample) =>
    sample.latitude != null &&
    sample.longitude != null &&
    Number.isFinite(sample.latitude) &&
    Number.isFinite(sample.longitude)
      ? [[sample.longitude, sample.latitude]]
      : [],
  )
}
