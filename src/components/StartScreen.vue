<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '@/stores/game'
import { scenarioRegistry } from '@/scenarios'

const BUILD_TAG = 'build-2026-07-02-r2'

const store = useGameStore()
const selectedId = ref<string | null>(scenarioRegistry[0]?.meta.id ?? null)
const isStarting = ref(false)

async function startGame() {
  if (!selectedId.value || isStarting.value) return
  isStarting.value = true
  store.selectedScenarioId = selectedId.value

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

  store.phase = 'loading'
  isStarting.value = false
}
</script>

<template>
  <div class="start-screen">
    <h1 class="title">ESCAPE MAP GAME</h1>
    <p class="subtitle">Симуляция побега из опасной зоны, которой становится ваш дом.</p>

    <div class="scenarios">
      <p class="label">Выберите сценарий:</p>
      <div class="scenario-list">
        <button
          v-for="entry in scenarioRegistry"
          :key="entry.meta.id"
          :class="['scenario', { selected: selectedId === entry.meta.id }]"
          @click="selectedId = entry.meta.id"
        >
          <span v-if="entry.meta.icon" class="icon">{{ entry.meta.icon }}</span>
          <span class="text">
            <span class="scenario-title">{{ entry.meta.title }}</span>
            <span class="scenario-desc">{{ entry.meta.description }}</span>
          </span>
        </button>
      </div>
    </div>

    <button
      class="start-btn"
      :disabled="!selectedId || isStarting"
      @click="startGame"
    >
      {{ isStarting ? 'ЗАГРУЗКА…' : 'СТАРТ' }}
    </button>

    <p class="build-tag">{{ BUILD_TAG }}</p>
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
  padding: 2rem;
  box-sizing: border-box;
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
  text-align: center;
  max-width: 520px;
}
.scenarios {
  width: 100%;
  max-width: 520px;
  margin-bottom: 2rem;
}
.label {
  margin-bottom: 0.75rem;
  font-size: 1.2rem;
  text-align: center;
}
.scenario-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.scenario {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: #1a1a1a;
  color: #fff;
  border: 1px solid #333;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: all 0.15s;
}
.scenario:hover {
  background: #222;
  border-color: #555;
}
.scenario.selected {
  background: rgba(255, 68, 68, 0.15);
  border-color: #f44;
  box-shadow: 0 0 12px rgba(255, 68, 68, 0.4);
}
.icon {
  font-size: 2rem;
  line-height: 1;
}
.text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.scenario-title {
  font-size: 1.1rem;
  letter-spacing: 0.05rem;
}
.scenario-desc {
  font-size: 0.8rem;
  opacity: 0.7;
  line-height: 1.3;
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
.start-btn:hover:not(:disabled) {
  background: #d33;
  box-shadow: 0 0 30px #f44;
}
.start-btn:disabled {
  background: #444;
  cursor: not-allowed;
  opacity: 0.5;
}
.build-tag {
  position: absolute;
  bottom: 0.5rem;
  right: 0.75rem;
  opacity: 0.3;
  font-size: 0.7rem;
}
</style>
