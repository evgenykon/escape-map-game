import maplibregl from 'maplibre-gl'
import { useGameStore } from '@/stores/game'

export class MapEngine {
  private map: maplibregl.Map | null = null
  private playerMarker: maplibregl.Marker | null = null
  private carMarker: maplibregl.Marker | null = null
  private explosionCircle: { source: string; layer: string } | null = null

  init(container: HTMLDivElement) {
    const store = useGameStore()

    this.map = new maplibregl.Map({
      container,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [store.playerLongitude, store.playerLatitude],
      zoom: 14,
      attributionControl: false,
    })

    this.map.addControl(new maplibregl.NavigationControl(), 'top-right')

    this.map.on('load', () => {
      this.addShelterMarkers()
      this.addEpicenterMarker()
      this.createPlayerMarker()
    })
  }

  private createPlayerMarker() {
    const el = document.createElement('div')
    el.className = 'player-marker'
    el.style.width = '12px'
    el.style.height = '12px'
    el.style.background = '#0f0'
    el.style.borderRadius = '50%'
    el.style.border = '2px solid #fff'
    el.style.boxShadow = '0 0 10px #0f0'

    this.playerMarker = new maplibregl.Marker({ element: el })
      .setLngLat([useGameStore().playerLongitude, useGameStore().playerLatitude])
      .addTo(this.map!)
  }

  private addEpicenterMarker() {
    const store = useGameStore()
    const el = document.createElement('div')
    el.className = 'epicenter-marker'
    el.style.width = '20px'
    el.style.height = '20px'
    el.style.background = '#f44'
    el.style.borderRadius = '50%'
    el.style.border = '3px solid #fff'
    el.style.boxShadow = '0 0 20px #f44'
    el.style.animation = 'pulse 1s infinite'

    new maplibregl.Marker({ element: el })
      .setLngLat([store.epicenterLongitude, store.epicenterLatitude])
      .addTo(this.map!)
  }

  private addShelterMarkers() {
    const store = useGameStore()

    for (const shelter of store.shelters) {
      const el = document.createElement('div')
      el.className = 'shelter-marker'
      el.style.width = '16px'
      el.style.height = '16px'
      el.style.background = '#ff0'
      el.style.border = '2px solid #fa0'
      el.style.transform = 'rotate(45deg)'
      el.style.boxShadow = '0 0 10px #ff0'

      new maplibregl.Marker({ element: el })
        .setLngLat([shelter.longitude, shelter.latitude])
        .setPopup(new maplibregl.Popup({ offset: 10 }).setText('Убежище'))
        .addTo(this.map!)
    }
  }

  updatePlayerPosition(lng: number, lat: number) {
    if (this.playerMarker) {
      this.playerMarker.setLngLat([lng, lat])
    }
    if (this.map) {
      this.map.setCenter([lng, lat])
    }
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

    this.explosionCircle = { source: id, layer: layerId }

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
    if (!store.isInShelter) {
      store.phase = 'gameover'
    }
  }

  destroy() {
    this.map?.remove()
    this.map = null
  }
}
