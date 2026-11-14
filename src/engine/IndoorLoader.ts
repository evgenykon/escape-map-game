import { booleanPointInPolygon, center, intersect, point, squareGrid } from '@turf/turf'

export interface RoomShape {
  id: number
  name: string
  polygon: GeoJSON.Polygon
}

type Poly = GeoJSON.Polygon | GeoJSON.MultiPolygon

function bboxOf(poly: Poly): [number, number, number, number] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90
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

/** Реальные помещения из OSM (indoor=room / indoor=area), попадающие в контур здания. */
export async function fetchRealRooms(building: Poly): Promise<RoomShape[]> {
  const [minX, minY, maxX, maxY] = bboxOf(building)
  const bbox = `${minY.toFixed(6)},${minX.toFixed(6)},${maxY.toFixed(6)},${maxX.toFixed(6)}`
  const query = `[out:json][timeout:20];way["indoor"~"^(room|area)$"](${bbox});out geom;`

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }).toString(),
  })
  if (!res.ok) throw new Error(`overpass ${res.status}`)
  const data = (await res.json()) as { elements?: Array<{ type: string; tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }> }> }

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
  return rooms
}

/** Нарезка контура здания на N помещений (когда OSM-комнат нет). */
export function splitBuildingIntoRooms(building: Poly, count: number): RoomShape[] {
  const [minX, minY, maxX, maxY] = bboxOf(building)
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  const cellW = ((maxX - minX) / cols) * 111320 * Math.cos((minY * Math.PI) / 180)
  const cellH = ((maxY - minY) / rows) * 111320

  const grid = squareGrid([minX, minY, maxX, maxY], Math.max(cellW, cellH) || 10, { units: 'meters' })
  const rooms: RoomShape[] = []
  for (const cell of grid.features) {
    if (rooms.length >= count) break
    try {
      const buildingFeature = { type: 'Feature', properties: {}, geometry: building } as never
      const clipped = intersect(cell as never, buildingFeature) as GeoJSON.Feature<GeoJSON.Polygon> | null
      if (!clipped) continue
      rooms.push({ id: rooms.length + 1, name: `Помещение ${rooms.length + 1}`, polygon: clipped.geometry })
    } catch {
      continue
    }
  }
  while (rooms.length < count) {
    rooms.push({ id: rooms.length + 1, name: `Помещение ${rooms.length + 1}`, polygon: building as GeoJSON.Polygon })
  }
  return rooms
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

export function polygonToFeature(poly: Poly): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: poly }],
  }
}

export { point }
