<script setup lang="ts">
import { onMounted } from 'vue'
import { useGameStore } from '@/stores/game'
import { loadScenarioData } from '@/engine/OverpassLoader'
import { loadScenario } from '@/scenarios'

const store = useGameStore()

onMounted(async () => {
  if (!store.selectedScenarioId) {
    store.phase = 'start'
    return
  }
  try {
    const scenario = await loadScenario(store.selectedScenarioId)
    store.scenario = scenario
    await loadScenarioData(scenario)
    store.phase = 'playing'
  } catch (e) {
    console.error('Ошибка загрузки сценария', e)
    store.phase = 'start'
  }
})
</script>

<template>
  <div class="loading-screen">
    <div class="spinner"></div>
    <p class="loading-text">{{ store.loadingMessage }}</p>
    <p v-if="store.scenario" class="loading-sub">
      Сценарий: {{ store.scenario.config.title }}
    </p>
  </div>
</template>

<style scoped>
.loading-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #111;
  color: #fff;
  font-family: 'Courier New', monospace;
}
.spinner {
  width: 60px;
  height: 60px;
  border: 4px solid #333;
  border-top-color: #f44;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 2rem;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.loading-text {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}
.loading-sub {
  opacity: 0.5;
}
</style>
