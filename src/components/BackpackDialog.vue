<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { CARRY_CAPACITY, RESOURCE_META, type ResourceKey } from '@/engine/LootEngine'

const store = useGameStore()
const props = defineProps<{ canDrop?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'drop'): void }>()

const entries = computed(() => {
  const carried = store.carried as Partial<Record<ResourceKey, number>>
  return Object.entries(carried)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([key, amount]) => ({
      key: key as ResourceKey,
      amount: amount as number,
      icon: RESOURCE_META[key as ResourceKey].icon,
      label: RESOURCE_META[key as ResourceKey].label,
    }))
})

const total = computed(() => entries.value.reduce((sum, e) => sum + e.amount, 0))

/** Что можно использовать сразу из рюкзака. */
const USE_LABEL: Partial<Record<ResourceKey, string>> = {
  food: '🍖 Съесть',
  water: '💧 Выпить',
  medicine: '💊 Принять',
}

function consume(key: ResourceKey) {
  const carried = store.carried as Partial<Record<ResourceKey, number>>
  if ((carried[key] ?? 0) <= 0) return
  carried[key] = (carried[key] ?? 0) - 1
  store.carried = { ...carried }

  if (key === 'food') store.stats.satiety = Math.min(100, store.stats.satiety + 40)
  else if (key === 'water') store.stats.water = Math.min(100, store.stats.water + 40)
  else if (key === 'medicine') store.stats.health = Math.min(100, store.stats.health + 35)
}
</script>

<template>
  <div class="bp-backdrop" @click.self="emit('close')">
    <div class="bp-dialog">
      <header>
        <h2>РЮКЗАК</h2>
        <span class="cap">{{ total }} / {{ CARRY_CAPACITY }}</span>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <div v-if="!entries.length" class="empty">
        Пусто. Ресурсы из зданий складываются сюда, а на базе уходят в хранилище автоматически.
      </div>

      <ul v-else class="list">
        <li v-for="item in entries" :key="item.key">
          <span class="ico">{{ item.icon }}</span>
          <span class="label">{{ item.label }}</span>
          <span class="amount">{{ item.amount }}</span>
          <button
            v-if="USE_LABEL[item.key]"
            class="use-btn"
            @click="consume(item.key)"
          >
            {{ USE_LABEL[item.key] }}
          </button>
        </li>
      </ul>

      <footer>
        <button
          v-if="props.canDrop && entries.length"
          class="drop-btn"
          @click="emit('drop')"
        >
          ⬇ Оставить в этом здании
        </button>
        <span class="hint">Дойдите до базы — содержимое выгрузится само.</span>
        <button @click="emit('close')">Закрыть</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.bp-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  font-family: 'Courier New', monospace;
}
.bp-dialog {
  width: min(420px, 92vw);
  background: #12161c;
  border: 1px solid #3a4654;
  color: #e6edf3;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
}
header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #29323c;
}
header h2 {
  margin: 0;
  font-size: 14px;
  letter-spacing: 2px;
  color: #ffd54a;
}
.cap {
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
.empty {
  padding: 18px 16px;
  font-size: 12px;
  line-height: 1.6;
  color: #7f8c99;
}
.list {
  list-style: none;
  margin: 0;
  padding: 8px 16px;
  max-height: 50vh;
  overflow: auto;
}
.list li {
  display: grid;
  grid-template-columns: 22px 1fr auto auto;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  padding: 7px 0;
  border-bottom: 1px solid #1e262e;
}
.ico {
  font-size: 15px;
}
.label {
  color: #b9c4cf;
}
.amount {
  color: #fff;
  font-weight: bold;
}
.use-btn {
  font-family: inherit;
  font-size: 10px;
  padding: 4px 8px;
  background: #14241a;
  color: #9fe9bf;
  border: 1px solid #3c7d54;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.use-btn:hover {
  background: #1b3122;
}
footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #29323c;
}
.hint {
  font-size: 11px;
  color: #6b7885;
}
footer .drop-btn {
  margin-left: 0;
  border-color: #6b5b2f;
  color: #ffd54a;
}
footer .drop-btn:hover {
  background: #2a2416;
}
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
