import { useGameStore } from '@/stores/game'
import type { Shelter, Car } from '@/stores/game'

export function loadOSMData(): Promise<void> {
  return new Promise((resolve) => {
    const store = useGameStore()

    store.loadingMessage = 'Загрузка данных карты...'

    setTimeout(() => {
      store.loadingMessage = 'Поиск убежищ...'
    }, 500)

    setTimeout(() => {
      store.loadingMessage = 'Поиск транспорта...'
    }, 1000)

    setTimeout(() => {
      const shelters: Shelter[] = []
      const cars: Car[] = []
      const { epicenterLatitude, epicenterLongitude, playerLatitude, playerLongitude } = store

      for (let i = 0; i < 20; i++) {
        const angle = Math.random() * 2 * Math.PI
        const dist = 5000 + Math.random() * 5000
        const dlat = (dist / 111320) * Math.cos(angle)
        const dlng = (dist / (111320 * Math.cos(epicenterLatitude * Math.PI / 180))) * Math.sin(angle)
        shelters.push({
          id: `shelter-${i}`,
          longitude: epicenterLongitude + dlng,
          latitude: epicenterLatitude + dlat,
        })
      }

      for (let i = 0; i < 12; i++) {
        const placeAngle = Math.random() * 2 * Math.PI
        const dist = 100 + Math.random() * 600
        const dlat = (dist / 111320) * Math.cos(placeAngle)
        const dlng = (dist / (111320 * Math.cos(playerLatitude * Math.PI / 180))) * Math.sin(placeAngle)
        cars.push({
          id: `car-${i}`,
          longitude: playerLongitude + dlng,
          latitude: playerLatitude + dlat,
          angle: Math.random() * 2 * Math.PI,
        })
      }

      store.shelters = shelters
      store.cars = cars
      resolve()
    }, 1500)
  })
}
