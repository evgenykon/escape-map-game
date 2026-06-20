import maplibregl from 'maplibre-gl'
import { useGameStore } from '@/stores/game'

export class MapEngine {
  private map: maplibregl.Map | null = null
  private playerMarker: maplibregl.Marker | null = null

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
      this.addEpicenterMarker()
      this.createPlayerMarker()
    })

    this.map.on('error', (e) => {
      console.error('Map error:', e.error?.message || e)
    })


  }

  private createPlayerMarker() {
    const el = document.createElement('div')
    el.style.zIndex = '100'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '24')
    svg.setAttribute('height', '24')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.style.filter = 'drop-shadow(0 0 6px #0f0)'
    svg.style.display = 'block'
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
    poly.setAttribute('points', '12,2 4,22 12,16 20,22')
    poly.setAttribute('fill', '#0f0')
    poly.setAttribute('stroke', '#fff')
    poly.setAttribute('stroke-width', '1.5')
    svg.appendChild(poly)
    el.appendChild(svg)

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

      new maplibregl.Marker({ element: el })
        .setLngLat([shelter.longitude, shelter.latitude])
        .setPopup(new maplibregl.Popup({ offset: 10 }).setText('Убежище'))
        .addTo(this.map!)
    }
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

  isInsideBuilding(lng: number, lat: number): boolean {
    if (!this.map) return false
    const pt = this.map.project([lng, lat])
    const features = this.map.queryRenderedFeatures(pt)
    return features.some(f => f.layer && (f.layer.id === 'building' || f.layer.id === 'building-3d'))
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

  addBuildingsLayer(geojson: any) {
    if (!this.map) return
    const srcId = 'buildings'
    if (this.map.getSource(srcId)) return

    try {
      this.map.addSource(srcId, { type: 'geojson', data: geojson })
      this.map.addLayer({
        id: 'buildings-fill',
        type: 'fill',
        source: srcId,
        paint: {
          'fill-color': '#ff4444',
          'fill-opacity': 0.15,
        },
      })
      this.map.addLayer({
        id: 'buildings-outline',
        type: 'line',
        source: srcId,
        paint: {
          'line-color': '#ff0000',
          'line-width': 2,
        },
      })
    } catch (e) {
      console.error('addBuildingsLayer error:', e)
    }
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
