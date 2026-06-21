import { useGameStore } from '@/stores/game'
import type { Car } from '@/stores/game'
import { CarPhysics } from './CarPhysics'
import { MapEngine } from './MapEngine'

const MOVE_SPEED_WALK = 0.000005
const ROTATION_SPEED = 0.04

export class PlayerController {
  private keys: Set<string> = new Set()
  private mapEngine: MapEngine
  private carPhysics: CarPhysics
  private animationId: number | null = null
  private lastTime: number = 0
  private playerLng: number
  private playerLat: number
  private playerAngle: number = 0
  private activeCarId: string | null = null
  private hackDuration: number = 0
  private spawnTimer: number = 0
  private nextCarId: number = 12
  private highlightedCar: string | null = null
  private highlightedShelter: string | null = null

  constructor(mapEngine: MapEngine) {
    const store = useGameStore()
    this.mapEngine = mapEngine
    this.carPhysics = new CarPhysics()
    this.playerLng = store.playerLongitude
    this.playerLat = store.playerLatitude
  }

  start() {
    this.lastTime = performance.now()
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

    if (store.isInCar) {
      this.exitCar()
      return
    }

    if (store.isHacking) {
      this.cancelHack()
      return
    }

    const found = this.findNearbyCar()
    if (found) {
      this.startHack(found)
      return
    }

    const shelter = this.findNearbyShelter()
    if (shelter) {
      store.isInShelter = true
      store.phase = 'victory'
    }
  }

  private startHack(car: Car) {
    const store = useGameStore()
    store.isHacking = true
    store.hackProgress = 0
    store.hackingCarId = car.id
    this.hackDuration = store.customHackSec * (0.9 + Math.random() * 0.2) * 1000
  }

  private cancelHack() {
    const store = useGameStore()
    store.isHacking = false
    store.hackProgress = 0
    store.hackingCarId = null
  }

  private finishHack() {
    const store = useGameStore()
    const carId = store.hackingCarId
    if (!carId) return
    const car = store.cars.find(c => c.id === carId)
    if (!car) return

    store.isHacking = false
    store.hackProgress = 0
    store.hackingCarId = null
    store.isInCar = true
    store.activeCarId = carId
    this.activeCarId = carId
    this.mapEngine.setPlayerMarkerShape(true)
    this.mapEngine.setPlayerMarkerShadow('#48f')
    this.mapEngine.hideCarMarker(carId)
    this.playerLng = car.longitude
    this.playerLat = car.latitude
    this.playerAngle = car.angle ?? 0
  }

  private exitCar() {
    const store = useGameStore()
    this.mapEngine.setPlayerMarkerShape(false)
    this.mapEngine.setPlayerMarkerShadow('#0f0')
    const offset = 0.00008
    this.playerLng += Math.sin(this.playerAngle) * offset
    this.playerLat += Math.cos(this.playerAngle) * offset
    if (this.activeCarId) {
      this.mapEngine.showCarMarker(this.activeCarId, this.playerLng, this.playerLat)
      const car = store.cars.find(c => c.id === this.activeCarId)
      if (car) {
        car.longitude = this.playerLng
        car.latitude = this.playerLat
      }
      store.activeCarId = null
      this.activeCarId = null
    }
    store.isInCar = false
  }

  private findNearbyCar(): Car | null {
    const store = useGameStore()
    const threshold = 0.0003
    let closest: Car | null = null
    let minDist = threshold

    for (const car of store.cars) {
      const dlat = Math.abs(car.latitude - this.playerLat)
      const dlng = Math.abs(car.longitude - this.playerLng)
      const dist = Math.sqrt(dlat * dlat + dlng * dlng)
      if (dist < minDist) {
        minDist = dist
        closest = car
      }
    }
    return closest
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
    const now = performance.now()
    const dt = Math.min((now - this.lastTime) / 1000, 0.05)
    this.lastTime = now

    const store = useGameStore()
    let forward = 0
    let rotation = 0

    if (this.keys.has('w')) forward += 1
    if (this.keys.has('s')) forward -= 1
    if (this.keys.has('a')) rotation -= 1
    if (this.keys.has('d')) rotation += 1

    this.updateProximityFeedback()
    this.updateHack(dt)
    this.carSpawnCheck(dt)

    if (store.isInCar) {
      this.updateCar(forward, rotation, dt)
      this.mapEngine.updatePlayerPosition(this.playerLng, this.playerLat, this.playerAngle)
    } else {
      this.updateWalk(forward, rotation)
      this.mapEngine.updatePlayerPosition(this.playerLng, this.playerLat, this.playerAngle)
    }
  }

  private carSpawnCheck(dt: number) {
    this.spawnTimer += dt
    if (this.spawnTimer < 1.5) return
    this.spawnTimer = 0

    const store = useGameStore()
    const bounds = this.mapEngine.getBounds()
    if (!bounds) return

    let inView = 0
    for (const car of store.cars) {
      if (car.longitude >= bounds.w && car.longitude <= bounds.e &&
          car.latitude >= bounds.s && car.latitude <= bounds.n) {
        inView++
      }
    }
    if (inView >= 2) return

    const needed = 2 - inView
    for (let i = 0; i < needed; i++) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const lng = bounds.w + Math.random() * (bounds.e - bounds.w)
        const lat = bounds.s + Math.random() * (bounds.n - bounds.s)

        if (this.mapEngine.isInsideBuilding(lng, lat)) continue

        let tooClose = false
        for (const car of store.cars) {
          const dx = car.longitude - lng
          const dy = car.latitude - lat
          if (Math.sqrt(dx * dx + dy * dy) < 0.0003) {
            tooClose = true
            break
          }
        }
        if (tooClose) continue

        const id = `car-${this.nextCarId++}`
        const angle = Math.random() * 2 * Math.PI
        store.cars.push({ id, longitude: lng, latitude: lat, angle, fuel: 0.3 + Math.random() * 0.7 })
        this.mapEngine.addCarMarker(id, lng, lat, angle)
        break
      }
    }
  }

  private updateHack(dt: number) {
    const store = useGameStore()
    if (!store.isHacking) return

    store.hackProgress = Math.min(store.hackProgress + dt / (this.hackDuration / 1000), 1)

    if (store.hackProgress >= 1) {
      this.finishHack()
      return
    }

    const dx = Math.abs(this.playerLng - (store.cars.find(c => c.id === store.hackingCarId)?.longitude ?? this.playerLng))
    const dy = Math.abs(this.playerLat - (store.cars.find(c => c.id === store.hackingCarId)?.latitude ?? this.playerLat))
    if (Math.sqrt(dx * dx + dy * dy) > 0.0005) {
      this.cancelHack()
    }
  }

  private updateProximityFeedback() {
    const store = useGameStore()
    const carThreshold = 0.0003
    const shelterThreshold = 0.0005

    let closestCar: string | null = null
    let minCarDist = carThreshold

    for (const car of store.cars) {
      const dlat = Math.abs(car.latitude - this.playerLat)
      const dlng = Math.abs(car.longitude - this.playerLng)
      const dist = Math.sqrt(dlat * dlat + dlng * dlng)
      if (dist < minCarDist) {
        minCarDist = dist
        closestCar = car.id
      }
    }

    if (closestCar !== this.highlightedCar) {
      if (this.highlightedCar) this.mapEngine.unhighlightCar(this.highlightedCar)
      if (closestCar) this.mapEngine.highlightCar(closestCar)
      this.highlightedCar = closestCar
    }

    let closestShelter: string | null = null
    let minShelterDist = shelterThreshold

    for (const shelter of store.shelters) {
      const dlat = Math.abs(shelter.latitude - this.playerLat)
      const dlng = Math.abs(shelter.longitude - this.playerLng)
      const dist = Math.sqrt(dlat * dlat + dlng * dlng)
      if (dist < minShelterDist) {
        minShelterDist = dist
        closestShelter = shelter.id
      }
    }

    if (closestShelter !== this.highlightedShelter) {
      if (this.highlightedShelter) this.mapEngine.unhighlightShelter(this.highlightedShelter)
      if (closestShelter) this.mapEngine.highlightShelter(closestShelter)
      this.highlightedShelter = closestShelter
    }
  }

  private updateWalk(forward: number, rotation: number) {
    this.playerAngle += rotation * ROTATION_SPEED

    if (forward !== 0) {
      const lngScale = 1 / Math.cos(this.playerLat * Math.PI / 180)
      const dlng = Math.sin(this.playerAngle) * forward * MOVE_SPEED_WALK * lngScale
      const dlat = Math.cos(this.playerAngle) * forward * MOVE_SPEED_WALK
      const newLng = this.playerLng + dlng
      const newLat = this.playerLat + dlat
      if (!this.mapEngine.isInsideBuilding(newLng, newLat)) {
        this.playerLng = newLng
        this.playerLat = newLat
      }
    }
  }

  private updateCar(forward: number, rotation: number, dt: number) {
    const store = useGameStore()
    const currentCar = this.activeCarId ? store.cars.find(c => c.id === this.activeCarId) : null
    const fuel = currentCar?.fuel ?? 1
    const result = this.carPhysics.update(forward, rotation, dt, fuel, this.playerLng, this.playerLat, this.playerAngle)
    const newLng = result.lng
    const newLat = result.lat

    if (!this.mapEngine.isInsideBuilding(newLng, newLat)) {
      this.playerLng = newLng
      this.playerLat = newLat
    }
    this.playerAngle = result.angle

    if (currentCar) {
      currentCar.longitude = this.playerLng
      currentCar.latitude = this.playerLat
      currentCar.fuel = result.fuel
      this.mapEngine.moveCarMarker(this.activeCarId!, this.playerLng, this.playerLat)
    }
  }

  getPosition(): { lng: number; lat: number } {
    return { lng: this.playerLng, lat: this.playerLat }
  }

  getAngle(): number {
    return this.playerAngle
  }
}
