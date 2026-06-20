import { useGameStore } from '@/stores/game'
import { CarPhysics } from './CarPhysics'
import { MapEngine } from './MapEngine'

const MOVE_SPEED_WALK = 0.00005

export class PlayerController {
  private keys: Set<string> = new Set()
  private mapEngine: MapEngine
  private carPhysics: CarPhysics
  private animationId: number | null = null
  private playerLng: number
  private playerLat: number
  private playerAngle: number = 0

  constructor(mapEngine: MapEngine) {
    const store = useGameStore()
    this.mapEngine = mapEngine
    this.carPhysics = new CarPhysics()
    this.playerLng = store.playerLongitude
    this.playerLat = store.playerLatitude
  }

  start() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.gameLoop()
  }

  stop() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.key.toLowerCase())
    if (e.key.toLowerCase() === 'e') {
      this.interact()
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase())
  }

  private interact() {
    const store = useGameStore()

    const shelter = this.findNearbyShelter()
    if (shelter) {
      store.isInShelter = true
      store.phase = 'victory'
      return
    }

    store.isInCar = !store.isInCar
  }

  private findNearbyShelter() {
    const store = useGameStore()
    const threshold = 0.0005

    for (const shelter of store.shelters) {
      const dlat = Math.abs(shelter.latitude - this.playerLat)
      const dlng = Math.abs(shelter.longitude - this.playerLng)
      if (dlat < threshold && dlng < threshold) {
        return shelter
      }
    }
    return null
  }

  private gameLoop = () => {
    this.update()
    this.animationId = requestAnimationFrame(this.gameLoop)
  }

  private update() {
    const store = useGameStore()
    let dx = 0
    let dy = 0

    if (this.keys.has('w')) dy -= 1
    if (this.keys.has('s')) dy += 1
    if (this.keys.has('a')) dx -= 1
    if (this.keys.has('d')) dx += 1

    if (dx !== 0 || dy !== 0) {
      this.playerAngle = Math.atan2(dx, -dy)
    }

    if (store.isInCar) {
      this.updateCar(dx, dy)
    } else {
      this.updateWalk(dx, dy)
    }

    this.mapEngine.updatePlayerPosition(this.playerLng, this.playerLat)
  }

  private updateWalk(dx: number, dy: number) {
    if (dx === 0 && dy === 0) return
    const len = Math.sqrt(dx * dx + dy * dy)
    this.playerLng += (dx / len) * MOVE_SPEED_WALK
    this.playerLat += (dy / len) * MOVE_SPEED_WALK
  }

  private updateCar(dx: number, dy: number) {
    const result = this.carPhysics.update(dx, dy, this.playerLng, this.playerLat, this.playerAngle)
    this.playerLng = result.lng
    this.playerLat = result.lat
    this.playerAngle = result.angle
  }

  getPosition(): { lng: number; lat: number } {
    return { lng: this.playerLng, lat: this.playerLat }
  }

  getAngle(): number {
    return this.playerAngle
  }
}
