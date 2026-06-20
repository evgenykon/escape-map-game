<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore, type Difficulty } from '@/stores/game'

const store = useGameStore()
const selectedDifficulty = ref<Difficulty>('normal')

const difficulties: { key: Difficulty; label: string; time: number }[] = [
  { key: 'easy', label: 'Лёгкая', time: 10 },
  { key: 'normal', label: 'Нормальная', time: 7 },
  { key: 'hard', label: 'Сложная', time: 5 },
]

function startGame() {
  const diff = difficulties.find(d => d.key === selectedDifficulty.value)!
  store.difficulty = selectedDifficulty.value
  store.timerMinutes = diff.time

  store.playerLatitude = 55.7558
  store.playerLongitude = 37.6173

  const angle = Math.random() * 2 * Math.PI
  const dlat = (1 / 111.32) * Math.cos(angle)
  const dlng = (1 / (111.32 * Math.cos(store.playerLatitude * Math.PI / 180))) * Math.sin(angle)
  store.epicenterLatitude = store.playerLatitude + dlat
  store.epicenterLongitude = store.playerLongitude + dlng

  store.phase = 'loading'

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      store.playerLatitude = pos.coords.latitude
      store.playerLongitude = pos.coords.longitude
      store.epicenterLatitude = store.playerLatitude + dlat
      store.epicenterLongitude = store.playerLongitude + dlng
    },
    () => {},
    { enableHighAccuracy: true, timeout: 10000 }
  )
}
</script>

<template>
  <div class="start-screen">
    <h1 class="title">ESCAPE MAP GAME</h1>
    <p class="subtitle">Ядерный апокалипсис. Спаси себя.</p>

    <div class="difficulty-select">
      <p class="label">Сложность:</p>
      <div class="buttons">
        <button
          v-for="d in difficulties"
          :key="d.key"
          :class="{ selected: selectedDifficulty === d.key }"
          @click="selectedDifficulty = d.key"
        >
          {{ d.label }} ({{ d.time }} мин)
        </button>
      </div>
    </div>

    <button class="start-btn" @click="startGame">СТАРТ</button>
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
  margin-bottom: 2rem;
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
</style>
