import { defineStore } from 'pinia'
import { ref } from 'vue'

export type GamePhase = 'start' | 'loading' | 'playing' | 'gameover' | 'victory'

export type Difficulty = 'easy' | 'normal' | 'hard' | 'custom'

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
  const difficulty = ref<Difficulty>('normal')
  const timerMinutes = ref(5)
  const explosionRadius = ref(1000)

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

  const isWalking = ref(true)
  const loadingMessage = ref('Загрузка карты...')
  const playerDistFromEpicenter = ref(0)
  const shelterHudVisible = ref(false)

  const customTimerMinutes = ref(7)
  const customShelterKm = ref(7)
  const customHackSec = ref(15)
  const customFuelAmount = ref(0.7)
  const customCarCount = ref(12)
  const customExplosionRadius = ref(1000)

  return {
    phase,
    difficulty,
    timerMinutes,
    explosionRadius,
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
    loadingMessage,
    playerDistFromEpicenter,
    shelterHudVisible,
    customTimerMinutes,
    customShelterKm,
    customHackSec,
    customFuelAmount,
    customCarCount,
    customExplosionRadius,
  }
})
