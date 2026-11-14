import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { Scenario } from '@/scenarios/types'

export type GamePhase = 'start' | 'loading' | 'playing' | 'explosion' | 'aftermath' | 'gameover' | 'victory'

export interface Shelter {
  id: string
  longitude: number
  latitude: number
}

export interface Car {
  id: string
  longitude: number
  latitude: number
  angle: number
  fuel: number
}

export interface SurvivalStats {
  health: number
  energy: number
  satiety: number
  water: number
}

export interface BaseResources {
  food: number
  water: number
  materials: number
  fuel: number
  medicine: number
  energy: number
}

export interface PlayerBase {
  latitude: number
  longitude: number
  rooms: number
  resources: BaseResources
  objects: string[]
}

export interface SMS {
  id: number
  text: string
  time: number
}

export const useGameStore = defineStore('game', () => {
  const phase = ref<GamePhase>('start')
  const selectedScenarioId = ref<string | null>(null)
  const scenario = shallowRef<Scenario | null>(null)

  const timerMinutes = ref(5)
  const explosionRadius = ref(1000)
  const fuelConsumption = ref(50)
  const hackSec = ref(15)

  const playerLatitude = ref(0)
  const playerLongitude = ref(0)
  const epicenterLatitude = ref(0)
  const epicenterLongitude = ref(0)

  const shelters = ref<Shelter[]>([])
  const cars = ref<Car[]>([])
  const smsMessages = ref<SMS[]>([])
  const timeLeft = ref(0)
  const isInCar = ref(false)
  const activeCarId = ref<string | null>(null)
  const isInShelter = ref(false)
  const isHacking = ref(false)
  const hackProgress = ref(0)
  const hackingCarId = ref<string | null>(null)

  const isSwimming = ref(false)
  const isWalking = ref(true)
  const surfaceType = ref<string>('default')
  const loadingMessage = ref('Загрузка карты...')
  const playerDistFromEpicenter = ref(0)
  const shelterHudVisible = ref(false)
  const isMuted = ref(false)
  const mapMode = ref(0)
  const fuelStationsDisabled = ref(false)

  // ---- пост-взрывной метагейм ----
  const isAftermath = ref(false)
  const stats = ref<SurvivalStats>({ health: 100, energy: 65, satiety: 75, water: 65 })
  const base = ref<PlayerBase | null>(null)
  const cleaning = ref<{ active: boolean; progress: number; rooms: number }>({ active: false, progress: 0, rooms: 0 })
  const deathReasonText = ref<string | null>(null)
  const devAftermath = ref(false)

  const cacheBustTag = 'bust-2026-07-06-12-00'

  return {
    phase,
    selectedScenarioId,
    scenario,
    timerMinutes,
    explosionRadius,
    fuelConsumption,
    hackSec,
    playerLatitude,
    playerLongitude,
    epicenterLatitude,
    epicenterLongitude,
    shelters,
    cars,
    smsMessages,
    timeLeft,
    isInCar,
    activeCarId,
    isInShelter,
    isHacking,
    hackProgress,
    hackingCarId,
    isWalking,
    isSwimming,
    loadingMessage,
    playerDistFromEpicenter,
    shelterHudVisible,
    isMuted,
    mapMode,
    surfaceType,
    fuelStationsDisabled,
    isAftermath,
    stats,
    base,
    cleaning,
    deathReasonText,
    devAftermath,
    cacheBustTag,
  }
})
