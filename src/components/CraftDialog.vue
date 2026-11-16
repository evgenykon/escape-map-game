<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useGameStore } from '@/stores/game'
import { CRAFT_RECIPES, type CraftRecipe } from '@/engine/BaseRooms'

const store = useGameStore()
const emit = defineEmits<{ (e: 'close'): void }>()

const selectedId = ref<string>(CRAFT_RECIPES[0]?.id ?? '')
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => { now.value = Date.now() }, 120)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  timer = null
})

const resources = computed(() => (store.base?.resources ?? {}) as unknown as Record<string, number>)

const capacityNow = computed(() => {
  const r = resources.value
  return Object.values(r).reduce((sum, v) => sum + (v ?? 0), 0)
})

const selected = computed<CraftRecipe | null>(
  () => CRAFT_RECIPES.find((r) => r.id === selectedId.value) ?? null,
)

const job = computed(() => store.craftJob)
const jobRecipe = computed(() => CRAFT_RECIPES.find((r) => r.id === job.value?.recipeId) ?? null)
const jobProgress = computed(() => {
  const j = job.value
  if (!j) return 0
  return Math.min(100, Math.round(((now.value - (j.endsAt - j.durationMs)) / j.durationMs) * 100))
})

function canCraft(recipe: CraftRecipe): boolean {
  for (const [key, need] of Object.entries(recipe.input)) {
    if ((resources.value[key] ?? 0) < (need ?? 0)) return false
  }
  const outTotal = Object.values(recipe.output).reduce((sum, v) => sum + (v ?? 0), 0)
  return capacityNow.value + outTotal <= storeCapacity.value
}

const storeCapacity = computed(() => {
  const area = store.base?.areaM2 ?? 250
  const stores = Object.values(store.base?.roomTypes ?? {}).filter((k) => k === 'storage').length
  return Math.max(60, Math.min(600, Math.round(area / 12))) + stores * 60
})

const RESOURCE_LABEL: Record<string, string> = {
  materials: '🧱 Материалы',
  tech: '🔌 Техника',
  tools: '🔧 Инструменты',
  clothes: '👕 Одежда',
  fuel: '⛽ Топливо',
  weapons: '🔪 Оружие',
  medicine: '💊 Медицина',
  energy: '⚡ Электричество',
  battery: '🔋 Батарейка',
  wire: '🧵 Провод',
  metal: '▤ Лист металла',
  pipe: '▯ Труба',
  circuit: '🎛 Эл. плата',
  wheel: '🛞 Колесо',
  chain: '⛓ Цепь',
}

const outputEntries = computed(() =>
  Object.entries(selected.value?.output ?? {}).map(([key, amount]) => ({
    key,
    amount: amount ?? 0,
    label: RESOURCE_LABEL[key] ?? key,
  })),
)

const inputEntries = computed(() =>
  Object.entries(selected.value?.input ?? {}).map(([key, need]) => ({
    key,
    need: need ?? 0,
    have: resources.value[key] ?? 0,
    label: RESOURCE_LABEL[key] ?? key,
  })),
)

function craft() {
  const recipe = selected.value
  if (!recipe || store.craftJob || !canCraft(recipe)) return

  const r = store.base?.resources as unknown as Record<string, number> | undefined
  if (!r) return

  for (const [key, need] of Object.entries(recipe.input)) {
    r[key] = (r[key] ?? 0) - (need ?? 0)
  }
  store.craftJob = {
    recipeId: recipe.id,
    durationMs: recipe.durationMs,
    endsAt: Date.now() + recipe.durationMs,
  }
}

function cancel() {
  const j = store.craftJob
  if (!j) return
  const recipe = CRAFT_RECIPES.find((r) => r.id === j.recipeId)
  const r = store.base?.resources as unknown as Record<string, number> | undefined
  if (recipe && r) {
    for (const [key, need] of Object.entries(recipe.input)) {
      r[key] = (r[key] ?? 0) + (need ?? 0)
    }
  }
  store.craftJob = null
}
</script>

<template>
  <div class="craft-backdrop" @click.self="emit('close')">
    <div class="craft-dialog">
      <header>
        <h2>МАСТЕРСКАЯ</h2>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <div class="craft-body">
        <aside class="recipes">
          <button
            v-for="recipe in CRAFT_RECIPES"
            :key="recipe.id"
            class="recipe"
            :class="{ selected: selectedId === recipe.id, dim: !canCraft(recipe) }"
            @click="selectedId = recipe.id"
          >
            <span class="recipe-ico">{{ recipe.icon }}</span>
            <span class="recipe-name">{{ recipe.name }}</span>
          </button>
        </aside>

        <section class="detail">
          <div class="result">
            <div class="result-icon">{{ selected?.icon ?? '—' }}</div>
            <div class="result-name">{{ selected?.name ?? 'Выберите рецепт' }}</div>
            <div class="result-qty">{{ outputEntries.map((o) => o.label + ' ×' + o.amount).join(', ') }}</div>
          </div>

          <div class="materials">
            <div class="materials-title">Нужно</div>
            <ul>
              <li v-for="item in inputEntries" :key="item.key" :class="{ enough: item.have >= item.need }">
                <span>{{ item.label }}</span>
                <b>{{ item.have }} / {{ item.need }}</b>
              </li>
            </ul>
          </div>

          <div v-if="job && jobRecipe" class="progress-box">
            <div class="progress-label">
              {{ jobRecipe.icon }} {{ jobRecipe.name }} · {{ jobProgress }}%
              · осталось {{ Math.max(0, Math.ceil((job.endsAt - now) / 1000)) }} с
            </div>
            <div class="progress-bar"><i :style="{ width: jobProgress + '%' }"></i></div>
          </div>

          <div class="actions">
            <button
              class="craft-btn"
              :disabled="!selected || !canCraft(selected) || !!job"
              @click="craft"
            >
              🛠 Крафтить
            </button>
            <button v-if="job" class="cancel-btn" @click="cancel">Отменить</button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.craft-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  font-family: 'Courier New', monospace;
}
.craft-dialog {
  width: min(760px, 94vw);
  max-height: 86vh;
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
  padding: 14px 18px;
  border-bottom: 1px solid #29323c;
}
header h2 {
  margin: 0;
  font-size: 15px;
  letter-spacing: 3px;
  color: #ffd54a;
}
.close {
  margin-left: auto;
  background: none;
  border: none;
  color: #8b98a5;
  font-size: 18px;
  cursor: pointer;
}
.craft-body {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 16px;
  padding: 16px;
  overflow: auto;
  min-height: 0;
}
.recipes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-right: 1px solid #232c35;
  padding-right: 12px;
}
.recipe {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: inherit;
  font-size: 12px;
  padding: 9px 10px;
  background: #161d25;
  border: 1px solid #2a3542;
  color: #cfd8e2;
  cursor: pointer;
  text-align: left;
}
.recipe.selected {
  border-color: #ffd54a;
  background: #1e2229;
}
.recipe.dim {
  opacity: 0.42;
}
.recipe-ico { font-size: 15px; }
.recipe-name { color: inherit; }

.detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 18px 12px;
  border: 1px solid #2a3542;
  background: radial-gradient(circle at 50% 30%, #1b232c, #10151b);
}
.result-icon { font-size: 44px; line-height: 1; }
.result-name { font-size: 14px; letter-spacing: 1px; color: #ffd54a; }
.result-qty { font-size: 11px; color: #8b98a5; }

.materials-title {
  font-size: 10px;
  letter-spacing: 2px;
  color: #7f8c99;
  margin-bottom: 6px;
}
.materials ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.materials li {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 5px 0;
  border-bottom: 1px solid #1e262e;
  color: #c3ccd6;
}
.materials li b { color: #ff9a9a; }
.materials li.enough b { color: #9fe9bf; }

.progress-box { display: flex; flex-direction: column; gap: 6px; }
.progress-label { font-size: 11px; color: #ffd54a; }
.progress-bar {
  height: 8px;
  background: #1a222b;
  border: 1px solid #2a3542;
}
.progress-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #a07a10, #ffd54a);
}
.actions { display: flex; gap: 10px; }
.craft-btn {
  font-family: inherit;
  font-size: 12px;
  padding: 10px 18px;
  background: #2a2416;
  color: #ffd54a;
  border: 1px solid #6b5b2f;
  cursor: pointer;
}
.craft-btn:disabled { opacity: 0.4; cursor: default; }
.cancel-btn {
  font-family: inherit;
  font-size: 12px;
  padding: 10px 14px;
  background: #2a1616;
  color: #ff9a9a;
  border: 1px solid #6b2f2f;
  cursor: pointer;
}
</style>
