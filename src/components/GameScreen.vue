<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useGameStore } from '@/stores/game'
import type { TimelineEvent } from '@/scenarios/types'
import { MapEngine } from '@/engine/MapEngine'
import { PlayerController } from '@/engine/PlayerController'
import { soundEngine } from '@/engine/SoundEngine'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import StatsBars from '@/components/StatsBars.vue'
import BaseDialog from '@/components/BaseDialog.vue'
import { fetchBuildingPolygon, fetchRealRooms, polygonAreaM2, roomsToFeatureCollection, splitBuildingIntoRooms } from '@/engine/IndoorLoader'
import { CRAFT_RECIPES, ELECTRICITY_MAX, FUEL_PER_CYCLE, GENERATOR_CYCLE_SEC, POWER_PER_CYCLE, countRooms, storageCapacity } from '@/engine/BaseRooms'
import { loadGame, saveGame } from '@/engine/SaveEngine'
import LootDialog from '@/components/LootDialog.vue'
import BackpackDialog from '@/components/BackpackDialog.vue'
import { CARRY_CAPACITY, generateLoot, lootIcons, lootKey as makeLootKey, LOOT_TTL_MS, RESOURCE_META, resourcesForPois, searchSeconds, type ResourceKey } from '@/engine/LootEngine'

const store = useGameStore()
const baseUrl = import.meta.env.BASE_URL
const mapContainer = ref<HTMLDivElement>()
const hudTimeLeft = ref(0)
const gameElapsed = ref(0)
const totalTime = ref(0)
const gameReady = ref(false)
const deathReason = ref<'explosion' | 'collapse' | 'survival' | null>(null)
const buildingDamagePercent = ref(0)
const hudSms = ref<{ id: number; text: string; visible: boolean }[]>([])
const showSplash = ref(false)
const splashText = ref('')
const showExplosionInfo = ref(false)

// ---- пост-взрывной метагейм ----
const showAftermathNotice = ref(false)
const showBaseConfirm = ref(false)
const baseDialogOpen = ref(false)
const canMakeBase = ref(false)
const canOpenBase = ref(false)
const canSearchLoot = ref(false)
const canMoveBase = ref(false)
const canDropHere = ref(false)
const insideBuildingNow = ref(false)
const lootDialogOpen = ref(false)
const backpackOpen = ref(false)
const toastText = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(text: string, ms = 3200) {
  toastText.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastText.value = '' }, ms)
}
const activeLootKey = ref('')
const currentLootKey = ref('')
const searchActive = ref(false)
const searchProgress = ref(0)
let searchTimer: ReturnType<typeof setInterval> | null = null
let lootCleanup: ReturnType<typeof setInterval> | null = null
let poiCache: Array<{ class?: string; subclass?: string; name?: string }> = []
let pendingPolygon: GeoJSON.Polygon | null = null
const moveBaseMode = ref(false)
const nearBase = ref(false)
const roomsPreview = ref(1)
const DROP_TTL_MS = 15 * 60 * 1000
const areaPreview = ref<number | null>(null)
const carriedTotal = computed(() =>
  Object.values(store.carried).reduce((sum, v) => sum + (v ?? 0), 0),
)
const CLEAN_SEC_PER_ROOM = 15
const cleaningTimeText = computed(() => {
  const total = roomsPreview.value * CLEAN_SEC_PER_ROOM
  const m = Math.floor(total / 60)
  const sec = total % 60
  if (!m) return `${sec} сек`
  return sec ? `${m} мин ${sec} сек` : `${m} мин`
})
const cleaningUi = ref({ active: false, progress: 0, rooms: 0 })

// блокировка движения, пока открыта любая модалка или идёт расчистка
const anyModalOpen = computed(() => showAftermathNotice.value || showBaseConfirm.value || cleaningUi.value.active || baseDialogOpen.value || lootDialogOpen.value || backpackOpen.value)
watch(anyModalOpen, (open) => { playerController?.setInputBlocked(open) }, { flush: 'post' })

// взял/выронил ресурс — иконки на карте обновляются сразу
watch(
  () => store.lootBuildings,
  () => refreshLootMarkers(),
  { deep: true },
)
let statsInterval: ReturnType<typeof setInterval> | null = null
let buildingInterval: ReturnType<typeof setInterval> | null = null
let fogInterval: ReturnType<typeof setInterval> | null = null
let autosaveInterval: ReturnType<typeof setInterval> | null = null
const onUnload = () => persistGame(false)
let baseDismissed = false
const currentFuel = computed(() => {
  const car = store.cars.find(c => c.id === store.activeCarId)
  return car?.fuel ?? 0
})
const surfaceEmojiMap: Record<string, string> = {
  building: '🏢',
  water: '🌊',
  forest: '🌲',
  park: '🌳',
  grass: '🌿',
  road: '🛣️',
  default: '🚶',
}
const surfaceLabelMap: Record<string, string> = {
  building: 'в здании',
  water: 'в воде',
  forest: 'в лесу',
  park: 'в парке',
  grass: 'на траве',
  road: 'на дороге',
  default: 'пешком',
}
const surfaceDisplay = computed(() => ({
  emoji: surfaceEmojiMap[store.surfaceType] ?? '🚶',
  label: surfaceLabelMap[store.surfaceType] ?? 'пешком',
  cssClass: `status-${store.surfaceType}`,
}))

let mapEngine: MapEngine
let playerController: PlayerController
let timerInterval: ReturnType<typeof setInterval>
let shelterInterval: ReturnType<typeof setInterval>
let carInfoInterval: ReturnType<typeof setInterval>
const spawnValidationTimeouts: ReturnType<typeof setTimeout>[] = []
const processedEvents = new Set<number>()

const shelterHeading = ref(0)
const shelterDist = ref(0)
const baseHeading = ref(0)
const baseDist = ref(0)
const showBaseArrow = ref(false)

/** Пеленг от игрока к точке базы (радианы от севера). */
function bearingTo(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dl = ((lng2 - lng1) * Math.PI) / 180
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return Math.atan2(y, x)
}
const carSpeed = ref(0)
const carGear = ref('P')

function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180
  const rLat1 = lat1 * Math.PI / 180
  const rLat2 = lat2 * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(rLat2)
  const x = Math.cos(rLat1) * Math.sin(rLat2) - Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLng)
  return Math.atan2(y, x)
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const rLat1 = lat1 * Math.PI / 180
  const rLat2 = lat2 * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function findNearestShelter() {
  const pos = playerController.getPosition()
  let minDist = Infinity
  let nearest: { heading: number; dist: number } = { heading: 0, dist: 0 }
  for (const s of store.shelters) {
    const dist = haversine(pos.lat, pos.lng, s.latitude, s.longitude)
    if (dist < minDist) {
      minDist = dist
      nearest = {
        heading: bearing(pos.lat, pos.lng, s.latitude, s.longitude),
        dist,
      }
    }
  }
  return nearest
}

function updateShelterInfo() {
  if (!store.shelterHudVisible || !playerController) return
  const info = findNearestShelter()
  const playerAngle = playerController.getAngle()
  shelterHeading.value = info.heading - playerAngle
  shelterDist.value = info.dist
}

function validateSpawn() {
  if (!mapEngine) return
  // после взрыва/восстановления позиция игрока осмысленна — не переносим его на спавн
  if (store.phase === 'aftermath') return
  const valid = mapEngine.findValidSpawnPoint(store.playerLongitude, store.playerLatitude)
  if (valid) {
    store.playerLatitude = valid.lat
    store.playerLongitude = valid.lng
    playerController.setPosition(valid.lat, valid.lng)
    mapEngine.updatePlayerPosition(valid.lng, valid.lat)
  }
}

const timeline = computed<TimelineEvent[]>(() => store.scenario?.timeline ?? [])
const isDev = import.meta.env.DEV

const debugZoom = ref(18)
const debugScale = ref(1)

onMounted(() => {
  mapEngine = new MapEngine()
  mapEngine.init(mapContainer.value!)
  mapEngine.onReady(() => {
    validateSpawn()
    spawnValidationTimeouts.push(setTimeout(validateSpawn, 800))
    spawnValidationTimeouts.push(setTimeout(validateSpawn, 2500))
    soundEngine.startCityNoiseLoop()
    startTimer()
    setTimeout(() => {
      mapEngine.refreshCarMarkers()
      gameReady.value = true
      if (store.resumeSave) {
        store.resumeSave = false
        enterDevAftermath(false)
        applySave()
      } else if (store.devAftermath) {
        enterDevAftermath()
      }
    }, 3000)
  })

  playerController = new PlayerController(mapEngine)
  playerController.start()
  shelterInterval = setInterval(updateShelterInfo, 500)
  carInfoInterval = setInterval(() => {
    if (store.base && playerController) {
      const pos = playerController.getPosition()
      const d = haversine(pos.lat, pos.lng, store.base.latitude, store.base.longitude)
      baseDist.value = d
      // показываем, как только база не «под ногами»
      showBaseArrow.value = store.isAftermath && d > 40
      baseHeading.value = bearingTo(pos.lat, pos.lng, store.base.latitude, store.base.longitude) - playerController.getAngle()
    } else {
      showBaseArrow.value = false
    }

    const moving = store.isWalking || store.isSwimming || store.isInCar
    const closeUp = store.phase === 'aftermath' && !anyModalOpen.value &&
      (insideBuildingNow.value || !moving)
    mapEngine?.setIdleZoom(closeUp)
    carSpeed.value = playerController.getCarSpeed()
    carGear.value = playerController.getCarGear()
    debugZoom.value = mapEngine.getCurrentZoom()
    debugScale.value = mapEngine.getCurrentScale()
  }, 200)
})

onUnmounted(() => {
  playerController.stop()
  clearInterval(timerInterval)
  clearInterval(explosionTimer!)
  clearInterval(shelterInterval)
  clearInterval(carInfoInterval)
  if (statsInterval) clearInterval(statsInterval)
  if (buildingInterval) clearInterval(buildingInterval)
  if (searchTimer) clearInterval(searchTimer)
  if (lootCleanup) clearInterval(lootCleanup)
  spawnValidationTimeouts.forEach(clearTimeout)
  mapEngine?.destroy()
})

function fireEvent(entry: TimelineEvent) {
  if (entry.type === 'sms') {
    showSMS(entry.text)
    soundEngine.playIncomingMessage()
  } else if (entry.type === 'thought') {
    mapEngine.setThought(entry.texts[Math.floor(Math.random() * entry.texts.length)])
  } else if (entry.type === 'shelter') {
    store.shelterHudVisible = true
    const pos = playerController.getPosition()
    mapEngine.assignShelterBuilding(pos.lng, pos.lat, entry.minM, entry.maxM)
  } else if (entry.type === 'traffic') {
    playerController.enableTrafficMode()
  }
}

function debugAdvanceTimer() {
  gameElapsed.value += 30
  store.timeLeft = Math.max(0, totalTime.value - gameElapsed.value)
  hudTimeLeft.value = store.timeLeft
  for (let i = 0; i < timeline.value.length; i++) {
    if (timeline.value[i].timeSec <= gameElapsed.value && !processedEvents.has(i)) {
      processedEvents.add(i)
      fireEvent(timeline.value[i])
    }
  }
  if (store.timeLeft <= 0) {
    if (timerInterval) clearInterval(timerInterval)
    triggerExplosion()
  }
}

function startTimer() {
  totalTime.value = timeline.value.find(e => e.type === 'explosion')?.timeSec ?? store.timerMinutes * 60
  store.timeLeft = totalTime.value
  store.fuelStationsDisabled = false
  hudTimeLeft.value = store.timeLeft
  gameElapsed.value = 0
  processedEvents.clear()

  timerInterval = setInterval(() => {
    gameElapsed.value++
    store.timeLeft = totalTime.value - gameElapsed.value
    hudTimeLeft.value = store.timeLeft

    for (let i = 0; i < timeline.value.length; i++) {
      if (processedEvents.has(i)) continue
      const entry = timeline.value[i]
      if (entry.timeSec <= gameElapsed.value) {
        processedEvents.add(i)
        fireEvent(entry)
      }
    }

    if (store.timeLeft === 30) {
      soundEngine.startNuclearDangerLoop()
      store.fuelStationsDisabled = true
    }

    if (store.timeLeft <= 5 && store.timeLeft > 0) {
      soundEngine.setNuclearDangerVolume(store.timeLeft / 5)
    }

    if (store.timeLeft <= 0) {
      clearInterval(timerInterval)
      triggerExplosion()
    }
  }, 1000)
}

function showSMS(text: string) {
  const id = Date.now()
  hudSms.value.push({ id, text, visible: true })

  setTimeout(() => {
    const msg = hudSms.value.find(m => m.id === id)
    if (msg) msg.visible = false
  }, 8000)
}

let explosionTimer: ReturnType<typeof setInterval> | null = null
let explosionStarted = false

function triggerExplosion() {
  if (store.phase !== 'playing' || explosionStarted) return
  explosionStarted = true
  mapEngine.setMarkersVisible(false)
  store.cars.forEach(c => mapEngine.removeCarMarker(c.id))
  store.cars = []
  playerController.stop()
  soundEngine.stopAllLoops()
  soundEngine.stopAftermathAmbience()
  soundEngine.setAftermathMode(false)
  mapEngine?.disableFog()
  if (fogInterval) { clearInterval(fogInterval); fogInterval = null }
  stopAutosave()

  hudTimeLeft.value = 0
  if (explosionTimer) clearInterval(explosionTimer)
  explosionTimer = setInterval(() => { hudTimeLeft.value++ }, 1000)

  const pos = playerController.getPosition()
  const dist = haversine(pos.lat, pos.lng, store.epicenterLatitude, store.epicenterLongitude)
  store.playerDistFromEpicenter = dist

  const blast = store.explosionRadius
  const shockwave = blast * 12

  let survived: boolean
  deathReason.value = null

  const nearShelter = store.shelters.some(s => haversine(pos.lat, pos.lng, s.latitude, s.longitude) < 50)

  if (store.isInShelter || nearShelter) {
    buildingDamagePercent.value = 0
    survived = true
  } else if (mapEngine.isInsideBuilding(pos.lng, pos.lat)) {
    let damage = 0
    if (dist <= blast) {
      damage = 0.8 + Math.random() * 0.2
    } else if (dist <= shockwave) {
      const t = (dist - blast) / (shockwave - blast)
      damage = 0.5 * (1 - t)
    }
    buildingDamagePercent.value = damage
    if (Math.random() < damage) {
      survived = false
      deathReason.value = 'collapse'
    } else {
      survived = true
    }
  } else if (dist > shockwave) {
    buildingDamagePercent.value = 0
    survived = true
  } else {
    buildingDamagePercent.value = 0
    survived = false
    deathReason.value = 'explosion'
  }

  mapEngine.flyToEpicenter(store.epicenterLongitude, store.epicenterLatitude, () => {
    setTimeout(() => {
      soundEngine.playExplosion()
      mapEngine.showExplosion(store.epicenterLongitude, store.epicenterLatitude, store.explosionRadius)
      mapEngine.showShockwave(store.epicenterLongitude, store.epicenterLatitude, store.explosionRadius)

      setTimeout(() => {
        mapEngine.setMarkersVisible(true)
        mapEngine.setPlayerMarkerShape(false)
        mapEngine.setPlayerFrame(survived ? 'idle' : 'dead')
        mapEngine.flyToPlayer(pos.lat, pos.lng, () => {
          mapEngine.setPlayerZoom(19)
          store.phase = 'explosion'
          showExplosionInfo.value = true
          const infoText = `💥 Мощность: ${formatPower(store.explosionRadius)}\nЗона поражения: ${((Math.PI * store.explosionRadius ** 2) / 1e6).toFixed(1)} км²\nЗона ударной волны: ${((Math.PI * (store.explosionRadius * 12) ** 2) / 1e6).toFixed(1)} км²`
          mapEngine.showExplosionInfoMarker(pos.lng, pos.lat, infoText)
          if (buildingDamagePercent.value > 0) {
            mapEngine.showBuildingDamageLabel(pos.lng, pos.lat, buildingDamagePercent.value)
          }
          setTimeout(() => {
            mapEngine.setMarkersVisible(false)
            checkGameResult()
          }, 10000)
        })
      }, 20000)
    }, 2000)
  })
}

const ROOM_AREA_M2 = 260
function roomsForArea(areaM2: number): number {
  // «комната» ≈ 260 м²: маленькие здания дают 1–2 комнаты, огромные упираются в 10
  return Math.max(1, Math.min(10, Math.round(areaM2 / ROOM_AREA_M2)))
}

/**
 * Радиус «я в базе»: половина габарита здания (по измеренной площади),
 * но не меньше 12 и не больше 40 м — соседний дом через улицу уже не считается.
 */
function baseRadiusM(): number {
  const area = store.base?.areaM2 ?? 0
  const side = Math.sqrt(Math.max(area, 1))
  return Math.min(40, Math.max(12, side * 0.6))
}

function isAtBase(): boolean {
  const b = store.base
  if (!b || !playerController) return false
  const pos = playerController.getPosition()
  return haversine(pos.lat, pos.lng, b.latitude, b.longitude) <= baseRadiusM()
}

function enterDevAftermath(teleport = true) {
  explosionStarted = true
  if (timerInterval) clearInterval(timerInterval)
  if (explosionTimer) clearInterval(explosionTimer)
  store.devAftermath = true
  store.timeLeft = 0
  hudTimeLeft.value = 0
  startSurvival(false)
  // dev: сразу ставим игрока в ближайшее здание, чтобы кнопка базы была под рукой
  if (teleport && mapEngine && playerController) {
    const pos = playerController.getPosition()
    const b = mapEngine.findBuildingCenterNear(pos.lng, pos.lat)
    if (b) {
      playerController.setPosition(b.lat, b.lng)
      mapEngine.updatePlayerPosition(b.lng, b.lat)
    }
  }
}

/** Сохранить текущее состояние игры в localStorage. */
function persistGame(force = false): void {
  if (store.phase !== 'aftermath' || !playerController || !store.base) return
  // обычное автосохранение — только пока игрок у базы; force — снимок при уходе
  if (!force && !nearBaseNow) return
  const pos = playerController.getPosition()
  saveGame({
    player: { lat: pos.lat, lng: pos.lng },
    stats: { ...store.stats },
    carried: { ...store.carried },
    base: store.base ? JSON.parse(JSON.stringify(store.base)) : null,
    explored: mapEngine?.getExploredPoints() ?? [],
    loot: JSON.parse(JSON.stringify(store.lootBuildings)),
  })
}

function startAutosave(): void {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => persistGame(false))
  }
  if (autosaveInterval) clearInterval(autosaveInterval)
  autosaveInterval = setInterval(() => persistGame(false), 8000)
  window.addEventListener('beforeunload', onUnload)
}

function stopAutosave(): void {
  if (autosaveInterval) { clearInterval(autosaveInterval); autosaveInterval = null }
  window.removeEventListener('beforeunload', onUnload)
}

/** Продолжить игру из сохранения. */
function applySave(): void {
  const data = loadGame()
  if (!data) return
  // после восстановления у базы игрок отдохнувший: энергия всегда 100%
  store.stats = { ...data.stats, energy: 100 }
  store.carried = { ...(data.carried ?? {}) }
  store.base = data.base ?? null
  store.lootBuildings = { ...(data.loot ?? {}) }

  // сохранение делается у базы, поэтому и восстанавливаемся на базе
  const spawnLat = data.base ? data.base.latitude : data.player.lat
  const spawnLng = data.base ? data.base.longitude : data.player.lng
  store.playerLatitude = spawnLat
  store.playerLongitude = spawnLng
  playerController?.setPosition(spawnLat, spawnLng)
  mapEngine?.updatePlayerPosition(spawnLng, spawnLat)
  mapEngine?.flyToPlayer(spawnLat, spawnLng, () => {})

  if (data.base) {
    mapEngine?.setBaseMarker(data.base.longitude, data.base.latitude)
  }
  mapEngine?.restoreExplored((data.explored ?? []) as Array<[number, number]>)

  for (const [key, loot] of Object.entries(store.lootBuildings)) {
    if (loot.expiresAt <= Date.now()) continue
    mapEngine?.setLootMarker(key, loot.lng, loot.lat, loot.icons, loot.emptied)
  }
  showToast('Сохранение загружено')
}

function startSurvival(showNotice = true) {
  store.isAftermath = true
  store.phase = 'aftermath'
  startAutosave()
  soundEngine.setAftermathMode(true)
  soundEngine.startAftermathAmbience()
  mapEngine?.enableFog()
  if (store.base) mapEngine?.markExplored(store.base.longitude, store.base.latitude)
  if (fogInterval) clearInterval(fogInterval)
  fogInterval = setInterval(() => {
    const pos = playerController?.getPosition()
    if (!pos) return
    mapEngine?.updatePlayerClearing(pos.lng, pos.lat)
    checkDoorEntry(pos)
  }, 80)
  if (!store.resumeSave) {
    store.stats = { health: 100, energy: 65, satiety: 70, water: 60 }
  }
  showAftermathNotice.value = showNotice
  mapEngine?.clearWorldObjects()
  store.cars = []
  store.shelters = []
  store.shelterHudVisible = false
  store.isInCar = false
  store.activeCarId = null
  // заправляться нельзя, но машины в мире остаются
  store.fuelStationsDisabled = true
  setTimeout(() => mapEngine?.respawnCars(), 600)
  if (statsInterval) clearInterval(statsInterval)
  statsInterval = setInterval(tickSurvival, 1000)
  if (buildingInterval) clearInterval(buildingInterval)
  buildingInterval = setInterval(updateBasePrompt, 600)
  if (lootCleanup) clearInterval(lootCleanup)
  lootCleanup = setInterval(cleanupLoot, 5000)
}

let greenhouseAcc = 0
let workshopAcc = 0
let generatorAcc = 0

/** Пассивное производство обустроенных комнат (раз в секунду). */
function tickRooms() {
  const base = store.base
  if (!base) return
  const types = base.roomTypes

  if (countRooms(types, 'greenhouse') > 0) {
    greenhouseAcc += 1
    if (greenhouseAcc >= 60) {
      greenhouseAcc = 0
      const cap = storageCapacity(base.areaM2 ?? 250, types)
      if (storageUsed() < cap) {
        base.resources.food += countRooms(types, 'greenhouse')
        showToast('🌱 Теплица: +1 еда')
      }
    }
  } else {
    greenhouseAcc = 0
  }

  // генераторы: тратят топливо и дают электричество
  if (countRooms(types, 'generator') > 0) {
    generatorAcc += 1
    if (generatorAcc >= GENERATOR_CYCLE_SEC) {
      generatorAcc = 0
      const gens = countRooms(types, 'generator')
      const fuelNeed = FUEL_PER_CYCLE * gens
      if (base.resources.fuel >= fuelNeed) {
        base.resources.fuel -= fuelNeed
        const room = Math.max(0, ELECTRICITY_MAX - base.resources.energy)
        const produced = Math.min(room, POWER_PER_CYCLE * gens)
        base.resources.energy += produced
        if (produced > 0) showToast(`⚙ Генераторы: +${produced} ⚡ (−${fuelNeed} ⛽)`)
      }
    }
  } else {
    generatorAcc = 0
  }

  if (countRooms(types, 'workshop') > 0) {
    workshopAcc += 1
    if (workshopAcc >= 120) {
      workshopAcc = 0
      if (base.resources.tech > 0) {
        base.resources.tech -= 1
        base.resources.materials += 2
        showToast('🛠 Мастерская: 1 🔌 → 2 🧱')
      }
    }
  } else {
    workshopAcc = 0
  }
}

/** Баланс выживания: единицы в секунду. */
const SURVIVAL = {
  satietyDrain: 0.09, // было 0.18
  waterDrain: 0.09, // было 0.22 → 100% воды хватает ~18 минут
  starveDamage: 0.35, // было 1.2
  thirstDamage: 0.4, // было 1.4 → на нуле воды ~4 минуты до смерти
  exhaustionDamage: 0.15, // было 0.4
}

function tickSurvival() {
  if (!store.isAftermath || store.phase !== 'aftermath') return
  const s = store.stats
  const inBase = isAtBase()
  s.satiety = Math.max(0, s.satiety - SURVIVAL.satietyDrain)
  s.water = Math.max(0, s.water - SURVIVAL.waterDrain)
  const gymBonus = countRooms(store.base?.roomTypes, 'gym') > 0 ? 0.85 : 1
  s.energy = Math.max(0, s.energy - (inBase ? 0.04 : 0.12) * gymBonus)
  tickRooms()

  // крафт в мастерской завершается по таймеру, даже если окно закрыто
  const craft = store.craftJob
  if (craft && store.base && Date.now() >= craft.endsAt) {
    const recipe = CRAFT_RECIPES.find((r) => r.id === craft.recipeId)
    if (recipe) {
      const r = store.base.resources as unknown as Record<string, number>
      for (const [key, amount] of Object.entries(recipe.output)) {
        r[key] = (r[key] ?? 0) + (amount ?? 0)
      }
      showToast(`🛠 Готово: ${recipe.icon} ${recipe.name}`)
    }
    store.craftJob = null
  }

  // постройка помещения завершается по таймеру, даже если окно базы закрыто
  const job = store.construction
  if (job && store.base && Date.now() >= job.endsAt) {
    store.base.roomTypes = { ...(store.base.roomTypes ?? {}), [job.roomId]: job.type }
    store.construction = null
  store.craftJob = null
    showToast(`🏗 Помещение ${job.roomId} готово`)
  }

  // отдых на базе: силы восстанавливаются постепенно (~2% в секунду).
  // Условие — «внутри здания базы» (как и открытие окна), а не радиус от точки базы:
  // в большом здании игрок легко оказывается дальше радиуса и отдых обрывался.
  if (store.resting) {
    // Никаких проверок зоны: отдых идёт, пока открыто окно базы (при закрытии флаг
    // снимается в BaseDialog) и пока игрок не начал двигаться.
    const s2 = store.stats
    const restRate = countRooms(store.base?.roomTypes, 'bedroom') > 0 ? 3 : 2
    s2.energy = Math.min(100, s2.energy + restRate)
    if (s2.energy >= 100) {
      store.resting = false
      showToast('⚡ Отдохнули, силы восстановлены')
    }
  }

  let damage = 0
  if (s.satiety <= 0) damage += SURVIVAL.starveDamage
  if (s.water <= 0) damage += SURVIVAL.thirstDamage
  if (s.energy <= 0) damage += SURVIVAL.exhaustionDamage
  if (damage > 0) {
    s.health = Math.max(0, s.health - damage)
  } else if (inBase) {
    s.health = Math.min(100, s.health + 0.15)
  }
  if (s.health <= 0) {
    store.deathReasonText = s.water <= 0 ? 'Вы погибли от обезвоживания.' : 'Вы погибли от истощения.'
    deathReason.value = 'survival'
    store.phase = 'gameover'
    soundEngine.stopAftermathAmbience()
    if (fogInterval) { clearInterval(fogInterval); fogInterval = null }
  stopAutosave()
    if (statsInterval) { clearInterval(statsInterval); statsInterval = null }
    if (buildingInterval) { clearInterval(buildingInterval); buildingInterval = null }
  }
}

let wasInsideBuilding = false
let doorArmed = true
let depositedThisVisit = false
let nearBaseNow = false
let wasNearBase = false
let lastOutsidePos: { lat: number; lng: number } | null = null

/**
 * Касание стены: срабатывает ОДИН раз на подход к зданию (edge-trigger),
 * иначе дверь открывается заново, пока игрок стоит у стены.
 */
function checkDoorEntry(pos: { lat: number; lng: number }) {
  if (!mapEngine || !playerController) return
  if (store.phase !== 'aftermath' || store.isInCar) {
    insideBuildingNow.value = false
    doorArmed = true
    return
  }

  insideBuildingNow.value = mapEngine.isInsideBuildingStrict(pos.lng, pos.lat)
  if (insideBuildingNow.value) {
    doorArmed = true
    return
  }

  const contact = mapEngine.findWallContact(pos.lng, pos.lat, playerController.getAngle(), 1.2)
  if (!contact || contact.dist > 0.95) {
    // отошёл от стены — взводим для следующего подхода
    doorArmed = true
    return
  }
  if (!doorArmed) return

  doorArmed = false
  playDoorAnimation({ lat: contact.lat, lng: contact.lng })
}

/**
 * Вход в здание: створка двери распахивается, игрок не останавливается —
 * движение и анимация шагов продолжаются без блокировки.
 */
function playDoorAnimation(pos: { lat: number; lng: number }) {
  if (!mapEngine || !playerController) return
  soundEngine.playDoorOpeningClosing()

  const angle = playerController.getAngle() - Math.PI / 2
  mapEngine.playDoorSwing(pos.lng, pos.lat, angle, 82)

  // кадры анимации замирают на время открытия, но управление не отбираем:
  // блокировка чистит нажатые клавиши и игрок потом не идёт без повторного нажатия
  mapEngine.freezePlayerAnimation(420)
}

function updateBasePrompt() {
  if (store.phase !== 'aftermath' || !playerController || !mapEngine) return
  const pos = playerController.getPosition()
  const insideBuilding = mapEngine.isInsideBuildingStrict(pos.lng, pos.lat)
  // звезда базы всегда на карте, даже после восстановления сохранения
  if (store.base && mapEngine && !mapEngine.hasBaseMarker()) {
    mapEngine.setBaseMarker(store.base.longitude, store.base.latitude)
  }

  const atBase = insideBuilding && isAtBase()
  if (nearBase.value && !atBase) baseDismissed = false
  nearBase.value = atBase
  const inBaseBuilding = !!store.base && atBase
  canMakeBase.value = !store.base && !store.isInCar && insideBuilding
  canOpenBase.value = inBaseBuilding && insideBuilding && !cleaningUi.value.active
  canMoveBase.value = !!store.base && insideBuilding && !inBaseBuilding && !store.isInCar && !cleaningUi.value.active
  canDropHere.value = !!store.base && insideBuilding && !inBaseBuilding && !store.isInCar


  // «у базы» с запасом по расстоянию: большой дом целиком входит в 70 м
  nearBaseNow = !!store.base && haversine(pos.lat, pos.lng, store.base.latitude, store.base.longitude) < 70
  if (wasNearBase && !nearBaseNow) persistGame(true) // снимок на момент ухода с базы
  wasNearBase = nearBaseNow

  // вернулся на базу — рюкзак выгружается ОДИН раз за визит
  // (иначе взятое из хранилища тут же возвращалось обратно)
  if (inBaseBuilding && store.base) {
    if (!depositedThisVisit) {
      depositedThisVisit = true
      // если игрок сразу открыл окно базы — не разгружаем, он распорядится сам
      if (!baseDialogOpen.value) depositBackpack()
    }
  } else {
    depositedThisVisit = false
  }

  // поиск ресурсов в магазинах
  if (insideBuilding && !store.isInCar) {
    poiCache = mapEngine.getPoisNear(pos.lng, pos.lat, 70)
    // искать можно в любом здании; магазины лишь определяют состав лута
    canSearchLoot.value = !baseDialogOpen.value && !lootDialogOpen.value && !inBaseBuilding && !cleaningUi.value.active
    currentLootKey.value = makeLootKey(pos.lat, pos.lng)
  } else {
    poiCache = []
    canSearchLoot.value = false
  }
}

function storageUsed(): number {
  const r = store.base?.resources
  if (!r) return 0
  return Object.values(r as unknown as Record<string, number>).reduce((sum, v) => sum + v, 0)
}

/** Открытие окна базы: план помещений пересобирается, если он не из OSM. */
function openBaseDialog() {
  const base = store.base
  if (!base) return
  if (!base.roomsGeo && base.polygon) {
    base.roomsGeo = roomsToFeatureCollection(splitBuildingIntoRooms(base.polygon, base.rooms))
    base.roomsReal = false
  }
  if (!base.roomsReal && base.polygon) {
    base.roomsGeo = roomsToFeatureCollection(splitBuildingIntoRooms(base.polygon, base.rooms))
  }
  baseDialogOpen.value = true
}

/** Выложить рюкзак в текущем здании (когда на базе места нет). */
function dropBackpackInBuilding() {
  if (!mapEngine || !playerController || !store.base) return
  const pos = playerController.getPosition()
  const carried = store.carried as Partial<Record<ResourceKey, number>>
  const dropped = Object.entries(carried).filter(([, v]) => (v ?? 0) > 0)
  if (!dropped.length) {
    showToast('Рюкзак пуст')
    return
  }

  const key = findNearbyLoot(pos.lat, pos.lng) ?? makeLootKey(pos.lat, pos.lng)
  let loot = store.lootBuildings[key]
  if (!loot) {
    loot = {
      key,
      lat: pos.lat,
      lng: pos.lng,
      items: [],
      icons: '',
      expiresAt: Date.now() + DROP_TTL_MS,
    }
    store.lootBuildings[key] = loot
  }

  const parts: string[] = []
  for (const [k, v] of dropped) {
    const resourceKey = k as ResourceKey
    const amount = v ?? 0
    const existing = loot.items.find((i) => i.key === resourceKey)
    if (existing) existing.amount += amount
    else loot.items.push({ key: resourceKey, amount })
    carried[resourceKey] = 0
    parts.push(`${RESOURCE_META[resourceKey].icon}${amount}`)
  }
  loot.expiresAt = Date.now() + DROP_TTL_MS
  loot.emptied = false
  store.carried = { ...carried }
  refreshLootMarkers()
  showToast(`Оставлено в здании: ${parts.join(' ')}`, 3200)
}

function depositBackpack() {
  const base = store.base
  if (!base) return
  const cap = storageCapacity(base.areaM2 ?? 250, base.roomTypes)
  let free = Math.max(0, cap - storageUsed())
  if (free <= 0) {
    if (store.carried && Object.values(store.carried).some((v) => (v ?? 0) > 0)) {
      showToast(`Хранилище заполнено (${storageUsed()}/${cap})`, 2600)
    }
    return
  }

  const carried = store.carried as Partial<Record<ResourceKey, number>>
  const keys = Object.keys(carried) as ResourceKey[]
  const moved: string[] = []
  let total = 0
  const target = base.resources as unknown as Record<string, number>

  for (const key of keys) {
    const amount = carried[key] ?? 0
    if (amount <= 0 || free <= 0) continue
    const put = Math.min(amount, free)
    target[key] = (target[key] ?? 0) + put
    carried[key] = amount - put
    free -= put
    total += put
    moved.push(`${RESOURCE_META[key].icon}${put}`)
  }
  if (!total) return
  store.carried = { ...carried }
  const left = Object.values(carried).reduce((sum, v) => sum + (v ?? 0), 0)
  showToast(
    left > 0
      ? `Выгружено: ${moved.join(' ')} · хранилище полно, осталось в рюкзаке: ${left}`
      : `Выгружено на базу: ${moved.join(' ')}`,
  )
}

async function openMoveBase() {
  if (!mapEngine || !playerController) return
  const pos = playerController.getPosition()
  const local = mapEngine.measureBuildingAt(pos.lng, pos.lat)
  const area = local ? local.areaM2 : 250
  pendingPolygon = local ? mapEngine.rectPolygonAround(pos.lng, pos.lat, local.widthM, local.depthM) : null
  moveBaseMode.value = true
  areaPreview.value = Math.round(area)
  roomsPreview.value = roomsForArea(area)
  showBaseConfirm.value = true
}

function confirmMoveBase() {
  showBaseConfirm.value = false
  if (!store.base) return
  const pos = playerController!.getPosition()
  const rooms = Math.max(1, Math.min(10, roomsPreview.value))
  const totalMs = rooms * CLEAN_SEC_PER_ROOM * 1000
  const started = Date.now()
  cleaningUi.value = { active: true, progress: 0, rooms }
  const timer = setInterval(() => {
    const p = Math.min(1, (Date.now() - started) / totalMs)
    cleaningUi.value = { active: p < 1, progress: p, rooms }
    if (p >= 1) {
      clearInterval(timer)
      relocateBase(pos.lat, pos.lng, rooms)
    }
  }, 120)
}

function relocateBase(lat: number, lng: number, rooms: number) {
  if (!store.base) return

  const newArea = areaPreview.value ?? store.base.areaM2 ?? 250
  // оборудование комнат НЕ переносится — на новом месте комнаты пустые
  const capacity = storageCapacity(newArea, {})

  // ресурсы переносим, но обрезаем по лимиту нового помещения
  const res = { ...store.base.resources } as unknown as Record<string, number>
  // сначала режем менее важное
  const cutOrder = ['materials', 'fuel', 'clothes', 'tech', 'weapons', 'tools', 'battery', 'wire', 'metal', 'pipe', 'circuit', 'wheel', 'chain', 'medicine', 'food', 'water', 'energy']
  let total = Object.values(res).reduce((sum, v) => sum + v, 0)
  for (const key of cutOrder) {
    if (total <= capacity) break
    const excess = total - capacity
    const cut = Math.min(res[key] ?? 0, excess)
    res[key] = (res[key] ?? 0) - cut
    total -= cut
  }

  store.base = {
    ...store.base,
    latitude: lat,
    longitude: lng,
    rooms,
    areaM2: newArea,
    roomTypes: {},
    resources: res as never,
    polygon: pendingPolygon,
    roomsGeo: null,
    roomsReal: false,
  }
  showToast(`База перенесена: комнаты пустые, запас обрезан до ${capacity} ед.`, 3600)
  mapEngine?.setBaseMarker(lng, lat)
  mapEngine?.markExplored(lng, lat)
  const polygon = pendingPolygon
  if (polygon) {
    store.base.roomsGeo = roomsToFeatureCollection(splitBuildingIntoRooms(polygon, rooms))
    store.base.roomsReal = false
    void (async () => {
      let roomsGeo: GeoJSON.FeatureCollection | null = null
      let real = false
      try {
        const realRooms = await fetchRealRooms(polygon)
        if (realRooms.length) {
          roomsGeo = roomsToFeatureCollection(realRooms)
          real = true
        }
      } catch { /* офлайн — нарезка ниже */ }
      if (!roomsGeo) roomsGeo = roomsToFeatureCollection(splitBuildingIntoRooms(polygon, rooms))
      if (store.base) {
        store.base.roomsGeo = roomsGeo
        store.base.roomsReal = real
      }
    })()
  }
  canMoveBase.value = false
}

/** Уже осмотренное здание рядом (в радиусе 25 м) — лутать заново не нужно. */
function findNearbyLoot(lat: number, lng: number): string | null {
  const now = Date.now()
  let bestKey: string | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const [key, loot] of Object.entries(store.lootBuildings)) {
    if (loot.expiresAt <= now) continue
    const d = haversine(lat, lng, loot.lat, loot.lng)
    if (d < 25 && d < bestDist) {
      bestDist = d
      bestKey = key
    }
  }
  return bestKey
}

function openLoot() {
  if (!mapEngine || !playerController) return
  const pos = playerController.getPosition()
  const key = makeLootKey(pos.lat, pos.lng)

  // здание уже осматривали и содержимое ещё не «забыто» — открываем сразу
  const nearby = findNearbyLoot(pos.lat, pos.lng)
  if (nearby) {
    activeLootKey.value = nearby
    searchActive.value = false
    searchProgress.value = 1
    lootDialogOpen.value = true
    return
  }

  const existing = store.lootBuildings[key]
  if (existing && existing.expiresAt > Date.now()) {
    activeLootKey.value = key
    lootDialogOpen.value = true
    return
  }

  const local = mapEngine.measureBuildingAt(pos.lng, pos.lat)
  const areaM2 = local ? local.areaM2 : 250
  let keys = resourcesForPois(poiCache)
  let generic = false
  if (!keys.length) {
    keys = ['food', 'water', 'materials', 'medicine']
    generic = true
  }
  const shops = new Set(poiCache.map((p) => p.subclass ?? p.class ?? '')).size
  const seconds = searchSeconds(areaM2, keys.length)

  activeLootKey.value = key
  searchActive.value = true
  searchProgress.value = 0
  lootDialogOpen.value = true
  mapEngine.markExplored(pos.lng, pos.lat)
  const started = Date.now()
  if (searchTimer) clearInterval(searchTimer)
  searchTimer = setInterval(() => {
    const p = Math.min(1, (Date.now() - started) / (seconds * 1000))
    searchProgress.value = p
    if (p >= 1) {
      if (searchTimer) { clearInterval(searchTimer); searchTimer = null }
      const items = generateLoot(keys, areaM2 * (generic ? 0.5 : 1), shops || 1)
      store.lootBuildings[key] = {
        key,
        lat: pos.lat,
        lng: pos.lng,
        items,
        expiresAt: Date.now() + LOOT_TTL_MS,
        icons: lootIcons(items),
      }
      mapEngine?.setLootMarker(key, pos.lng, pos.lat, lootIcons(items))
      searchActive.value = false
    }
  }, 120)
}

function depositCarried() {
  if (!store.base) return
  const carried = store.carried as Record<string, number>
  let moved = 0
  for (const [k, amount] of Object.entries(carried)) {
    if (!amount) continue
    const target = store.base.resources as unknown as Record<string, number>
    target[k] = (target[k] ?? 0) + amount
    moved += amount
  }
  if (moved) store.carried = {}
}

/** последнее отрисованное состояние маркеров, чтобы не пересоздавать DOM зря */
const lootMarkerState = new Map<string, string>()

/** Иконки на карте всегда показывают то, что в здании реально осталось. */
function refreshLootMarkers() {
  const now = Date.now()
  for (const [key, loot] of Object.entries(store.lootBuildings)) {
    if (loot.expiresAt <= now) {
      delete store.lootBuildings[key]
      mapEngine?.removeLootMarker(key)
      lootMarkerState.delete(key)
      continue
    }
    const left = loot.items.filter((i) => i.amount > 0)
    const empty = left.length === 0
    const icons = empty ? loot.icons : lootIcons(left)

    if (icons !== loot.icons) loot.icons = icons
    if (empty !== !!loot.emptied) loot.emptied = empty

    const signature = `${icons}|${empty}`
    if (lootMarkerState.get(key) === signature) continue
    lootMarkerState.set(key, signature)
    mapEngine?.setLootMarker(key, loot.lng, loot.lat, icons, empty)
  }
}

function cleanupLoot() {
  refreshLootMarkers()
}

async function openBaseConfirm() {
  if (!mapEngine || !playerController) return
  const pos = playerController.getPosition()

  // 1) мгновенный локальный замер по пикселям карты (без сети)
  const local = mapEngine.measureBuildingAt(pos.lng, pos.lat)
  const localArea = local ? local.areaM2 : 250
  pendingPolygon = local
    ? mapEngine.rectPolygonAround(pos.lng, pos.lat, local.widthM, local.depthM)
    : null
  areaPreview.value = Math.round(localArea)
  roomsPreview.value = roomsForArea(localArea)
  showBaseConfirm.value = true

  // 2) уточнение по OSM (если доступен) — не блокирует диалог
  try {
    const poly = (await fetchBuildingPolygon(pos.lat, pos.lng)) as GeoJSON.Polygon | null
    if (poly) {
      const measured = polygonAreaM2(poly)
      if (measured > 20) {
        pendingPolygon = poly
        areaPreview.value = Math.round(measured)
        roomsPreview.value = roomsForArea(measured)
      }
    }
  } catch {
    /* Overpass недоступен — остаёмся на локальном замере */
  }
}

function confirmMakeBase() {
  showBaseConfirm.value = false
  moveBaseMode.value = false
  if (!mapEngine || !playerController) return
  const pos = playerController.getPosition()
  const rooms = Math.max(1, Math.min(10, roomsPreview.value))
  const totalMs = rooms * CLEAN_SEC_PER_ROOM * 1000
  const started = Date.now()
  cleaningUi.value = { active: true, progress: 0, rooms }
  const timer = setInterval(() => {
    const p = Math.min(1, (Date.now() - started) / totalMs)
    cleaningUi.value = { active: p < 1, progress: p, rooms }
    if (p >= 1) {
      clearInterval(timer)
      createBase(pos.lat, pos.lng, rooms)
    }
  }, 120)
}

function createBase(lat: number, lng: number, rooms: number) {
  const polygon = pendingPolygon ?? null
  store.base = {
    latitude: lat,
    longitude: lng,
    rooms,
    areaM2: areaPreview.value ?? 250,
    resources: {
      food: 2 + rooms,
      water: 2 + rooms,
      materials: rooms,
      fuel: 1,
      medicine: Math.max(1, Math.floor(rooms / 2)),
      energy: 10,
      clothes: 0,
      tech: 0,
      weapons: 0,
      tools: 0,
      battery: 0,
      wire: 0,
      metal: 0,
      pipe: 0,
      circuit: 0,
      wheel: 0,
      chain: 0,
    },
    roomTypes: {},
    objects: [],
    polygon,
    roomsGeo: null,
    roomsReal: false,
  }

  mapEngine?.markExplored(lng, lat)

  // помещения: сразу строим схему по контуру, уточняем по OSM в фоне
  if (polygon) {
    store.base.roomsGeo = roomsToFeatureCollection(splitBuildingIntoRooms(polygon, rooms))
    store.base.roomsReal = false
    void (async () => {
      let roomsGeo: GeoJSON.FeatureCollection | null = null
      let real = false
      try {
        const realRooms = await fetchRealRooms(polygon)
        if (realRooms.length) {
          roomsGeo = roomsToFeatureCollection(realRooms)
          real = true
        }
      } catch (e) {
        console.warn('indoor rooms fail', e)
      }
      if (!roomsGeo) roomsGeo = roomsToFeatureCollection(splitBuildingIntoRooms(polygon, rooms))
      if (store.base) {
        store.base.roomsGeo = roomsGeo
        store.base.roomsReal = real
      }
    })()
  }

  mapEngine?.setBaseMarker(lng, lat)
  mapEngine?.markExplored(lng, lat)
  canMakeBase.value = false
  baseDismissed = true
  baseDialogOpen.value = true
}

function closeBaseDialog() {
  baseDialogOpen.value = false
  baseDismissed = true
}

function checkGameResult() {
  clearInterval(explosionTimer!)
  clearInterval(shelterInterval)
  clearInterval(carInfoInterval)
  hudSms.value = []
  mapEngine.setThought(null)
  mapEngine.removeBuildingDamageLabel()
  mapEngine.removeExplosionInfoMarker()
  soundEngine.stopAllLoops()
  soundEngine.stopAftermathAmbience()
  soundEngine.setAftermathMode(false)
  mapEngine?.disableFog()
  if (fogInterval) { clearInterval(fogInterval); fogInterval = null }
  stopAutosave()
  if (deathReason.value === 'collapse' || deathReason.value === 'explosion') {
    store.phase = 'gameover'
  } else {
    startSurvival()
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatPower(radius: number): string {
  const kt = (radius / 1000) ** 3 * 25
  if (kt >= 1000) return (kt / 1000).toFixed(1) + ' Мт'
  return Math.round(kt) + ' кт'
}

function formatSpeed(speed: number): string {
  const kmh = Math.round(Math.abs(speed) * 3.6)
  return `${kmh} км/ч`
}

function restartGame() {
  store.phase = 'start'
  store.scenario = null
  store.shelters = []
  store.cars = []
  store.smsMessages = []
  store.shelterHudVisible = false
  store.isInShelter = false
  store.timeLeft = 0
  hudTimeLeft.value = 0
  hudSms.value = []
  explosionStarted = false
  store.isAftermath = false
  store.base = null
  store.carried = {}
  store.lootBuildings = {}
  store.resting = false
  activeLootKey.value = ''
  lootDialogOpen.value = false
  searchActive.value = false
  canSearchLoot.value = false
  backpackOpen.value = false
  if (searchTimer) { clearInterval(searchTimer); searchTimer = null }
  mapEngine?.clearLootMarkers()
  store.deathReasonText = null
  showAftermathNotice.value = false
  showBaseConfirm.value = false
  baseDialogOpen.value = false
  canMakeBase.value = false
  canOpenBase.value = false
  canMoveBase.value = false
  moveBaseMode.value = false
  cleaningUi.value = { active: false, progress: 0, rooms: 0 }
  baseDismissed = false
  if (statsInterval) { clearInterval(statsInterval); statsInterval = null }
  if (buildingInterval) { clearInterval(buildingInterval); buildingInterval = null }
  mapEngine?.clearBaseMarker()
}

const resultTexts = computed(() => store.scenario?.resultTexts)

function toggleMute() {
  store.isMuted = !store.isMuted
  soundEngine.setMuted(store.isMuted)
  // включаем эмбиент обратно, если мы уже в посмертном мире
  if (!store.isMuted && store.phase === 'aftermath') soundEngine.startAftermathAmbience()
}
</script>

<template>
  <div class="game-wrapper">
    <div ref="mapContainer" class="map-container"></div>

    <div v-if="!gameReady" class="game-loading-overlay">
      <div class="spinner"></div>
      <p class="loading-text">{{ store.loadingMessage }}</p>
    </div>

    <div v-if="isDev" class="debug-panel" @click="debugAdvanceTimer()">
      <div>{{ showExplosionInfo ? '-' : '' }}{{ formatTime(hudTimeLeft) }}</div>
      <div>{{ hudTimeLeft.toFixed(0) }} сек</div>
      <div>+{{ gameElapsed }}с</div>
      <div>cars: {{ store.cars.length }}</div>
      <div>zoom: {{ debugZoom.toFixed(2) }}</div>
      <div>map: {{ ['close', 'medium', 'far'][store.mapMode] }}</div>
      <div>scale: {{ debugScale.toFixed(2) }}</div>
      <button v-if="isDev" class="debug-dev-btn" @click.stop="enterDevAftermath()">→ БАЗА</button>
    </div>

    <div v-if="store.phase === 'playing'" class="hud">
      <button
        class="mute-btn"
        :title="store.isMuted ? 'Включить звук' : 'Выключить звук'"
        @click="toggleMute"
      >
        {{ store.isMuted ? '🔇' : '🔊' }}
      </button>

      <div v-if="store.isInCar" class="hud-status status-car">
        <span>🚗</span><span>В машине</span>
      </div>
      <div v-else class="hud-status" :class="surfaceDisplay.cssClass">
        <span>{{ surfaceDisplay.emoji }}</span><span>{{ surfaceDisplay.label }}</span>
      </div>
      <div v-if="store.isHacking" class="hack-bar">
        <div class="hack-bar-fill" :style="{ width: store.hackProgress * 100 + '%' }"></div>
        <span>Взлом замка зажигания… {{ Math.round(store.hackProgress * 100) }}%</span>
      </div>
      <div v-if="store.isInCar" class="fuel-bar">
        <div class="fuel-bar-fill" :style="{ width: currentFuel * 100 + '%' }"></div>
        <span>⛽ Топливо: {{ Math.round(currentFuel * 100) }}%</span>
      </div>
      <div v-if="store.isInCar" class="hud-speed">{{ carGear }} {{ formatSpeed(carSpeed) }}</div>
    </div>

    <div v-if="store.shelterHudVisible" class="shelter-hud">
      <div class="shelter-compass">
          <div class="shelter-arrow-wrap" :style="{ transform: `rotate(${shelterHeading}rad)` }">
            <div class="shelter-arrow-head"></div>
            <div class="shelter-arrow-stem"></div>
          </div>
      </div>
      <div class="shelter-dist">{{ (shelterDist / 1000).toFixed(1) }} км</div>
    </div>

    <div v-if="showBaseArrow" class="base-hud" title="Направление на базу">
      <div class="shelter-compass base-compass">
        <div class="shelter-arrow-wrap" :style="{ transform: `rotate(${baseHeading}rad)` }">
          <div class="shelter-arrow-head base-arrow"></div>
          <div class="shelter-arrow-stem base-arrow-stem"></div>
        </div>
      </div>
      <div class="base-dist">★ {{ baseDist > 1000 ? (baseDist / 1000).toFixed(1) + ' км' : Math.round(baseDist) + ' м' }}</div>
    </div>

    <div class="sms-container">
      <TransitionGroup name="sms">
        <div
          v-for="msg in hudSms.filter(m => m.visible)"
          :key="msg.id"
          class="sms-message"
        >
          📱 {{ msg.text }}
        </div>
      </TransitionGroup>
    </div>

    <div v-if="showSplash" class="splash-overlay">
      <h1 class="splash-text">{{ splashText }}</h1>
    </div>

    <div v-if="store.isAftermath" class="stats-hud">
      <StatsBars />
      <button class="backpack-btn" @click="backpackOpen = true">
        🎒 {{ carriedTotal }} / {{ CARRY_CAPACITY }}
      </button>
    </div>

    <div v-if="toastText" class="game-toast">{{ toastText }}</div>

    <BackpackDialog
      v-if="backpackOpen"
      :can-drop="canDropHere"
      @drop="dropBackpackInBuilding()"
      @close="backpackOpen = false"
    />

    <button v-if="canMakeBase" class="make-base-btn" @click="openBaseConfirm">
      ★ Сделать базой
    </button>

    <button v-if="canOpenBase && !baseDialogOpen" class="open-base-btn" @click="openBaseDialog">
      ★ Открыть окно базы
    </button>

    <button v-if="canMoveBase" class="move-base-btn" @click="openMoveBase">
      📦 Перенести базу сюда
    </button>

    <button
      v-if="canSearchLoot && !canMakeBase && !canOpenBase"
      class="loot-btn"
      @click="openLoot"
    >
      🔎 {{ store.lootBuildings[currentLootKey] && store.lootBuildings[currentLootKey].expiresAt > Date.now() ? 'Открыть найденное' : 'Поиск ресурсов' }}
    </button>

    <LootDialog
      v-if="lootDialogOpen && activeLootKey"
      :loot-key="activeLootKey"
      :searching="searchActive"
      :progress="searchProgress"
      @close="lootDialogOpen = false; cleanupLoot()"
    />

    <div v-if="showAftermathNotice" class="aftermath-overlay">
      <div class="aftermath-card">
        <p class="aftermath-text">
          Скорее всего, все ваши близкие погибли. Вам решать что делать дальше:
          исследовать новый мир, восстанавливать цивилизацию или искать гибель.
        </p>
        <button @click="showAftermathNotice = false">Продолжить</button>
      </div>
    </div>

    <div v-if="showBaseConfirm" class="aftermath-overlay">
      <div class="aftermath-card narrow">
        <h2>{{ moveBaseMode ? 'Перенести базу сюда?' : 'Сделать здание вашей базой?' }}</h2>
        <p class="aftermath-sub">
          Площадь здания: <b>{{ areaPreview === null ? 'измеряем…' : areaPreview + ' м²' }}</b>
          → помещений: <b>{{ roomsPreview }}</b>.
          Расчистка: {{ roomsPreview }} × {{ CLEAN_SEC_PER_ROOM }} с ≈ <b>{{ cleaningTimeText }}</b>.
          Пока идёт расчистка, вы не можете двигаться. Внутри можно хранить найденные вещи,
          отдыхать и лечиться.
        </p>
        <div class="aftermath-actions">
          <button @click="showBaseConfirm = false; moveBaseMode = false">Отмена</button>
          <button class="primary" @click="moveBaseMode ? confirmMoveBase() : confirmMakeBase()">Подтвердить</button>
        </div>
      </div>
    </div>

    <div v-if="cleaningUi.active" class="aftermath-overlay">
      <div class="aftermath-card narrow">
        <h2>Расчистка помещений</h2>
        <div class="clean-bar"><i :style="{ width: cleaningUi.progress * 100 + '%' }"></i></div>
        <p class="aftermath-sub">
          {{ Math.round(cleaningUi.progress * 100) }}% · {{ cleaningUi.rooms }} комн.
        </p>
      </div>
    </div>

    <BaseDialog v-if="baseDialogOpen" @close="closeBaseDialog" />

    <div v-if="store.phase === 'gameover'" class="gameover-overlay">
      <img :src="baseUrl + 'sprites/player/dead-single.png'" class="dead-sprite" alt="" />
      <h1>{{ deathReason === 'collapse' ? resultTexts?.collapseTitle : deathReason === 'survival' ? 'ВЫ ПОГИБЛИ' : resultTexts?.gameoverTitle ?? 'GAME OVER' }}</h1>
      <p>{{ deathReason === 'collapse' ? resultTexts?.collapseSubtitle : deathReason === 'survival' ? store.deathReasonText : resultTexts?.gameoverSubtitle }}</p>
      <button @click="restartGame">Заново</button>
    </div>

    <div v-if="store.phase === 'victory'" class="victory-overlay">
      <h1>{{ resultTexts?.victoryTitle ?? 'ВЫ ВЫЖИЛИ' }}</h1>
      <p>{{ resultTexts?.victorySubtitle }}</p>
      <button @click="restartGame">Заново</button>
    </div>
  </div>
</template>

<style scoped>
.game-wrapper {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
}
.map-container {
  width: 100%;
  height: 100%;
}
.game-loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #111;
  z-index: 200;
}
.game-loading-overlay .spinner {
  width: 60px;
  height: 60px;
  border: 4px solid #333;
  border-top-color: #f44;
  border-radius: 50%;
  animation: game-load-spin 1s linear infinite;
  margin-bottom: 2rem;
}
@keyframes game-load-spin {
  to { transform: rotate(360deg); }
}
.game-loading-overlay .loading-text {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: #fff;
  font-family: 'Courier New', monospace;
}
.debug-panel {
  position: absolute;
  left: 0.5rem;
  bottom: 0.5rem;
  cursor: pointer;
  z-index: 150;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.6);
  color: #0f0;
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  line-height: 1.3;
  border-radius: 4px;
}
.hud {
  position: absolute;
  top: 1rem;
  left: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 10;
  font-family: 'Courier New', monospace;
}
.mute-btn {
  margin-top: 0.5rem;
  width: 2.5rem;
  height: 2.5rem;
  background: rgba(0, 0, 0, 0.5);
  border: 2px solid #0ff;
  border-radius: 4px;
  color: #0ff;
  font-size: 1.1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.15s, transform 0.1s;
}
.mute-btn:hover {
  background: rgba(0, 50, 80, 0.7);
}
.mute-btn:active {
  transform: scale(0.92);
}
.hud-status {
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  padding: 0.2rem 0.8rem;
  font-size: 0.85rem;
  line-height: 1;
  border-radius: 6px;
  border-left: 4px solid #666;
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.hud-status span:first-child {
  font-size: 0.7rem;
}
.hud-status span:last-child {
  font-size: 1rem;
}
.status-car     { border-left-color: #48f; }
.status-building { border-left-color: #f60; }
.status-water    { border-left-color: #0af; }
.status-forest   { border-left-color: #2a2; }
.status-park     { border-left-color: #4c4; }
.status-grass    { border-left-color: #8c4; }
.status-road     { border-left-color: #888; }
.status-default  { border-left-color: #666; }
.hack-bar {
  position: relative;
  background: rgba(0,0,0,0.8);
  border: 1px solid #fa0;
  padding: 0.3rem;
  width: 200px;
  height: 2rem;
  overflow: hidden;
}
.hack-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #fa0, #f80);
  transition: width 0.1s linear;
}
.hack-bar span {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.75rem;
  text-shadow: 0 0 4px #000;
}
.fuel-bar {
  position: relative;
  background: rgba(0,0,0,0.8);
  border: 1px solid #48f;
  border-radius: 6px;
  padding: 0.3rem;
  width: 200px;
  height: 2rem;
  overflow: hidden;
}
.fuel-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #48f, #4af);
  transition: width 0.1s linear;
}
.fuel-bar span {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.75rem;
  text-shadow: 0 0 4px #000;
}
.hud-speed {
  background: rgba(0,0,0,0.8);
  color: #0f0;
  padding: 0.3rem 0.8rem;
  font-size: 1rem;
  border: 1px solid #0f0;
  border-radius: 6px;
  text-align: center;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.1rem;
}
.shelter-hud {
  position: absolute;
  top: 3.5rem;
  right: 0.5rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(0,0,0,0.6);
  padding: 0.3rem 0.6rem;
  border: 1px solid #fa0;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
}
.base-hud {
  position: absolute;
  top: 3.5rem;
  right: 0.5rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(0, 0, 0, 0.62);
  padding: 0.3rem 0.6rem;
  border: 1px solid #ffd54a;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
}
.base-compass {
  border-color: #ffd54a;
}
.base-arrow {
  border-bottom-color: #ffd54a;
}
.base-arrow-stem {
  background: #ffd54a;
}
.base-dist {
  color: #ffd54a;
  font-size: 0.8rem;
  letter-spacing: 0.03rem;
}
.shelter-compass {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid #fa0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.shelter-arrow-wrap {
  position: relative;
  width: 3px;
  height: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: transform 0.3s;
}
.shelter-arrow-stem {
  width: 2px;
  height: 12px;
  background: #fa0;
  border-radius: 1px;
}
.shelter-arrow-head {
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 7px solid #fa0;
}
.shelter-dist {
  color: #ff0;
  font-size: 0.8rem;
  letter-spacing: 0.03rem;
}
.sms-container {
  position: absolute;
  bottom: 2rem;
  right: 1rem;
  width: 400px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-end;
}
.sms-message {
  background: rgba(0,0,0,0.85);
  color: #ff0;
  padding: 0.75rem 1rem;
  border-left: 3px solid #ff0;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  line-height: 1.3;
  max-width: 100%;
}
.sms-enter-active {
  transition: all 0.3s ease;
}
.sms-leave-active {
  transition: all 0.5s ease;
}
.sms-enter-from {
  opacity: 0;
  transform: translateX(50px);
}
.sms-leave-to {
  opacity: 0;
  transform: translateX(50px);
}
.splash-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,0,0,0.3);
  z-index: 20;
  animation: flash 0.5s;
}
@keyframes flash {
  0% { background: rgba(255,255,255,0.8); }
  100% { background: rgba(255,0,0,0.3); }
}
.splash-text {
  font-size: 5rem;
  color: #fff;
  text-shadow: 0 0 50px #f44;
  font-family: 'Courier New', monospace;
  letter-spacing: 1rem;
}
.gameover-overlay,
.victory-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.9);
  z-index: 1000;
  color: #fff;
  font-family: 'Courier New', monospace;
}
.dead-sprite {
  width: 96px;
  height: 96px;
  margin-bottom: 0.5rem;
}
.gameover-overlay h1 {
  font-size: 4rem;
  color: #f44;
  margin-bottom: 1rem;
}
.victory-overlay h1 {
  font-size: 4rem;
  color: #0f0;
  margin-bottom: 1rem;
}
.gameover-overlay button,
.victory-overlay button {
  margin-top: 2rem;
  padding: 1rem 3rem;
  font-size: 1.2rem;
  font-family: inherit;
  background: #f44;
  color: #fff;
  border: none;
  cursor: pointer;
}
</style>

<style>
.debug-dev-btn {
  margin-top: 6px;
  width: 100%;
  font-family: inherit;
  font-size: 10px;
  padding: 4px 6px;
  background: rgba(255, 213, 74, 0.12);
  color: #ffd54a;
  border: 1px solid #ffd54a;
  cursor: pointer;
}
.debug-dev-btn:hover { background: rgba(255, 213, 74, 0.25); }

.game-toast {
  position: absolute;
  left: 50%;
  top: 96px;
  transform: translateX(-50%);
  z-index: 900;
  padding: 10px 18px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  letter-spacing: 1px;
  color: #e8f5e9;
  background: rgba(18, 32, 22, 0.94);
  border: 1px solid #4caf50;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}

.backpack-btn {
  margin-top: 6px;
  width: 100%;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  letter-spacing: 1px;
  padding: 7px 10px;
  background: rgba(10, 14, 19, 0.82);
  color: #ffd54a;
  border: 1px solid #ffd54a;
  border-radius: 6px;
  cursor: pointer;
  pointer-events: auto;
}
.backpack-btn:hover {
  background: rgba(34, 30, 12, 0.9);
}

.stats-hud {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 150;
}

.make-base-btn {
  position: absolute;
  right: 18px;
  bottom: 18px;
  z-index: 160;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  letter-spacing: 1px;
  padding: 12px 18px;
  background: rgba(20, 26, 34, 0.92);
  color: #ffd54a;
  border: 1px solid #ffd54a;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
}
.make-base-btn:hover { background: rgba(38, 46, 58, 0.95); }

.open-base-btn {
  position: absolute;
  right: 18px;
  bottom: 18px;
  z-index: 160;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  letter-spacing: 1px;
  padding: 12px 18px;
  background: rgba(28, 34, 20, 0.94);
  color: #b8ff8a;
  border: 1px solid #b8ff8a;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
}
.open-base-btn:hover { background: rgba(44, 54, 32, 0.95); }

.move-base-btn {
  position: absolute;
  right: 18px;
  bottom: 76px;
  z-index: 160;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  letter-spacing: 1px;
  padding: 12px 18px;
  background: rgba(34, 26, 46, 0.94);
  color: #c9a6ff;
  border: 1px solid #c9a6ff;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
}
.move-base-btn:hover { background: rgba(46, 36, 60, 0.96); }

.loot-btn {
  position: absolute;
  right: 18px;
  bottom: 132px;
  z-index: 160;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  letter-spacing: 1px;
  padding: 12px 18px;
  background: rgba(20, 26, 34, 0.94);
  color: #7fd7ff;
  border: 1px solid #7fd7ff;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
}
.loot-btn:hover { background: rgba(30, 42, 54, 0.96); }

.aftermath-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.82);
  z-index: 1000;
  font-family: 'Courier New', monospace;
  padding: 20px;
}
.aftermath-card {
  width: min(560px, 92vw);
  background: #12161c;
  border: 1px solid #3a4654;
  padding: 26px 28px;
  color: #e6edf3;
  text-align: center;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
}
.aftermath-card.narrow { width: min(440px, 92vw); }
.aftermath-card h2 {
  font-size: 15px;
  letter-spacing: 2px;
  margin: 0 0 14px;
  color: #ffd54a;
}
.aftermath-text {
  font-size: 14px;
  line-height: 1.7;
  margin: 0 0 22px;
  color: #dbe4ec;
}
.aftermath-sub {
  font-size: 12px;
  line-height: 1.6;
  color: #93a0ad;
  margin: 0 0 18px;
}
.aftermath-actions { display: flex; gap: 10px; justify-content: center; }
.aftermath-card button {
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 1px;
  padding: 10px 20px;
  background: #1d2733;
  color: #dfe7ef;
  border: 1px solid #3a4654;
  cursor: pointer;
}
.aftermath-card button.primary { border-color: #ffd54a; color: #ffd54a; }
.aftermath-card button:hover { background: #26333f; }
.clean-bar {
  height: 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid #3a4654;
  margin: 6px 0 12px;
}
.clean-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #ffd54a, #ff9f43);
  transition: width 0.15s linear;
}

@keyframes player-idle-anim {
  from { transform: translateY(0); }
  to   { transform: translateY(-100%); }
}
@keyframes player-walk-anim {
  from { transform: translateY(0); }
  to   { transform: translateY(-100%); }
}
@keyframes player-hack-anim {
  from { transform: translateY(0); }
  to   { transform: translateY(-100%); }
}
.idle {
  animation: player-idle-anim 3s steps(10) infinite;
}
.still {
  animation: none;
}
.anim-frozen {
  animation-play-state: paused !important;
}
.walking {
  animation: player-walk-anim 0.58s steps(8) infinite;
}
.walking.running {
  animation: player-walk-anim 0.44s steps(8) infinite;
}
.hacking {
  animation: player-hack-anim 0.9s steps(6) infinite;
}
@keyframes player-door-anim {
  from { transform: translateY(0); }
  to   { transform: translateY(-100%); }
}
.dooring {
  animation: player-door-anim 1.05s steps(6) 1;
}
@keyframes player-swim-anim {
  from { transform: translateY(0); }
  to   { transform: translateY(-100%); }
}
.swimming {
  animation: player-swim-anim 0.9s steps(6) infinite;
}
.dead {
  animation: none;
}
@keyframes car-move-anim {
  from { transform: translateY(-9.090909%); }
  to   { transform: translateY(-100%); }
}
.car-moving {
  animation: car-move-anim 0.8s steps(10) infinite;
}
</style>
