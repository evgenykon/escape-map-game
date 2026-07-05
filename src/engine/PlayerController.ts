import { distance, destination } from '@turf/turf'
import { useGameStore } from '@/stores/game'
import type { Car } from '@/stores/game'
import { CarPhysics } from './CarPhysics'
import { MapEngine } from './MapEngine'
import { soundEngine } from './SoundEngine'

const MOVE_SPEED_WALK = 2
const ROTATION_SPEED = 2.4
const CAR_COLLISION_DIST = 0.2
const SWIM_SPEED = 0.3
const DOOR_SLOW_SPEED = 0.1
const DOOR_SLOW_DURATION = 1
const DOOR_DEBOUNCE = 2

const HACK_THOUGHTS = [
  'Надеюсь, я тут один...',
  'Надеюсь, никто не заметит...',
  'Так, почти бы всё готово...',
  'Где-то я уже видел эту машину...',
  'Главное - чтобы бензин был...',
  'Ну давай, давай!',
]

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
  private ownCarClaimed = false
  private nextCarId: number = 12
  private highlightedCar: string | null = null
  private lastWalkState = 0
  private wasInsideBuilding = false
  private doorSlowTimer = 0
  private doorDebounceTimer = 0
  private mapMode: 0 | 1 | 2 = 0
  private wasFuelEmpty = false
  private lowFuelThoughtShown = false
  private lastCrashAt = 0
  private lastBuildingCrashAt = 0
  private lastFrameState: 'idle' | 'walking' | 'running' | 'hacking' | 'swimming' | null = null
  private wasBraking = false
  private trafficMode = false
  private refuelThoughtShown = false
  private wasInFuelZone = false
  private fuelStationScanTimer = 0

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
      const store = useGameStore()
      const prevMode = this.mapMode
      this.mapMode = ((this.mapMode + 1) % 3) as 0 | 1 | 2
      store.mapMode = this.mapMode
      if (this.mapMode === 0) {
        this.mapEngine.setMapZoom(20)
        this.mapEngine.setCarMarkersVisible(true)
        this.mapEngine.setMapModeCrosshair(false)
        if (store.activeCarId) this.mapEngine.hideCarMarker(store.activeCarId)
      } else if (this.mapMode === 1) {
        this.mapEngine.setMapZoom(14)
        this.mapEngine.setCarMarkersVisible(true)
        this.mapEngine.setMapModeCrosshair(true)
      } else {
        this.mapEngine.setMapZoom(10)
        this.mapEngine.setCarMarkersVisible(false)
        this.mapEngine.setMapModeCrosshair(true)
      }
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
      if (Math.abs(this.carPhysics.getSpeed()) > 0.5) {
        this.mapEngine.setThought('Слишком быстро!')
        return
      }
      this.exitCar()
      return
    }

    if (store.isHacking) {
      this.cancelHack()
      return
    }

    const found = this.findNearbyCar()
    if (found) {
      if (!this.ownCarClaimed) {
        this.ownCarClaimed = true
        this.hackedCarIds.add(found.id)
        this.enterCarDirectly(found)
      } else if (this.hackedCarIds.has(found.id)) {
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
    const sprite = this.mapEngine.getCarMarkerSprite(car.id)
    if (sprite) this.mapEngine.setPlayerCarSprite(sprite)
    this.mapEngine.setPlayerMarkerShape(true)
    this.mapEngine.setPlayerMarkerShadow('#48f')
    this.mapEngine.hideCarMarker(car.id)
    this.playerLng = car.longitude
    this.playerLat = car.latitude
    this.playerAngle = car.angle ?? 0
    soundEngine.playOpeningCarDoor()
    soundEngine.playEngineStart()
    soundEngine.startCarDrivenLoop()
    soundEngine.stopFootstepsLoop()
    this.mapEngine.setFuelZonesVisible(true)
  }

  private startHack(car: Car) {
    const store = useGameStore()
    store.isHacking = true
    store.hackProgress = 0
    store.hackingCarId = car.id
    this.hackDuration = store.hackSec * (0.9 + Math.random() * 0.2) * 1000
    soundEngine.startHackingLoop()
    this.mapEngine.setThought(HACK_THOUGHTS[Math.floor(Math.random() * HACK_THOUGHTS.length)])
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
    const sprite = this.mapEngine.getCarMarkerSprite(carId)
    if (sprite) this.mapEngine.setPlayerCarSprite(sprite)
    this.mapEngine.setPlayerMarkerShape(true)
    this.mapEngine.setPlayerMarkerShadow('#48f')
    this.mapEngine.hideCarMarker(carId)
    this.playerLng = car.longitude
    this.playerLat = car.latitude
    this.playerAngle = car.angle ?? 0
    soundEngine.stopHackingLoop()
    soundEngine.playEngineStart()
    soundEngine.startCarDrivenLoop()
    soundEngine.stopFootstepsLoop()
    this.mapEngine.setFuelZonesVisible(true)
  }

  private exitCar() {
    const store = useGameStore()
    this.mapEngine.setPlayerMarkerShape(false)
    this.mapEngine.setPlayerMarkerShadow('#0f0')
    this.mapEngine.clearPlayerCarSprite()
    this.mapEngine.setPlayerCarMoving(false)
    this.mapEngine.setFuelZonesVisible(false)
    this.lastFrameState = null

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
    soundEngine.stopCarFillingStationLoop()
    soundEngine.playOpeningCarDoor()
    this.lowFuelThoughtShown = false
    this.refuelThoughtShown = false
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

    if (this.mapMode !== 0) return

    this.fuelStationScanTimer += dt
    if (this.fuelStationScanTimer >= 5) {
      this.fuelStationScanTimer = 0
      this.mapEngine.scanAndAddFuelStations(this.playerLng, this.playerLat)
    }

    this.updateProximityFeedback()
    this.updateHack(dt)
    this.carSpawnCheck(dt)

    const newFrameState: 'idle' | 'walking' | 'running' | 'hacking' | 'swimming' | null = store.isHacking
      ? 'hacking'
      : store.isInCar
        ? null
        : store.isSwimming
          ? 'swimming'
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

  enableTrafficMode() {
    this.trafficMode = true
  }

  private carSpawnCheck(dt: number) {
    const spawnInterval = this.trafficMode ? 0.8 : 1.5
    this.spawnTimer += dt
    if (this.spawnTimer < spawnInterval) return
    this.spawnTimer = 0

    const store = useGameStore()
    const maxDist = this.trafficMode ? 1500 : 2000
    for (let i = store.cars.length - 1; i >= 0; i--) {
      const car = store.cars[i]
      if (car.id === store.activeCarId) continue
      const d = distance([this.playerLng, this.playerLat], [car.longitude, car.latitude], { units: 'meters' })
      if (d > maxDist) {
        this.mapEngine.removeCarMarker(car.id)
        store.cars.splice(i, 1)
      }
    }

    const nearbyRadius = this.trafficMode ? 300 : 300
    const targetCount = this.trafficMode ? 6 : 2
    let totalNearby = 0
    for (const car of store.cars) {
      const d = distance([this.playerLng, this.playerLat], [car.longitude, car.latitude], { units: 'meters' })
      if (d < nearbyRadius) totalNearby++
    }
    if (totalNearby >= targetCount) return

    const needed = targetCount - totalNearby
    const spawnDistMin = this.trafficMode ? 50 : 80
    const spawnDistMax = this.trafficMode ? 250 : 250
    const minCarDist = this.trafficMode ? 4 : 30
    for (let i = 0; i < needed; i++) {
      let placed = false
      for (let pass = 0; pass < 2 && !placed; pass++) {
        for (let attempt = 0; attempt < 60; attempt++) {
          const angle = Math.random() * 2 * Math.PI
          const dist = spawnDistMin + Math.random() * (spawnDistMax - spawnDistMin)
          const dlat = (dist / 111320) * Math.cos(angle)
          const dlng = (dist / (111320 * Math.cos(this.playerLat * Math.PI / 180))) * Math.sin(angle)
          const lng = this.playerLng + dlng
          const lat = this.playerLat + dlat

          if (this.mapEngine.isInsideBuilding(lng, lat)) continue
          if (this.mapEngine.isOnOffroadSurface(lng, lat)) continue
          if (pass === 0 && !this.mapEngine.isOnRoad(lng, lat)) continue

          let tooClose = false
          for (const car of store.cars) {
            const cd = distance([lng, lat], [car.longitude, car.latitude], { units: 'meters' })
            if (cd < minCarDist) {
              tooClose = true
              break
            }
          }
          if (tooClose) continue

          const id = `car-${this.nextCarId++}`
          const carAngle = Math.random() * 2 * Math.PI
          store.cars.push({ id, longitude: lng, latitude: lat, angle: carAngle, fuel: Math.random() * 0.3 })
          this.mapEngine.addCarMarker(id, lng, lat, carAngle)
          placed = true
          break
        }
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

  }

  private sinkPlayerCar() {
    const store = useGameStore()
    if (this.activeCarId) {
      this.mapEngine.removeCarMarker(this.activeCarId)
      this.mapEngine.setPlayerMarkerShape(false)
      this.mapEngine.setPlayerMarkerShadow('#0f0')
      this.mapEngine.clearPlayerCarSprite()
      this.mapEngine.setPlayerCarMoving(false)
      const idx = store.cars.findIndex(c => c.id === this.activeCarId)
      if (idx !== -1) store.cars.splice(idx, 1)
      store.activeCarId = null
      this.activeCarId = null
    }
    store.isInCar = false
    store.isSwimming = true
    soundEngine.stopCarDrivenLoop()
    soundEngine.playEngineBreakdown()
    this.lowFuelThoughtShown = false
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

    if (this.doorSlowTimer > 0) {
      this.doorSlowTimer = Math.max(0, this.doorSlowTimer - dt)
    }
    if (this.doorDebounceTimer > 0) {
      this.doorDebounceTimer = Math.max(0, this.doorDebounceTimer - dt)
    }

    if (forward !== 0) {
      let bearing = this.playerAngle * 180 / Math.PI
      const inWater = this.mapEngine.isOnWater(this.playerLng, this.playerLat)
      let speed = inWater ? SWIM_SPEED : (isRunning ? 6 : MOVE_SPEED_WALK)
      if (this.doorSlowTimer > 0) speed = Math.min(speed, DOOR_SLOW_SPEED)
      let dist = Math.abs(forward) * speed * dt
      if (forward < 0) {
        bearing += 180
      }
      const moved = destination([this.playerLng, this.playerLat], dist, bearing, { units: 'meters' })
      const [newLng, newLat] = moved.geometry.coordinates
      const enteringBuilding = this.mapEngine.isInsideBuilding(newLng, newLat)
      if (enteringBuilding !== this.wasInsideBuilding) {
        if (this.doorDebounceTimer <= 0) {
          if (enteringBuilding) {
            soundEngine.playDoorOpeningClosing()
          } else {
            soundEngine.playDoorClosing()
          }
          this.doorSlowTimer = DOOR_SLOW_DURATION
          this.doorDebounceTimer = DOOR_DEBOUNCE
        }
        this.wasInsideBuilding = enteringBuilding
      }
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
    store.surfaceType = this.mapEngine.getSurfaceType(this.playerLng, this.playerLat)
  }

  private checkCarCollision(lng: number, lat: number, excludeId?: string): boolean {
    const store = useGameStore()
    const speed = Math.abs(this.carPhysics.getSpeed())
    const threshold = Math.max(CAR_COLLISION_DIST, speed * 0.02)
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
    const speed = this.carPhysics.getSpeed()
    const isBraking = forward < 0 && speed > 0.5
    if (isBraking && !this.wasBraking) soundEngine.playCarBrake()
    this.wasBraking = isBraking
    const isReversing = forward < 0 && speed < 0.5
    if (isReversing) rotation = -rotation
    const isOffroad = this.mapEngine.isOnOffroadSurface(this.playerLng, this.playerLat) || (!this.mapEngine.isOnRoad(this.playerLng, this.playerLat) && !this.mapEngine.hasBuilding3d(this.playerLng, this.playerLat))
    const result = this.carPhysics.update(forward, rotation, dt, fuel, this.playerLng, this.playerLat, this.playerAngle, isOffroad)
    const newLng = result.lng
    const newLat = result.lat

    if (this.mapEngine.isInsideBuilding(newLng, newLat)) {
      this.carPhysics.setSpeed(0)
      this.playerLng -= (newLng - this.playerLng) * 0.3
      this.playerLat -= (newLat - this.playerLat) * 0.3
      const now = performance.now()
      if (now - this.lastBuildingCrashAt > 10000) {
        this.lastBuildingCrashAt = now
        soundEngine.playCarCrash()
      }
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
      if (this.mapEngine.isOnOffroadSurface(newLng, newLat) || (!this.mapEngine.isOnRoad(newLng, newLat) && !this.mapEngine.hasBuilding3d(newLng, newLat))) {
        this.carPhysics.applyOffRoadSpeedCap(dt)
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
      if (result.fuel > 0 && result.fuel <= 0.05 && !this.lowFuelThoughtShown) {
        this.lowFuelThoughtShown = true
        this.mapEngine.setThought('Надо заправиться или двигаться на чём-то другом…')
      }
      if (result.fuel === 0) {
        const s = this.carPhysics.getSpeed()
        if (Math.abs(s) > 0.5) {
          this.carPhysics.setSpeed(s - Math.sign(s) * 20 * dt)
        } else {
          this.carPhysics.setSpeed(0)
        }
      }
      const isStationary = Math.abs(this.carPhysics.getSpeed()) < 0.5
      const inFuelZone = this.mapEngine.isInFuelZone(this.playerLng, this.playerLat)
      const isRefueling = inFuelZone && isStationary && currentCar.fuel < 1.0 && !store.fuelStationsDisabled
      if (isRefueling) {
        currentCar.fuel = Math.min(currentCar.fuel + 0.01 * dt, 1.0)
        if (!this.refuelThoughtShown) {
          this.refuelThoughtShown = true
          this.mapEngine.setThought('Заправляюсь…')
          soundEngine.startCarFillingStationLoop()
        }
      } else {
        if (this.refuelThoughtShown) {
          soundEngine.stopCarFillingStationLoop()
        }
        this.refuelThoughtShown = false
      }
    }
    const finalSpeed = this.carPhysics.getSpeed()
    this.mapEngine.setPlayerCarMoving(finalSpeed > 0.5)
    const speedRate = 0.6 + (Math.abs(finalSpeed) / 50) * 0.6
    soundEngine.setCarDrivenRate(speedRate)
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
