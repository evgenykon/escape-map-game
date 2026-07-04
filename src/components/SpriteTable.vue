<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

const emit = defineEmits<{ close: [] }>()
const baseUrl = import.meta.env.BASE_URL

interface SpriteDef {
  name: string
  url: string
  w: number
  h: number
  count: number
  duration: number
}

const sprites: SpriteDef[] = [
  { name: 'Idle', url: 'sprites/player-idle.png', w: 48, h: 48, count: 10, duration: 3 },
  { name: 'Walk', url: 'sprites/player-walking.png', w: 48, h: 48, count: 6, duration: 0.6 },
  { name: 'Hack', url: 'sprites/player-hacking.png', w: 48, h: 48, count: 4, duration: 1 },
  { name: 'Dead', url: 'sprites/dead.png', w: 32, h: 32, count: 1, duration: 0 },
]

const frames = ref<number[]>(sprites.map(() => 0))
const animTimers: ReturnType<typeof setInterval>[] = []

sprites.forEach((s, i) => {
  if (s.count > 1) {
    const interval = setInterval(() => {
      frames.value[i] = (frames.value[i] + 1) % s.count
    }, s.duration * 1000 / s.count)
    animTimers.push(interval)
  }
})

onUnmounted(() => {
  animTimers.forEach(clearInterval)
})
</script>

<template>
  <div class="sprite-table">
    <button class="close-btn" @click="emit('close')">✕</button>
    <h1>Sprite Table</h1>
    <div class="grid">
      <div v-for="(s, i) in sprites" :key="s.name" class="sprite-card">
        <div class="preview">
          <div
            class="sprite"
            :style="{
              width: s.w + 'px',
              height: s.h + 'px',
              backgroundImage: `url(${baseUrl}${s.url})`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: `0px -${frames[i] * s.h}px`,
              backgroundSize: `${s.w}px ${s.h * s.count}px`,
              imageRendering: 'pixelated',
            }"
          />
        </div>
        <div class="info">
          <strong>{{ s.name }}</strong>
          <span>{{ s.w }}×{{ s.h }} · {{ s.count }} frames</span>
          <span v-if="s.count > 1">{{ s.duration }}s loop</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sprite-table {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #111;
  color: #fff;
  font-family: 'Courier New', monospace;
  padding: 2rem;
}
h1 {
  font-size: 2rem;
  margin-bottom: 2rem;
  color: #f44;
  letter-spacing: 0.3rem;
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  justify-content: center;
}
.sprite-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.5rem;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 4px;
}
.preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 120px;
  background: #222;
  border: 1px solid #444;
}
.sprite {
  display: block;
}
.info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  font-size: 0.85rem;
  opacity: 0.8;
}
.info strong {
  font-size: 1rem;
  opacity: 1;
}
.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 2rem;
  height: 2rem;
  background: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.close-btn:hover {
  background: #f44;
}
</style>
