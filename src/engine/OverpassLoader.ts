import { useGameStore } from '@/stores/game'
import type { Shelter } from '@/stores/game'

export function loadOSMData() {
  const store = useGameStore()
  const shelters: Shelter[] = []
  const { epicenterLatitude, epicenterLongitude } = store

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

  store.shelters = shelters
}
