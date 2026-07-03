import type { Shelter, Car } from '@/stores/game'

export interface ScenarioConfig {
  id: string
  title: string
  description: string
  icon?: string
}

export interface SpawnContext {
  playerLatitude: number
  playerLongitude: number
}

export interface EpicenterSpec {
  latitude: number
  longitude: number
}

export interface ShelterSpawn {
  latitude: number
  longitude: number
}

export interface CarSpawn {
  latitude: number
  longitude: number
  angle: number
  fuel: number
}

export interface SpawnResult {
  shelters: Shelter[]
  cars: Car[]
}

export interface ResultTexts {
  victoryTitle: string
  victorySubtitle: string
  gameoverTitle: string
  gameoverSubtitle: string
}

export interface Scenario {
  config: ScenarioConfig
  timerMinutes: number
  explosionRadius: number
  fuelConsumption: number
  hackSec: number
  init(): void
  computeEpicenter(ctx: SpawnContext): EpicenterSpec
  computeSpawn(ctx: SpawnContext, epicenter: EpicenterSpec): SpawnResult
  smsTexts: string[]
  resultTexts: ResultTexts
}
