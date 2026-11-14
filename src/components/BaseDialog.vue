<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useGameStore } from '@/stores/game'
import { polygonToFeature } from '@/engine/IndoorLoader'

const store = useGameStore()
const emit = defineEmits<{ (e: 'close'): void }>()

const mapEl = ref<HTMLDivElement>()
let miniMap: maplibregl.Map | null = null
let ready = false

const roomsList = computed(() => {
  const fc = store.base?.roomsGeo
  if (!fc) return []
  return fc.features.map((f, i) => ({
    id: Number((f.properties as Record<string, unknown>)?.id ?? i + 1),
    name: String((f.properties as Record<string, unknown>)?.name ?? `Помещение ${i + 1}`),
  }))
})

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
    { key: 'clothes', icon: '👕', label: 'Одежда', value: r.clothes },
    { key: 'tech', icon: '🔌', label: 'Техника', value: r.tech },
    { key: 'weapons', icon: '🔪', label: 'Оружие', value: r.weapons },
    { key: 'tools', icon: '🔧', label: 'Инструменты', value: r.tools },
  ]
})

const stats = computed(() => store.stats)

function draw() {
  if (!miniMap || !ready) return
  const roomsGeo = store.base?.roomsGeo
  const polygon = store.base?.polygon
  if (!roomsGeo && !polygon) return

  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

  if (!miniMap.getSource('rooms')) {
    miniMap.addSource('rooms', { type: 'geojson', data: roomsGeo ?? empty })
    miniMap.addLayer({
      id: 'rooms-fill',
      type: 'fill',
      source: 'rooms',
      paint: {
        'fill-color': ['interpolate', ['linear'], ['get', 'id'], 1, '#1f4f6b', 10, '#2a7a8c'],
        'fill-opacity': 0.75,
      },
    })
    miniMap.addLayer({
      id: 'rooms-line',
      type: 'line',
      source: 'rooms',
      paint: { 'line-color': '#7fd7ff', 'line-width': 1.2 },
    })
    miniMap.addLayer({
      id: 'rooms-label',
      type: 'symbol',
      source: 'rooms',
      layout: {
        'text-field': ['to-string', ['get', 'id']],
        'text-size': 12,
        'text-font': ['Noto Sans Regular'],
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#eaf6ff', 'text-halo-color': '#08131c', 'text-halo-width': 1.4 },
    })
  } else {
    ;(miniMap.getSource('rooms') as maplibregl.GeoJSONSource).setData(roomsGeo ?? empty)
  }

  if (polygon) {
    const fc = polygonToFeature(polygon)
    if (!miniMap.getSource('building')) {
      miniMap.addSource('building', { type: 'geojson', data: fc })
      miniMap.addLayer({
        id: 'building-line',
        type: 'line',
        source: 'building',
        paint: { 'line-color': '#ffd54a', 'line-width': 2 },
      })
    } else {
      ;(miniMap.getSource('building') as maplibregl.GeoJSONSource).setData(fc)
    }
  }
}

function fitToBuilding() {
  if (!miniMap || !store.base?.polygon) return
  let minX = 180
  let minY = 90
  let maxX = -180
  let maxY = -90
  for (const [x, y] of store.base.polygon.coordinates[0]) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  miniMap.fitBounds(
    [
      [minX, minY],
      [maxX, maxY],
    ],
    { padding: 30, duration: 0 },
  )
}

onMounted(() => {
  if (!mapEl.value) return
  miniMap = new maplibregl.Map({
    container: mapEl.value,
    style: {
      version: 8,
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sources: {},
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0d1218' } }] as never,
    },
    interactive: true,
    attributionControl: false,
  })
  miniMap.on('load', () => {
    ready = true
    draw()
    fitToBuilding()
  })
})

watch(
  () => store.base?.roomsGeo,
  () => {
    draw()
    fitToBuilding()
  },
)

onUnmounted(() => {
  miniMap?.remove()
  miniMap = null
})

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
        <span class="rooms-count">
          {{ store.base?.rooms }} комн.
          <em v-if="store.base?.roomsReal">· планировка из OSM</em>
          <em v-else>· схема по площади</em>
        </span>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <div class="body">
        <section class="plan">
          <h3>Помещения</h3>
          <div ref="mapEl" class="plan-map"></div>
          <div class="room-list">
            <span v-for="room in roomsList" :key="room.id" class="room-chip">{{ room.id }}</span>
          </div>
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
  width: min(920px, 94vw);
  max-height: 90vh;
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
.rooms-count em {
  font-style: normal;
  color: #5f6c79;
}
.close {
  margin-left: auto;
  background: none;
  border: none;
  color: #8b98a5;
  font-size: 18px;
  cursor: pointer;
}
.close:hover {
  color: #fff;
}
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
.plan-map {
  width: 100%;
  height: 340px;
  border: 1px solid #2a3542;
  background: #0d1218;
}
.room-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.room-chip {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid #2f4a5e;
  color: #7fd7ff;
  background: rgba(31, 79, 107, 0.35);
}
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
.res-ico {
  width: 16px;
  text-align: center;
}
.res-label {
  color: #98a5b2;
}
.res-val {
  margin-left: auto;
  color: #fff;
  font-weight: bold;
}
.mini-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #98a5b2;
  padding: 3px 0;
}
.mini-row b {
  color: #e6edf3;
}
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
footer button:hover:not(:disabled) {
  background: #26333f;
}
footer button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
