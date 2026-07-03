# Escape Map Game

Браузерная игра с открытой картой (MapLibre + OpenStreetMap), в которой игрок должен добраться до убежища до того, как произойдёт взрыв в случайном эпицентре. Реальные дороги и здания подгружаются через Overpass API вокруг геопозиции игрока.

> Все команды выполняются **только через `make`**. Прямой запуск `npm` / `vite` / `bun` запрещён — окружение обязано быть изолированным в Docker.

## Стек

| Слой | Технология |
|---|---|
| Язык | TypeScript |
| Сборка | Vite 5 |
| UI | Vue 3 (Composition API) |
| Состояние | Pinia |
| Карта | MapLibre GL JS |
| Гео-анализ | Turf.js |
| Данные карты | OpenStreetMap (Overpass API) |
| Контейнеризация | Docker + docker compose |

## Требования

- Docker 24+
- Docker Compose v2 (`docker compose ...`)
- Make
- Свободный порт `3001` (dev) и/или `80` (production)

## Структура

```
.
├── AGENTS.md              # правила проекта (приоритетнее README)
├── Makefile               # все сценарии запуска
├── docker-compose.yml     # dev- и production-сервисы
├── Dockerfile             # production-сборка (multi-stage → nginx)
├── Dockerfile.dev         # dev-образ (node:24-alpine + Vite HMR)
├── nginx.conf             # SPA fallback
├── vite.config.ts         # алиас @ → src, base для GH_PAGES
├── index.html
├── public/                # статические ассеты
└── src/
    ├── main.ts            # bootstrap Vue + Pinia
    ├── App.vue
    ├── components/        # StartScreen, LoadingScreen, GameScreen
    ├── stores/game.ts     # Pinia-store состояния игры
    └── engine/
        ├── MapEngine.ts        # инициализация MapLibre, слои
        ├── OverpassLoader.ts   # запрос дорог и зданий
        ├── PlayerController.ts # пешее движение
        └── CarPhysics.ts       # физика машины + снэп к графу
```

## Быстрый старт

### 1. Dev-режим (hot-reload)

```bash
make dev
```

Поднимет контейнер `frontend-dev`:
- внутри: Vite dev-server на `5173`
- наружу: `http://localhost:3001`
- исходники монтируются томом (`./:/app`), правки применяются без перезапуска
- зависимости (`node_modules`) хранятся в именованном anonymous-томе и не перетираются хостом

Остановить: `Ctrl+C`, затем `docker compose down` (или `docker compose down -v` чтобы сбросить `node_modules`-том).

### 2. Production-сборка и запуск

```bash
make build     # docker build образа frontend (профиль production)
make run       # запуск nginx-контейнера в фоне на порту 80
```

После `make run` игра доступна на `http://localhost/`.

Остановить:

```bash
docker compose --profile production down
```

### 3. Проверка типов

```bash
make typecheck
```

Запускает `vue-tsc --noEmit` внутри dev-контейнера. Проверяет TypeScript и Vue-шаблоны без сборки артефактов.

### 4. Деплой на GitHub Pages

```bash
make deploy-gh-pages
```

Соберёт `dist/` (с `base: '/escape-map-game/'`), переключится на ветку `gh-pages`, зальёт артефакт и вернётся на `main`. Требует чистого рабочего дерева и прав на `push` в `origin`.

## Сценарии Makefile

| Команда | Что делает |
|---|---|
| `make dev` | Поднимает dev-контейнер с HMR на `:3001` |
| `make typecheck` | Прогоняет `vue-tsc --noEmit` в dev-контейнере |
| `make build` | Собирает production-образ `frontend` (multi-stage) |
| `make run` | Запускает production-контейнер `frontend` в фоне на `:80` |
| `make deploy-gh-pages` | Сборка + деплой `dist/` в ветку `gh-pages` |

## Как играть

1. На стартовом экране выбрать сложность (влияет на таймер и мощность взрыва) и нажать **«Старт»**.
2. Браузер запросит геолокацию — нужно подтвердить.
3. Игра запросит у Overpass API дороги и здания в радиусе ~15 км, построит граф дорог, выберет 15–20 убежищ в кольце 5–10 км от эпицентра.
4. Управление:
   - **W / A / S / D** — движение
   - мышь — вращение камеры
   - **E** — сесть в машину / выйти
5. На экране HUD: обратный отсчёт, SMS-оповещения правительства, отметки убежищ.
6. В момент взрыва: если игрок **внутри** убежища — победа, иначе — поражение.

Карта и положение машины синхронизируются с реальной геометрией OSM (машина «прилипает» к ближайшему сегменту графа дорог).

## Переменные окружения

| Переменная | Где | Назначение | Значение по умолчанию |
|---|---|---|---|
| `GH_PAGES` | build-аргумент `frontend` | Включает `base: '/escape-map-game/'` в Vite | `1` |
| `NODE_ENV` | `frontend-dev` | Режим Node | `development` |

Передать своё значение: `GH_PAGES=0 make build`.

## Полезные команды

```bash
# логи dev-контейнера
docker compose logs -f frontend-dev

# зайти в shell dev-контейнера
docker compose run --rm --entrypoint sh frontend-dev

# пересобрать dev-образ с нуля
docker compose build --no-cache frontend-dev
```

## Правила и ограничения

- Запуск `npm run dev`, `npx vite` и подобных команд **напрямую** запрещён — только через `make`-цели.
- Любые правки `src/` подхватываются HMR в dev-режиме без перезапуска контейнера.
- Перед PR обязательно прогнать `make typecheck`.

Подробности — в [AGENTS.md](./AGENTS.md).
