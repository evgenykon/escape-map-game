<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore, type Difficulty } from '@/stores/game'

const store = useGameStore()
const selectedDifficulty = ref<Difficulty>('normal')

const difficulties: { key: Difficulty; label: string; time: number }[] = [
  { key: 'easy', label: 'Лёгкая', time: 10 },
  { key: 'normal', label: 'Нормальная', time: 7 },
  { key: 'hard', label: 'Сложная', time: 5 },
  { key: 'custom', label: 'Custom', time: 0 },
]

const radiusMap: Record<string, number> = { easy: 800, normal: 1000, hard: 1500 }

const effectiveTime = computed(() => {
  if (selectedDifficulty.value === 'custom') return store.customTimerMinutes
  return difficulties.find(d => d.key === selectedDifficulty.value)!.time
})

async function startGame() {
  if (selectedDifficulty.value === 'custom') {
    store.difficulty = 'custom'
    store.timerMinutes = store.customTimerMinutes
    store.explosionRadius = store.customExplosionRadius
  } else {
    store.difficulty = selectedDifficulty.value
    store.timerMinutes = effectiveTime.value
    store.explosionRadius = radiusMap[selectedDifficulty.value]
  }

  store.playerLatitude = 55.7558
  store.playerLongitude = 37.6173

  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject,
        { enableHighAccuracy: true, timeout: 10000 })
    })
    store.playerLatitude = pos.coords.latitude
    store.playerLongitude = pos.coords.longitude
  } catch {
    // fallback to Moscow coordinates
  }

  const angle = Math.random() * 2 * Math.PI
  const dlat = (1 / 111.32) * Math.cos(angle)
  const dlng = (1 / (111.32 * Math.cos(store.playerLatitude * Math.PI / 180))) * Math.sin(angle)
  store.epicenterLatitude = store.playerLatitude + dlat
  store.epicenterLongitude = store.playerLongitude + dlng

  store.phase = 'loading'
}
</script>

<template>
  <div class="start-screen">
    <h1 class="title">ESCAPE MAP GAME</h1>
    <p class="subtitle">Симуляция побега из опасной зоны, которой становится ваш дом.</p>

    <div class="difficulty-select">
      <p class="label">Сложность:</p>
      <div class="buttons">
        <button
          v-for="d in difficulties"
          :key="d.key"
          :class="{ selected: selectedDifficulty === d.key }"
          @click="selectedDifficulty = d.key"
        >
          {{ d.label }}{{ d.time ? ` (${d.time} мин)` : '' }}
        </button>
      </div>
    </div>

    <div v-if="selectedDifficulty === 'custom'" class="custom-options">
      <div class="option">
        <label>Время до взрыва: <strong>{{ store.customTimerMinutes }} мин</strong></label>
        <input type="range" min="3" max="20" step="1" v-model.number="store.customTimerMinutes">
      </div>
      <div class="option">
        <label>Радиус поражения: <strong>{{ store.customExplosionRadius }} м</strong></label>
        <input type="range" min="500" max="3000" step="100" v-model.number="store.customExplosionRadius">
      </div>
      <div class="option">
        <label>Удалённость убежищ: <strong>{{ store.customShelterKm }} км</strong></label>
        <input type="range" min="1" max="20" step="0.5" v-model.number="store.customShelterKm">
      </div>
      <div class="option">
        <label>Время взлома: <strong>{{ store.customHackSec }} сек</strong></label>
        <input type="range" min="3" max="60" step="1" v-model.number="store.customHackSec">
      </div>
      <div class="option">
        <label>Объём топлива: <strong>{{ Math.round(store.customFuelAmount * 100) }}%</strong></label>
        <input type="range" min="0.1" max="1" step="0.05" v-model.number="store.customFuelAmount">
      </div>
      <div class="option">
        <label>Количество машин: <strong>{{ store.customCarCount }}</strong></label>
        <input type="range" min="3" max="30" step="1" v-model.number="store.customCarCount">
      </div>
    </div>

    <button class="start-btn" @click="startGame">СТАРТ</button>
    <p class="info">Время: {{ effectiveTime }} мин</p>
  </div>
</template>

<style scoped>
.start-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #111;
  color: #fff;
  font-family: 'Courier New', monospace;
}
.title {
  font-size: 3rem;
  letter-spacing: 0.5rem;
  margin-bottom: 0.5rem;
  color: #f44;
  text-shadow: 0 0 20px #f44;
}
.subtitle {
  margin-bottom: 2rem;
  opacity: 0.7;
}
.difficulty-select {
  margin-bottom: 1rem;
  text-align: center;
}
.label {
  margin-bottom: 0.5rem;
  font-size: 1.2rem;
}
.buttons {
  display: flex;
  gap: 1rem;
}
.buttons button {
  padding: 0.75rem 1.5rem;
  background: #222;
  color: #fff;
  border: 1px solid #444;
  cursor: pointer;
  font-family: inherit;
  font-size: 1rem;
  transition: all 0.2s;
}
.buttons button:hover {
  background: #333;
}
.buttons button.selected {
  background: #f44;
  border-color: #f44;
}
.custom-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  width: 360px;
}
.option {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.option label {
  font-size: 0.85rem;
  opacity: 0.9;
}
.option input[type="range"] {
  width: 100%;
  accent-color: #f44;
}
.start-btn {
  padding: 1rem 3rem;
  font-size: 1.5rem;
  font-family: inherit;
  background: #f44;
  color: #fff;
  border: none;
  cursor: pointer;
  letter-spacing: 0.3rem;
  transition: all 0.2s;
}
.start-btn:hover {
  background: #d33;
  box-shadow: 0 0 30px #f44;
}
.info {
  margin-top: 0.5rem;
  opacity: 0.5;
  font-size: 0.85rem;
}
</style>
