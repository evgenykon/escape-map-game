import { circle, distance, destination } from '@turf/turf'
import maplibregl from 'maplibre-gl'
import { useGameStore } from '@/stores/game'

export class MapEngine {
  private map: maplibregl.Map | null = null
  private playerMarker: maplibregl.Marker | null = null
  private playerMarkerOuter: HTMLElement | null = null
  private playerMarkerShadowWrap: HTMLElement | null = null
  private playerMarkerFlip: HTMLElement | null = null
  private playerMarkerFrameWrap: HTMLElement | null = null
  private playerMarkerImg: HTMLElement | null = null
  private carMarkers: Map<string, maplibregl.Marker> = new Map()
  private carMarkerInners: Map<string, HTMLElement> = new Map()
  private playerBaseW = 22
  private playerBaseH = 28
  private playerIsCar = false
  private playerCarSpriteData: { url: string; w: number; h: number; count: number; duration: number } | null = null
  private playerCarFrameH = 0
  private onReadyCallback?: () => void
  private targetZoom: number | null = null
  private crosshairMarker: maplibregl.Marker | null = null
  private playerThoughtEl: HTMLElement | null = null
  private thoughtTimer: ReturnType<typeof setTimeout> | null = null
  private shelterIconMarker: maplibregl.Marker | null = null
  private buildingDamageMarker: maplibregl.Marker | null = null
  private explosionInfoMarker: maplibregl.Marker | null = null
  private fuelStations: { lng: number; lat: number }[] = []
  private static readonly FUEL_ZONE_RADIUS_M = 20
  private initialCarsPlaced = false
  private static readonly SHEET_W = 276
  private static readonly SHEET_H = 262
  private static readonly PERSON_X = 185
  private static readonly PERSON_Y = 92
  private static readonly PERSON_W = 75
  private static readonly PERSON_H = 87
  private static readonly CAR_X = 29
  private static readonly CAR_Y = 23
  private static readonly CAR_W = 133
  private static readonly CAR_H = 202
  private static readonly PERSON_CELL: [number, number, number, number] = [
    MapEngine.PERSON_X,
    MapEngine.PERSON_Y,
    MapEngine.PERSON_W,
    MapEngine.PERSON_H,
  ]
  private static readonly CAR_CELL: [number, number, number, number] = [
    MapEngine.CAR_X,
    MapEngine.CAR_Y,
    MapEngine.CAR_W,
    MapEngine.CAR_H,
  ]

  private static readonly PLAYER_IDLE = { url: 'sprites/player-idle.png', w: 48, h: 48, count: 10, duration: 3 }
  private static readonly PLAYER_WALK = { url: 'sprites/player-walking.png', w: 48, h: 48, count: 6, duration: 0.6 }
  private static readonly PLAYER_HACK = { url: 'sprites/player-hacking.png', w: 48, h: 48, count: 4, duration: 1 }
  private static readonly PLAYER_DEAD = { url: 'sprites/dead.png', w: 32, h: 32, count: 1, duration: 0 }
  private static readonly PLAYER_SWIM = { url: 'sprites/player_swimming.png', w: 48, h: 48, count: 7, duration: 0.8 }
  private static readonly CAR_RED = { url: 'sprites/car-red.png', w: 120, h: 180, count: 11, duration: 0.8 }
  private static readonly CAR_BLUE = { url: 'sprites/car-blue.png', w: 120, h: 180, count: 11, duration: 0.8 }
  private static readonly CAR_GREEN = { url: 'sprites/car-green.png', w: 120, h: 180, count: 11, duration: 0.8 }
  private static readonly CAR_SPRITES = [MapEngine.CAR_RED, MapEngine.CAR_BLUE, MapEngine.CAR_GREEN]

  private playerAnimState: 'idle' | 'walking' | 'running' | 'hacking' | 'dead' | 'swimming' = 'idle'

  static getScale(zoom: number): number {
    return Math.max(0.4, 1 + (zoom - 19) * 0.7)
  }

  private applyCellBackground(
    inner: HTMLElement,
    cellX: number,
    cellY: number,
    cellW: number,
    cellH: number,
    boxW: number,
    boxH: number
  ) {
    const scale = Math.min(boxW / cellW, boxH / cellH)
    inner.style.backgroundImage = `url(${import.meta.env.BASE_URL}sprites.png)`
    inner.style.backgroundRepeat = 'no-repeat'
    inner.style.backgroundSize = `${(MapEngine.SHEET_W * scale).toFixed(2)}px ${(MapEngine.SHEET_H * scale).toFixed(2)}px`
    inner.style.backgroundPositionX = `-${(cellX * scale).toFixed(2)}px`
    inner.style.backgroundPositionY = `-${(cellY * scale).toFixed(2)}px`
  }

  onReady(cb: () => void) {
    this.onReadyCallback = cb
  }

  init(container: HTMLDivElement) {
    const store = useGameStore()

    this.map = new maplibregl.Map({
      container,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [store.playerLongitude, store.playerLatitude],
      zoom: 16,
      keyboard: false,
    })

    this.map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: false }), 'top-right')

    this.map.on('load', () => {
      try { this.createPlayerMarker() } catch (e) { console.warn('player marker fail', e) }
      this.createCrosshairMarker()
      this.applyAllCarsZoom(this.map!.getZoom())
      this.onReadyCallback?.()

      const layers = this.map!.getStyle().layers
      console.log('[MapEngine] All layer IDs:')
      for (const layer of layers) {
        console.log('  ', layer.id)
      }
    })

    this.map.on('move', () => {
      if (!this.map) return
    })

    let lastFeatureKey = ''
    this.map.on('mousemove', (e) => {
      if (!this.map) return
      const features = this.map.queryRenderedFeatures(e.point)
      const types = new Set<string>()
      for (const f of features) {
        const cls = f.properties?.class ?? f.properties?.subclass
        types.add(`${f.layer?.id ?? '?'}${cls ? ':' + cls : ''}`)
      }
      const key = [...types].sort().join('|')
      if (key !== lastFeatureKey) {
        lastFeatureKey = key
        console.log('[MapEngine] surface under cursor:', key || 'none')
      }
    })

    this.map.on('zoom', () => {
      if (this.map) this.applyAllCarsZoom(this.map.getZoom())
    })

    this.map.on('moveend', () => {
      if (this.map) this.applyAllCarsZoom(this.map.getZoom())
      const st = useGameStore()
      this.scanAndAddFuelStations(st.playerLongitude, st.playerLatitude)
    })

    this.map.on('styleimagemissing', (e) => {
      if (!this.map) return
      const id = e.id
      if (this.map.hasImage(id)) return
      const size = 16
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#888'
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.stroke()
      this.map.addImage(id, ctx.getImageData(0, 0, size, size))
    })

    this.map.on('error', (e) => {
      console.error('Map error:', e.error?.message || e)
    })

  }

  private createPlayerMarker() {
    const el = document.createElement('div')
    el.style.zIndex = '100'
    el.style.width = '22px'
    el.style.height = '28px'
    this.playerMarkerOuter = el

    const shadowWrap = document.createElement('div')
    shadowWrap.style.width = '100%'
    shadowWrap.style.height = '100%'
    shadowWrap.style.filter = 'drop-shadow(0 0 6px #0f0)'
    this.playerMarkerShadowWrap = shadowWrap

    const flipWrap = document.createElement('div')
    flipWrap.style.width = '100%'
    flipWrap.style.height = '100%'
    flipWrap.style.overflow = 'hidden'
    flipWrap.style.transform = ''
    flipWrap.style.transformOrigin = 'center'

    const frameWrap = document.createElement('div')
    frameWrap.style.width = '100%'
    frameWrap.style.overflow = 'hidden'
    frameWrap.style.position = 'relative'
    frameWrap.style.overflow = 'hidden'

    const inner = document.createElement('div')
    inner.style.width = '100%'
    inner.style.backgroundRepeat = 'no-repeat'
    inner.style.position = 'absolute'
    inner.style.top = '0'
    inner.style.left = '0'

    const thoughtEl = document.createElement('div')
    thoughtEl.style.cssText = `
      position:absolute; right:100%; bottom:100%;
      margin:0 12px 10px 0;
      background:rgba(255,255,255,0.95); color:#111;
      padding:6px 12px;
      border-radius:6px;
      font-family:'Courier New',monospace; font-size:11px; line-height:1.3;
      min-width:200px; max-width:280px;
      pointer-events:none; user-select:none;
      transition:opacity 0.4s; opacity:0;
      border:1px solid rgba(200,200,200,0.8); z-index:200;
    `
    const tail = document.createElement('div')
    tail.style.cssText = `
      position:absolute; top:-4px; left:50%;
      margin-left:-4px;
      width:8px; height:8px;
      background:rgba(255,255,255,0.95);
      border-left:1px solid rgba(200,200,200,0.8);
      border-top:1px solid rgba(200,200,200,0.8);
      transform:rotate(45deg);
      border-radius:1px;
    `
    thoughtEl.appendChild(tail)
    el.appendChild(thoughtEl)
    this.playerThoughtEl = thoughtEl

    frameWrap.appendChild(inner)
    flipWrap.appendChild(frameWrap)
    shadowWrap.appendChild(flipWrap)
    el.appendChild(shadowWrap)
    this.playerMarkerFlip = flipWrap
    this.playerMarkerFrameWrap = frameWrap
    this.playerMarkerImg = inner

    this.setPlayerFrame(this.playerAnimState)

    this.playerMarker = new maplibregl.Marker({ element: el })
      .setLngLat([useGameStore().playerLongitude, useGameStore().playerLatitude])
      .addTo(this.map!)
  }

  private createCrosshairMarker() {
    const el = document.createElement('div')
    el.style.width = '12px'
    el.style.height = '12px'
    el.style.zIndex = '100'

    const h = document.createElement('div')
    h.style.position = 'absolute'
    h.style.left = '0'
    h.style.top = '5px'
    h.style.width = '12px'
    h.style.height = '2px'
    h.style.background = '#fff'
    h.style.boxShadow = '0 0 2px rgba(0,0,0,0.9)'

    const v = document.createElement('div')
    v.style.position = 'absolute'
    v.style.left = '5px'
    v.style.top = '0'
    v.style.width = '2px'
    v.style.height = '12px'
    v.style.background = '#fff'
    v.style.boxShadow = '0 0 2px rgba(0,0,0,0.9)'

    el.appendChild(h)
    el.appendChild(v)

    this.crosshairMarker = new maplibregl.Marker({ element: el })
      .setLngLat([useGameStore().playerLongitude, useGameStore().playerLatitude])
      .addTo(this.map!)
    this.crosshairMarker.getElement().style.display = 'none'
  }

  setMapModeCrosshair(show: boolean) {
    if (!this.playerMarker || !this.crosshairMarker) return
    this.playerMarker.getElement().style.display = show ? 'none' : ''
    this.crosshairMarker.getElement().style.display = show ? '' : 'none'
  }

  setThought(text: string | null) {
    if (!this.playerThoughtEl) return
    if (this.thoughtTimer) { clearTimeout(this.thoughtTimer); this.thoughtTimer = null }
    if (!text) {
      this.playerThoughtEl.style.opacity = '0'
      return
    }
    this.playerThoughtEl.textContent = text
    this.playerThoughtEl.style.opacity = '1'
    this.thoughtTimer = setTimeout(() => {
      if (this.playerThoughtEl) this.playerThoughtEl.style.opacity = '0'
      this.thoughtTimer = null
    }, 4000)
  }

  private createCarImage(angle?: number, carSprite?: { url: string; w: number; h: number; count: number; duration: number }): { outer: HTMLElement; inner: HTMLElement } {
    const frame = carSprite ?? MapEngine.CAR_RED
    const outer = document.createElement('div')
    outer.style.width = '36px'
    outer.style.height = '53px'

    const inner = document.createElement('div')
    inner.style.width = '100%'
    inner.style.height = '100%'
    inner.style.overflow = 'hidden'
    inner.style.filter = 'drop-shadow(0 0 6px #48f)'
    if (angle !== undefined) {
      inner.style.transform = `rotate(${angle}rad)`
    }

    const frameWrap = document.createElement('div')
    frameWrap.style.width = '100%'
    frameWrap.style.overflow = 'hidden'
    frameWrap.style.position = 'relative'

    const sprite = document.createElement('div')
    sprite.style.width = '100%'
    sprite.style.backgroundImage = `url(${import.meta.env.BASE_URL}${frame.url})`
    sprite.style.backgroundRepeat = 'no-repeat'
    sprite.style.backgroundPosition = '0 0'
    sprite.style.position = 'absolute'
    sprite.style.top = '0'
    sprite.style.left = '0'

    frameWrap.appendChild(sprite)
    inner.appendChild(frameWrap)
    outer.appendChild(inner)
    return { outer, inner }
  }

  private applyCarCellBackground(el: HTMLElement, boxW: number, boxH: number) {
    const scale = Math.min(boxW / MapEngine.CAR_W, boxH / MapEngine.CAR_H)
    el.style.backgroundImage = `url(${import.meta.env.BASE_URL}sprites.png)`
    el.style.backgroundRepeat = 'no-repeat'
    el.style.backgroundSize = `${(MapEngine.SHEET_W * scale).toFixed(2)}px ${(MapEngine.SHEET_H * scale).toFixed(2)}px`
    el.style.backgroundPositionX = `-${(MapEngine.CAR_X * scale).toFixed(2)}px`
    el.style.backgroundPositionY = `-${(MapEngine.CAR_Y * scale).toFixed(2)}px`
  }

  private applyAllCarsZoom(zoom: number) {
    const natural = MapEngine.getScale(zoom)
    const scale = Math.max(0.5, natural - 0.2)
    const boxW = Math.round(36 * scale)
    const boxH = Math.round(53 * scale)

    for (const marker of this.carMarkers.values()) {
      marker.getElement().style.width = boxW + 'px'
      marker.getElement().style.height = boxH + 'px'
    }
    for (const inner of this.carMarkerInners.values()) {
      const sW = inner.dataset.spriteW ? Number(inner.dataset.spriteW) : 120
      const sH = inner.dataset.spriteH ? Number(inner.dataset.spriteH) : 180
      const sCount = inner.dataset.spriteCount ? Number(inner.dataset.spriteCount) : 11
      const sUrl = inner.dataset.spriteUrl ?? MapEngine.CAR_RED.url

      inner.style.width = boxW + 'px'
      inner.style.height = boxH + 'px'
      const frameWrap = inner.firstElementChild as HTMLElement | null
      if (frameWrap) {
        const s = Math.min(boxW / sW, boxH / sH)
        const frameH = sH * s
        frameWrap.style.height = `${(frameH - 2).toFixed(2)}px`
        const sprite = frameWrap.firstElementChild as HTMLElement | null
        if (sprite) {
          sprite.style.backgroundImage = `url(${import.meta.env.BASE_URL}${sUrl})`
          sprite.style.backgroundSize = `${(sW * s).toFixed(2)}px ${(sH * sCount * s).toFixed(2)}px`
          sprite.style.width = `${(sW * s).toFixed(2)}px`
          sprite.style.height = `${(sH * sCount * s).toFixed(2)}px`
        }
      }
    }
  }

  private addCarMarkers() {
    const store = useGameStore()

    for (const car of store.cars) {
      if (this.carMarkers.has(car.id)) continue
      const carSprite = MapEngine.CAR_SPRITES[Math.floor(Math.random() * MapEngine.CAR_SPRITES.length)]
      const { outer, inner } = this.createCarImage(car.angle, carSprite)
      inner.dataset.spriteUrl = carSprite.url
      inner.dataset.spriteW = String(carSprite.w)
      inner.dataset.spriteH = String(carSprite.h)
      inner.dataset.spriteCount = String(carSprite.count)
      const marker = new maplibregl.Marker({ element: outer, rotationAlignment: 'map' })
        .setLngLat([car.longitude, car.latitude])
        .addTo(this.map!)
      this.carMarkers.set(car.id, marker)
      this.carMarkerInners.set(car.id, inner)
    }
  }

  refreshCarMarkers() {
    if (!this.map) return
    const store = useGameStore()
    const M_PER_DEG = 111320
    const cosLat = Math.cos(store.playerLatitude * Math.PI / 180)

    if (!this.initialCarsPlaced) {
      this.initialCarsPlaced = true
      for (let i = 0; i < 12; i++) {
        let placed = false
        for (let pass = 0; pass < 2 && !placed; pass++) {
          for (let attempt = 0; attempt < 60; attempt++) {
            const angle = Math.random() * 2 * Math.PI
            const dist = 30 + Math.random() * 150
            const dlat = (dist / M_PER_DEG) * Math.cos(angle)
            const dlng = (dist / (M_PER_DEG * cosLat)) * Math.sin(angle)
            const lng = store.playerLongitude + dlng
            const lat = store.playerLatitude + dlat
            try {
              if (this.isInsideBuilding(lng, lat)) continue
              if (this.isOnOffroadSurface(lng, lat)) continue
              if (pass === 0 && !this.isOnRoad(lng, lat) && this._hasAnyFeature(lng, lat)) continue
            } catch { continue }
            store.cars.push({
              id: `car-${i}`,
              longitude: lng,
              latitude: lat,
              angle: Math.random() * 2 * Math.PI,
              fuel: Math.random() * 0.3,
            })
            placed = true
            break
          }
        }
      }
    }

    for (const car of store.cars) {
      let needMove = false
      try {
        needMove = !this.isValidSpawnPoint(car.longitude, car.latitude) || this.isOnOffroadSurface(car.longitude, car.latitude)
      } catch {}
      if (!needMove) continue

      let placed = false
      const originLng = store.playerLongitude
      const originLat = store.playerLatitude
      for (let pass = 0; pass < 2 && !placed; pass++) {
        for (let attempt = 0; attempt < 60; attempt++) {
          const angle = Math.random() * 2 * Math.PI
          const dist = 30 + Math.random() * 200
          const dlat = (dist / M_PER_DEG) * Math.cos(angle)
          const dlng = (dist / (M_PER_DEG * cosLat)) * Math.sin(angle)
          const lng = originLng + dlng
          const lat = originLat + dlat
          try {
            if (this.isInsideBuilding(lng, lat)) continue
            if (this.isOnOffroadSurface(lng, lat)) continue
            if (pass === 0 && !this.isOnRoad(lng, lat) && this._hasAnyFeature(lng, lat)) continue
          } catch { continue }
          car.longitude = lng
          car.latitude = lat
          const marker = this.carMarkers.get(car.id)
          if (marker) marker.setLngLat([lng, lat])
          placed = true
          break
        }
      }
    }
    this.addCarMarkers()
    this.findAndPlaceFuelStations()
    this.addCarMarkers()
    if (this.map) this.applyAllCarsZoom(this.map.getZoom())
  }

  moveCarMarker(id: string, lng: number, lat: number) {
    const marker = this.carMarkers.get(id)
    if (marker) marker.setLngLat([lng, lat])
  }

  hideCarMarker(id: string) {
    const marker = this.carMarkers.get(id)
    if (marker) marker.getElement().style.display = 'none'
  }

  showCarMarker(id: string, lng: number, lat: number) {
    const marker = this.carMarkers.get(id)
    if (marker) {
      marker.setLngLat([lng, lat])
      marker.getElement().style.display = ''
    }
  }

  setCarMarkerAngle(id: string, angle: number) {
    const inner = this.carMarkerInners.get(id)
    if (inner) inner.style.transform = `rotate(${angle}rad)`
  }

  addCarMarker(id: string, lng: number, lat: number, angle?: number) {
    if (this.carMarkers.has(id)) return
    const carSprite = MapEngine.CAR_SPRITES[Math.floor(Math.random() * MapEngine.CAR_SPRITES.length)]
    const { outer, inner } = this.createCarImage(angle, carSprite)
    inner.dataset.spriteUrl = carSprite.url
    inner.dataset.spriteW = String(carSprite.w)
    inner.dataset.spriteH = String(carSprite.h)
    inner.dataset.spriteCount = String(carSprite.count)
    const marker = new maplibregl.Marker({ element: outer, rotationAlignment: 'map' })
      .setLngLat([lng, lat])
      .addTo(this.map!)
    this.carMarkers.set(id, marker)
    this.carMarkerInners.set(id, inner)
    if (this.map) this.applyAllCarsZoom(this.map.getZoom())
  }

  removeCarMarker(id: string) {
    const marker = this.carMarkers.get(id)
    if (marker) {
      marker.remove()
      this.carMarkers.delete(id)
      this.carMarkerInners.delete(id)
    }
  }

  setCarMarkersVisible(visible: boolean) {
    for (const marker of this.carMarkers.values()) {
      marker.getElement().style.display = visible ? '' : 'none'
    }
  }

  getBounds(): { n: number; s: number; e: number; w: number } | null {
    if (!this.map) return null
    const b = this.map.getBounds()
    return { n: b.getNorth(), s: b.getSouth(), e: b.getEast(), w: b.getWest() }
  }

  setPlayerZoom(zoom: number) {
    this.applyPlayerZoom(zoom)
  }

  updatePlayerPosition(lng: number, lat: number, angle?: number, zoom?: number) {
    if (this.playerMarker) {
      this.playerMarker.setLngLat([lng, lat])
    }
    if (this.map) {
      this.map.setCenter([lng, lat])
      if (zoom !== undefined) {
        this.applyPlayerZoom(zoom)
        this.applyAllCarsZoom(zoom)
        this.targetZoom = zoom
        this.map.setZoom(zoom)
      } else {
        this.targetZoom = null
      }
      if (angle !== undefined) {
        this.map.setBearing(angle * 180 / Math.PI)
      }
    }
  }

  rotatePlayerMarker(_angle: number) {
    // Handled by map bearing
  }

  flyTo(lng: number, lat: number) {
    this.map?.flyTo({ center: [lng, lat], duration: 1500 })
  }

  setMapZoom(z: number) {
    this.map?.flyTo({ zoom: z, duration: 1500 })
  }

  getCurrentZoom(): number {
    return this.map?.getZoom() ?? 18
  }

  getCurrentScale(): number {
    return MapEngine.getScale(this.getCurrentZoom())
  }

  fitBounds(lng1: number, lat1: number, lng2: number, lat2: number, padding: number = 200) {
    this.map?.fitBounds([[lng1, lat1], [lng2, lat2]], { padding, duration: 1500 })
  }

  setMovementScale(_factor: number) {
    // no-op: scale is now purely zoom-based via MapEngine.getScale
  }

  private applyPlayerZoom(zoom: number) {
    if (!this.playerMarkerOuter) return
    const natural = MapEngine.getScale(zoom)
    const store = useGameStore()
    let scale: number
    if (store.isHacking) {
      scale = 3
    } else if (this.playerIsCar) {
      scale = Math.max(0.5, natural - 0.2)
    } else {
      scale = natural
    }
    const w = Math.round(this.playerBaseW * scale)
    const h = Math.round(this.playerBaseH * scale) - 2
    this.playerMarkerOuter.style.width = w + 'px'
    this.playerMarkerOuter.style.height = h + 'px'
    this.applyPlayerBackground(scale, w, h)
  }

  private applyPlayerBackground(scale: number, boxW: number, boxH: number) {
    if (!this.playerMarkerImg) return
    if (this.playerIsCar) {
      const frame = this.playerCarSpriteData ?? MapEngine.CAR_RED
      const s = Math.min(boxW / frame.w, boxH / frame.h)
      const sheetW = frame.w * s
      const sheetH = frame.h * frame.count * s
      const frameH = frame.h * s
      this.playerCarFrameH = frameH
      this.playerMarkerImg.style.backgroundImage = `url(${import.meta.env.BASE_URL}${frame.url})`
      this.playerMarkerImg.style.backgroundRepeat = 'no-repeat'
      this.playerMarkerImg.style.backgroundSize = `${sheetW.toFixed(2)}px ${sheetH.toFixed(2)}px`
      this.playerMarkerImg.style.backgroundPosition = '0 0'
      this.playerMarkerImg.style.width = `${sheetW.toFixed(2)}px`
      this.playerMarkerImg.style.height = `${sheetH.toFixed(2)}px`
      if (this.playerMarkerFrameWrap) {
        this.playerMarkerFrameWrap.style.height = `${frameH.toFixed(2)}px`
        this.playerMarkerFrameWrap.style.top = `${((boxH - frameH) / 2).toFixed(2)}px`
      }
      return
    }
    const frame = this.playerAnimState === 'hacking' ? MapEngine.PLAYER_HACK
      : this.playerAnimState === 'walking' || this.playerAnimState === 'running' ? MapEngine.PLAYER_WALK
      : this.playerAnimState === 'dead' ? MapEngine.PLAYER_DEAD
      : this.playerAnimState === 'swimming' ? MapEngine.PLAYER_SWIM
      : MapEngine.PLAYER_IDLE
    const s = Math.min(boxW / frame.w, boxH / frame.h)
    const sheetW = frame.w * s
    const sheetH = frame.h * frame.count * s
    const frameH = frame.h * s
    if (this.playerMarkerFrameWrap) {
      this.playerMarkerFrameWrap.style.height = `${frameH.toFixed(2)}px`
      this.playerMarkerFrameWrap.style.top = `${((boxH - frameH) / 2).toFixed(2)}px`
    }
    this.playerMarkerImg.style.backgroundImage = `url(${import.meta.env.BASE_URL}${frame.url})`
    this.playerMarkerImg.style.backgroundSize = `${sheetW.toFixed(2)}px ${sheetH.toFixed(2)}px`
    this.playerMarkerImg.style.backgroundPosition = '0 0'
    this.playerMarkerImg.style.width = `${sheetW.toFixed(2)}px`
    this.playerMarkerImg.style.height = `${sheetH.toFixed(2)}px`
  }

  setPlayerFrame(state: 'idle' | 'walking' | 'running' | 'hacking' | 'dead' | 'swimming') {
    if (!this.playerMarkerImg) return
    this.playerAnimState = state
    this.playerMarkerImg.classList.remove('walking', 'running', 'hacking', 'idle', 'dead', 'swimming')
    this.applyPlayerZoom(this.map?.getZoom() ?? 18)
    if (state === 'walking' || state === 'running') {
      this.playerMarkerImg.classList.add('walking')
      if (state === 'running') {
        this.playerMarkerImg.classList.add('running')
      }
    } else if (state === 'hacking') {
      this.playerMarkerImg.classList.add('hacking')
    } else if (state === 'dead') {
      this.playerMarkerImg.classList.add('dead')
    } else if (state === 'swimming') {
      this.playerMarkerImg.classList.add('swimming')
    } else {
      this.playerMarkerImg.classList.add('idle')
    }
  }

  setPlayerMarkerShadow(shadow: string) {
    if (this.playerMarkerShadowWrap) {
      this.playerMarkerShadowWrap.style.filter = `drop-shadow(0 0 6px ${shadow})`
    }
  }

  setPlayerMarkerShape(isCar: boolean) {
    if (!this.playerMarkerImg) return
    this.playerBaseW = isCar ? 36 : 22
    this.playerBaseH = isCar ? 53 : 28
    this.playerIsCar = isCar
    if (this.playerMarkerFlip) {
      this.playerMarkerFlip.style.transform = ''
    }
    if (isCar) {
      this.setPlayerMarkerShadow('#48f')
    } else {
      this.setPlayerMarkerShadow('#0f0')
    }
    this.playerMarkerImg.classList.remove('walking', 'running', 'hacking', 'idle', 'swimming', 'dead')
    this.applyPlayerZoom(this.map?.getZoom() ?? 18)
  }

  setPlayerCarSprite(sprite: { url: string; w: number; h: number; count: number; duration: number }) {
    this.playerCarSpriteData = sprite
  }

  clearPlayerCarSprite() {
    this.setPlayerCarMoving(false)
    this.playerCarSpriteData = null
  }

  setPlayerCarMoving(moving: boolean) {
    if (!this.playerMarkerImg || !this.playerIsCar) return
    if (moving) {
      this.playerMarkerImg.classList.add('car-moving')
    } else {
      this.playerMarkerImg.classList.remove('car-moving')
    }
  }

  getCarMarkerSprite(carId: string): { url: string; w: number; h: number; count: number; duration: number } | null {
    const inner = this.carMarkerInners.get(carId)
    if (!inner) return null
    const url = inner.dataset.spriteUrl
    const w = Number(inner.dataset.spriteW)
    const h = Number(inner.dataset.spriteH)
    const count = Number(inner.dataset.spriteCount)
    if (!url || !w || !h || !count) return null
    const duration = MapEngine.CAR_RED.duration
    return { url, w, h, count, duration }
  }

  isInsideBuilding(lng: number, lat: number): boolean {
    if (!this.map) return false
    const pt = this.map.project([lng, lat])
    const r = 8
    const features = this.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]])
    const hasBridgePath = features.some(f => f.layer?.id.startsWith('bridge_path_'))
    if (hasBridgePath) return false
    return features.some(f => f.layer && (f.layer.id === 'building' || f.layer.id === 'building-3d'))
  }

  isInsideBuilding2d(lng: number, lat: number): boolean {
    if (!this.map) return false
    const pt = this.map.project([lng, lat])
    const r = 8
    const features = this.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]])
    const hasBridgePath = features.some(f => f.layer?.id.startsWith('bridge_path_'))
    if (hasBridgePath) return false
    return features.some(f => f.layer && f.layer.id === 'building')
  }

  hasBuilding3d(lng: number, lat: number): boolean {
    if (!this.map) return false
    const pt = this.map.project([lng, lat])
    const r = 8
    const features = this.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]])
    return features.some(f => f.layer?.id === 'building-3d')
  }

  isOnRoad(lng: number, lat: number): boolean {
    if (!this.map) return false
    const pt = this.map.project([lng, lat])
    const r = 12
    const features = this.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]])
    return features.some(f => {
      if (!f.layer) return false
      const id = f.layer.id
      return id.startsWith('road') || id.startsWith('tunnel') || id.startsWith('bridge') || id.startsWith('highway-') || id.includes('crossing') || id.startsWith('transportation_')
    })
  }

  isOnOffroadSurface(lng: number, lat: number): boolean {
    if (!this.map) return false
    const pt = this.map.project([lng, lat])
    const r = 12
    const features = this.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]])
    return features.some(f => {
      if (!f.layer) return false
      const id = f.layer.id
      const cls = f.properties?.class
      return id.startsWith('landcover_grass') || cls === 'grass'
          || id.startsWith('landcover_wood') || cls === 'wood'
    })
  }

  private _hasAnyFeature(lng: number, lat: number): boolean {
    if (!this.map) return false
    const pt = this.map.project([lng, lat])
    const r = 12
    const features = this.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]])
    return features.length > 0
  }

  isOnWater(lng: number, lat: number): boolean {
    if (!this.map) return false
    const pt = this.map.project([lng, lat])
    const r = 12
    const features = this.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]])
    return features.some(f => {
      if (!f.layer) return false
      const id = f.layer.id
      const cls = f.properties?.class
      return id === 'water' || id === 'waterway' || id.startsWith('water_') || cls === 'water'
    })
  }

  private isOnForest(lng: number, lat: number): boolean {
    if (!this.map) return false
    const pt = this.map.project([lng, lat])
    const r = 12
    const features = this.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]])
    return features.some(f => {
      if (!f.layer) return false
      const id = f.layer.id
      const cls = f.properties?.class
      return id.startsWith('landcover_wood') || cls === 'wood'
    })
  }

  private isOnGrass(lng: number, lat: number): boolean {
    if (!this.map) return false
    const pt = this.map.project([lng, lat])
    const r = 12
    const features = this.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]])
    return features.some(f => {
      if (!f.layer) return false
      const id = f.layer.id
      const cls = f.properties?.class
      return id.startsWith('landcover_grass') || cls === 'grass'
    })
  }

  private isOnPark(lng: number, lat: number): boolean {
    if (!this.map) return false
    const pt = this.map.project([lng, lat])
    const r = 12
    const features = this.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]])
    return features.some(f => {
      if (!f.layer) return false
      const id = f.layer.id
      const cls = f.properties?.class
      return id.startsWith('landuse_park') || id.startsWith('leisure_') || cls === 'park' || cls === 'leisure'
    })
  }

  getSurfaceType(lng: number, lat: number): string {
    if (this.isInsideBuilding(lng, lat)) return 'building'
    if (this.isOnWater(lng, lat)) return 'water'
    if (this.isOnPark(lng, lat)) return 'park'
    if (this.isOnForest(lng, lat)) return 'forest'
    if (this.isOnGrass(lng, lat)) return 'grass'
    if (this.isOnRoad(lng, lat)) return 'road'
    return 'default'
  }

  isValidSpawnPoint(lng: number, lat: number): boolean {
    return !this.isInsideBuilding(lng, lat) && !this.isOnWater(lng, lat)
  }

  findValidSpawnPoint(lng: number, lat: number, maxRadiusM: number = 1500): { lat: number; lng: number } | null {
    if (this.isValidSpawnPoint(lng, lat)) return { lat, lng }
    const M_PER_DEG_LAT = 111320
    for (let attempt = 0; attempt < 100; attempt++) {
      const angle = Math.random() * 2 * Math.PI
      const dist = Math.random() * maxRadiusM
      const dlat = (dist / M_PER_DEG_LAT) * Math.cos(angle)
      const dlng = (dist / (M_PER_DEG_LAT * Math.cos(lat * Math.PI / 180))) * Math.sin(angle)
      const newLat = lat + dlat
      const newLng = lng + dlng
      if (this.isValidSpawnPoint(newLng, newLat)) return { lat: newLat, lng: newLng }
    }
    return null
  }

  private findShelterBuilding(lng: number, lat: number, minM: number, maxM: number): { lng: number; lat: number } | null {
    if (!this.map) return null
    const M_PER_DEG = 111320
    const cosLat = Math.cos(lat * Math.PI / 180)

    const sourceFeatures = this.map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' })
    const candidates: { lng: number; lat: number }[] = []
    for (const f of sourceFeatures) {
      if (!f.geometry) continue
      let rings: number[][] = []
      if (f.geometry.type === 'Polygon') rings = f.geometry.coordinates[0]
      else if (f.geometry.type === 'MultiPolygon') {
        const first = f.geometry.coordinates[0]
        if (first?.length) rings = first[0]
      }
      if (!rings.length) continue
      let cx = 0, cy = 0, n = 0
      for (const [x, y] of rings) {
        cx += x; cy += y; n++
      }
      cx /= n; cy /= n
      const dist = Math.sqrt(((cx - lng) * cosLat * M_PER_DEG) ** 2 + ((cy - lat) * M_PER_DEG) ** 2)
      if (dist >= minM && dist <= maxM && this.isInsideBuilding(cx, cy)) {
        candidates.push({ lng: cx, lat: cy })
      }
    }

    if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)]

    for (let attempt = 0; attempt < 500; attempt++) {
      const angle = Math.random() * 2 * Math.PI
      const dist = minM + Math.random() * (maxM - minM)
      const dlat = (dist / M_PER_DEG) * Math.cos(angle)
      const dlng = (dist / (M_PER_DEG * cosLat)) * Math.sin(angle)
      const clng = lng + dlng
      const clat = lat + dlat
      if (this.isInsideBuilding(clng, clat)) {
        return { lng: clng, lat: clat }
      }
    }

    return null
  }

  assignShelterBuilding(playerLng: number, playerLat: number, minM: number, maxM: number): boolean {
    if (!this.map) return false
    const store = useGameStore()
    const M_PER_DEG = 111320
    const cosLat = Math.cos(playerLat * Math.PI / 180)

    let building = this.findShelterBuilding(playerLng, playerLat, minM, maxM)
    if (!building) {
      const targetAngle = Math.random() * 2 * Math.PI
      const targetDist = minM + Math.random() * (maxM - minM)
      const tLat = playerLat + (targetDist / M_PER_DEG) * Math.cos(targetAngle)
      const tLng = playerLng + (targetDist / (M_PER_DEG * cosLat)) * Math.sin(targetAngle)
      const savedZoom = this.map.getZoom()
      const savedCenter = this.map.getCenter()

      this.map.jumpTo({ center: [tLng, tLat], zoom: 14 })
      this.map.once('idle', () => {
        building = this.findShelterBuilding(playerLng, playerLat, minM, maxM)
        if (!building) building = { lng: tLng, lat: tLat }
        this._placeShelter(building)
        this.map?.jumpTo({ center: savedCenter, zoom: savedZoom })
      })
      return true
    }

    this._placeShelter(building)
    return true
  }

  private _placeShelter(building: { lng: number; lat: number }) {
    if (!this.map) return
    const store = useGameStore()

    if (store.shelters.length === 0) {
      store.shelters.push({ id: 'shelter-evacuation', longitude: building.lng, latitude: building.lat })
    } else {
      store.shelters[0] = { id: 'shelter-evacuation', longitude: building.lng, latitude: building.lat }
    }

    const el = document.createElement('img')
    el.src = import.meta.env.BASE_URL + 'icons/shelter.png'
    el.style.width = '32px'
    el.style.height = '32px'
    el.style.zIndex = '90'
    el.style.filter = 'drop-shadow(0 0 6px rgba(255,200,0,0.6))'

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([building.lng, building.lat])
      .addTo(this.map)
    if (this.shelterIconMarker) this.shelterIconMarker.remove()
    this.shelterIconMarker = marker

    const zoneId = 'evacuation-zone'
    if (!this.map.getSource(zoneId)) {
      const polygon = circle([building.lng, building.lat], 0.05, { steps: 32, units: 'kilometers' })
      this.map.addSource(zoneId, { type: 'geojson', data: polygon as GeoJSON.Feature })
      this.map.addLayer({
        id: 'evacuation-zone-fill',
        type: 'fill',
        source: zoneId,
        paint: { 'fill-color': '#0f0', 'fill-opacity': 0.15 },
      })
      this.map.addLayer({
        id: 'evacuation-zone-outline',
        type: 'line',
        source: zoneId,
        paint: { 'line-color': '#0f0', 'line-opacity': 0.5, 'line-width': 2, 'line-dasharray': [4, 4] },
      })
    }

    store.shelterHudVisible = true
  }

  private _placeFuelZones() {
    if (!this.map || this.fuelStations.length === 0) return
    const zoneId = 'fuel-zone'
    if (this.map.getLayer('fuel-zone-fill')) this.map.removeLayer('fuel-zone-fill')
    if (this.map.getLayer('fuel-zone-outline')) this.map.removeLayer('fuel-zone-outline')
    if (this.map.getSource(zoneId)) this.map.removeSource(zoneId)

    const polygons: GeoJSON.Polygon[] = []
    for (const s of this.fuelStations) {
      const polygon = circle([s.lng, s.lat], MapEngine.FUEL_ZONE_RADIUS_M / 1000, { steps: 24, units: 'kilometers' })
      polygons.push(polygon.geometry as GeoJSON.Polygon)
    }

    this.map.addSource(zoneId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: polygons.map(p => ({ type: 'Feature', geometry: p, properties: {} })) },
    })
    this.map.addLayer({
      id: 'fuel-zone-fill',
      type: 'fill',
      source: zoneId,
      paint: { 'fill-color': '#9b59b6', 'fill-opacity': 0.2 },
    })
    this.map.addLayer({
      id: 'fuel-zone-outline',
      type: 'line',
      source: zoneId,
      paint: { 'line-color': '#9b59b6', 'line-opacity': 0.5, 'line-width': 2, 'line-dasharray': [4, 4] },
    })
  }

  private _scanFuelStations(playerLng: number, playerLat: number): { lng: number; lat: number }[] {
    if (!this.map) return []
    const found: { lng: number; lat: number }[] = []
    const pt = this.map.project([playerLng, playerLat])
    const r = 500
    const features = this.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]]) as any[]
    for (const f of features) {
      if (f.properties?.class === 'fuel' && f.geometry?.type === 'Point') {
        const coords = (f.geometry as GeoJSON.Point).coordinates
        const tooClose = found.some(s => distance([s.lng, s.lat], coords, { units: 'meters' }) < MapEngine.FUEL_ZONE_RADIUS_M * 2)
        if (!tooClose) found.push({ lng: coords[0], lat: coords[1] })
      }
    }
    return found
  }

  private _updateFuelZonesSource() {
    if (!this.map) return
    const zoneId = 'fuel-zone'
    const polygons: GeoJSON.Polygon[] = []
    for (const s of this.fuelStations) {
      const polygon = circle([s.lng, s.lat], MapEngine.FUEL_ZONE_RADIUS_M / 1000, { steps: 24, units: 'kilometers' })
      polygons.push(polygon.geometry as GeoJSON.Polygon)
    }
    const src = this.map.getSource(zoneId) as any
    if (src) {
      src.setData({ type: 'FeatureCollection', features: polygons.map(p => ({ type: 'Feature', geometry: p, properties: {} })) })
    }
  }

  private _spawnFuelStationCars(station: { lng: number; lat: number }, store: ReturnType<typeof useGameStore>) {
    for (let i = 0; i < 4; i++) {
      const id = `fuel-${station.lng}-${station.lat}-${i}`
      const existingCar = store.cars.find(c => c.id === id)
      if (existingCar) continue
      let placed = false
      for (let attempt = 0; attempt < 10 && !placed; attempt++) {
        const angle = Math.random() * 2 * Math.PI
        const dist = 5 + Math.random() * 15
        const M_PER_DEG = 111320
        const cosLat = Math.cos(station.lat * Math.PI / 180)
        const dlat = (dist / M_PER_DEG) * Math.cos(angle)
        const dlng = (dist / (M_PER_DEG * cosLat)) * Math.sin(angle)
        const carLng = station.lng + dlng
        const carLat = station.lat + dlat
        if (this.isInsideBuilding(carLng, carLat)) continue
        store.cars.push({
          id,
          longitude: carLng,
          latitude: carLat,
          angle: Math.random() * 2 * Math.PI,
          fuel: 0,
        })
        this.addCarMarker(id, carLng, carLat, Math.random() * 2 * Math.PI)
        placed = true
      }
    }
  }

  scanAndAddFuelStations(playerLng: number, playerLat: number) {
    const newStations = this._scanFuelStations(playerLng, playerLat)
    const reallyNew: { lng: number; lat: number }[] = []
    for (const s of newStations) {
      const existing = this.fuelStations.find(e => distance([e.lng, e.lat], [s.lng, s.lat], { units: 'meters' }) < MapEngine.FUEL_ZONE_RADIUS_M * 2)
      if (!existing) {
        this.fuelStations.push(s)
        reallyNew.push(s)
      }
    }
    if (reallyNew.length === 0) return
    const store = useGameStore()
    for (const s of reallyNew) {
      this._spawnFuelStationCars(s, store)
    }
    const zoneId = 'fuel-zone'
    if (this.map && this.map.getSource(zoneId)) {
      this._updateFuelZonesSource()
    } else {
      this._placeFuelZones()
    }
  }

  findAndPlaceFuelStations() {
    if (!this.map) return
    const store = useGameStore()
    this.fuelStations = this._scanFuelStations(store.playerLongitude, store.playerLatitude)
    if (this.fuelStations.length === 0) {
      const style = this.map.getStyle()
      const layerDef = style.layers?.find(l => l.id === 'poi_r1') as any
      if (layerDef?.source && layerDef?.['source-layer']) {
        const features = this.map.querySourceFeatures(layerDef.source, { sourceLayer: layerDef['source-layer'] }) as any[]
        for (const f of features) {
          if (f.properties?.class === 'fuel' && f.geometry?.type === 'Point') {
            const coords = (f.geometry as GeoJSON.Point).coordinates
            const existing = this.fuelStations.find(s => Math.abs(s.lng - coords[0]) < 0.0001 && Math.abs(s.lat - coords[1]) < 0.0001)
            if (!existing) this.fuelStations.push({ lng: coords[0], lat: coords[1] })
          }
        }
      }
    }
    this.fuelStations = this.fuelStations.filter((s, i, arr) => i === arr.findIndex(e => Math.abs(e.lng - s.lng) < 0.0001 && Math.abs(e.lat - s.lat) < 0.0001))
    if (this.fuelStations.length === 0) return
    this._placeFuelZones()
    for (const station of this.fuelStations) {
      this._spawnFuelStationCars(station, store)
    }
  }

  isInFuelZone(lng: number, lat: number): boolean {
    for (const s of this.fuelStations) {
      const d = distance([lng, lat], [s.lng, s.lat], { units: 'meters' })
      if (d < MapEngine.FUEL_ZONE_RADIUS_M) return true
    }
    return false
  }

  setFuelZonesVisible(visible: boolean) {
    if (!this.map) return
    const opacity = visible ? 0.2 : 0
    const lineOpacity = visible ? 0.5 : 0
    if (this.map.getLayer('fuel-zone-fill')) this.map.setPaintProperty('fuel-zone-fill', 'fill-opacity', opacity)
    if (this.map.getLayer('fuel-zone-outline')) this.map.setPaintProperty('fuel-zone-outline', 'line-opacity', lineOpacity)
  }

  clearFuelZones() {
    this.fuelStations = []
    if (!this.map) return
    const zoneId = 'fuel-zone'
    if (this.map.getLayer('fuel-zone-fill')) this.map.removeLayer('fuel-zone-fill')
    if (this.map.getLayer('fuel-zone-outline')) this.map.removeLayer('fuel-zone-outline')
    if (this.map.getSource(zoneId)) this.map.removeSource(zoneId)
  }

  setMarkersVisible(visible: boolean) {
    const v = visible ? '' : 'none'
    if (this.playerMarker) this.playerMarker.getElement().style.display = v
    if (this.shelterIconMarker) this.shelterIconMarker.getElement().style.display = v
    for (const c of this.carMarkers.values()) c.getElement().style.display = v
  }

  findBuildingCenterNear(lng: number, lat: number): { lng: number; lat: number } | null {
    if (!this.map) return null
    const pt = this.map.project([lng, lat])
    const r = 64
    const features = this.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]], { layers: ['building', 'building-3d'] }) as any[]
    for (const f of features) {
      if (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') {
        let rings: number[][] = []
        if (f.geometry.type === 'Polygon') rings = f.geometry.coordinates[0]
        else if (f.geometry.type === 'MultiPolygon') {
          const first = f.geometry.coordinates[0]
          if (first?.length) rings = first[0]
        }
        if (!rings.length) continue
        let cx = 0, cy = 0, n = 0
        for (const [x, y] of rings) {
          cx += x; cy += y; n++
        }
        return { lng: cx / n, lat: cy / n }
      }
    }
    return null
  }

  showBuildingDamageLabel(lng: number, lat: number, percent: number) {
    if (!this.map) return
    const dest = destination([lng, lat], 5, 90, { units: 'meters' })
    const pos = dest.geometry.coordinates as [number, number]
    const el = document.createElement('div')
    el.textContent = `Повреждение здания: ${Math.round(percent * 100)}%`
    el.style.cssText = `
      color:#fff; font-family:'Courier New',monospace;
      font-size:0.8rem; font-weight:bold;
      text-shadow:0 0 4px rgba(0,0,0,0.8);
      pointer-events:none; user-select:none;
      z-index:200;
    `
    if (this.buildingDamageMarker) this.buildingDamageMarker.remove()
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat(pos)
      .addTo(this.map)
    this.buildingDamageMarker = marker
  }

  removeBuildingDamageLabel() {
    if (this.buildingDamageMarker) {
      this.buildingDamageMarker.remove()
      this.buildingDamageMarker = null
    }
  }

  showExplosionInfoMarker(lng: number, lat: number, text: string) {
    if (!this.map) return
    if (this.explosionInfoMarker) this.explosionInfoMarker.remove()
    const dest = destination([lng, lat], 12, -90, { units: 'meters' })
    const pos = dest.geometry.coordinates as [number, number]
    const el = document.createElement('div')
    el.textContent = text
    el.style.cssText = `
      color:#fff; font-family:'Courier New',monospace;
      font-size:0.8rem; font-weight:bold;
      text-shadow:0 0 4px rgba(0,0,0,0.8);
      pointer-events:none; user-select:none;
      z-index:200;
      background:rgba(0,0,0,0.6);
      padding:6px 10px;
      border-radius:6px;
      line-height:1.5;
      white-space:pre-line;
    `
    this.explosionInfoMarker = new maplibregl.Marker({ element: el })
      .setLngLat(pos)
      .addTo(this.map)
  }

  removeExplosionInfoMarker() {
    if (this.explosionInfoMarker) {
      this.explosionInfoMarker.remove()
      this.explosionInfoMarker = null
    }
  }

  flyToEpicenter(lng: number, lat: number, cb: () => void) {
    this.map?.flyTo({ center: [lng, lat], zoom: 13, duration: 3000 })
    this.map?.once('moveend', cb)
  }

  flyToPlayer(lat: number, lng: number, cb: () => void) {
    this.map?.flyTo({ center: [lng, lat], zoom: 19, duration: 1500 })
    this.map?.once('moveend', cb)
  }

  flyToZoom(zoom: number) {
    if (this.map) {
      this.map.flyTo({ zoom, duration: 2000 })
    }
  }

  showExplosion(epicenterLng: number, epicenterLat: number, maxRadiusMeters: number) {
    if (!this.map) return

    const id = 'blast-zone'
    if (!this.map.getSource(id)) {
      const initial = circle([epicenterLng, epicenterLat], 0, {
        steps: 64, units: 'kilometers',
      })
      this.map.addSource(id, { type: 'geojson', data: initial as GeoJSON.Feature })
      this.map.addLayer({
        id: 'blast-zone-layer',
        type: 'fill',
        source: id,
        paint: { 'fill-color': '#000', 'fill-opacity': 0.5 },
      })
      this.map.addLayer({
        id: 'blast-zone-outline',
        type: 'line',
        source: id,
        paint: { 'line-color': '#000', 'line-width': 3 },
      })
    }

    const start = performance.now()
    const maxRadiusKm = maxRadiusMeters / 1000
    const tick = () => {
      if (!this.map) return
      const elapsed = performance.now() - start
      const t = Math.min(elapsed / 1000, 1)
      const radiusKm = maxRadiusKm * t
      const poly = circle([epicenterLng, epicenterLat], radiusKm, {
        steps: 64, units: 'kilometers',
      })
      const src = this.map.getSource(id) as maplibregl.GeoJSONSource
      if (src) src.setData(poly as GeoJSON.Feature)
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    const el = document.createElement('video')
    el.src = import.meta.env.BASE_URL + 'explosion.mp4'
    el.muted = true
    el.playsInline = true
    el.style.width = '600px'
    el.style.height = '600px'
    el.style.objectFit = 'cover'
    el.style.borderRadius = '50%'
    el.style.mixBlendMode = 'screen'
    el.style.pointerEvents = 'none'
    el.style.zIndex = '2'

    new maplibregl.Marker({ element: el })
      .setLngLat([epicenterLng, epicenterLat])
      .addTo(this.map)

    el.play().catch(() => {})

    setTimeout(() => el.remove(), 15500)
  }

  showShockwave(epicenterLng: number, epicenterLat: number, maxRadiusMeters: number) {
    if (!this.map) return

    const duration = 15000
    const startRadiusKm = maxRadiusMeters / 1000
    const endRadiusKm = startRadiusKm * 12
    const start = performance.now()
    const latRad = epicenterLat * Math.PI / 180
    const lineId = 'shockwave-line'
    const lineSourceId = 'shockwave-line-src'

    // Gradient circle marker (stays after explosion)
    const el = document.createElement('div')
    el.style.position = 'absolute'
    el.style.borderRadius = '50%'
    el.style.pointerEvents = 'none'
    el.style.zIndex = '1'
    el.style.background = 'radial-gradient(circle, rgba(80,80,80,0.7) 0%, rgba(80,80,80,0.35) 40%, rgba(80,80,80,0) 70%)'

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([epicenterLng, epicenterLat])
      .addTo(this.map)

    // Red dashed line (removed after animation)
    const initial = circle([epicenterLng, epicenterLat], startRadiusKm, {
      steps: 64, units: 'kilometers',
    })
    this.map.addSource(lineSourceId, { type: 'geojson', data: initial as GeoJSON.Feature })
    this.map.addLayer({
      id: lineId,
      type: 'line',
      source: lineSourceId,
      paint: {
        'line-color': '#f00',
        'line-dasharray': [4, 6],
        'line-width': 8,
      },
    })

    const tick = () => {
      if (!this.map) return
      const elapsed = performance.now() - start
      const t = Math.min(elapsed / duration, 1)
      const radiusKm = startRadiusKm + (endRadiusKm - startRadiusKm) * t
      const zoom = this.map.getZoom()
      const metersPerPixel = 156543.03 * Math.cos(latRad) / Math.pow(2, zoom)
      const radiusPx = (radiusKm * 1000) / metersPerPixel

      // Update gradient marker
      el.style.width = Math.round(radiusPx * 2) + 'px'
      el.style.height = Math.round(radiusPx * 2) + 'px'

      // Update dashed line
      const poly = circle([epicenterLng, epicenterLat], radiusKm, {
        steps: 64, units: 'kilometers',
      })
      const src = this.map.getSource(lineSourceId) as maplibregl.GeoJSONSource
      if (src) src.setData(poly as GeoJSON.Feature)
      const width = Math.max(1, Math.round(8 * (1 - t * 0.875)))
      this.map.setPaintProperty(lineId, 'line-width', width)

      if (t < 1) {
        requestAnimationFrame(tick)
      } else {
        if (this.map.getLayer(lineId)) this.map.removeLayer(lineId)
        if (this.map.getSource(lineSourceId)) this.map.removeSource(lineSourceId)
        // keep gradient marker sized to current zoom
        const keepTick = () => {
          if (!this.map || !this.map.getStyle()) return
          const zoom = this.map.getZoom()
          const mpp = 156543.03 * Math.cos(latRad) / Math.pow(2, zoom)
          const px = Math.round((endRadiusKm * 1000) / mpp * 2)
          el.style.width = px + 'px'
          el.style.height = px + 'px'
          requestAnimationFrame(keepTick)
        }
        requestAnimationFrame(keepTick)
      }
    }
    requestAnimationFrame(tick)
  }

  highlightCar(id: string) {
    const el = this.carMarkerInners.get(id)
    if (el) {
      el.style.filter = 'drop-shadow(0 0 10px #0f0)'
    }
  }

  unhighlightCar(id: string) {
    const el = this.carMarkerInners.get(id)
    if (el) {
      el.style.filter = 'drop-shadow(0 0 6px #48f)'
    }
  }

  destroy() {
    this.map?.remove()
    this.map = null
  }
}
