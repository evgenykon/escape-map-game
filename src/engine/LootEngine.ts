/** Ресурсы, которые можно найти в зданиях. */
export type ResourceKey =
  | 'water'
  | 'food'
  | 'clothes'
  | 'fuel'
  | 'tech'
  | 'medicine'
  | 'weapons'
  | 'tools'
  | 'materials'

export interface LootItem {
  key: ResourceKey
  amount: number
}

export interface BuildingLoot {
  key: string
  lat: number
  lng: number
  items: LootItem[]
  expiresAt: number
  /** иконки для маркера на карте */
  icons: string
  /** всё вынесли — маркер перечёркивается */
  emptied?: boolean
}

export const RESOURCE_META: Record<ResourceKey, { icon: string; label: string }> = {
  water: { icon: '💧', label: 'Вода' },
  food: { icon: '🍖', label: 'Еда' },
  clothes: { icon: '👕', label: 'Одежда' },
  fuel: { icon: '⛽', label: 'Бензин' },
  tech: { icon: '🔌', label: 'Техника' },
  medicine: { icon: '💊', label: 'Медицина' },
  weapons: { icon: '🔪', label: 'Оружие' },
  tools: { icon: '🔧', label: 'Инструменты' },
  materials: { icon: '🧱', label: 'Стройматериалы' },
}

/** OSM subclass → что в таком магазине может лежать. */
const SHOP_LOOT: Record<string, ResourceKey[]> = {
  supermarket: ['food', 'water'],
  convenience: ['food', 'water'],
  grocery: ['food', 'water'],
  greengrocer: ['food'],
  butcher: ['food'],
  bakery: ['food'],
  marketplace: ['food', 'water'],
  deli: ['food'],
  alcohol: ['water', 'food'],

  clothes: ['clothes'],
  shoes: ['clothes'],
  bag: ['clothes'],
  fashion: ['clothes'],
  department_store: ['clothes', 'tech'],
  second_hand: ['clothes'],

  fuel: ['fuel'],
  car_parts: ['tools'],
  car_repair: ['tools', 'materials'],

  electronics: ['tech'],
  mobile_phone: ['tech'],
  computer: ['tech'],
  hifi: ['tech'],
  appliance: ['tech'],

  pharmacy: ['medicine'],
  chemist: ['medicine'],
  medical_supply: ['medicine'],

  hardware: ['tools', 'materials'],
  doityourself: ['materials'],
  paint: ['materials'],
  garden_centre: ['materials'],
  trade: ['materials'],

  hunting: ['weapons'],
  weapons: ['weapons'],
  sports: ['tools', 'clothes'],
}

const FALLBACK: ResourceKey[] = ['food', 'water', 'materials']

export interface PoiLike {
  class?: string
  subclass?: string
  name?: string
}

/** Какие ресурсы соответствуют наборам POI в здании. */
export function resourcesForPois(pois: PoiLike[]): ResourceKey[] {
  const keys = new Set<ResourceKey>()
  for (const poi of pois) {
    const sub = poi.subclass ?? ''
    const byClass = poi.class === 'shop' || poi.class === 'food_and_drink' || poi.class === 'commercial'
    const mapped = SHOP_LOOT[sub]
    if (mapped) {
      mapped.forEach((k) => keys.add(k))
    } else if (byClass) {
      FALLBACK.forEach((k) => keys.add(k))
    }
    if (poi.class === 'fuel') keys.add('fuel')
    if (poi.class === 'healthcare' || poi.class === 'hospital') keys.add('medicine')
  }
  return [...keys]
}

/** Время поиска: зависит от площади здания и числа найденных типов ресурсов. */
export function searchSeconds(areaM2: number, resourceTypes: number): number {
  const base = 6 + Math.min(30, areaM2 / 60)
  const perType = 1.5 * Math.max(0, resourceTypes - 1)
  return Math.round(Math.max(8, Math.min(45, base + perType)))
}

/** Сколько единиц игрок уносит за один заход. */
export const CARRY_CAPACITY = 12

/** Сколько живёт содержимое здания после поиска. */
export const LOOT_TTL_MS = 5 * 60 * 1000

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}

/** Состав лута: количество зависит от площади и числа магазинов. */
export function generateLoot(keys: ResourceKey[], areaM2: number, shopCount: number): LootItem[] {
  const sizeFactor = Math.max(1, Math.min(6, areaM2 / 400))
  const shopFactor = Math.max(1, Math.min(4, shopCount))
  return keys.map((key) => {
    const min = Math.round(1 * sizeFactor * shopFactor)
    const max = Math.round(4 * sizeFactor * shopFactor)
    return { key, amount: randInt(min, max) }
  })
}

export function lootKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)}:${lng.toFixed(4)}`
}

export function lootIcons(items: LootItem[]): string {
  return items.slice(0, 3).map((i) => RESOURCE_META[i.key].icon).join('')
}
