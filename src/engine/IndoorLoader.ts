import { area, booleanPointInPolygon, center, feature, featureCollection, intersect, point } from '@turf/turf'

export interface RoomShape {
  id: number
  name: string
  polygon: GeoJSON.Polygon
}

type Poly = GeoJSON.Polygon | GeoJSON.MultiPolygon

const OVERPASS_HOSTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const polyCache = new Map<string, Poly | null>()
const roomsCache = new Map<string, RoomShape[]>()

async function overpass(query: string, timeoutMs = 7000): Promise<unknown> {
  let lastErr: unknown = null
  for (const host of OVERPASS_HOSTS) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(host, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }).toString(),
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`overpass ${res.status}`)
      return await res.json()
    } catch (e) {
      clearTimeout(timer)
      lastErr = e
    }
  }
  throw lastErr ?? new Error('overpass failed')
}

function bboxOf(poly: Poly): [number, number, number, number] {
  let minX = 180
  let minY = 90
  let maxX = -180
  let maxY = -90
  const walk = (rings: number[][][]) => {
    for (const ring of rings) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (poly.type === 'Polygon') walk(poly.coordinates)
  else for (const p of poly.coordinates) walk(p)
  return [minX, minY, maxX, maxY]
}

/** Полигон здания вокруг точки в широте/долготе: берём из OSM, тайлы отдают геометрию в иных координатах. */
export async function fetchBuildingPolygon(lat: number, lng: number, radiusM = 25): Promise<Poly | null> {
  const cacheKey = `${lat.toFixed(4)}:${lng.toFixed(4)}`
  if (polyCache.has(cacheKey)) return polyCache.get(cacheKey) ?? null

  const query = `[out:json][timeout:15];way(around:${radiusM},${lat},${lng})["building"];out geom;`
  const data = (await overpass(query)) as { elements?: Array<{ geometry?: Array<{ lat: number; lon: number }> }> }

  let best: Poly | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const el of data.elements ?? []) {
    if (!el.geometry || el.geometry.length < 4) continue
    const ring = el.geometry.map((g) => [g.lon, g.lat] as [number, number])
    const poly: GeoJSON.Polygon = { type: 'Polygon', coordinates: [ring] }
    try {
      if (booleanPointInPolygon(point([lng, lat]), poly)) {
        polyCache.set(cacheKey, poly)
        return poly
      }
    } catch {
      /* некорректный полигон — пропускаем */
    }
    const c = center(poly)
    const d = Math.hypot(c.geometry.coordinates[0] - lng, c.geometry.coordinates[1] - lat)
    if (d < bestDist) {
      bestDist = d
      best = poly
    }
  }
  polyCache.set(cacheKey, best)
  return best
}

/** Площадь полигона в м². */
export function polygonAreaM2(poly: Poly): number {
  try {
    return area(poly as never)
  } catch {
    return 0
  }
}

/** Реальные помещения из OSM (indoor=room / indoor=area) внутри контура здания. */
export async function fetchRealRooms(building: Poly): Promise<RoomShape[]> {
  const [minX, minY, maxX, maxY] = bboxOf(building)
  const cacheKey = `${minX.toFixed(4)}:${minY.toFixed(4)}`
  if (roomsCache.has(cacheKey)) return roomsCache.get(cacheKey) ?? []

  const bbox = `${minY.toFixed(6)},${minX.toFixed(6)},${maxY.toFixed(6)},${maxX.toFixed(6)}`
  const query = `[out:json][timeout:15];way["indoor"~"^(room|area)$"](${bbox});out geom;`
  const data = (await overpass(query, 8000)) as {
    elements?: Array<{ type: string; tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }> }>
  }

  const rooms: RoomShape[] = []
  for (const el of data.elements ?? []) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 4) continue
    const ring = el.geometry.map((g) => [g.lon, g.lat] as [number, number])
    const polygon: GeoJSON.Polygon = { type: 'Polygon', coordinates: [ring] }
    try {
      if (!booleanPointInPolygon(center(polygon), building)) continue
    } catch {
      continue
    }
    rooms.push({
      id: rooms.length + 1,
      name: el.tags?.name || el.tags?.['room'] || `Помещение ${rooms.length + 1}`,
      polygon,
    })
    if (rooms.length >= 40) break
  }
  roomsCache.set(cacheKey, rooms)
  return rooms
}

/**
 * Автоматический план помещений: рекурсивно делим контур пополам по длинной стороне,
 * пока не получим ровно N помещений. Куски не пересекаются и вместе покрывают здание.
 */
export function splitBuildingIntoRooms(building: Poly, count: number): RoomShape[] {
  const n = Math.max(1, Math.min(10, count))
  const [minX, minY, maxX, maxY] = bboxOf(building)
  const buildingFeature = feature(building as never) as never

  const largestPolygon = (geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): GeoJSON.Polygon | null => {
    if (geom.type === 'Polygon') return geom
    if (!geom.coordinates.length) return null
    let best = geom.coordinates[0]
    let bestArea = -1
    for (const poly of geom.coordinates) {
      const candidate: GeoJSON.Polygon = { type: 'Polygon', coordinates: poly }
      const a = area(candidate as never)
      if (a > bestArea) {
        bestArea = a
        best = poly
      }
    }
    return { type: 'Polygon', coordinates: best }
  }

  const clip = (poly: GeoJSON.Polygon): GeoJSON.Polygon | null => {
    try {
      const res = intersect(featureCollection([feature(poly as never), buildingFeature]) as never) as unknown as
        | GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
        | null
      if (!res?.geometry) return null
      const poly2 = largestPolygon(res.geometry)
      if (!poly2 || area(poly2 as never) < 4) return null
      return poly2
    } catch {
      return null
    }
  }

  const rect = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Polygon => ({
    type: 'Polygon',
    coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
  })

  const whole = clip(rect(minX, minY, maxX, maxY)) ?? (building as GeoJSON.Polygon)
  let regions: GeoJSON.Polygon[] = [whole]

  let guard = 0
  while (regions.length < n && guard < 40) {
    guard += 1

    // делим самый большой кусок
    let idx = 0
    let maxArea = -1
    regions.forEach((poly, i) => {
      const a = area(poly as never)
      if (a > maxArea) {
        maxArea = a
        idx = i
      }
    })

    const target = regions[idx]
    const [x0, y0, x1, y1] = bboxOf(target)
    const vertical = x1 - x0 >= y1 - y0
    const mx = (x0 + x1) / 2
    const my = (y0 + y1) / 2

    const parts = vertical
      ? [rect(x0, y0, mx, y1), rect(mx, y0, x1, y1)]
      : [rect(x0, y0, x1, my), rect(x0, my, x1, y1)]

    const pieces: GeoJSON.Polygon[] = []
    for (const part of parts) {
      const piece = clip(part)
      if (piece) pieces.push(piece)
    }
    if (pieces.length < 2) break

    regions = [...regions.slice(0, idx), ...regions.slice(idx + 1), ...pieces]
  }

  return regions
    .sort((a, b) => {
      const [ax, ay] = center(feature(a as never) as never).geometry.coordinates
      const [bx, by] = center(feature(b as never) as never).geometry.coordinates
      if (Math.abs(ay - by) > 1e-6) return by - ay
      return ax - bx
    })
    .map((polygon, i) => ({ id: i + 1, name: `Помещение ${i + 1}`, polygon }))
}

export function roomsToFeatureCollection(rooms: RoomShape[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rooms.map((r) => ({
      type: 'Feature',
      properties: { id: r.id, name: r.name },
      geometry: r.polygon,
    })),
  }
}

export function isInsidePolygon(lat: number, lng: number, poly: Poly | null): boolean {
  if (!poly) return false
  try {
    return booleanPointInPolygon(point([lng, lat]), poly as never)
  } catch {
    return false
  }
}

export function polygonToFeature(poly: Poly): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: poly }],
  }
}
