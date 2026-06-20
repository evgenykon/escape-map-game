import { defineStore } from 'pinia'
import { ref } from 'vue'

export type GamePhase = 'start' | 'loading' | 'playing' | 'gameover' | 'victory'

export type Difficulty = 'easy' | 'normal' | 'hard'

export interface Shelter {
  id: string
  longitude: number
  latitude: number
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
  const smsMessages = ref<SMS[]>([])
  const timeLeft = ref(0)
  const isInCar = ref(false)
  const isInShelter = ref(false)

  const isWalking = ref(true)
  const loadingMessage = ref('Загрузка карты...')

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
    smsMessages,
    timeLeft,
    isInCar,
    isInShelter,
    isWalking,
    loadingMessage,
  }
})
