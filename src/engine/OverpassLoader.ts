import { useGameStore } from '@/stores/game'
import type { Shelter } from '@/stores/game'
import * as turf from '@turf/turf'

interface OverpassNode {
  type: 'node'
  id: number
  lat: number
  lon: number
}

interface OverpassWay {
  type: 'way'
  id: number
  nodes: number[]
  tags?: Record<string, string>
}

interface OverpassResult {
  elements: (OverpassNode | OverpassWay)[]
}

const OSM_FETCH_RADIUS = 15000

export async function loadOSMData() {
  const store = useGameStore()
  const { playerLatitude, playerLongitude, epicenterLatitude, epicenterLongitude } = store

  const bbox = getBBox(playerLatitude, playerLongitude, OSM_FETCH_RADIUS)
  const query = buildOverpassQuery(bbox)
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`

  let data: OverpassResult
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
    data = await res.json()
  } catch {
    return generateFallbackData()
  }

  const nodes = new Map<number, OverpassNode>()
  const buildings: OverpassWay[] = []
  const roads: OverpassWay[] = []

  for (const el of data.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, el)
    } else if (el.type === 'way') {
      if (el.tags?.building || el.tags?.amenity) {
        buildings.push(el)
      }
      if (el.tags?.highway) {
        roads.push(el)
      }
    }
  }

  store.shelters = selectShelters(buildings, nodes, epicenterLatitude, epicenterLongitude, 5000, 10000)
}

function getBBox(lat: number, lon: number, radiusMeters: number) {
  const dlat = (radiusMeters / 111320) * 2
  const dlng = (radiusMeters / (111320 * Math.cos(lat * Math.PI / 180))) * 2
  return {
    s: lat - dlat / 2,
    n: lat + dlat / 2,
    w: lon - dlng / 2,
    e: lon + dlng / 2,
  }
}

function buildOverpassQuery(bbox: { s: number; n: number; w: number; e: number }): string {
  return `[out:json];(
    node["building"](${bbox.s},${bbox.w},${bbox.n},${bbox.e});
    way["building"](${bbox.s},${bbox.w},${bbox.n},${bbox.e});
    node["highway"](${bbox.s},${bbox.w},${bbox.n},${bbox.e});
    way["highway"](${bbox.s},${bbox.w},${bbox.n},${bbox.e});
  );out center;`
}

function selectShelters(
  buildings: OverpassWay[],
  nodes: Map<number, OverpassNode>,
  epicenterLat: number,
  epicenterLon: number,
  minDist: number,
  maxDist: number,
): Shelter[] {
  const candidates: Shelter[] = []

  for (const b of buildings) {
    const coords = getBuildingCenter(b, nodes)
    if (!coords) continue

    const dist = turf.distance(
      turf.point([epicenterLon, epicenterLat]),
      turf.point([coords[0], coords[1]]),
      { units: 'meters' }
    )

    if (dist >= minDist && dist <= maxDist) {
      candidates.push({
        id: `shelter-${b.id}`,
        longitude: coords[0],
        latitude: coords[1],
      })
    }
  }

  const shuffled = candidates.sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 20)
}

function getBuildingCenter(
  way: OverpassWay,
  nodes: Map<number, OverpassNode>,
): [number, number] | null {
  if ('center' in way && (way as any).center) {
    return [(way as any).center.lon, (way as any).center.lat]
  }

  let latSum = 0
  let lonSum = 0
  let count = 0
  for (const nid of way.nodes) {
    const n = nodes.get(nid)
    if (n) {
      latSum += n.lat
      lonSum += n.lon
      count++
    }
  }
  if (count === 0) return null
  return [lonSum / count, latSum / count]
}

function generateFallbackData() {
  const store = useGameStore()
  const shelters: Shelter[] = []
  const { epicenterLatitude, epicenterLongitude } = store

  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * 2 * Math.PI
    const dist = 5000 + Math.random() * 5000
    const dlat = (dist / 111320) * Math.cos(angle)
    const dlng = (dist / (111320 * Math.cos(epicenterLatitude * Math.PI / 180))) * Math.sin(angle)
    shelters.push({
      id: `shelter-${i}`,
      longitude: epicenterLongitude + dlng,
      latitude: epicenterLatitude + dlat,
    })
  }

  store.shelters = shelters
}
