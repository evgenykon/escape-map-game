import type { Scenario, SpawnContext, EpicenterSpec, SpawnResult } from './types'
import type { Shelter, Car } from '@/stores/game'

const M_PER_DEG_LAT = 111320

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function offsetMeters(lat: number, lng: number, distanceM: number, angleRad: number): { lat: number; lng: number } {
  const dlat = (distanceM / M_PER_DEG_LAT) * Math.cos(angleRad)
  const dlng = (distanceM / (M_PER_DEG_LAT * Math.cos(lat * Math.PI / 180))) * Math.sin(angleRad)
  return { lat: lat + dlat, lng: lng + dlng }
}

export const nuclearScenario: Scenario = {
  config: {
    id: 'nuclear',
    title: 'Ядерный взрыв',
    description: 'Зафиксирован запуск ракеты в ваш регион. У вас несколько минут, чтобы добраться до убежища.',
    icon: '☢️',
  },

  timerMinutes: 8,
  explosionRadius: 1000,
  fuelConsumption: 50,
  hackSec: 15,

  init() {
    this.timerMinutes = Math.round(randomInRange(7, 10))
    this.explosionRadius = Math.round(randomInRange(800, 1500))
  },

  computeEpicenter(ctx: SpawnContext): EpicenterSpec {
    const angle = Math.random() * 2 * Math.PI
    const { lat, lng } = offsetMeters(ctx.playerLatitude, ctx.playerLongitude, 1000, angle)
    return { latitude: lat, longitude: lng }
  },

  computeSpawn(ctx: SpawnContext, epicenter: EpicenterSpec): SpawnResult {
    const shelters: Shelter[] = []
    const cars: Car[] = []

    const shelterCount = 18
    for (let i = 0; i < shelterCount; i++) {
      const angle = Math.random() * 2 * Math.PI
      const dist = randomInRange(5000, 10000)
      const { lat, lng } = offsetMeters(epicenter.latitude, epicenter.longitude, dist, angle)
      shelters.push({
        id: `shelter-${i}`,
        latitude: lat,
        longitude: lng,
      })
    }

    const carCount = 12
    for (let i = 0; i < carCount; i++) {
      const placeAngle = Math.random() * 2 * Math.PI
      const dist = randomInRange(100, 350)
      const { lat, lng } = offsetMeters(ctx.playerLatitude, ctx.playerLongitude, dist, placeAngle)
      cars.push({
        id: `car-${i}`,
        latitude: lat,
        longitude: lng,
        angle: Math.random() * 2 * Math.PI,
        fuel: 0.3 + Math.random() * 0.7,
      })
    }

    return { shelters, cars }
  },

  thoughts: [
    { timeSec: 5, texts: ['Надо зайти в магазин... Вроде, молоко дома закончилось.', 'Надо в парк...', 'Надо бы к родителям съездить...'] },
    { timeSec: 40, texts: ['Черт, опять налёт... Наверное, успею.', 'Опять...', 'Ну что ж, я уже вышел из дома.'] },
    { timeSec: 100, texts: ['СТОП, ЧТО??? Ядерный заряд?!', 'Так, это уже не очень весело...', 'Ядерный заряд? Да вы выдумываете.'] },
    { timeSec: 105, texts: ['Надо сваливать!', 'Бежать!', 'Нужно убираться!'] },
    { timeSec: 120, texts: ['Брат, я надеюсь мы еще увидимся...', 'Позвоню как стихнет...', 'Где они сейчас?.. Надеюсь, с ними всё в порядке.'] },
    { timeSec: 160, texts: ['Ага, сохраняю. Еще будут советы?', 'Спасибо, очень полезно...', 'Легко сказать "сохраняйте спокойствие".'] },
    { timeSec: 370, texts: ['Убежище? Или двигаться дальше?', 'Где безопаснее?', 'Не знаю, кажется это не поможет, если весь город разнесёт...'] },
  ],

  smsTexts: [
    { timeSec: 30, text: '(Оповещение): Внимание! Чрезвычайная ситуация! Зафиксирован запуск ракеты в сторону нашего региона!' },
    { timeSec: 90, text: '(Сообщение в новостях): По оценкам МО ракета, выпущенная по нашему региону, может нести ядерный заряд!' },
    { timeSec: 110, text: '(Сообщение от друга): Привет! Видел объявление? Мы собираемся сваливать подальше на восток.' },
    { timeSec: 150, text: '(Оповещение): Внимание! Ракетная опасность! Спуститесь в подвал. Не пользуйтесь лифтами. Держитесь подальше от окон. Сохраняйте спокойствие.' },
    { timeSec: 240, text: '(Оповещение): Работает ПВО и спасательные службы! Избегайте паники и мест скопления людей и машин. Ждите дальнейших инструкций.' },
    { timeSec: 360, text: '(Оповещение): Внимание! Угроза применения ЯО! Найдите ближайшее убежище! Следуйте указателям на карте.', triggerShelterHud: true },
    { timeSec: 400, text: '(Оповещение): Внимание! Опасайтесь оставаться на улицах! Немедленно найдите укрытие!' },
  ],

  resultTexts: {
    victoryTitle: 'ВЫ ВЫЖИЛИ',
    victorySubtitle: 'Неизвестно только, поздравлять ли вас с этим.',
    gameoverTitle: 'ВЫ ПОГИБЛИ',
    gameoverSubtitle: 'Вы не спаслись.',
  },
}
