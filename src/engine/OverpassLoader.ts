import { useGameStore } from '@/stores/game'
import type { Scenario } from '@/scenarios/types'

type Step = { delay: number; message?: string; finalize?: boolean }

const STEPS: Step[] = [
  { delay: 0, message: 'Загрузка данных карты...' },
  { delay: 500, message: 'Поиск убежищ...' },
  { delay: 1000, message: 'Поиск транспорта...' },
  { delay: 1500, message: 'Загрузка графики...' },
  { delay: 2000, finalize: true },
]

function preloadSprite(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = url
  })
}

function preloadVideo(url: string): void {
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'video'
  link.href = url
  document.head.appendChild(link)
}

async function preloadSprites(): Promise<void> {
  const baseUrl = import.meta.env.BASE_URL
  preloadVideo(`${baseUrl}explosion.mp4`)
  await Promise.all([
    preloadSprite(`${baseUrl}sprites.png`),
    preloadSprite(`${baseUrl}sprites/player-idle.png`),
    preloadSprite(`${baseUrl}sprites/player-walking.png`),
    preloadSprite(`${baseUrl}sprites/player-hacking.png`),
    preloadSprite(`${baseUrl}sprites/player_swimming.png`),
    preloadSprite(`${baseUrl}sprites/dead.png`),
    preloadSprite(`${baseUrl}sprites/car-red.png`),
    preloadSprite(`${baseUrl}sprites/car-blue.png`),
    preloadSprite(`${baseUrl}sprites/car-green.png`),
  ])
}

export async function loadScenarioData(scenario: Scenario): Promise<void> {
  const store = useGameStore()

  store.loadingMessage = STEPS[0].message!

  await new Promise<void>((resolve) => {
    for (const step of STEPS) {
      setTimeout(() => {
        if (!step.finalize) {
          store.loadingMessage = step.message!
          return
        }
        scenario.init()
        const explosionEntry = scenario.timeline.find(e => e.type === 'explosion')
        store.timerMinutes = explosionEntry ? Math.round(explosionEntry.timeSec / 60) : 7
        store.explosionRadius = scenario.explosionRadius
        store.fuelConsumption = scenario.fuelConsumption
        store.hackSec = scenario.hackSec

        const epicenter = scenario.computeEpicenter({
          playerLatitude: store.playerLatitude,
          playerLongitude: store.playerLongitude,
        })
        store.epicenterLatitude = epicenter.latitude
        store.epicenterLongitude = epicenter.longitude

        store.cars = []

        resolve()
      }, step.delay)
    }
  })

  store.loadingMessage = 'Загрузка графики...'
  await preloadSprites()
}
