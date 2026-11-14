# Запекание спрайтов (Blender)

Скрипт рендерит игровые спрайты машин и персонажа из 3D-моделей: ортокамера сверху,
EEVEE с raytracing, прозрачный фон. На выходе — вертикальные PNG-полосы кадров.

## Что получается

| Ассет | Файл | Размер | Кадров |
|---|---|---|---|
| Машина (каждый цвет) | `public/sprites/cars/car-<color>.png` | 128×2048 | 16 направлений, по 1 кадру |
| Персонаж, ходьба | `public/sprites/player/walk-<dir>.png` | 128×1024 | 8 направлений × 8 кадров |
| Персонаж, взлом | `public/sprites/player/hack-<dir>.png` | 128×768 | 8 направлений × 6 кадров |
| Персонаж, плавание | `public/sprites/player/swim-<dir>.png` | 128×768 | 8 направлений × 6 кадров |
| Персонаж, смерть | `public/sprites/player/dead-<dir>.png` | 128×128 | 8 направлений × 1 кадр (+ `dead-single.png` для оверлея) |

Кадр машины выбирается в рантайме по углу (`MapEngine.carFrameIndex`), а не прокручивается
по времени. У персонажа лист на направление, внутри — 8 кадров цикла ходьбы.

## Запуск

Нужен Blender 4.2+ / 5.x в PATH (или полный путь к `blender.exe`).

```bash
# машины: 16 направлений, три цвета
CARCOLOR=red   CARS=16 PDIRS=0 blender -b -P bake_sprites.py
CARCOLOR=blue  CARS=16 PDIRS=0 blender -b -P bake_sprites.py
CARCOLOR=green CARS=16 PDIRS=0 blender -b -P bake_sprites.py

# персонаж: 8 направлений × 8 кадров ходьбы
CARS=0 PDIRS=8 PFRAMES=8 blender -b -P bake_sprites.py

# персонаж: анимация взлома (8 направлений × 6 кадров)
CARS=0 PDIRS=8 PFRAMES=6 MODE=hack blender -b -P bake_sprites.py

# персонаж: плавание и смерть
CARS=0 PDIRS=8 PFRAMES=6 MODE=swim blender -b -P bake_sprites.py
CARS=0 PDIRS=8 PFRAMES=1 MODE=dead blender -b -P bake_sprites.py
```

Кадры складываются в `frames_v5_<color>/` (машины) и `frames_v5/` (персонаж) рядом со скриптом.
Сборка полос в листы — `ffmpeg`:

```bash
ffmpeg -y -i frames_v5_red/car_%02d.png -vf "scale=128:128:flags=lanczos,tile=1x16" -frames:v 1 public/sprites/cars/car-red.png
ffmpeg -y -start_number 0 -i frames_v5/pl_03_%02d.png -vf "scale=128:128:flags=lanczos,tile=1x8" -frames:v 1 public/sprites/player/walk-3.png
```

Полный прогон (80 кадров) занимает ~2–3 минуты, ~1.2 с на кадр.

## Модели

- **Машина** — процедурная, строится прямо в скрипте (`build_car`): кузов и остекление —
  лофт по сечениям (superellipse), сужение к носу и корме, булевы вырезы арок, стекло,
  хром, диски со спицами. Форма правится в таблицах сечений `loft(...)`.
- **Персонаж** — `assets/character-casual.glb`, Quaternius «Ultimate Modular Men» (CC0).
  Скелет: `Hips / UpperLeg.L/R / LowerLeg.L/R / UpperArm.L/R`. Поза и цикл ходьбы
  задаются процедурно (`world_rot`), анимации в модели нет.

Внимание по осям: после импорта glTF арматура повёрнута, поэтому в её пространстве
**Y = мировая Z (вверх)**, а «руки вниз» — это поворот вокруг локальной `Z`, не `Y`.

## Настройки рендера

`EL = 46°` — наклон камеры (как в GTA2: видно объём, а не только крышу),
`ortho_scale 5.05` для машины и `1.95` для персонажа, 48 сэмплов EEVEE,
тональность AgX с экспозицией −0.4.
