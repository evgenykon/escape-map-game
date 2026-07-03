import { distance, destination } from '@turf/turf'
import { useGameStore } from '@/stores/game'
import type { Car } from '@/stores/game'
import { CarPhysics } from './CarPhysics'
import { MapEngine } from './MapEngine'
import { soundEngine } from './SoundEngine'

const MOVE_SPEED_WALK = 2
const ROTATION_SPEED = 2.4
const CAR_COLLISION_DIST = 1.5
const SWIM_SPEED = 0.3

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
  private hackedCarIds: Set<string> = new Set()
  private spawnTimer: number = 0
  private nextCarId: number = 12
  private highlightedCar: string | null = null
  private highlightedShelter: string | null = null
  private lastWalkState = 0
  private isMapMode = false
  private wasFuelEmpty = false
  private lastCrashAt = 0
  private lastFrameState: 'idle' | 'walking' | 'running' | 'hacking' | null = null

  constructor(mapEngine: MapEngine) {
    const store = useGameStore()
    this.mapEngine = mapEngine
    this.carPhysics = new CarPhysics()
    this.carPhysics.setConsumption(store.fuelConsumption / 100 * 0.005)
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
    soundEngine.resume()
    const code = e.code
    const key = code === 'ShiftLeft' || code === 'ShiftRight' ? 'shift' : code.replace('Key', '').toLowerCase()
    if (key === 'm') {
      this.isMapMode = !this.isMapMode
      this.mapEngine.setMapZoom(this.isMapMode ? 10 : 20)
      this.mapEngine.setCarMarkersVisible(!this.isMapMode)
      return
    }
    if (['w', 'a', 's', 'd', 'e', 'shift'].includes(key)) {
      e.preventDefault()
      this.keys.add(key)
      if (key === 'e') {
        this.interact()
      }
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    const key = e.code === 'ShiftLeft' || e.code === 'ShiftRight' ? 'shift' : e.code.replace('Key', '').toLowerCase()
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
      if (this.hackedCarIds.has(found.id)) {
        this.enterCarDirectly(found)
      } else {
        this.startHack(found)
      }
      return
    }

    const shelter = this.findNearbyShelter()
    if (shelter) {
      store.isInShelter = true
      store.phase = 'victory'
    }
  }

  private enterCarDirectly(car: Car) {
    const store = useGameStore()
    store.isInCar = true
    store.activeCarId = car.id
    this.activeCarId = car.id
    this.wasFuelEmpty = false
    this.mapEngine.setPlayerMarkerShape(true)
    this.mapEngine.setPlayerMarkerShadow('#48f')
    this.mapEngine.hideCarMarker(car.id)
    this.playerLng = car.longitude
    this.playerLat = car.latitude
    this.playerAngle = car.angle ?? 0
    soundEngine.playOpeningCarDoor()
    soundEngine.playEngineStart()
    soundEngine.startCarDrivenLoop()
  }

  private startHack(car: Car) {
    const store = useGameStore()
    store.isHacking = true
    store.hackProgress = 0
    store.hackingCarId = car.id
    this.hackDuration = store.hackSec * (0.9 + Math.random() * 0.2) * 1000
    soundEngine.startHackingLoop()
  }

  private cancelHack() {
    const store = useGameStore()
    store.isHacking = false
    store.hackProgress = 0
    store.hackingCarId = null
    soundEngine.stopHackingLoop()
  }

  private finishHack() {
    const store = useGameStore()
    const carId = store.hackingCarId
    if (!carId) return
    const car = store.cars.find(c => c.id === carId)
    if (!car) return

    this.hackedCarIds.add(carId)
    store.isHacking = false
    store.hackProgress = 0
    store.hackingCarId = null
    store.isInCar = true
    store.activeCarId = carId
    this.activeCarId = carId
    this.wasFuelEmpty = false
    this.mapEngine.setPlayerMarkerShape(true)
    this.mapEngine.setPlayerMarkerShadow('#48f')
    this.mapEngine.hideCarMarker(carId)
    this.playerLng = car.longitude
    this.playerLat = car.latitude
    this.playerAngle = car.angle ?? 0
    soundEngine.stopHackingLoop()
    soundEngine.playEngineStart()
    soundEngine.startCarDrivenLoop()
  }

  private exitCar() {
    const store = useGameStore()
    this.mapEngine.setPlayerMarkerShape(false)
    this.mapEngine.setPlayerMarkerShadow('#0f0')
    const exitPos = destination([this.playerLng, this.playerLat], 8, this.playerAngle * 180 / Math.PI, { units: 'meters' })
    this.playerLng = exitPos.geometry.coordinates[0]
    this.playerLat = exitPos.geometry.coordinates[1]
    if (this.activeCarId) {
      const carPos = destination([this.playerLng, this.playerLat], -8, this.playerAngle * 180 / Math.PI, { units: 'meters' })
      const carLng = carPos.geometry.coordinates[0]
      const carLat = carPos.geometry.coordinates[1]
      const car = store.cars.find(c => c.id === this.activeCarId)
      if (car) {
        car.longitude = carLng
        car.latitude = carLat
        car.angle = this.playerAngle
        this.mapEngine.setCarMarkerAngle(this.activeCarId, this.playerAngle)
      }
      this.mapEngine.showCarMarker(this.activeCarId, carLng, carLat)
      store.activeCarId = null
      this.activeCarId = null
    }
    store.isInCar = false
    soundEngine.stopCarDrivenLoop()
    soundEngine.playOpeningCarDoor()
  }

  private findNearbyCar(): Car | null {
    const store = useGameStore()
    // distance in meters to find a car for hack/enter (smaller = must be closer)
    const threshold = 2
    let closest: Car | null = null
    let minDist = threshold

    for (const car of store.cars) {
      const dist = distance([this.playerLng, this.playerLat], [car.longitude, car.latitude], { units: 'meters' })
      if (dist < minDist) {
        minDist = dist
        closest = car
      }
    }
    return closest
  }

  private findNearbyShelter() {
    const store = useGameStore()
    const threshold = 50

    for (const shelter of store.shelters) {
      const dist = distance([this.playerLng, this.playerLat], [shelter.longitude, shelter.latitude], { units: 'meters' })
      if (dist < threshold) {
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

    if (this.isMapMode) return

    const newFrameState: 'idle' | 'walking' | 'running' | 'hacking' | null = store.isHacking
      ? 'hacking'
      : store.isInCar
        ? null
        : this.lastWalkState === 2
          ? 'running'
          : this.lastWalkState === 1
            ? 'walking'
            : 'idle'
    if (newFrameState && newFrameState !== this.lastFrameState) {
      this.lastFrameState = newFrameState
      this.mapEngine.setPlayerFrame(newFrameState)
    }

    if (store.isHacking) {
      const hackZoom = 21
      this.mapEngine.updatePlayerPosition(this.playerLng, this.playerLat, this.playerAngle, hackZoom)
      return
    }

    if (store.isInCar) {
      this.updateCar(forward, rotation, dt)
      const speedKmh = Math.abs(this.getCarSpeed()) * 3.6
      const t = Math.min(1, Math.max(0, (speedKmh - 30) / 30))
      const zoom = 19 - t * 1
      soundEngine.setCarDrivenVolume(Math.min(1, speedKmh / 100))
      this.mapEngine.updatePlayerPosition(this.playerLng, this.playerLat, this.playerAngle, zoom)
    } else {
      this.updateWalk(forward, rotation, dt)
      const isRunning = this.keys.has('shift')
      const walkZoom = forward !== 0 ? (isRunning ? 18.5 : 19) : 19
      this.mapEngine.updatePlayerPosition(this.playerLng, this.playerLat, this.playerAngle, walkZoom)

      if (store.isSwimming) {
        soundEngine.startSwimmingLoop()
        soundEngine.stopFootstepsLoop()
      } else if (this.lastWalkState === 2) {
        soundEngine.startFootstepsRunLoop()
      } else if (this.lastWalkState === 1) {
        soundEngine.startFootstepsWalkLoop()
      } else {
        soundEngine.stopFootstepsLoop()
        soundEngine.stopSwimmingLoop()
      }
    }
  }

  private carSpawnCheck(dt: number) {
    this.spawnTimer += dt
    if (this.spawnTimer < 1.5) return
    this.spawnTimer = 0

    const store = useGameStore()
    const bounds = this.mapEngine.getBounds()
    if (!bounds) return

    let totalInView = 0
    for (const car of store.cars) {
      if (car.longitude >= bounds.w && car.longitude <= bounds.e &&
          car.latitude >= bounds.s && car.latitude <= bounds.n) {
        totalInView++
      }
    }
    if (totalInView >= 2) return

    const needed = 2 - totalInView
    for (let i = 0; i < needed; i++) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const lng = bounds.w + Math.random() * (bounds.e - bounds.w)
        const lat = bounds.s + Math.random() * (bounds.n - bounds.s)

        if (this.mapEngine.isInsideBuilding(lng, lat)) continue
        if (!this.mapEngine.isOnRoad(lng, lat)) continue

        let tooClose = false
        for (const car of store.cars) {
          const cd = distance([lng, lat], [car.longitude, car.latitude], { units: 'meters' })
          if (cd < 30) {
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

    const hackTarget = store.cars.find(c => c.id === store.hackingCarId)
    if (hackTarget) {
      const hackDist = distance([this.playerLng, this.playerLat], [hackTarget.longitude, hackTarget.latitude], { units: 'meters' })
      if (hackDist > 50) {
        this.cancelHack()
      }
    }
  }

  private updateProximityFeedback() {
    const store = useGameStore()
    const carThreshold = 2
    const shelterThreshold = 50

    let closestCar: string | null = null
    let minCarDist = carThreshold

    for (const car of store.cars) {
      const dist = distance([this.playerLng, this.playerLat], [car.longitude, car.latitude], { units: 'meters' })
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
      const dist = distance([this.playerLng, this.playerLat], [shelter.longitude, shelter.latitude], { units: 'meters' })
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

  private sinkPlayerCar() {
    const store = useGameStore()
    if (this.activeCarId) {
      this.mapEngine.removeCarMarker(this.activeCarId)
      this.mapEngine.setPlayerMarkerShape(false)
      this.mapEngine.setPlayerMarkerShadow('#0f0')
      const idx = store.cars.findIndex(c => c.id === this.activeCarId)
      if (idx !== -1) store.cars.splice(idx, 1)
      store.activeCarId = null
      this.activeCarId = null
    }
    store.isInCar = false
    store.isSwimming = true
    soundEngine.stopCarDrivenLoop()
    soundEngine.playEngineBreakdown()
  }

  private removeTrafficCar(id: string) {
    const store = useGameStore()
    this.mapEngine.removeCarMarker(id)
    const idx = store.cars.findIndex(c => c.id === id)
    if (idx !== -1) store.cars.splice(idx, 1)
  }

  private updateWalk(forward: number, rotation: number, dt: number) {
    this.playerAngle += rotation * ROTATION_SPEED * dt

    const isRunning = this.keys.has('shift')

    if (forward !== 0) {
      let bearing = this.playerAngle * 180 / Math.PI
      const inWater = this.mapEngine.isOnWater(this.playerLng, this.playerLat)
      const speed = inWater ? SWIM_SPEED : (isRunning ? 6 : MOVE_SPEED_WALK)
      let dist = Math.abs(forward) * speed * dt
      if (forward < 0) {
        bearing += 180
      }
      const moved = destination([this.playerLng, this.playerLat], dist, bearing, { units: 'meters' })
      const [newLng, newLat] = moved.geometry.coordinates
      if (!this.mapEngine.isInsideBuilding2d(newLng, newLat)) {
        this.playerLng = newLng
        this.playerLat = newLat
      }
    }

    if (forward !== 0) {
      this.lastWalkState = isRunning ? 2 : 1
    } else {
      this.lastWalkState = 0
    }

    const store = useGameStore()
    store.isSwimming = this.mapEngine.isOnWater(this.playerLng, this.playerLat)
  }

  private checkCarCollision(lng: number, lat: number, excludeId?: string): boolean {
    const store = useGameStore()
    const speed = Math.abs(this.carPhysics.getSpeed())
    const scale = MapEngine.getScale(this.mapEngine.getCurrentZoom())
    const threshold = Math.max(CAR_COLLISION_DIST, speed * 0.4) * scale
    for (const car of store.cars) {
      if (car.id === excludeId) continue
      const dist = distance([lng, lat], [car.longitude, car.latitude], { units: 'meters' })
      if (dist < threshold) return true
    }
    return false
  }

  private updateCar(forward: number, rotation: number, dt: number) {
    const store = useGameStore()
    const currentCar = this.activeCarId ? store.cars.find(c => c.id === this.activeCarId) : null
    const fuel = currentCar?.fuel ?? 1
    const result = this.carPhysics.update(forward, rotation, dt, fuel, this.playerLng, this.playerLat, this.playerAngle)
    const newLng = result.lng
    const newLat = result.lat

    if (this.mapEngine.isInsideBuilding(newLng, newLat)) {
      this.carPhysics.setSpeed(0)
    } else if (this.mapEngine.isOnWater(newLng, newLat)) {
      this.sinkPlayerCar()
    } else if (this.checkCarCollision(newLng, newLat, this.activeCarId!)) {
      this.carPhysics.setSpeed(0)
      this.playerLng -= (newLng - this.playerLng) * 0.8
      this.playerLat -= (newLat - this.playerLat) * 0.8
      const now = performance.now()
      if (now - this.lastCrashAt > 10000) {
        this.lastCrashAt = now
        soundEngine.playCarCrash()
      }
    } else {
      if (!this.mapEngine.isOnRoad(newLng, newLat) && !this.mapEngine.hasBuilding3d(newLng, newLat)) {
        this.carPhysics.applyOffRoadDrag(dt)
      }
      this.playerLng = newLng
      this.playerLat = newLat
    }
    this.playerAngle = result.angle

    if (currentCar) {
      const prevFuel = currentCar.fuel
      currentCar.longitude = this.playerLng
      currentCar.latitude = this.playerLat
      currentCar.fuel = result.fuel
      this.mapEngine.moveCarMarker(this.activeCarId!, this.playerLng, this.playerLat)
      if (prevFuel > 0 && result.fuel === 0 && !this.wasFuelEmpty) {
        this.wasFuelEmpty = true
        soundEngine.playEngineBreakdown()
        soundEngine.stopCarDrivenLoop()
      }
    }
  }

  getCarSpeed(): number {
    return this.carPhysics.getSpeed()
  }

  getCarGear(): string {
    return this.carPhysics.getGear()
  }

  getPosition(): { lng: number; lat: number } {
    return { lng: this.playerLng, lat: this.playerLat }
  }

  setPosition(lat: number, lng: number) {
    this.playerLat = lat
    this.playerLng = lng
  }

  getAngle(): number {
    return this.playerAngle
  }
}
