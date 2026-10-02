import { feature } from 'topojson-client'
import { geoArea } from 'd3-geo'

// d3-geo expects clockwise outer rings; some source polygons are wound the other way,
// which d3 reads as "the whole globe except this shape". Flip any ring set that covers
// more than a hemisphere.
function fixWinding(f) {
  const g = f.geometry
  if (!g) return f
  const fixPoly = (rings) => (geoArea({ type: 'Polygon', coordinates: rings }) > 2 * Math.PI ? rings.map((r) => [...r].reverse()) : rings)
  if (g.type === 'Polygon') g.coordinates = fixPoly(g.coordinates)
  else if (g.type === 'MultiPolygon') g.coordinates = g.coordinates.map(fixPoly)
  return f
}

const cache = new Map()

export async function loadIndex() {
  const r = await fetch('/data/borders/index.json')
  if (!r.ok) throw new Error(`Border index failed to load (HTTP ${r.status}).`)
  return (await r.json()).snapshots
}

export function loadSnapshot(year) {
  if (!cache.has(year)) {
    const p = fetch(`/data/borders/${year}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Border snapshot ${year} failed to load (HTTP ${r.status}).`)
        return r.json()
      })
      .then((topo) => {
        const key = Object.keys(topo.objects)[0]
        return { year, features: feature(topo, topo.objects[key]).features.map(fixWinding) }
      })
    p.catch(() => cache.delete(year))
    cache.set(year, p)
  }
  return cache.get(year)
}

const baseCache = new Map()
function loadTopo(name) {
  if (!baseCache.has(name)) {
    const p = fetch(`/data/base/${name}.json`)
      .then((r) => { if (!r.ok) throw new Error(`Map layer ${name} failed to load (HTTP ${r.status}).`); return r.json() })
      .then((topo) => feature(topo, topo.objects[Object.keys(topo.objects)[0]]).features)
    p.catch(() => baseCache.delete(name))
    baseCache.set(name, p)
  }
  return baseCache.get(name)
}

// Coastlines, rivers and lakes from Natural Earth. land-10m is fetched only when zoomed in.
export const loadBase = () => Promise.all(['land-50m', 'rivers', 'lakes'].map(loadTopo))
  .then(([land, rivers, lakes]) => ({ land, rivers, lakes }))
export const loadFineLand = () => loadTopo('land-10m')

// Detailed overlays (dated outlines from scholarly atlases), loaded per group when the year needs them.
let overlayIndex = null
const overlayCache = new Map()
export function loadOverlayIndex() {
  if (!overlayIndex) {
    overlayIndex = fetch('/data/overlays/index.json').then((r) => (r.ok ? r.json() : [])).catch(() => [])
  }
  return overlayIndex
}
export function loadOverlayGroup(g) {
  if (!overlayCache.has(g.id)) {
    const p = fetch(`/data/overlays/${g.file}`)
      .then((r) => { if (!r.ok) throw new Error(`Overlay ${g.id} failed to load (HTTP ${r.status}).`); return r.json() })
      .then((fc) => fc.features.map((f) => { fixWinding(f); f.properties.group = f.properties.group || g.id; return f }))
    p.catch(() => overlayCache.delete(g.id))
    overlayCache.set(g.id, p)
  }
  return overlayCache.get(g.id)
}
