import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { Scenario } from '@/scenarios/types'

export type GamePhase = 'start' | 'loading' | 'playing' | 'gameover' | 'victory'

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
  const loadingMessage = ref('Загрузка карты...')
  const playerDistFromEpicenter = ref(0)
  const shelterHudVisible = ref(false)

  const cacheBustTag = 'bust-2026-07-02-19-45'

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
    cacheBustTag,
  }
})
