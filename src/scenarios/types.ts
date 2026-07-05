import type { Car } from '@/stores/game'

export interface ScenarioConfig {
  id: string
  title: string
  description: string
  icon?: string
}

export interface EpicenterSpec {
  latitude: number
  longitude: number
}

export interface ResultTexts {
  victoryTitle: string
  victorySubtitle: string
  gameoverTitle: string
  gameoverSubtitle: string
  collapseTitle?: string
  collapseSubtitle?: string
}

export type TimelineEvent =
  | { timeSec: number; type: 'sms'; text: string }
  | { timeSec: number; type: 'thought'; texts: string[] }
  | { timeSec: number; type: 'shelter'; minM: number; maxM: number }
  | { timeSec: number; type: 'explosion' }
  | { timeSec: number; type: 'traffic' }

export interface Scenario {
  config: ScenarioConfig
  explosionRadius: number
  fuelConsumption: number
  hackSec: number
  init(): void
  computeEpicenter(ctx: { playerLatitude: number; playerLongitude: number }): EpicenterSpec
  timeline: TimelineEvent[]
  resultTexts: ResultTexts
}
