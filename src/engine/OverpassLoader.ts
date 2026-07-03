import { useGameStore } from '@/stores/game'
import type { Scenario } from '@/scenarios/types'

type Step = { delay: number; message?: string; finalize?: boolean }

const STEPS: Step[] = [
  { delay: 0, message: 'Загрузка данных карты...' },
  { delay: 500, message: 'Поиск убежищ...' },
  { delay: 1000, message: 'Поиск транспорта...' },
  { delay: 1500, finalize: true },
]

export function loadScenarioData(scenario: Scenario): Promise<void> {
  const store = useGameStore()

  store.loadingMessage = STEPS[0].message!

  return new Promise((resolve) => {
    for (const step of STEPS) {
      setTimeout(() => {
        if (!step.finalize) {
          store.loadingMessage = step.message!
          return
        }
        scenario.init()
        store.timerMinutes = scenario.timerMinutes
        store.explosionRadius = scenario.explosionRadius
        store.fuelConsumption = scenario.fuelConsumption
        store.hackSec = scenario.hackSec

        const epicenter = scenario.computeEpicenter({
          playerLatitude: store.playerLatitude,
          playerLongitude: store.playerLongitude,
        })
        store.epicenterLatitude = epicenter.latitude
        store.epicenterLongitude = epicenter.longitude

        const spawn = scenario.computeSpawn(
          {
            playerLatitude: store.playerLatitude,
            playerLongitude: store.playerLongitude,
          },
          epicenter,
        )
        store.shelters = spawn.shelters
        store.cars = spawn.cars

        resolve()
      }, step.delay)
    }
  })
}
