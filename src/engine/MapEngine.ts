import { circle } from '@turf/turf'
import maplibregl from 'maplibre-gl'
import { useGameStore } from '@/stores/game'

export class MapEngine {
  private map: maplibregl.Map | null = null
  private playerMarker: maplibregl.Marker | null = null
  private playerMarkerOuter: HTMLElement | null = null
  private playerMarkerFlip: HTMLElement | null = null
  private playerMarkerFrameWrap: HTMLElement | null = null
  private playerMarkerImg: HTMLElement | null = null
  private carMarkers: Map<string, maplibregl.Marker> = new Map()
  private carMarkerInners: Map<string, HTMLElement> = new Map()
  private shelterMarkers: Map<string, maplibregl.Marker> = new Map()
  private shelterMarkerEls: Map<string, HTMLElement> = new Map()
  private playerBaseW = 22
  private playerBaseH = 28
  private playerIsCar = false
  private onReadyCallback?: () => void
  private targetZoom: number | null = null
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

  private playerAnimState: 'idle' | 'walking' | 'running' | 'hacking' | 'dead' = 'idle'

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
      try { this.addShelterMarkers() } catch (e) { console.warn('shelter markers fail', e) }
      try { this.addCarMarkers() } catch (e) { console.warn('car markers fail', e) }
      try { this.createPlayerMarker() } catch (e) { console.warn('player marker fail', e) }
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
    el.style.overflow = 'hidden'
    el.style.filter = 'drop-shadow(0 0 6px #0f0)'

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

    const inner = document.createElement('div')
    inner.style.width = '100%'
    inner.style.backgroundRepeat = 'no-repeat'
    inner.style.position = 'absolute'
    inner.style.top = '0'
    inner.style.left = '0'

    frameWrap.appendChild(inner)
    flipWrap.appendChild(frameWrap)
    el.appendChild(flipWrap)
    this.playerMarkerOuter = el
    this.playerMarkerFlip = flipWrap
    this.playerMarkerFrameWrap = frameWrap
    frameWrap.style.overflow = 'hidden'
    this.playerMarkerImg = inner

    this.setPlayerFrame(this.playerAnimState)

    this.playerMarker = new maplibregl.Marker({ element: el })
      .setLngLat([useGameStore().playerLongitude, useGameStore().playerLatitude])
      .addTo(this.map!)
  }

  private addShelterMarkers() {
    const store = useGameStore()

    for (const shelter of store.shelters) {
      const el = document.createElement('div')
      el.style.width = '20px'
      el.style.height = '20px'
      el.style.background = '#ff0'
      el.style.border = '3px solid #fa0'
      el.style.transform = 'rotate(45deg)'
      el.style.boxShadow = '0 0 15px #ff0'
      el.style.zIndex = '80'

      const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
        .setLngLat([shelter.longitude, shelter.latitude])
        .setPopup(new maplibregl.Popup({ offset: 10 }).setText('Убежище'))
        .addTo(this.map!)
      this.shelterMarkers.set(shelter.id, marker)
      this.shelterMarkerEls.set(shelter.id, el)
    }
  }

  private createCarImage(angle?: number): HTMLElement {
    const el = document.createElement('div')
    el.style.width = '26px'
    el.style.height = '38px'
    el.style.overflow = 'hidden'
    el.style.filter = 'drop-shadow(0 0 6px #48f)'
    if (angle !== undefined) {
      el.style.transform = `rotate(${angle}rad)`
    }
    this.applyCarCellBackground(el, 26, 38)
    return el
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
    const w = Math.round(26 * scale)
    const h = Math.round(38 * scale)
    for (const marker of this.carMarkers.values()) {
      const el = marker.getElement()
      el.style.width = w + 'px'
      el.style.height = h + 'px'
      this.applyCarCellBackground(el, w, h)
    }
  }

  private addCarMarkers() {
    const store = useGameStore()

    for (const car of store.cars) {
      let lng = car.longitude
      let lat = car.latitude
      let attempts = 0
      while (!this.isValidSpawnPoint(lng, lat) && attempts < 20) {
        const jitter = (Math.random() - 0.5) * 0.0006
        lng = car.longitude + jitter
        lat = car.latitude + jitter
        attempts++
      }
      car.longitude = lng
      car.latitude = lat

      const el = this.createCarImage(car.angle)
      const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
        .setLngLat([lng, lat])
        .addTo(this.map!)
      this.carMarkers.set(car.id, marker)
      this.carMarkerInners.set(car.id, el)
    }
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
    const marker = this.carMarkers.get(id)
    if (marker) marker.getElement().style.transform = `rotate(${angle}rad)`
  }

  addCarMarker(id: string, lng: number, lat: number, angle?: number) {
    if (this.carMarkers.has(id)) return
    const el = this.createCarImage(angle)
    const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
      .setLngLat([lng, lat])
      .addTo(this.map!)
    this.carMarkers.set(id, marker)
    this.carMarkerInners.set(id, el)
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
    this.map?.flyTo({ zoom: z, duration: 600 })
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
      const [cx, cy, cw, ch] = MapEngine.CAR_CELL
      const s = Math.min(boxW / cw, boxH / ch)
      const sheetW = MapEngine.SHEET_W * s
      const sheetH = MapEngine.SHEET_H * s
      this.playerMarkerImg.style.backgroundImage = `url(${import.meta.env.BASE_URL}sprites.png)`
      this.playerMarkerImg.style.backgroundRepeat = 'no-repeat'
      this.playerMarkerImg.style.backgroundSize = `${sheetW.toFixed(2)}px ${sheetH.toFixed(2)}px`
      this.playerMarkerImg.style.backgroundPosition = `-${(cx * s).toFixed(2)}px -${(cy * s).toFixed(2)}px`
      this.playerMarkerImg.style.width = `${sheetW.toFixed(2)}px`
      this.playerMarkerImg.style.height = `${sheetH.toFixed(2)}px`
      if (this.playerMarkerFrameWrap) {
        this.playerMarkerFrameWrap.style.height = `${(ch * s).toFixed(2)}px`
        this.playerMarkerFrameWrap.style.top = `${((boxH - ch * s) / 2).toFixed(2)}px`
      }
      return
    }
    const frame = this.playerAnimState === 'hacking' ? MapEngine.PLAYER_HACK
      : this.playerAnimState === 'walking' || this.playerAnimState === 'running' ? MapEngine.PLAYER_WALK
      : this.playerAnimState === 'dead' ? MapEngine.PLAYER_DEAD
      : MapEngine.PLAYER_IDLE
    const s = Math.min(boxW / frame.w, boxH / frame.h)
    const sheetW = frame.w * s
    const sheetH = frame.h * frame.count * s
    const frameH = frame.h * s
    if (this.playerMarkerFrameWrap) {
      this.playerMarkerFrameWrap.style.height = `${(frameH - 2).toFixed(2)}px`
      this.playerMarkerFrameWrap.style.top = `${((boxH - frameH) / 2).toFixed(2)}px`
    }
    this.playerMarkerImg.style.backgroundImage = `url(${import.meta.env.BASE_URL}${frame.url})`
    this.playerMarkerImg.style.backgroundSize = `${sheetW.toFixed(2)}px ${sheetH.toFixed(2)}px`
    this.playerMarkerImg.style.backgroundPosition = '0 0'
    this.playerMarkerImg.style.width = `${sheetW.toFixed(2)}px`
    this.playerMarkerImg.style.height = `${sheetH.toFixed(2)}px`
  }

  setPlayerFrame(state: 'idle' | 'walking' | 'running' | 'hacking' | 'dead') {
    if (!this.playerMarkerImg) return
    this.playerAnimState = state
    this.playerMarkerImg.classList.remove('walking', 'running', 'hacking', 'idle', 'dead')
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
    } else {
      this.playerMarkerImg.classList.add('idle')
    }
  }

  setPlayerMarkerShadow(shadow: string) {
    if (this.playerMarkerOuter) {
      this.playerMarkerOuter.style.filter = `drop-shadow(0 0 6px ${shadow})`
    }
  }

  setPlayerMarkerShape(isCar: boolean) {
    if (!this.playerMarkerImg) return
    this.playerBaseW = isCar ? 26 : 22
    this.playerBaseH = isCar ? 38 : 28
    this.playerIsCar = isCar
    if (this.playerMarkerFlip) {
      this.playerMarkerFlip.style.transform = ''
    }
    if (isCar) {
      this.setPlayerMarkerShadow('#48f')
    } else {
      this.setPlayerMarkerShadow('#0f0')
    }
    this.playerMarkerImg.classList.remove('walking', 'running', 'hacking', 'idle')
    this.applyPlayerZoom(this.map?.getZoom() ?? 18)
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
      return id.startsWith('road_') || id.startsWith('tunnel_') || id.startsWith('bridge_') || id.startsWith('highway-') || id.includes('crossing')
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

  isOnWater(lng: number, lat: number): boolean {
    if (!this.map) return false
    const pt = this.map.project([lng, lat])
    const features = this.map.queryRenderedFeatures(pt)
    return features.some(f => {
      if (!f.layer) return false
      const id = f.layer.id
      return id === 'water' || id === 'waterway' || id.startsWith('water_')
    })
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

  setMarkersVisible(visible: boolean) {
    const v = visible ? '' : 'none'
    if (this.playerMarker) this.playerMarker.getElement().style.display = v
    for (const c of this.carMarkers.values()) c.getElement().style.display = v
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
      const polygon = circle([epicenterLng, epicenterLat], maxRadiusMeters / 1000, {
        steps: 64, units: 'kilometers',
      })
      this.map.addSource(id, { type: 'geojson', data: polygon as GeoJSON.Feature })
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

  highlightShelter(id: string) {
    const el = this.shelterMarkerEls.get(id)
    if (el) {
      el.style.boxShadow = '0 0 30px #0f0'
      el.style.borderColor = '#0f0'
    }
  }

  unhighlightShelter(id: string) {
    const el = this.shelterMarkerEls.get(id)
    if (el) {
      el.style.boxShadow = '0 0 15px #ff0'
      el.style.borderColor = '#fa0'
    }
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
