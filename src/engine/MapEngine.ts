import maplibregl from 'maplibre-gl'
import { useGameStore } from '@/stores/game'

export class MapEngine {
  private map: maplibregl.Map | null = null
  private playerMarker: maplibregl.Marker | null = null
  private playerMarkerImg: HTMLImageElement | null = null
  private carMarkers: Map<string, maplibregl.Marker> = new Map()
  private carMarkerInners: Map<string, HTMLImageElement> = new Map()
  private shelterMarkers: Map<string, maplibregl.Marker> = new Map()
  private shelterMarkerEls: Map<string, HTMLElement> = new Map()

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
      this.addShelterMarkers()
      this.addCarMarkers()
      this.addEpicenterMarker()
      this.createPlayerMarker()
    })

    this.map.on('error', (e) => {
      console.error('Map error:', e.error?.message || e)
    })


  }

  private createPlayerMarker() {
    const img = new Image()
    img.src = '/player.png'
    img.width = 22
    img.height = 28
    img.style.display = 'block'
    img.style.filter = 'drop-shadow(0 0 6px #0f0)'
    img.style.zIndex = '100'
    this.playerMarkerImg = img

    this.playerMarker = new maplibregl.Marker({ element: img })
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

  private createCarImage(angle?: number): HTMLImageElement {
    const img = new Image()
    img.src = '/car.png'
    img.width = 26
    img.height = 38
    img.style.display = 'block'
    img.style.filter = 'drop-shadow(0 0 6px #48f)'
    if (angle !== undefined) {
      img.style.transform = `rotate(${angle}rad)`
    }
    return img
  }

  private addCarMarkers() {
    const store = useGameStore()

    for (const car of store.cars) {
      const img = this.createCarImage(car.angle)

      const marker = new maplibregl.Marker({ element: img, rotationAlignment: 'map' })
        .setLngLat([car.longitude, car.latitude])
        .addTo(this.map!)
      this.carMarkers.set(car.id, marker)
      this.carMarkerInners.set(car.id, img)
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
    const img = this.createCarImage(angle)
    const marker = new maplibregl.Marker({ element: img, rotationAlignment: 'map' })
      .setLngLat([lng, lat])
      .addTo(this.map!)
    this.carMarkers.set(id, marker)
    this.carMarkerInners.set(id, img)
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

  setPlayerMarkerShadow(shadow: string) {
    if (this.playerMarkerImg) {
      this.playerMarkerImg.style.filter = `drop-shadow(0 0 6px ${shadow})`
    }
  }

  setPlayerMarkerShape(isCar: boolean) {
    if (!this.playerMarkerImg) return
    if (isCar) {
      this.playerMarkerImg.src = '/car.png'
      this.playerMarkerImg.width = 26
      this.playerMarkerImg.height = 38
    } else {
      this.playerMarkerImg.src = '/player.png'
      this.playerMarkerImg.width = 22
      this.playerMarkerImg.height = 28
    }
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
