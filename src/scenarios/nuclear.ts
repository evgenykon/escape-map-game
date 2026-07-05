import type { Scenario, EpicenterSpec } from './types'

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

  explosionRadius: 1000,
  fuelConsumption: 50,
  hackSec: 15,

  init() {
    this.explosionRadius = Math.round(randomInRange(2500, 3500))
    const explosion = this.timeline.find(e => e.type === 'explosion')
    if (explosion) explosion.timeSec = Math.round(randomInRange(420, 600))
  },

  computeEpicenter(ctx): EpicenterSpec {
    const angle = Math.random() * 2 * Math.PI
    const { lat, lng } = offsetMeters(ctx.playerLatitude, ctx.playerLongitude, 1000, angle)
    return { latitude: lat, longitude: lng }
  },

  timeline: [
    { timeSec: 5, type: 'thought', texts: ['Надо зайти в магазин... Вроде, молоко дома закончилось.', 'Надо в парк...', 'Надо бы к родителям съездить...'] },
    { timeSec: 30, type: 'sms', text: '(Оповещение): Внимание! Чрезвычайная ситуация! Зафиксирован запуск ракеты в сторону нашего региона!' },
    { timeSec: 40, type: 'thought', texts: ['Черт, опять налёт... Наверное, успею.', 'Опять...', 'Ну что ж, я уже вышел из дома.'] },
    { timeSec: 90, type: 'sms', text: '(Сообщение в новостях): По оценкам МО ракета, выпущенная по нашему региону, может нести ядерный заряд!' },
    { timeSec: 100, type: 'thought', texts: ['СТОП, ЧТО??? Ядерный заряд?!', 'Так, это уже не очень весело...', 'Ядерный заряд? Да вы выдумываете.'] },
    { timeSec: 110, type: 'sms', text: '(Сообщение от друга): Привет! Видел новость? Мы собираемся сваливать подальше на восток.' },
    { timeSec: 120, type: 'thought', texts: ['Брат, я надеюсь мы еще увидимся...', 'Позвоню как стихнет...', 'Где они сейчас?.. Надеюсь, с ними всё в порядке.'] },
    { timeSec: 135, type: 'thought', texts: ['Надо сваливать!', 'Бежать!', 'Нужно убираться!'] },
    { timeSec: 150, type: 'sms', text: '(Оповещение): Внимание! Ракетная опасность! Спуститесь в подвал. Сохраняйте спокойствие.' },
    { timeSec: 160, type: 'thought', texts: ['Ага, сохраняю. Еще будут советы?', 'Спасибо, очень полезно...', 'Легко сказать "сохраняйте спокойствие".'] },
    { timeSec: 240, type: 'sms', text: '(Оповещение): Работает ПВО и спасательные службы! Избегайте паники и мест скопления людей и машин. Ждите дальнейших инструкций.' },
    { timeSec: 245, type: 'traffic' },
    { timeSec: 360, type: 'shelter', minM: 1500, maxM: 2000 },
    { timeSec: 360, type: 'sms', text: '(Оповещение): Внимание! Угроза применения ЯО! Найдите ближайшее убежище! Следуйте указателям на карте.' },
    { timeSec: 370, type: 'thought', texts: ['Убежище? Или двигаться дальше?', 'Где безопаснее?', 'Не знаю, кажется это не поможет, если весь город разнесёт...'] },
    { timeSec: 400, type: 'sms', text: '(Оповещение): Внимание! Опасайтесь оставаться на улицах! Немедленно найдите укрытие!' },
    { timeSec: 480, type: 'explosion' },
  ],

  resultTexts: {
    victoryTitle: 'ВЫ ВЫЖИЛИ',
    victorySubtitle: 'Неизвестно только, поздравлять ли вас с этим.',
    gameoverTitle: 'ВЫ ПОГИБЛИ',
    gameoverSubtitle: 'Как и миллионы других.',
    collapseTitle: 'ЗДАНИЕ РУХНУЛО',
    collapseSubtitle: 'Укрытие не спасло от обрушения.',
  },
}
