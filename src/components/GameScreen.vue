<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '@/stores/game'
import { MapEngine } from '@/engine/MapEngine'
import { PlayerController } from '@/engine/PlayerController'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const store = useGameStore()
const mapContainer = ref<HTMLDivElement>()
const hudTimeLeft = ref(0)
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
const smsTimeouts: ReturnType<typeof setTimeout>[] = []

const shelterHeading = ref(0)
const shelterDist = ref(0)

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

const smsTexts = [
  'Сообщение: Внимание! Чрезвычайная ситуация! Зафиксирован запуск ракеты в сторону нашего региона!',
  'Сообщение: Внимание! По оценкам МО ракета, выпушенная по нашему региону, может нести ядерный заряд!',
  'Друг: Привет! Видел объявление? Ты где? Мы собираемся сваливать подальше на восток.',
  'Сообщение: Внимание! Не пользуйтесь лифтами. Отключите газ и электричество. Сохраняйте спокойствие.',
  'Сообщение: Экстренные службы открыли убежища. Следуйте указателям на карте.',
  'Сообщение: Если вы не успеваете достигнуть убежища, ищите здания с глубокими подвалами.',
  'ПВО и спасательные службы работают. Избегайте паники и мест скопления людей и машин. Ждите дальнейших инструкций.',
  'Внимание! Опасайтесь оставаться на улицах! Немедленно найдите укрытие!',
  'Внимание! Не покидайте убежище.',
]

onMounted(() => {
  mapEngine = new MapEngine()
  mapEngine.init(mapContainer.value!)
  mapEngine.onReady(() => {
    startTimer()
    scheduleSMS()
  })

  playerController = new PlayerController(mapEngine)
  playerController.start()
  shelterInterval = setInterval(updateShelterInfo, 500)
})

onUnmounted(() => {
  playerController.stop()
  clearInterval(timerInterval)
  clearInterval(shelterInterval)
  smsTimeouts.forEach(clearTimeout)
  mapEngine?.destroy()
})

function startTimer() {
  store.timeLeft = store.timerMinutes * 60
  hudTimeLeft.value = store.timeLeft

  timerInterval = setInterval(() => {
    store.timeLeft--
    hudTimeLeft.value = store.timeLeft

    if (store.timeLeft <= 0) {
      clearInterval(timerInterval)
      triggerExplosion()
    }
  }, 1000)
}

function scheduleSMS() {
  const totalMs = store.timerMinutes * 60 * 1000
  const count = smsTexts.length
  const gap = totalMs * 0.85 / (count - 1)

  smsTexts.forEach((text, i) => {
    if (i === 0) {
      showSMS(text)
    } else {
      const id = setTimeout(() => {
        if (store.phase !== 'playing') return
        showSMS(text)
        if (i === 4) store.shelterHudVisible = true
      }, Math.round(gap * i))
      smsTimeouts.push(id)
    }
  })
}

function showSMS(text: string) {
  const id = Date.now()
  hudSms.value.push({ id, text, visible: true })

  setTimeout(() => {
    const msg = hudSms.value.find(m => m.id === id)
    if (msg) msg.visible = false
  }, 8000)
}

function triggerExplosion() {
  playerController.stop()

  const pos = playerController.getPosition()
  const dlat = (pos.lat - store.epicenterLatitude) * 111320
  const dlng = (pos.lng - store.epicenterLongitude) * 111320 * Math.cos(pos.lat * Math.PI / 180)
  store.playerDistFromEpicenter = Math.sqrt(dlat * dlat + dlng * dlng)

  showSplash.value = true
  splashText.value = 'ВЗРЫВ'
  setTimeout(() => { showSplash.value = false }, 1000)

  mapEngine.fitBounds(
    store.epicenterLongitude, store.epicenterLatitude,
    pos.lng, pos.lat,
    120
  )

  setTimeout(() => {
    const radius = store.explosionRadius
    mapEngine.showExplosion(store.epicenterLongitude, store.epicenterLatitude, radius)
  }, 1600)

  setTimeout(() => {
    if (store.phase !== 'playing') return
    checkGameResult()
  }, 10000)
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

function restartGame() {
  store.phase = 'start'
}
</script>

<template>
  <div class="game-wrapper">
    <div ref="mapContainer" class="map-container"></div>

    <div class="hud">
      <div class="hud-time" :class="{ warning: store.timeLeft < 60 }">
        {{ formatTime(hudTimeLeft) }}
      </div>

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
      <h1>GAME OVER</h1>
      <p>Вы не успели укрыться от взрыва.</p>
      <button @click="restartGame">Заново</button>
    </div>

    <div v-if="store.phase === 'victory'" class="victory-overlay">
      <h1>ВЫ ВЫЖИЛИ</h1>
      <p>Вы укрылись в убежище вовремя.</p>
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
.hud-time {
  background: rgba(0,0,0,0.7);
  color: #0f0;
  padding: 0.5rem 1rem;
  font-size: 2rem;
  letter-spacing: 0.2rem;
  border: 1px solid #0f0;
}
.hud-time.warning {
  color: #f44;
  border-color: #f44;
  animation: blink 0.5s infinite;
}
@keyframes blink {
  50% { opacity: 0.5; }
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
