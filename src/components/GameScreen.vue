<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
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

let mapEngine: MapEngine
let playerController: PlayerController
let timerInterval: ReturnType<typeof setInterval>
const smsTimeouts: ReturnType<typeof setTimeout>[] = []

const smsTexts = [
  'Сообщение: Внимание! Чрезвычайная ситуация! Зафиксирован запуск ракеты в сторону нашего региона!',
  'Сообщение: Внимание! По оценкам МО ракета, выпушенная по нашему региону, может нести ядерный заряд!',
  'Друг: Привет! Видел объявление? Ты где? Мы собираемся сваливать подальше на восток.',
  'Сообщение: Внимание! Не пользуйтесь лифтами. Отключите газ и электричество. Сохраняйте спокойствие.',
  'Сообщение: Если вы не успеваете достигнуть убежища, ищите здания с глубокими подвалами.',
  'ПВО и спасательные службы работают. Избегайте паники и мест скопления людей и машин. Ждите дальнейших инструкций.',
  'Внимание! Опасайтесь оставаться на улицах! Немедленно найдите укрытие!',
  'Внимание! Не покидайте убежище.',
]

onMounted(() => {
  mapEngine = new MapEngine()
  mapEngine.init(mapContainer.value!)

  playerController = new PlayerController(mapEngine)
  playerController.start()

  startTimer()
  scheduleSMS()
})

onUnmounted(() => {
  playerController.stop()
  clearInterval(timerInterval)
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
  const totalSeconds = store.timerMinutes * 60
  const baseDelays = [10, 25, 45, 70, 100, 140, 180, 230]
  const maxBaseDelay = 230
  const scale = Math.max(0.3, (totalSeconds * 0.8) / maxBaseDelay)
  const delays = baseDelays.map(d => Math.round(d * scale * 1000))

  showSMS(smsTexts[0])

  delays.slice(1).forEach((delay, i) => {
    const id = setTimeout(() => {
      if (store.phase !== 'playing') return
      showSMS(smsTexts[i + 1])
    }, delay)
    smsTimeouts.push(id)
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
  showSplash.value = true
  splashText.value = 'ВЗРЫВ'

  const radius = store.explosionRadius
  mapEngine.showExplosion(store.epicenterLongitude, store.epicenterLatitude, radius)

  setTimeout(() => {
    showSplash.value = false
  }, 5000)
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
