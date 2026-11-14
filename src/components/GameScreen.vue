<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '@/stores/game'
import type { TimelineEvent } from '@/scenarios/types'
import { MapEngine } from '@/engine/MapEngine'
import { PlayerController } from '@/engine/PlayerController'
import { soundEngine } from '@/engine/SoundEngine'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import StatsBars from '@/components/StatsBars.vue'
import BaseDialog from '@/components/BaseDialog.vue'

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
const nearBase = ref(false)
const roomsPreview = ref(1)
const cleaningUi = ref({ active: false, progress: 0, rooms: 0 })
let statsInterval: ReturnType<typeof setInterval> | null = null
let buildingInterval: ReturnType<typeof setInterval> | null = null
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
      if (store.devAftermath) {
        if (timerInterval) clearInterval(timerInterval)
        if (explosionTimer) clearInterval(explosionTimer)
        store.timeLeft = 0
        hudTimeLeft.value = 0
        startSurvival(false)
      }
    }, 3000)
  })

  playerController = new PlayerController(mapEngine)
  playerController.start()
  shelterInterval = setInterval(updateShelterInfo, 500)
  carInfoInterval = setInterval(() => {
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

function roomsForArea(areaM2: number): number {
  if (areaM2 < 200) return 1
  if (areaM2 < 400) return 3
  if (areaM2 < 700) return 5
  if (areaM2 < 1200) return 7
  return 10
}

function isAtBase(): boolean {
  const b = store.base
  if (!b || !playerController) return false
  const pos = playerController.getPosition()
  return haversine(pos.lat, pos.lng, b.latitude, b.longitude) < 30
}

function startSurvival(showNotice = true) {
  store.isAftermath = true
  store.phase = 'aftermath'
  store.stats = { health: 100, fatigue: 35, hunger: 70, thirst: 60 }
  showAftermathNotice.value = showNotice
  mapEngine?.clearWorldObjects()
  store.cars = []
  store.shelters = []
  store.shelterHudVisible = false
  store.isInCar = false
  store.activeCarId = null
  store.fuelStationsDisabled = true
  if (statsInterval) clearInterval(statsInterval)
  statsInterval = setInterval(tickSurvival, 1000)
  if (buildingInterval) clearInterval(buildingInterval)
  buildingInterval = setInterval(updateBasePrompt, 600)
}

function tickSurvival() {
  if (!store.isAftermath || store.phase !== 'aftermath') return
  const s = store.stats
  const inBase = isAtBase()
  s.hunger = Math.max(0, s.hunger - 0.18)
  s.thirst = Math.max(0, s.thirst - 0.22)
  s.fatigue = Math.min(100, s.fatigue + (inBase ? 0.04 : 0.12))
  let damage = 0
  if (s.hunger <= 0) damage += 1.2
  if (s.thirst <= 0) damage += 1.4
  if (s.fatigue >= 100) damage += 0.4
  if (damage > 0) {
    s.health = Math.max(0, s.health - damage)
  } else if (inBase) {
    s.health = Math.min(100, s.health + 0.15)
  }
  if (s.health <= 0) {
    store.deathReasonText = s.thirst <= 0 ? 'Вы погибли от обезвоживания.' : 'Вы погибли от истощения.'
    deathReason.value = 'survival'
    store.phase = 'gameover'
    if (statsInterval) { clearInterval(statsInterval); statsInterval = null }
    if (buildingInterval) { clearInterval(buildingInterval); buildingInterval = null }
  }
}

function updateBasePrompt() {
  if (store.phase !== 'aftermath' || !playerController || !mapEngine) return
  const pos = playerController.getPosition()
  const atBase = isAtBase()
  if (nearBase.value && !atBase) baseDismissed = false
  nearBase.value = atBase
  const devAnywhere = import.meta.env.DEV && store.devAftermath
  canMakeBase.value = !store.base && !store.isInCar && (devAnywhere || mapEngine.isInsideBuilding(pos.lng, pos.lat))
  if (atBase && !baseDialogOpen.value && !baseDismissed && !cleaningUi.value.active) {
    baseDialogOpen.value = true
  }
}

function openBaseConfirm() {
  if (!mapEngine || !playerController) return
  const pos = playerController.getPosition()
  roomsPreview.value = roomsForArea(mapEngine.getBuildingAreaAt(pos.lng, pos.lat) ?? 250)
  showBaseConfirm.value = true
}

function confirmMakeBase() {
  showBaseConfirm.value = false
  if (!mapEngine || !playerController) return
  const pos = playerController.getPosition()
  const areaM2 = mapEngine.getBuildingAreaAt(pos.lng, pos.lat) ?? 250
  const rooms = roomsForArea(areaM2)
  const totalMs = rooms * 15 * 1000
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
  store.base = {
    latitude: lat,
    longitude: lng,
    rooms,
    resources: {
      food: 2 + rooms,
      water: 2 + rooms,
      materials: rooms,
      fuel: 1,
      medicine: Math.max(1, Math.floor(rooms / 2)),
      energy: 10,
    },
    objects: [],
  }
  mapEngine?.setBaseMarker(lng, lat)
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
  store.deathReasonText = null
  showAftermathNotice.value = false
  showBaseConfirm.value = false
  baseDialogOpen.value = false
  canMakeBase.value = false
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
    </div>

    <button v-if="canMakeBase" class="make-base-btn" @click="openBaseConfirm">
      ★ Сделать базой
    </button>

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
        <h2>Сделать здание вашей базой?</h2>
        <p class="aftermath-sub">
          Потребуется расчистить помещения: {{ roomsPreview }} комн. × 15 с.
          Внутри можно хранить найденные вещи, отдыхать и лечиться.
        </p>
        <div class="aftermath-actions">
          <button @click="showBaseConfirm = false">Отмена</button>
          <button class="primary" @click="confirmMakeBase">Подтвердить</button>
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
  z-index: 100;
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
  z-index: 30;
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
.stats-hud {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 25;
}

.make-base-btn {
  position: absolute;
  right: 18px;
  bottom: 18px;
  z-index: 28;
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

.aftermath-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.82);
  z-index: 35;
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
.walking {
  animation: player-walk-anim 0.58s steps(8) infinite;
}
.walking.running {
  animation: player-walk-anim 0.44s steps(8) infinite;
}
.hacking {
  animation: player-hack-anim 0.9s steps(6) infinite;
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
