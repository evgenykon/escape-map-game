<script setup lang="ts">
import { useGameStore } from '@/stores/game'
import StartScreen from '@/components/StartScreen.vue'
import LoadingScreen from '@/components/LoadingScreen.vue'
import GameScreen from '@/components/GameScreen.vue'

const store = useGameStore()
</script>

<template>
  <StartScreen v-if="store.phase === 'start'" />
  <LoadingScreen v-else-if="store.phase === 'loading'" />
  <GameScreen v-else-if="store.phase === 'playing' || store.phase === 'gameover' || store.phase === 'victory'" />
</template>
