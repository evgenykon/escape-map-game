import type { PlayerBase, SurvivalStats } from '@/stores/game'
import type { BuildingLoot, ResourceKey } from '@/engine/LootEngine'

const STORAGE_KEY = 'escape-map-game:save:v1'

export interface SaveData {
  version: 1
  savedAt: number
  player: { lat: number; lng: number }
  stats: SurvivalStats
  carried: Partial<Record<ResourceKey, number>>
  base: PlayerBase | null
  /** центры исследованных зданий */
  explored: Array<[number, number]>
  loot: Record<string, BuildingLoot>
}

export function saveGame(data: Omit<SaveData, 'version' | 'savedAt'>): boolean {
  try {
    const payload: SaveData = { version: 1, savedAt: Date.now(), ...data }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as SaveData
    if (data.version !== 1 || !data.player) return null
    return data
  } catch {
    return null
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* приватный режим — сохранение недоступно */
  }
}

export function hasSave(): boolean {
  return loadGame() !== null
}

export function saveAgeText(): string {
  const data = loadGame()
  if (!data) return ''
  const sec = Math.max(0, Math.round((Date.now() - data.savedAt) / 1000))
  if (sec < 60) return `${sec} с назад`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} мин назад`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours} ч назад`
  return `${Math.round(hours / 24)} дн назад`
}
