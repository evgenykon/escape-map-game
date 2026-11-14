export type RoomTypeKey =
  | 'bedroom'
  | 'kitchen'
  | 'workshop'
  | 'gym'
  | 'storage'
  | 'greenhouse'
  | 'library'
  | 'radio'
  | 'armory'

export interface RoomType {
  key: RoomTypeKey
  name: string
  icon: string
  /** что даёт помещение */
  perks: string
}

/** Стоимость обустройства одной комнаты и возврат при демонтаже. */
export const ROOM_BUILD_COST = 10
/** сколько длится постройка одного помещения, мс */
export const ROOM_BUILD_MS = 20000
export const ROOM_REFUND = 5

export const ROOM_TYPES: RoomType[] = [
  { key: 'bedroom', name: 'Спальня', icon: '🛏', perks: 'отдых восстанавливает больше энергии' },
  { key: 'kitchen', name: 'Кухня', icon: '🍳', perks: 'еда с базы сытнее, готовка из запасов' },
  { key: 'workshop', name: 'Мастерская', icon: '🛠', perks: 'починка и разбор техники на материалы' },
  { key: 'gym', name: 'Спортзал', icon: '🏋', perks: 'выносливость, меньше расход энергии' },
  { key: 'storage', name: 'Склад', icon: '📦', perks: 'больше места для хранения ресурсов' },
  { key: 'greenhouse', name: 'Теплица', icon: '🌱', perks: 'постепенно производит еду' },
  { key: 'library', name: 'Библиотека', icon: '📚', perks: 'ускоряет изучение и взлом' },
  { key: 'radio', name: 'Радиоточка', icon: '📡', perks: 'принимает сообщения и координаты' },
  { key: 'armory', name: 'Оружейная', icon: '🔫', perks: 'хранилище оружия и боеприпасов' },
]

/** Вместимость хранилища: зависит от площади здания + склад даёт прибавку. */
export const STORAGE_PER_ROOM = 60

export function storageCapacity(areaM2: number, roomTypes: Record<number, RoomTypeKey> = {}): number {
  const fromArea = Math.round((areaM2 || 250) / 12)
  const stores = Object.values(roomTypes).filter((k) => k === 'storage').length
  return Math.max(60, Math.min(600, fromArea)) + stores * STORAGE_PER_ROOM
}

export function countRooms(roomTypes: Record<number, RoomTypeKey> | undefined, key: RoomTypeKey): number {
  if (!roomTypes) return 0
  return Object.values(roomTypes).filter((k) => k === key).length
}

export function roomTypeOf(key: RoomTypeKey | undefined): RoomType | null {
  if (!key) return null
  return ROOM_TYPES.find((t) => t.key === key) ?? null
}
