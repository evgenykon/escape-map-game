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

export function roomTypeOf(key: RoomTypeKey | undefined): RoomType | null {
  if (!key) return null
  return ROOM_TYPES.find((t) => t.key === key) ?? null
}
