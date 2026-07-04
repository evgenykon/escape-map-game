<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '@/stores/game'
import type { SMSEntry } from '@/scenarios/types'
import { MapEngine } from '@/engine/MapEngine'
import { PlayerController } from '@/engine/PlayerController'
import { soundEngine } from '@/engine/SoundEngine'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const store = useGameStore()
const mapContainer = ref<HTMLDivElement>()
const hudTimeLeft = ref(0)
const gameReady = ref(false)
const hudSms = ref<{ id: number; text: string; visible: boolean }[]>([])
const showSplash = ref(false)
const splashText = ref('')
const currentFuel = computed(() => {
  const car = store.cars.find(c => c.id === store.activeCarId)
  return car?.fuel ?? 0
})

let mapEngine: MapEngine
let playerController: PlayerController
let timerInterval: ReturnType<typeof setInterval>
let shelterInterval: ReturnType<typeof setInterval>
let carInfoInterval: ReturnType<typeof setInterval>
const smsTimeouts: ReturnType<typeof setTimeout>[] = []
const spawnValidationTimeouts: ReturnType<typeof setTimeout>[] = []

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

const smsTexts = computed<SMSEntry[]>(() => store.scenario?.smsTexts ?? [])
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
    scheduleSMS()
    setTimeout(() => { gameReady.value = true }, 1000)
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
  smsTimeouts.forEach(clearTimeout)
  spawnValidationTimeouts.forEach(clearTimeout)
  mapEngine?.destroy()
})

function debugSetTimer(sec: number) {
  console.log('[debugSetTimer]', sec)
  store.timeLeft = sec
  hudTimeLeft.value = sec
}

function startTimer() {
  store.timeLeft = store.timerMinutes * 60
  hudTimeLeft.value = store.timeLeft

  timerInterval = setInterval(() => {
    store.timeLeft--
    hudTimeLeft.value = store.timeLeft

    if (store.timeLeft === 30) {
      soundEngine.startNuclearDangerLoop()
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

function scheduleSMS() {
  const entries = smsTexts.value
  if (entries.length === 0) return

  for (const entry of entries) {
    const delayMs = entry.timeSec * 1000
    const id = setTimeout(() => {
      if (store.phase !== 'playing') return
      showSMS(entry.text)
      soundEngine.playIncomingMessage()
      if (entry.triggerShelterHud) store.shelterHudVisible = true
    }, delayMs)
    smsTimeouts.push(id)
  }
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

function triggerExplosion() {
  if (store.phase !== 'playing') return
  store.phase = 'explosion'
  mapEngine.setMarkersVisible(false)
  playerController.stop()
  soundEngine.stopAllLoops()

  hudTimeLeft.value = 0
  if (explosionTimer) clearInterval(explosionTimer)
  explosionTimer = setInterval(() => { hudTimeLeft.value++ }, 1000)

  const pos = playerController.getPosition()
  const dlat = (pos.lat - store.epicenterLatitude) * 111320
  const dlng = (pos.lng - store.epicenterLongitude) * 111320 * Math.cos(pos.lat * Math.PI / 180)
  store.playerDistFromEpicenter = Math.sqrt(dlat * dlat + dlng * dlng)

  mapEngine.flyToEpicenter(store.epicenterLongitude, store.epicenterLatitude, () => {
    setTimeout(() => {
      soundEngine.playExplosion()
      mapEngine.showExplosion(store.epicenterLongitude, store.epicenterLatitude, store.explosionRadius)
      mapEngine.showShockwave(store.epicenterLongitude, store.epicenterLatitude, store.explosionRadius)
      setTimeout(() => mapEngine.flyToZoom(11), 3000)

      setTimeout(() => {
        mapEngine.setMarkersVisible(true)
        mapEngine.setPlayerFrame('idle')
        mapEngine.flyToPlayer(pos.lat, pos.lng, () => {
          setTimeout(() => {
            mapEngine.setMarkersVisible(false)
            checkGameResult()
          }, 10000)
        })
      }, 20000)
    }, 2000)
  })
}

function checkGameResult() {
  if (store.isInShelter) {
    store.phase = 'victory'
  } else if (store.playerDistFromEpicenter > store.explosionRadius) {
    store.phase = 'victory'
  } else {
    store.phase = 'gameover'
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
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
  store.timeLeft = 0
  hudTimeLeft.value = 0
  hudSms.value = []
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

    <div v-if="isDev" class="debug-panel" @click="debugSetTimer(15)">
      <div>{{ store.phase === 'explosion' ? '-' : '' }}{{ formatTime(hudTimeLeft) }}</div>
      <div>zoom: {{ debugZoom.toFixed(2) }}</div>
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

      <div class="hud-status">
        <span v-if="store.isInCar">🚗 В машине</span>
        <span v-else>🚶 Пешком</span>
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
          <div class="shelter-arrow-stem"></div>
          <div class="shelter-arrow-head"></div>
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

    <div v-if="store.phase === 'gameover'" class="gameover-overlay">
      <h1>{{ resultTexts?.gameoverTitle ?? 'GAME OVER' }}</h1>
      <p>{{ resultTexts?.gameoverSubtitle }}</p>
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
  background: rgba(0,0,0,0.7);
  color: #fff;
  padding: 0.3rem 0.8rem;
  font-size: 0.9rem;
  border: 1px solid #444;
}
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
  text-align: center;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.1rem;
}
.shelter-hud {
  position: absolute;
  bottom: 8rem;
  right: 1rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: rgba(0,0,0,0.75);
  padding: 0.75rem 1rem;
  border: 1px solid #fa0;
  font-family: 'Courier New', monospace;
}
.shelter-compass {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid #fa0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.shelter-arrow-wrap {
  position: relative;
  width: 4px;
  height: 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: transform 0.3s;
}
.shelter-arrow-stem {
  width: 3px;
  height: 22px;
  background: #fa0;
  border-radius: 1px;
}
.shelter-arrow-head {
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 10px solid #fa0;
  margin-top: -1px;
}
.shelter-dist {
  color: #ff0;
  font-size: 1.1rem;
  letter-spacing: 0.05rem;
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
.walking {
  animation: player-walk-anim 0.6s steps(6) infinite;
}
.walking.running {
  animation: player-walk-anim 0.3s steps(6) infinite;
}
.hacking {
  animation: player-hack-anim 1s steps(4) infinite;
}
</style>
