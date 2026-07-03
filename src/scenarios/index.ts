import type { Scenario, ScenarioConfig } from './types'

export type ScenarioMeta = ScenarioConfig

export interface ScenarioEntry {
  meta: ScenarioMeta
  loader: () => Promise<Scenario>
}

export const scenarioRegistry: ScenarioEntry[] = [
  {
    meta: {
      id: 'nuclear',
      title: 'Ядерный взрыв',
      description: 'Зафиксирован запуск ракеты в ваш регион. У вас несколько минут, чтобы добраться до убежища.',
      icon: '☢️',
    },
    loader: () => import('./nuclear').then(m => m.nuclearScenario),
  },
]

export function findScenarioMeta(id: string): ScenarioMeta | undefined {
  return scenarioRegistry.find(s => s.meta.id === id)?.meta
}

export function loadScenario(id: string): Promise<Scenario> {
  const entry = scenarioRegistry.find(s => s.meta.id === id)
  if (!entry) {
    return Promise.reject(new Error(`Сценарий "${id}" не найден`))
  }
  return entry.loader()
}
