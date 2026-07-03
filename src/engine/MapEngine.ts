import { destination } from '@turf/turf'
import maplibregl from 'maplibre-gl'
import { useGameStore } from '@/stores/game'

export class MapEngine {
  private map: maplibregl.Map | null = null
  private playerMarker: maplibregl.Marker | null = null
  private playerMarkerOuter: HTMLElement | null = null
  private playerMarkerFlip: HTMLElement | null = null
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

  static getScale(zoom: number): number {
    return 1 + (zoom - 19) * 0.7
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
    el.style.overflow = 'visible'

    const flipWrap = document.createElement('div')
    flipWrap.style.width = '100%'
    flipWrap.style.height = '100%'
    flipWrap.style.transform = 'rotate(180deg)'
    flipWrap.style.transformOrigin = 'center'

    const inner = document.createElement('div')
    inner.style.width = '100%'
    inner.style.height = '100%'
    inner.style.overflow = 'hidden'
    const [px, py, pw, ph] = MapEngine.PERSON_CELL
    this.applyCellBackground(inner, px, py, pw, ph, this.playerBaseW, this.playerBaseH)
    inner.style.filter = 'drop-shadow(0 0 6px #0f0)'

    flipWrap.appendChild(inner)
    el.appendChild(flipWrap)
    this.playerMarkerOuter = el
    this.playerMarkerFlip = flipWrap
    this.playerMarkerImg = inner

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
    const scale = MapEngine.getScale(zoom)
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
    const scale = MapEngine.getScale(zoom)
    const w = Math.round(this.playerBaseW * scale)
    const h = Math.round(this.playerBaseH * scale)
    this.playerMarkerOuter.style.width = w + 'px'
    this.playerMarkerOuter.style.height = h + 'px'
    if (this.playerMarkerImg) {
      const [cx, cy, cw, ch] = this.playerIsCar ? MapEngine.CAR_CELL : MapEngine.PERSON_CELL
      this.applyCellBackground(this.playerMarkerImg, cx, cy, cw, ch, w, h)
    }
  }

  setPlayerMarkerShadow(shadow: string) {
    if (this.playerMarkerImg) {
      this.playerMarkerImg.style.filter = `drop-shadow(0 0 6px ${shadow})`
    }
  }

  setPlayerMarkerShape(isCar: boolean) {
    if (!this.playerMarkerImg) return
    this.playerBaseW = isCar ? 26 : 22
    this.playerBaseH = isCar ? 38 : 28
    this.playerIsCar = isCar
    if (this.playerMarkerFlip) {
      this.playerMarkerFlip.style.transform = isCar ? '' : 'rotate(180deg)'
    }
    if (isCar) {
      this.playerMarkerImg.style.filter = 'drop-shadow(0 0 6px #48f)'
    } else {
      this.playerMarkerImg.style.filter = 'drop-shadow(0 0 6px #0f0)'
    }
    this.playerMarkerImg.classList.remove('walking', 'running')
    this.applyPlayerZoom(this.map?.getZoom() ?? 18)
  }

  setPlayerWalkFrame(frame: number) {
    if (!this.playerMarkerImg) return
    const isIdle = frame === 0
    const isRunning = frame === 2
    this.playerMarkerImg.classList.toggle('walking', !isIdle)
    this.playerMarkerImg.classList.toggle('running', isRunning)
    this.applyPlayerZoom(this.map?.getZoom() ?? 18)
  }

  isInsideBuilding(lng: number, lat: number): boolean {
    if (!this.map) return false
    const pt = this.map.project([lng, lat])
    const features = this.map.queryRenderedFeatures(pt)
    return features.some(f => f.layer && (f.layer.id === 'building' || f.layer.id === 'building-3d'))
  }

  isOnRoad(lng: number, lat: number): boolean {
    if (!this.map) return false
    const pt = this.map.project([lng, lat])
    const r = 12
    const features = this.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]])
    return features.some(f => {
      if (!f.layer) return false
      const id = f.layer.id
      return id.startsWith('road_') || id.startsWith('tunnel_') || id.startsWith('bridge_') || id.startsWith('highway-')
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

  showExplosion(epicenterLng: number, epicenterLat: number, maxRadiusMeters: number) {
    if (!this.map) return

    const store = useGameStore()
    const id = 'explosion-circle'
    const layerId = 'explosion-layer'

    this.map.addSource(id, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: [epicenterLng, epicenterLat],
        },
      },
    })

    this.map.addLayer({
      id: layerId,
      type: 'circle',
      source: id,
      paint: {
        'circle-radius': 0,
        'circle-color': '#f44',
        'circle-opacity': 0.4,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#f44',
      },
    })

    const blastZoneId = 'blast-zone'
    this.map.addSource(blastZoneId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [epicenterLng, epicenterLat] },
      },
    })
    this.map.addLayer({
      id: 'blast-zone-layer',
      type: 'circle',
      source: blastZoneId,
      paint: {
        'circle-radius': 30,
        'circle-color': '#f44',
        'circle-opacity': 0.6,
        'circle-stroke-width': 3,
        'circle-stroke-color': '#f80',
        'circle-blur': 0.3,
      },
    })

    const dest = destination([epicenterLng, epicenterLat], maxRadiusMeters, 90, { units: 'meters' })
    const maxPixels = this.map.project([epicenterLng, epicenterLat]).x - this.map.project(dest.geometry.coordinates as [number, number]).x

    let radius = 0
    const interval = setInterval(() => {
      radius += maxPixels / 50
      if (radius >= maxPixels) {
        clearInterval(interval)
      }
      if (this.map && this.map.getLayer(layerId)) {
        this.map.setPaintProperty(layerId, 'circle-radius', radius)
      }
    }, 100)
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
