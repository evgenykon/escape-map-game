<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { CARRY_CAPACITY, COMPONENT_KEYS, RESOURCE_META, type ComponentKey } from '@/engine/LootEngine'

const store = useGameStore()
const emit = defineEmits<{ (e: 'close'): void }>()

const resources = computed(() => (store.base?.resources ?? {}) as unknown as Record<string, number>)
const carried = computed(() => (store.carried ?? {}) as unknown as Partial<Record<ComponentKey, number>>)

const carriedTotal = computed(() =>
  Object.values(store.carried).reduce((sum, v) => sum + (v ?? 0), 0),
)
const freeSlots = computed(() => Math.max(0, CARRY_CAPACITY - carriedTotal.value))

const rows = computed(() =>
  COMPONENT_KEYS.map((key) => ({
    key,
    icon: RESOURCE_META[key].icon,
    label: RESOURCE_META[key].label,
    inStore: resources.value[key] ?? 0,
    inBackpack: carried.value[key] ?? 0,
  })),
)

const storeTotal = computed(() => rows.value.reduce((sum, r) => sum + r.inStore, 0))

function take(key: ComponentKey, all = false) {
  const r = store.base?.resources as unknown as Record<string, number> | undefined
  if (!r) return
  const have = r[key] ?? 0
  if (have <= 0 || freeSlots.value <= 0) return
  const amount = all ? Math.min(have, freeSlots.value) : 1
  r[key] = have - amount
  const c = { ...(store.carried as Partial<Record<ComponentKey, number>>) }
  c[key] = (c[key] ?? 0) + amount
  store.carried = c as never
}

function put(key: ComponentKey) {
  const r = store.base?.resources as unknown as Record<string, number> | undefined
  if (!r) return
  const c = { ...(store.carried as Partial<Record<ComponentKey, number>>) }
  const have = c[key] ?? 0
  if (have <= 0) return
  c[key] = have - 1
  r[key] = (r[key] ?? 0) + 1
  store.carried = c as never
}
</script>

<template>
  <div class="box-backdrop" @click.self="emit('close')">
    <div class="box-dialog">
      <header>
        <h2>📦 ЯЩИК С ВЕЩАМИ</h2>
        <span class="cap">в ящике {{ storeTotal }} · рюкзак {{ carriedTotal }}/{{ CARRY_CAPACITY }}</span>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <ul class="box-list">
        <li v-for="item in rows" :key="item.key">
          <span class="ico">{{ item.icon }}</span>
          <span class="label">{{ item.label }}</span>
          <span class="store-amount">{{ item.inStore }}</span>
          <span v-if="item.inBackpack > 0" class="carry">🎒{{ item.inBackpack }}</span>
          <button class="act put" :disabled="item.inBackpack <= 0" @click="put(item.key)">−1</button>
          <button class="act" :disabled="item.inStore <= 0 || freeSlots <= 0" @click="take(item.key)">+1</button>
          <button class="act" :disabled="item.inStore <= 0 || freeSlots <= 0" @click="take(item.key, true)">макс</button>
        </li>
      </ul>

      <footer>
        <span class="hint">Скрафченные предметы хранятся здесь и берутся в рюкзак.</span>
        <button @click="emit('close')">Закрыть</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.box-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  font-family: 'Courier New', monospace;
}
.box-dialog {
  width: min(560px, 94vw);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  background: #12161c;
  border: 1px solid #3a4654;
  color: #e6edf3;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75);
}
header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid #29323c;
}
header h2 {
  margin: 0;
  font-size: 13px;
  letter-spacing: 2px;
  color: #ffd54a;
}
.cap {
  font-size: 10px;
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
.box-list {
  list-style: none;
  margin: 0;
  padding: 10px 18px;
  overflow: auto;
  min-height: 0;
}
.box-list li {
  display: grid;
  grid-template-columns: 20px 1fr auto auto auto auto auto;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 7px 0;
  border-bottom: 1px solid #1e262e;
}
.ico { text-align: center; }
.label { color: #b9c4cf; }
.store-amount { color: #fff; font-weight: bold; min-width: 24px; text-align: right; }
.carry { font-size: 10px; color: #ffd54a; }
.act {
  font-family: inherit;
  font-size: 10px;
  padding: 3px 7px;
  background: #17202a;
  color: #9fe9bf;
  border: 1px solid #3c7d54;
  border-radius: 3px;
  cursor: pointer;
}
.act.put { color: #ffd54a; border-color: #6b5b2f; }
.act:disabled { opacity: 0.35; cursor: default; }
footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid #29323c;
}
.hint { font-size: 10px; color: #6b7885; }
footer button {
  margin-left: auto;
  font-family: inherit;
  font-size: 12px;
  padding: 8px 14px;
  background: #1d2733;
  color: #dfe7ef;
  border: 1px solid #3a4654;
  cursor: pointer;
}
</style>
