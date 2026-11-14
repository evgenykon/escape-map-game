<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'

const store = useGameStore()
const emit = defineEmits<{ (e: 'close'): void }>()

const rooms = computed(() => Array.from({ length: store.base?.rooms ?? 0 }, (_, i) => i + 1))

const resources = computed(() => {
  const r = store.base?.resources
  if (!r) return []
  return [
    { key: 'food', icon: '🍖', label: 'Еда', value: r.food },
    { key: 'water', icon: '💧', label: 'Вода', value: r.water },
    { key: 'materials', icon: '🧱', label: 'Материалы', value: r.materials },
    { key: 'fuel', icon: '⛽', label: 'Топливо', value: r.fuel },
    { key: 'medicine', icon: '💊', label: 'Медицина', value: r.medicine },
    { key: 'energy', icon: '⚡', label: 'Энергия', value: r.energy },
  ]
})

const stats = computed(() => store.stats)

function eat() {
  const r = store.base?.resources
  if (!r || r.food <= 0) return
  r.food -= 1
  store.stats.satiety = Math.min(100, store.stats.satiety + 50)
}

function drink() {
  const r = store.base?.resources
  if (!r || r.water <= 0) return
  r.water -= 1
  store.stats.water = Math.min(100, store.stats.water + 50)
}

function rest() {
  store.stats.energy = Math.min(100, store.stats.energy + 60)
  store.stats.health = Math.min(100, store.stats.health + 10)
}

function heal() {
  const r = store.base?.resources
  if (!r || r.medicine <= 0) return
  r.medicine -= 1
  store.stats.health = Math.min(100, store.stats.health + 40)
}
</script>

<template>
  <div class="base-backdrop" @click.self="emit('close')">
    <div class="base-dialog">
      <header>
        <h2>ОПОРНАЯ ТОЧКА</h2>
        <span class="rooms-count">{{ store.base?.rooms }} комн.</span>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <div class="body">
        <section class="plan">
          <h3>Схема помещений</h3>
          <div class="rooms" :class="{ wide: rooms.length > 6 }">
            <div v-for="n in rooms" :key="n" class="room">
              <span class="room-num">{{ n }}</span>
              <span class="room-state">расчищено</span>
            </div>
          </div>
          <h3 class="objects-title">Установленные объекты</h3>
          <div v-if="!store.base?.objects.length" class="empty">
            Пока пусто. Здесь появятся койка, верстак, фильтр воды и прочее.
          </div>
          <ul v-else class="objects">
            <li v-for="(obj, i) in store.base?.objects" :key="i">{{ obj }}</li>
          </ul>
        </section>

        <aside class="side">
          <h3>Ресурсы</h3>
          <ul class="res">
            <li v-for="res in resources" :key="res.key">
              <span class="res-ico">{{ res.icon }}</span>
              <span class="res-label">{{ res.label }}</span>
              <span class="res-val">{{ res.value }}</span>
            </li>
          </ul>

          <h3>Состояние</h3>
          <div class="mini">
            <div class="mini-row"><span>Здоровье</span><b>{{ Math.round(stats.health) }}</b></div>
            <div class="mini-row"><span>Энергия</span><b>{{ Math.round(stats.energy) }}</b></div>
            <div class="mini-row"><span>Сытость</span><b>{{ Math.round(stats.satiety) }}</b></div>
            <div class="mini-row"><span>Вода</span><b>{{ Math.round(stats.water) }}</b></div>
          </div>
        </aside>
      </div>

      <footer>
        <button :disabled="!store.base || store.base.resources.food <= 0" @click="eat">🍖 Поесть</button>
        <button :disabled="!store.base || store.base.resources.water <= 0" @click="drink">💧 Попить</button>
        <button @click="rest">⚡ Отдохнуть</button>
        <button :disabled="!store.base || store.base.resources.medicine <= 0" @click="heal">💊 Лечиться</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.base-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  font-family: 'Courier New', monospace;
}
.base-dialog {
  width: min(880px, 94vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: #12161c;
  border: 1px solid #3a4654;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
  color: #e6edf3;
}
header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-bottom: 1px solid #29323c;
}
header h2 {
  font-size: 16px;
  letter-spacing: 3px;
  margin: 0;
  color: #ffd54a;
}
.rooms-count {
  font-size: 12px;
  color: #8b98a5;
}
.close {
  margin-left: auto;
  background: none;
  border: none;
  color: #8b98a5;
  font-size: 18px;
  cursor: pointer;
}
.close:hover { color: #fff; }
.body {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 18px;
  padding: 18px;
  overflow: auto;
}
h3 {
  font-size: 11px;
  letter-spacing: 2px;
  color: #7f8c99;
  margin: 0 0 10px;
  text-transform: uppercase;
}
.rooms {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.rooms.wide { grid-template-columns: repeat(4, 1fr); }
.room {
  aspect-ratio: 4 / 3;
  border: 1px solid #3f4c5a;
  background: linear-gradient(180deg, #1b232c, #151b22);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
}
.room-num { font-size: 18px; color: #cfd8e3; }
.room-state { font-size: 9px; color: #5e6b78; letter-spacing: 1px; }
.objects-title { margin-top: 18px; }
.empty {
  font-size: 11px;
  color: #6b7885;
  line-height: 1.5;
  border: 1px dashed #333e49;
  padding: 12px;
}
.objects { margin: 0; padding-left: 16px; font-size: 12px; }
.res {
  list-style: none;
  margin: 0 0 18px;
  padding: 0;
}
.res li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 5px 0;
  border-bottom: 1px solid #1e262e;
}
.res-ico { width: 16px; text-align: center; }
.res-label { color: #98a5b2; }
.res-val { margin-left: auto; color: #fff; font-weight: bold; }
.mini-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #98a5b2;
  padding: 3px 0;
}
.mini-row b { color: #e6edf3; }
footer {
  display: flex;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid #29323c;
  flex-wrap: wrap;
}
footer button {
  font-family: inherit;
  font-size: 12px;
  padding: 9px 14px;
  background: #1d2733;
  color: #dfe7ef;
  border: 1px solid #3a4654;
  cursor: pointer;
}
footer button:hover:not(:disabled) { background: #26333f; }
footer button:disabled { opacity: 0.4; cursor: default; }
</style>
