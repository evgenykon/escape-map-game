import { useGameStore } from '@/stores/game'
import { CarPhysics } from './CarPhysics'
import { MapEngine } from './MapEngine'

const MOVE_SPEED_WALK = 0.000005
const ROTATION_SPEED = 0.04

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
    const code = e.code
    const key = code.replace('Key', '').toLowerCase()
    if (['w', 'a', 's', 'd', 'e'].includes(key)) {
      e.preventDefault()
      this.keys.add(key)
      if (key === 'e') {
        this.interact()
      }
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    const key = e.code.replace('Key', '').toLowerCase()
    this.keys.delete(key)
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
    try {
      this.update()
    } catch (e) {
      console.error('gameLoop error', e)
    }
    this.animationId = requestAnimationFrame(this.gameLoop)
  }

  private update() {
    const store = useGameStore()
    let forward = 0
    let rotation = 0

    if (this.keys.has('w')) forward += 1
    if (this.keys.has('s')) forward -= 1
    if (this.keys.has('a')) rotation -= 1
    if (this.keys.has('d')) rotation += 1

    if (store.isInCar) {
      this.updateCar(forward, rotation)
    } else {
      this.updateWalk(forward, rotation)
    }

    this.mapEngine.updatePlayerPosition(this.playerLng, this.playerLat, this.playerAngle)
  }

  private updateWalk(forward: number, rotation: number) {
    this.playerAngle += rotation * ROTATION_SPEED

    if (forward !== 0) {
      const dlng = Math.sin(this.playerAngle) * forward * MOVE_SPEED_WALK
      const dlat = Math.cos(this.playerAngle) * forward * MOVE_SPEED_WALK
      const newLng = this.playerLng + dlng
      const newLat = this.playerLat + dlat
      if (!this.mapEngine.isInsideBuilding(newLng, newLat)) {
        this.playerLng = newLng
        this.playerLat = newLat
      }
    }
  }

  private updateCar(forward: number, rotation: number) {
    const result = this.carPhysics.update(forward, rotation, this.playerLng, this.playerLat, this.playerAngle)
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
