<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'

const store = useGameStore()

const clamp = (v: number) => Math.max(0, Math.min(100, v))
const health = computed(() => clamp(store.stats.health))
const fatigue = computed(() => clamp(store.stats.fatigue))
const hunger = computed(() => clamp(store.stats.hunger))
const thirst = computed(() => clamp(store.stats.thirst))
</script>

<template>
  <div class="stats-bars">
    <div class="stat" title="Здоровье">
      <span class="ico">❤</span>
      <div class="bar"><i class="fill health" :style="{ width: health + '%' }" /></div>
      <span class="num">{{ Math.round(health) }}</span>
    </div>
    <div class="stat" title="Усталость">
      <span class="ico">💤</span>
      <div class="bar"><i class="fill fatigue" :style="{ width: fatigue + '%' }" /></div>
      <span class="num">{{ Math.round(fatigue) }}</span>
    </div>
    <div class="stat" title="Голод">
      <span class="ico">🍖</span>
      <div class="bar"><i class="fill hunger" :style="{ width: hunger + '%' }" /></div>
      <span class="num">{{ Math.round(hunger) }}</span>
    </div>
    <div class="stat" title="Жажда">
      <span class="ico">💧</span>
      <div class="bar"><i class="fill thirst" :style="{ width: thirst + '%' }" /></div>
      <span class="num">{{ Math.round(thirst) }}</span>
    </div>
  </div>
</template>

<style scoped>
.stats-bars {
  display: flex;
  flex-direction: column;
  gap: 4px;
  pointer-events: none;
  font-family: 'Courier New', monospace;
}
.stat {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ico {
  font-size: 11px;
  width: 14px;
  text-align: center;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
}
.bar {
  width: 108px;
  height: 7px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 4px;
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  transition: width 0.35s linear;
}
.health { background: linear-gradient(90deg, #ff4d4d, #ff8a5c); }
.fatigue { background: linear-gradient(90deg, #8f7bff, #b9a8ff); }
.hunger { background: linear-gradient(90deg, #e0a020, #ffd166); }
.thirst { background: linear-gradient(90deg, #2f9bd6, #6fd3ff); }
.num {
  font-size: 10px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
  width: 22px;
}
</style>
