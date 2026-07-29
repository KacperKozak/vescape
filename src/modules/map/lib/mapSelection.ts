import type { MapPoint } from 'vescape-core'

export type MapSelection =
  | {
      type: 'coordinate'
      id: string
      latitude: number
      longitude: number
      title: string
      subtitle: string | null
      loadingDetails?: boolean
    }
  | {
      type: 'place'
      id: string
      latitude: number
      longitude: number
      title: string
      subtitle: string | null
      category: string | null
      loadingDetails?: boolean
    }
  | {
      type: 'mapPoint'
      id: string
      latitude: number
      longitude: number
      title: string
      subtitle: string | null
      point: MapPoint
      loadingDetails?: boolean
    }
