<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useGameStore } from '@/stores/game'
import { polygonToFeature } from '@/engine/IndoorLoader'
import { ROOM_BUILD_COST, ROOM_BUILD_MS, ROOM_REFUND, ROOM_TYPES, countRooms, roomTypeOf, storageCapacity, type RoomTypeKey } from '@/engine/BaseRooms'

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

const selectedRoom = ref<number | null>(null)
const buildMessage = ref('')
const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  nowTimer = setInterval(() => { now.value = Date.now() }, 200)
})
const job = computed(() => store.construction)
const jobProgress = computed(() => {
  const j = job.value
  if (!j) return 0
  return Math.min(100, Math.round(((now.value - (j.endsAt - j.durationMs)) / j.durationMs) * 100))
})

const capacity = computed(() => storageCapacity(store.base?.areaM2 ?? 250, store.base?.roomTypes ?? {}))
const usedUnits = computed(() => {
  const r = store.base?.resources
  if (!r) return 0
  return Object.values(r as unknown as Record<string, number>).reduce((sum, v) => sum + v, 0)
})
const fillPct = computed(() => Math.min(100, Math.round((usedUnits.value / Math.max(1, capacity.value)) * 100)))
const hasKitchen = computed(() => countRooms(store.base?.roomTypes, 'kitchen') > 0)
const hasBedroom = computed(() => countRooms(store.base?.roomTypes, 'bedroom') > 0)

function roomType(id: number) {
  return roomTypeOf(store.base?.roomTypes?.[id])
}

function materials(): number {
  return store.base?.resources.materials ?? 0
}

function build(roomId: number, key: RoomTypeKey) {
  const base = store.base
  if (!base) return
  if (base.roomTypes?.[roomId] === key) return
  if (store.construction) {
    buildMessage.value = `Сначала завершите постройку в помещении ${store.construction.roomId}`
    return
  }
  if (materials() < ROOM_BUILD_COST) {
    buildMessage.value = `Нужно ${ROOM_BUILD_COST} 🧱 материалов`
    return
  }
  base.resources.materials -= ROOM_BUILD_COST
  store.construction = {
    roomId,
    type: key,
    durationMs: ROOM_BUILD_MS,
    endsAt: Date.now() + ROOM_BUILD_MS,
  }
  const t = roomTypeOf(key)
  buildMessage.value = `Помещение ${roomId}: начата постройка «${t?.name}» (−${ROOM_BUILD_COST} 🧱, ${Math.round(ROOM_BUILD_MS / 1000)} с)`
  selectedRoom.value = null
}

function cancelBuild() {
  const base = store.base
  if (!base || !store.construction) return
  const roomId = store.construction.roomId
  store.construction = null
  base.resources.materials += ROOM_BUILD_COST
  buildMessage.value = `Постройка в помещении ${roomId} отменена, материалы возвращены`
}

function dismantle(roomId: number) {
  const base = store.base
  if (!base?.roomTypes?.[roomId]) return
  const next = { ...base.roomTypes }
  delete next[roomId]
  base.roomTypes = next
  base.resources.materials += ROOM_REFUND
  buildMessage.value = `Помещение ${roomId}: разобрано (+${ROOM_REFUND} 🧱)`
  selectedRoom.value = null
}

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
  // отдых идёт только пока открыто окно базы
  store.resting = false
  if (nowTimer) clearInterval(nowTimer)
  nowTimer = null
  miniMap?.remove()
  miniMap = null
})

function eat() {
  const r = store.base?.resources
  if (!r || r.food <= 0) return
  r.food -= 1
  store.stats.satiety = Math.min(100, store.stats.satiety + (hasKitchen.value ? 65 : 50))
}

function drink() {
  const r = store.base?.resources
  if (!r || r.water <= 0) return
  r.water -= 1
  store.stats.water = Math.min(100, store.stats.water + 50)
}

function toggleRest() {
  store.resting = !store.resting
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

      <div v-if="store.construction" class="rest-bar build-bar">
        🏗 Помещение {{ store.construction.roomId }}: {{ roomTypeOf(store.construction.type)?.name ?? '' }}
        · {{ jobProgress }}% · осталось {{ Math.max(0, Math.ceil((store.construction.endsAt - now) / 1000)) }} с
      </div>

      <div v-if="store.resting" class="rest-bar">
        Отдых: энергия восстанавливается {{ hasBedroom ? '3' : '2' }}% в секунду ({{ Math.round(stats.energy) }}%)
      </div>

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

          <h3>Хранилище</h3>
          <div class="cap-row">
            <b>{{ usedUnits }}</b> / {{ capacity }} ед.
            <span class="cap-hint">{{ store.base?.areaM2 ? Math.round(store.base.areaM2) + ' м²' : '' }}</span>
          </div>
          <div class="cap-bar"><i :style="{ width: fillPct + '%' }" :class="{ full: fillPct >= 100 }"></i></div>

          <h3>Состояние</h3>
          <div class="mini">
            <div class="mini-row"><span>Здоровье</span><b>{{ Math.round(stats.health) }}</b></div>
            <div class="mini-row"><span>Энергия</span><b>{{ Math.round(stats.energy) }}</b></div>
            <div class="mini-row"><span>Сытость</span><b>{{ Math.round(stats.satiety) }}</b></div>
            <div class="mini-row"><span>Вода</span><b>{{ Math.round(stats.water) }}</b></div>
          </div>
        </aside>
      </div>

      <section class="build">
        <h3>Обустройство помещений · 🧱 {{ materials() }} материалов</h3>

        <div class="rooms-grid">
          <button
            v-for="room in roomsList"
            :key="room.id"
            class="room-card"
            :class="{ active: selectedRoom === room.id, built: !!roomType(room.id) }"
            @click="selectedRoom = selectedRoom === room.id ? null : room.id"
          >
            <span class="room-num">{{ room.id }}</span>
            <span class="room-name">{{ room.name }}</span>
            <span v-if="job?.roomId === room.id" class="room-progress">
              🏗 {{ roomTypeOf(job.type)?.name ?? '' }} · {{ jobProgress }}%
              <i :style="{ width: jobProgress + '%' }"></i>
            </span>
            <span v-else-if="roomType(room.id)" class="room-built">
              {{ roomType(room.id)!.icon }} {{ roomType(room.id)!.name }}
            </span>
            <span v-else class="room-empty">пусто</span>
          </button>
        </div>

        <div v-if="selectedRoom !== null" class="palette">
          <div class="palette-head">
            Помещение {{ selectedRoom }} —
            <span v-if="roomType(selectedRoom)">{{ roomType(selectedRoom)!.perks }}</span>
            <span v-else>выберите, что построить ({{ ROOM_BUILD_COST }} 🧱)</span>
          </div>

          <div class="palette-grid">
            <button
              v-for="t in ROOM_TYPES"
              :key="t.key"
              class="type-btn"
              :class="{ current: store.base?.roomTypes?.[selectedRoom] === t.key }"
              :disabled="materials() < ROOM_BUILD_COST || !!store.construction"
              @click="build(selectedRoom, t.key)"
            >
              <span class="type-ico">{{ t.icon }}</span>
              <span class="type-name">{{ t.name }}</span>
              <span class="type-cost">{{ ROOM_BUILD_COST }} 🧱</span>
            </button>
          </div>

          <button v-if="store.construction" class="dismantle" @click="cancelBuild">
            Отменить постройку в помещении {{ store.construction.roomId }} (возврат {{ ROOM_BUILD_COST }} 🧱)
          </button>

          <button
            v-if="roomType(selectedRoom) && !store.construction"
            class="dismantle"
            @click="dismantle(selectedRoom)"
          >
            Демонтировать (возврат {{ ROOM_REFUND }} 🧱)
          </button>
        </div>

        <div v-if="buildMessage" class="build-msg">{{ buildMessage }}</div>
      </section>

      <footer>
        <button :disabled="!store.base || store.base.resources.food <= 0" @click="eat">🍖 Поесть</button>
        <button :disabled="!store.base || store.base.resources.water <= 0" @click="drink">💧 Попить</button>
        <button :class="{ resting: store.resting }" @click="toggleRest">
          {{ store.resting ? '🛑 Встать' : '⚡ Отдохнуть' }}
        </button>
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
.cap-row {
  font-size: 12px;
  color: #98a5b2;
  margin-bottom: 6px;
}
.cap-row b { color: #fff; }
.cap-hint {
  margin-left: 6px;
  font-size: 10px;
  color: #5f6c79;
}
.cap-bar {
  height: 8px;
  background: #1a222b;
  border: 1px solid #2a3542;
  margin-bottom: 14px;
}
.cap-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #3c7d54, #7ee2a8);
}
.cap-bar i.full {
  background: linear-gradient(90deg, #7d3c3c, #ff8a8a);
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
.build-bar {
  color: #ffd54a;
  background: #1c1808;
  border-bottom-color: #40361a;
}
.rest-bar {
  padding: 8px 18px;
  font-size: 11px;
  color: #9fe9bf;
  background: #101c14;
  border-bottom: 1px solid #24402f;
}
footer button.resting {
  border-color: #7ee2a8;
  color: #9fe9bf;
}

.build {
  padding: 14px 18px;
  border-top: 1px solid #29323c;
  background: #10151b;
}
.rooms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}
.room-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  font-family: inherit;
  padding: 8px 10px;
  background: #161d25;
  border: 1px solid #2a3542;
  color: #cfd8e2;
  cursor: pointer;
}
.room-card:hover { border-color: #3f5468; }
.room-card.built { border-color: #3c7d54; background: #14241a; }
.room-card.active { outline: 1px solid #ffd54a; }
.room-num {
  font-size: 10px;
  color: #6b7885;
}
.room-name {
  font-size: 12px;
  color: #e6edf3;
}
.room-built {
  font-size: 11px;
  color: #7ee2a8;
}
.room-empty {
  font-size: 11px;
  color: #5f6c79;
}
.room-progress {
  position: relative;
  display: block;
  font-size: 11px;
  color: #ffd54a;
  padding-bottom: 5px;
}
.room-progress i {
  position: absolute;
  left: 0;
  bottom: 0;
  display: block;
  height: 3px;
  background: #ffd54a;
}
.palette {
  margin-top: 12px;
  padding: 10px;
  border: 1px dashed #2f3d4b;
  background: #0e1319;
}
.palette-head {
  font-size: 11px;
  color: #8b98a5;
  margin-bottom: 8px;
}
.palette-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px;
}
.type-btn {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  gap: 6px;
  align-items: center;
  font-family: inherit;
  font-size: 11px;
  padding: 7px 8px;
  background: #17202a;
  color: #cfd8e2;
  border: 1px solid #2a3542;
  cursor: pointer;
}
.type-btn:hover:not(:disabled) { border-color: #4c7fa8; }
.type-btn.current { border-color: #7ee2a8; color: #9fe9bf; }
.type-btn:disabled { opacity: 0.4; cursor: default; }
.type-ico { text-align: center; }
.type-cost { color: #8b98a5; font-size: 10px; }
.dismantle {
  margin-top: 10px;
  font-family: inherit;
  font-size: 11px;
  padding: 7px 12px;
  background: #2a1616;
  color: #ff9a9a;
  border: 1px solid #6b2f2f;
  cursor: pointer;
}
.build-msg {
  margin-top: 8px;
  font-size: 11px;
  color: #9fe9bf;
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
