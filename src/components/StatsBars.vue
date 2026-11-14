<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'

const store = useGameStore()

const clamp = (v: number) => Math.max(0, Math.min(100, v))
const health = computed(() => clamp(store.stats.health))
const energy = computed(() => clamp(store.stats.energy))
const satiety = computed(() => clamp(store.stats.satiety))
const water = computed(() => clamp(store.stats.water))
</script>

<template>
  <div class="stats-panel">
    <div class="stat" :class="{ critical: health < 30 }">
      <span class="ico">❤️</span>
      <span class="label">Здоровье</span>
      <div class="bar"><i class="fill health" :style="{ width: health + '%' }" /></div>
      <span class="num">{{ Math.round(health) }}</span>
    </div>
    <div class="stat" :class="{ critical: energy < 20 }">
      <span class="ico">⚡</span>
      <span class="label">Энергия</span>
      <div class="bar"><i class="fill energy" :style="{ width: energy + '%' }" /></div>
      <span class="num">{{ Math.round(energy) }}</span>
    </div>
    <div class="stat" :class="{ critical: satiety < 20 }">
      <span class="ico">🍖</span>
      <span class="label">Сытость</span>
      <div class="bar"><i class="fill satiety" :style="{ width: satiety + '%' }" /></div>
      <span class="num">{{ Math.round(satiety) }}</span>
    </div>
    <div class="stat" :class="{ critical: water < 20 }">
      <span class="ico">💧</span>
      <span class="label">Вода</span>
      <div class="bar"><i class="fill water" :style="{ width: water + '%' }" /></div>
      <span class="num">{{ Math.round(water) }}</span>
    </div>
  </div>
</template>

<style scoped>
.stats-panel {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 12px;
  background: rgba(10, 14, 19, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  font-family: 'Courier New', monospace;
  pointer-events: none;
}
.stat {
  display: grid;
  grid-template-columns: 20px 76px 124px 28px;
  align-items: center;
  gap: 8px;
}
.ico {
  font-size: 15px;
  line-height: 1;
  text-align: center;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.9));
}
.label {
  font-size: 10.5px;
  letter-spacing: 0.5px;
  color: #b8c4d0;
  text-transform: uppercase;
}
.bar {
  height: 13px;
  background: rgba(0, 0, 0, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 7px;
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  border-radius: 6px;
  transition: width 0.35s linear;
  box-shadow: inset 0 -3px 5px rgba(0, 0, 0, 0.28);
}
.health { background: linear-gradient(90deg, #ff3b3b, #ff7a5c); }
.energy { background: linear-gradient(90deg, #7d6bff, #b3a6ff); }
.satiety { background: linear-gradient(90deg, #d99414, #ffce4f); }
.water { background: linear-gradient(90deg, #2a8ec9, #6ed2ff); }
.num {
  font-size: 12px;
  font-weight: bold;
  color: #fff;
  text-align: right;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}
.stat.critical .fill { animation: pulse 1.1s ease-in-out infinite; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
