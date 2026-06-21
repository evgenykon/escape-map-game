import maplibregl from 'maplibre-gl'
import { useGameStore } from '@/stores/game'

export class MapEngine {
  private map: maplibregl.Map | null = null
  private playerMarker: maplibregl.Marker | null = null
  private playerMarkerImg: HTMLElement | null = null
  private carMarkers: Map<string, maplibregl.Marker> = new Map()
  private carMarkerInners: Map<string, HTMLElement> = new Map()
  private shelterMarkers: Map<string, maplibregl.Marker> = new Map()
  private shelterMarkerEls: Map<string, HTMLElement> = new Map()
  private onReadyCallback?: () => void

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

    this.map.addControl(new maplibregl.NavigationControl(), 'top-right')

    this.map.on('load', () => {
      try { this.addShelterMarkers() } catch (e) { console.warn('shelter markers fail', e) }
      try { this.addCarMarkers() } catch (e) { console.warn('car markers fail', e) }
      try { this.addEpicenterMarker() } catch (e) { console.warn('epicenter fail', e) }
      try { this.createPlayerMarker() } catch (e) { console.warn('player marker fail', e) }
      this.onReadyCallback?.()
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
    el.style.width = '22px'
    el.style.height = '28px'
    el.style.background = 'no-repeat center/contain url(/player.png)'
    el.style.filter = 'drop-shadow(0 0 6px #0f0)'
    el.style.zIndex = '100'
    this.playerMarkerImg = el

    this.playerMarker = new maplibregl.Marker({ element: el })
      .setLngLat([useGameStore().playerLongitude, useGameStore().playerLatitude])
      .addTo(this.map!)
  }

  private addEpicenterMarker() {
    const store = useGameStore()
    const el = document.createElement('div')
    el.style.width = '24px'
    el.style.height = '24px'
    el.style.background = '#f44'
    el.style.borderRadius = '50%'
    el.style.border = '3px solid #fff'
    el.style.boxShadow = '0 0 30px #f44'
    el.style.zIndex = '90'

    new maplibregl.Marker({ element: el })
      .setLngLat([store.epicenterLongitude, store.epicenterLatitude])
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
    el.style.background = 'no-repeat center/contain url(/car.png)'
    el.style.filter = 'drop-shadow(0 0 6px #48f)'
    if (angle !== undefined) {
      el.style.transform = `rotate(${angle}rad)`
    }
    return el
  }

  private addCarMarkers() {
    const store = useGameStore()

    for (const car of store.cars) {
      let lng = car.longitude
      let lat = car.latitude
      let attempts = 0
      while (this.isInsideBuilding(lng, lat) && attempts < 20) {
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

  getBounds(): { n: number; s: number; e: number; w: number } | null {
    if (!this.map) return null
    const b = this.map.getBounds()
    return { n: b.getNorth(), s: b.getSouth(), e: b.getEast(), w: b.getWest() }
  }

  updatePlayerPosition(lng: number, lat: number, angle?: number) {
    if (this.playerMarker) {
      this.playerMarker.setLngLat([lng, lat])
    }
    if (this.map) {
      this.map.setCenter([lng, lat])
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

  setPlayerMarkerShadow(shadow: string) {
    if (this.playerMarkerImg) {
      this.playerMarkerImg.style.filter = `drop-shadow(0 0 6px ${shadow})`
    }
  }

  setPlayerMarkerShape(isCar: boolean) {
    if (!this.playerMarkerImg) return
    this.playerMarkerImg.style.backgroundImage = isCar ? 'url(/car.png)' : 'url(/player.png)'
    this.playerMarkerImg.style.width = isCar ? '26px' : '22px'
    this.playerMarkerImg.style.height = isCar ? '38px' : '28px'
    this.playerMarkerImg.style.filter = isCar
      ? 'drop-shadow(0 0 6px #48f)'
      : 'drop-shadow(0 0 6px #0f0)'
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
    const features = this.map.queryRenderedFeatures(pt)
    return features.some(f => {
      if (!f.layer) return false
      const id = f.layer.id
      return id.startsWith('road_') || id.startsWith('tunnel_') || id.startsWith('bridge_') || id.startsWith('highway-')
    })
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

    const maxPixels = this.map.project([epicenterLng, epicenterLat]).x -
      this.map.project([epicenterLng + maxRadiusMeters / (111320 * Math.cos(epicenterLat * Math.PI / 180)), epicenterLat]).x

    let radius = 0
    const interval = setInterval(() => {
      radius += maxPixels / 50
      if (radius >= maxPixels) {
        clearInterval(interval)
        this.checkExplosionEnd()
      }
      if (this.map && this.map.getLayer(layerId)) {
        this.map.setPaintProperty(layerId, 'circle-radius', radius)
      }
    }, 100)
  }

  private checkExplosionEnd() {
    const store = useGameStore()
    if (store.isInShelter) {
      store.phase = 'victory'
    } else if (store.playerDistFromEpicenter > store.explosionRadius) {
      store.phase = 'victory'
    } else {
      store.phase = 'gameover'
    }
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
