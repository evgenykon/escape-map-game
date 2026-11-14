<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { CARRY_CAPACITY, RESOURCE_META, type LootItem, type ResourceKey } from '@/engine/LootEngine'

const props = defineProps<{ lootKey: string; searching?: boolean; progress?: number }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const store = useGameStore()

const loot = computed(() => store.lootBuildings[props.lootKey] ?? null)
const items = computed<LootItem[]>(() => loot.value?.items.filter((i) => i.amount > 0) ?? [])

const carriedTotal = computed(() =>
  Object.values(store.carried).reduce((sum, v) => sum + (v ?? 0), 0),
)
const capacityLeft = computed(() => Math.max(0, CARRY_CAPACITY - carriedTotal.value))

function takeOne(item: LootItem) {
  if (capacityLeft.value <= 0) return
  const l = store.lootBuildings[props.lootKey]
  if (!l) return
  const target = l.items.find((i) => i.key === item.key)
  if (!target || target.amount <= 0) return
  target.amount -= 1
  const key = item.key as ResourceKey
  store.carried[key] = (store.carried[key] ?? 0) + 1
}

function takeAll(item: LootItem) {
  const take = Math.min(item.amount, capacityLeft.value)
  for (let i = 0; i < take; i++) takeOne(item)
}

const minutesLeft = computed(() => {
  if (!loot.value) return 0
  return Math.max(0, Math.ceil((loot.value.expiresAt - Date.now()) / 60000))
})
</script>

<template>
  <div class="loot-backdrop" @click.self="emit('close')">
    <div class="loot-dialog">
      <header>
        <h2>НАЙДЕННЫЕ РЕСУРСЫ</h2>
        <span class="ttl" v-if="!searching && loot">содержимое сохранится ~{{ minutesLeft }} мин</span>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <div v-if="searching" class="searching">
        <div class="search-bar"><i :style="{ width: (progress ?? 0) * 100 + '%' }"></i></div>
        <p>Идёт поиск… {{ Math.round((progress ?? 0) * 100) }}%</p>
      </div>

      <div v-else class="list">
        <div v-for="item in items" :key="item.key" class="row">
          <span class="ico">{{ RESOURCE_META[item.key].icon }}</span>
          <span class="label">{{ RESOURCE_META[item.key].label }}</span>
          <span class="amount">{{ item.amount }}</span>
          <button :disabled="capacityLeft <= 0" @click="takeOne(item)">Взять 1</button>
          <button :disabled="capacityLeft <= 0" @click="takeAll(item)">Всё</button>
        </div>
        <p v-if="!items.length" class="empty">Здесь уже ничего не осталось.</p>
      </div>

      <footer>
        <span class="carry">В руках: {{ carriedTotal }} / {{ CARRY_CAPACITY }}</span>
        <span class="hint">Отнесите на базу — там ресурсы попадут в хранилище.</span>
        <button class="done" @click="emit('close')">Закрыть</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.loot-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  font-family: 'Courier New', monospace;
}
.loot-dialog {
  width: min(560px, 94vw);
  background: #12161c;
  border: 1px solid #3a4654;
  color: #e6edf3;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
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
  font-size: 15px;
  letter-spacing: 2px;
  color: #ffd54a;
}
.ttl {
  font-size: 11px;
  color: #7f8c99;
}
.close {
  margin-left: auto;
  background: none;
  border: none;
  color: #8b98a5;
  font-size: 18px;
  cursor: pointer;
}
.list {
  padding: 12px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 50vh;
  overflow: auto;
}
.row {
  display: grid;
  grid-template-columns: 20px 1fr 40px auto auto;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  padding: 6px 0;
  border-bottom: 1px solid #1e262e;
}
.ico {
  font-size: 14px;
}
.label {
  color: #b9c4cf;
}
.amount {
  text-align: right;
  color: #fff;
  font-weight: bold;
}
.row button {
  font-family: inherit;
  font-size: 11px;
  padding: 4px 9px;
  background: #1d2733;
  color: #dfe7ef;
  border: 1px solid #3a4654;
  cursor: pointer;
}
.row button:disabled {
  opacity: 0.35;
  cursor: default;
}
.empty {
  font-size: 12px;
  color: #6b7885;
}
.searching {
  padding: 26px 18px;
  text-align: center;
}
.search-bar {
  height: 12px;
  border: 1px solid #3a4654;
  background: rgba(255, 255, 255, 0.06);
}
.search-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #ffd54a, #ff9f43);
  transition: width 0.12s linear;
}
.searching p {
  font-size: 12px;
  color: #98a5b2;
  margin: 10px 0 0;
}
footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-top: 1px solid #29323c;
}
.carry {
  font-size: 12px;
  color: #ffd54a;
}
.hint {
  font-size: 11px;
  color: #6b7885;
}
.done {
  margin-left: auto;
  font-family: inherit;
  font-size: 12px;
  padding: 8px 16px;
  background: #1d2733;
  color: #dfe7ef;
  border: 1px solid #3a4654;
  cursor: pointer;
}
</style>
