import { geoNaturalEarth1, geoPath, geoGraticule10 } from 'd3-geo'
import { isGeneric } from './polities.js'

const SEA = '#16304C'
const SPHERE_EDGE = '#2E5174'
const GRATICULE = 'rgba(150,180,210,0.07)'
const BORDER = 'rgba(8,19,32,0.92)'
const GOLD = '#E2B04A'
const INK = '#F2ECDD'
const HALO = 'rgba(9,20,34,0.78)'
const LAND_BASE = '#2B3833'
const RIVER = '#3F77A6'
const COAST = 'rgba(6,16,28,0.75)'

// Split (Multi)Polygon features into one Path2D per polygon so off-screen parts can be skipped.
function splitPolys(features, path) {
  const out = []
  for (const f of features) {
    const g = f.geometry
    if (!g) continue
    const polys = g.type === 'MultiPolygon' ? g.coordinates.map((c) => ({ type: 'Polygon', coordinates: c })) : [g]
    for (const poly of polys) {
      const d = path(poly)
      if (d) out.push({ path: new Path2D(d), bounds: path.bounds(poly) })
    }
  }
  return out
}

// Draws border snapshots on canvas. Two snapshots are cross-faded so the map
// moves smoothly between the years the dataset actually records.
export class MapEngine {
  constructor(canvas, opts) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.opts = opts
    this.hitCtx = document.createElement('canvas').getContext('2d')
    this.offA = document.createElement('canvas')
    this.offB = document.createElement('canvas')
    this.offUnder = document.createElement('canvas')
    this.offOver = document.createElement('canvas')
    this.keyA = this.keyB = this.keyUnder = this.keyOver = ''
    this.base = null
    this.fineLand = null
    this.bp = null
    this.cities = []
    this.cityHits = []
    this.t = { k: 1, x: 0, y: 0 }
    this.w = this.h = 0
    this.dpr = 1
    this.raw = new Map()
    this.prep = new Map()
    this.layerA = this.layerB = null
    this.f = 0
    this.events = []
    this.eventHits = []
    this.siteHits = []
    this.sites = []
    this.selectedPolityId = null
    this.selectedEventId = null
    this.hover = null
    this.raf = 0
  }

  resize(w, h, dpr) {
    if (!w || !h) return
    this.w = w; this.h = h; this.dpr = dpr
    // On tall, narrow screens let the world overflow sideways so it fills the height.
    const fw = Math.max(w, Math.min(h * 1.7, w * 2.2))
    const ox = (w - fw) / 2
    this.projection = geoNaturalEarth1().fitExtent([[ox + 14, 14], [ox + fw - 14, h - 14]], { type: 'Sphere' })
    this.minK = w / fw
    this.path = geoPath(this.projection)
    this.sphere = new Path2D(this.path({ type: 'Sphere' }))
    const [[sx0, sy0], [sx1, sy1]] = this.path.bounds({ type: 'Sphere' })
    this.extent = [[Math.min(0, sx0 - 14), Math.min(0, sy0 - 14)], [Math.max(w, sx1 + 14), Math.max(h, sy1 + 14)]]
    this.graticule = new Path2D(this.path(geoGraticule10()))
    for (const c of [this.canvas, this.offA, this.offB, this.offUnder, this.offOver]) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr)
    }
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px'
    this.prep.clear()
    if (this.layerA) this.layerA = this.getPrepared(this.layerA.year)
    if (this.layerB) this.layerB = this.getPrepared(this.layerB.year)
    this.hover = null
    this.bp = null
    this.keyA = this.keyB = this.keyUnder = this.keyOver = ''
    this.request()
  }

  setBase(base) { this.base = base; this.bp = null; this.invalidate() }
  setFineLand(features) { this.fineLand = features; if (this.bp) this.bp.land10 = null; this.invalidate() }
  setCities(list) { this.cities = list; this.request() }
  invalidate() { this.keyA = this.keyB = this.keyUnder = this.keyOver = ''; this.request() }

  basePrepared() {
    if (!this.base || !this.path) return null
    if (!this.bp) {
      this.bp = {
        land50: splitPolys(this.base.land, this.path),
        land10: null,
        lakes: splitPolys(this.base.lakes, this.path),
        rivers: this.base.rivers.map((f) => {
          const d = this.path(f)
          return d && { path: new Path2D(d), bounds: this.path.bounds(f), rank: f.properties.scalerank }
        }).filter(Boolean),
      }
    }
    if (!this.bp.land10 && this.fineLand) this.bp.land10 = splitPolys(this.fineLand, this.path)
    return this.bp
  }

  // Land polygons on screen, as one path (fine coastline when zoomed in).
  landPath() {
    const bp = this.basePrepared()
    if (!bp) return null
    const list = this.t.k >= 2.5 && bp.land10 ? bp.land10 : bp.land50
    const out = new Path2D()
    for (const p of list) if (this.onScreen(p.bounds)) out.addPath(p.path)
    return out
  }

  onScreen([[x0, y0], [x1, y1]]) {
    const { k, x, y } = this.t
    return !(x1 < -x / k || x0 > (this.w - x) / k || y1 < -y / k || y0 > (this.h - y) / k)
  }

  renderUnder(off) {
    const c = off.getContext('2d'), d = this.dpr, { k, x, y } = this.t
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, off.width, off.height)
    c.setTransform(d * k, 0, 0, d * k, d * x, d * y)
    c.fillStyle = SEA
    c.fill(this.sphere)
    c.lineWidth = 0.5 / k
    c.strokeStyle = GRATICULE
    c.stroke(this.graticule)
    const land = this.landPath()
    if (land) { c.fillStyle = LAND_BASE; c.fill(land) }
    this.currentLand = land
  }

  renderOver(off) {
    const c = off.getContext('2d'), d = this.dpr, { k, x, y } = this.t
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, off.width, off.height)
    const bp = this.basePrepared()
    if (!bp) return
    c.setTransform(d * k, 0, 0, d * k, d * x, d * y)
    c.lineJoin = 'round'
    c.lineCap = 'round'
    c.fillStyle = SEA
    c.strokeStyle = RIVER
    c.lineWidth = 0.7 / k
    for (const l of bp.lakes) if (this.onScreen(l.bounds)) { c.fill(l.path); c.stroke(l.path) }
    for (const r of bp.rivers) {
      if (r.rank > (k >= 2 ? 5 : 4) || !this.onScreen(r.bounds)) continue
      c.lineWidth = (r.rank <= 2 ? 1.25 : r.rank <= 4 ? 0.9 : 0.65) / k
      c.stroke(r.path)
    }
    if (this.currentLand) { c.lineWidth = 0.8 / k; c.strokeStyle = COAST; c.stroke(this.currentLand) }
  }

  addSnapshot(snap, warm = false) {
    if (!this.raw.has(snap.year)) this.raw.set(snap.year, snap)
    if (warm && !this.prep.has(snap.year)) {
      const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 60))
      idle(() => this.getPrepared(snap.year))
    }
  }

  getPrepared(year) {
    if (this.prep.has(year)) return this.prep.get(year)
    const snap = this.raw.get(year)
    if (!snap || !this.path) return null
    const p = this.prepare(snap)
    this.prep.set(year, p)
    return p
  }

  prepare(snap) {
    const { colorFor, resolvePolity } = this.opts
    const feats = []
    for (const f of snap.features) {
      if (!f.geometry) continue
      const d = this.path(f)
      if (!d) continue
      const name = f.properties.NAME || null
      let label = null, area = 0
      if (name) {
        const polys = f.geometry.type === 'MultiPolygon'
          ? f.geometry.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }))
          : [f.geometry]
        for (const g of polys) {
          const a = this.path.area(g)
          if (a > area) { area = a; label = this.path.centroid(g) }
        }
      }
      feats.push({
        props: f.properties,
        name,
        path: new Path2D(d),
        bounds: this.path.bounds(f),
        area,
        label: label && Number.isFinite(label[0]) ? label : null,
        color: colorFor(name, snap.year),
        polity: resolvePolity(name, snap.year),
        generic: name ? isGeneric(name) : false,
      })
    }
    const labels = feats.filter((f) => f.name && f.label).sort((a, b) => b.area - a.area)
    return { year: snap.year, feats, labels }
  }

  setLayers(a, b, f) {
    if (a === this.layerA && b === this.layerB && f === this.f) return
    this.layerA = a; this.layerB = b; this.f = f
    this.request()
  }

  setTransform(t) { this.t = { k: t.k, x: t.x, y: t.y }; this.request() }
  setEvents(list) { this.events = list; this.request() }
  setSelection({ polityId, eventId, sites }) {
    this.selectedPolityId = polityId || null
    this.selectedEventId = eventId || null
    this.sites = sites || []
    this.request()
  }
  setHover(h) {
    const key = (x) => (x ? (x.kind === 'region' ? x.feature : x.id || x.site?.name || x.city?.id) : null)
    if (key(h) === key(this.hover)) return
    this.hover = h
    this.request()
  }

  request() { if (!this.raf) this.raf = requestAnimationFrame(() => this.draw()) }
  destroy() { cancelAnimationFrame(this.raf) }

  dominant() { return this.layerB && this.f >= 0.5 ? this.layerB : this.layerA }

  renderLayer(off, layer) {
    const c = off.getContext('2d')
    const { k, x, y } = this.t, d = this.dpr
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, off.width, off.height)
    if (!layer) return
    c.setTransform(d * k, 0, 0, d * k, d * x, d * y)
    const vx0 = -x / k, vy0 = -y / k, vx1 = (this.w - x) / k, vy1 = (this.h - y) / k
    const visible = []
    c.lineJoin = 'round'
    c.lineWidth = 0.8 / k
    for (const f of layer.feats) {
      const [[x0, y0], [x1, y1]] = f.bounds
      if (x1 < vx0 || x0 > vx1 || y1 < vy0 || y0 > vy1) continue
      c.fillStyle = f.color
      c.fill(f.path)
      if (!f.name) { c.strokeStyle = f.color; c.stroke(f.path) } // hide seams between unnamed land shards
      visible.push(f)
    }
    c.lineWidth = 0.6 / k
    c.strokeStyle = BORDER
    for (const f of visible) if (f.name) c.stroke(f.path)
    // Trim fills to the real coastline; the dataset's own shorelines are coarse.
    if (this.currentLand) {
      c.globalCompositeOperation = 'destination-in'
      c.fillStyle = '#000'
      c.fill(this.currentLand)
      c.globalCompositeOperation = 'source-over'
    }
  }

  draw() {
    this.raf = 0
    if (!this.path) return
    const c = this.ctx, d = this.dpr, { k, x, y } = this.t
    const tKey = `${k.toFixed(4)},${x.toFixed(1)},${y.toFixed(1)},${this.w},${this.h},${this.bp ? 1 : 0}${this.bp?.land10 ? 1 : 0}`
    if (this.keyUnder !== tKey) { this.renderUnder(this.offUnder); this.keyUnder = tKey; this.keyA = this.keyB = '' }
    const kA = this.layerA ? `${this.layerA.year}|${tKey}` : ''
    const kB = this.layerB ? `${this.layerB.year}|${tKey}` : ''
    if (kA !== this.keyA) { this.renderLayer(this.offA, this.layerA); this.keyA = kA }
    if (kB !== this.keyB) { this.renderLayer(this.offB, this.layerB); this.keyB = kB }
    if (this.keyOver !== tKey) { this.renderOver(this.offOver); this.keyOver = tKey }

    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.canvas.width, this.canvas.height)
    c.drawImage(this.offUnder, 0, 0)
    if (this.layerA) { c.globalAlpha = 1; c.drawImage(this.offA, 0, 0) }
    if (this.layerB && this.f > 0) { c.globalAlpha = this.f; c.drawImage(this.offB, 0, 0) }
    c.globalAlpha = 1
    c.drawImage(this.offOver, 0, 0)

    c.setTransform(d * k, 0, 0, d * k, d * x, d * y)
    c.lineWidth = 1 / k
    c.strokeStyle = SPHERE_EDGE
    c.stroke(this.sphere)

    const dom = this.dominant()
    c.save()
    if (this.currentLand) c.clip(this.currentLand)
    if (dom && this.selectedPolityId) {
      c.fillStyle = 'rgba(226,176,74,0.16)'
      c.strokeStyle = GOLD
      c.lineWidth = 1.8 / k
      for (const f of dom.feats) if (f.polity && f.polity.id === this.selectedPolityId) { c.fill(f.path); c.stroke(f.path) }
    }
    if (dom && this.hover?.kind === 'region' && this.hover.layerYear === dom.year) {
      c.strokeStyle = 'rgba(242,236,221,0.9)'
      c.lineWidth = 1.3 / k
      c.stroke(this.hover.feature.path)
    }
    c.restore()

    c.setTransform(d, 0, 0, d, 0, 0)
    const placed = this.drawLabels(c, dom)
    this.drawCities(c, placed)
    this.drawSites(c, placed)
    this.drawEvents(c)
  }

  toScreen(lon, lat) {
    const p = this.projection([lon, lat])
    if (!p) return null
    return [p[0] * this.t.k + this.t.x, p[1] * this.t.k + this.t.y]
  }

  drawLabels(c, dom) {
    const placed = []
    if (!dom) return placed
    const { k, x, y } = this.t
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.lineJoin = 'round'
    let n = 0
    for (const f of dom.labels) {
      const sa = f.area * k * k
      if (sa < 1300) break
      const sx = f.label[0] * k + x, sy = f.label[1] * k + y
      if (sx < -60 || sx > this.w + 60 || sy < -20 || sy > this.h + 20) continue
      const size = Math.max(10.5, Math.min(19, Math.sqrt(sa) / 10))
      c.font = f.generic ? `italic 400 ${size}px Alegreya, Georgia, serif` : `500 ${size}px Alegreya, Georgia, serif`
      const tw = c.measureText(f.name).width
      if (tw > Math.sqrt(sa) * 2.6) continue
      const r = [sx - tw / 2 - 3, sy - size / 2 - 2, sx + tw / 2 + 3, sy + size / 2 + 2]
      if (placed.some((p) => !(r[2] < p[0] || r[0] > p[2] || r[3] < p[1] || r[1] > p[3]))) continue
      placed.push(r)
      c.lineWidth = 3
      c.strokeStyle = HALO
      c.strokeText(f.name, sx, sy)
      c.fillStyle = f.generic ? 'rgba(222,215,197,0.6)' : 'rgba(246,240,226,0.96)'
      c.fillText(f.name, sx, sy)
      if (++n > 80) break
    }
    return placed
  }

  drawCities(c, placed) {
    this.cityHits = []
    const k = this.t.k
    const minRank = k >= 4.5 ? 3 : k >= 2.2 ? 2 : 1
    c.textBaseline = 'middle'
    c.textAlign = 'left'
    for (const city of this.cities) {
      if (city.rank > minRank) continue
      const p = this.toScreen(city.lon, city.lat)
      if (!p) continue
      const [sx, sy] = p
      if (sx < -10 || sx > this.w + 10 || sy < -10 || sy > this.h + 10) continue
      const hov = this.hover?.kind === 'city' && this.hover.city === city
      const r = city.rank === 1 ? 3.2 : 2.5
      c.beginPath()
      c.rect(sx - r, sy - r, r * 2, r * 2)
      c.fillStyle = INK
      c.fill()
      c.lineWidth = 1.2
      c.strokeStyle = HALO
      c.stroke()
      this.cityHits.push({ city, sx, sy })
      const size = city.rank === 1 ? 13 : 12
      c.font = `${city.rank === 1 ? 600 : 500} ${size}px "Alegreya Sans", system-ui, sans-serif`
      const tw = c.measureText(city.label).width
      const box = [sx + 5, sy - size / 2 - 1, sx + 7 + tw, sy + size / 2 + 1]
      if (!hov && placed.some((q) => !(box[2] < q[0] || box[0] > q[2] || box[3] < q[1] || box[1] > q[3]))) continue
      placed.push(box)
      c.lineWidth = 3
      c.strokeStyle = HALO
      c.strokeText(city.label, sx + 6, sy)
      c.fillStyle = hov ? '#FFFFFF' : 'rgba(242,236,221,0.92)'
      c.fillText(city.label, sx + 6, sy)
    }
  }

  drawSites(c, placed = []) {
    this.siteHits = []
    if (!this.sites.length) return
    c.textAlign = 'left'
    c.textBaseline = 'middle'
    for (const s of this.sites) {
      const p = this.toScreen(s.lon, s.lat)
      if (!p) continue
      const [sx, sy] = p
      const hov = this.hover?.kind === 'site' && this.hover.site === s
      c.beginPath()
      c.arc(sx, sy, hov ? 5 : 4, 0, Math.PI * 2)
      c.fillStyle = HALO
      c.fill()
      c.lineWidth = 1.6
      c.strokeStyle = INK
      c.stroke()
      c.font = 'italic 500 12.5px Alegreya, Georgia, serif'
      const tw = c.measureText(s.name).width
      const box = [sx + 7, sy - 8, sx + 9 + tw, sy + 8]
      const clash = placed.some((q) => !(box[2] < q[0] || box[0] > q[2] || box[3] < q[1] || box[1] > q[3]))
      if ((this.t.k >= 1.8 && !clash) || hov) {
        placed.push(box)
        c.lineWidth = 3
        c.strokeStyle = HALO
        c.strokeText(s.name, sx + 8, sy)
        c.fillStyle = INK
        c.fillText(s.name, sx + 8, sy)
      }
      this.siteHits.push({ site: s, sx, sy })
    }
  }

  drawEvents(c) {
    this.eventHits = []
    for (const e of this.events) {
      const p = this.toScreen(e.ev.lon, e.ev.lat)
      if (!p) continue
      const [sx, sy] = p
      if (sx < -20 || sx > this.w + 20 || sy < -20 || sy > this.h + 20) continue
      const sel = e.ev.id === this.selectedEventId
      const hov = this.hover?.kind === 'event' && this.hover.id === e.ev.id
      c.globalAlpha = sel || hov ? 1 : 0.3 + 0.7 * e.alpha
      if (sel) {
        c.beginPath(); c.arc(sx, sy, 13, 0, Math.PI * 2)
        c.lineWidth = 1.5; c.strokeStyle = 'rgba(226,176,74,0.7)'; c.stroke()
      }
      glyph(c, e.ev.type, sx, sy, sel || hov ? 7 : 5.5)
      if (sel || hov) {
        c.font = '600 13px "Alegreya Sans", system-ui, sans-serif'
        c.textBaseline = 'middle'
        const flip = sx + 13 + c.measureText(e.ev.title).width > this.w - 8
        c.textAlign = flip ? 'right' : 'left'
        const lx = flip ? sx - 13 : sx + 13
        c.lineWidth = 3.5; c.strokeStyle = HALO
        c.strokeText(e.ev.title, lx, sy)
        c.fillStyle = INK
        c.fillText(e.ev.title, lx, sy)
      }
      this.eventHits.push({ id: e.ev.id, sx, sy })
    }
    c.globalAlpha = 1
  }

  pick(px, py) {
    for (let i = this.eventHits.length - 1; i >= 0; i--) {
      const h = this.eventHits[i]
      if (Math.hypot(px - h.sx, py - h.sy) <= 11) return { kind: 'event', id: h.id }
    }
    for (const h of this.siteHits) if (Math.hypot(px - h.sx, py - h.sy) <= 9) return { kind: 'site', site: h.site }
    for (const h of this.cityHits) if (Math.hypot(px - h.sx, py - h.sy) <= 7) return { kind: 'city', city: h.city }
    const dom = this.dominant()
    if (!dom || !this.path) return null
    const { k, x, y } = this.t
    const bx = (px - x) / k, by = (py - y) / k
    if (!this.hitCtx.isPointInPath(this.sphere, bx, by)) return null
    for (let i = dom.feats.length - 1; i >= 0; i--) {
      const f = dom.feats[i]
      const [[x0, y0], [x1, y1]] = f.bounds
      if (bx < x0 || bx > x1 || by < y0 || by > y1) continue
      if (this.hitCtx.isPointInPath(f.path, bx, by)) return { kind: 'region', feature: f, layerYear: dom.year }
    }
    return null
  }

  // Zoom transform that frames base-coordinate bounds.
  transformForBounds([[x0, y0], [x1, y1]], maxK = 7) {
    const dx = Math.max(x1 - x0, 1), dy = Math.max(y1 - y0, 1)
    const k = Math.max(this.minK || 1, Math.min(maxK, 0.78 / Math.max(dx / this.w, dy / this.h)))
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    return { k, x: this.w / 2 - k * cx, y: this.h / 2 - k * cy }
  }

  transformForPoint(lon, lat, minK = 3) {
    const p = this.projection([lon, lat])
    if (!p) return null
    const k = Math.max(this.t.k, minK)
    return { k, x: this.w / 2 - k * p[0], y: this.h / 2 - k * p[1] }
  }

  boundsForPolity(polity, year) {
    const layer = this.getPrepared(year)
    let b = null
    const grow = (x0, y0, x1, y1) => {
      b = b ? [[Math.min(b[0][0], x0), Math.min(b[0][1], y0)], [Math.max(b[1][0], x1), Math.max(b[1][1], y1)]] : [[x0, y0], [x1, y1]]
    }
    if (layer) for (const f of layer.feats) {
      if (f.polity && f.polity.id === polity.id) {
        const [[x0, y0], [x1, y1]] = f.bounds
        if (x1 - x0 < this.w * 0.9) grow(x0, y0, x1, y1) // skip antimeridian-wrapped shapes
      }
    }
    if (!b) for (const s of polity.sites || []) {
      const p = this.projection([s.lon, s.lat])
      if (p) grow(p[0] - 40, p[1] - 30, p[0] + 40, p[1] + 30)
    }
    return b
  }
}

function glyph(c, type, x, y, r) {
  c.beginPath()
  if (type === 'battle') {
    c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath()
  } else if (type === 'treaty') {
    c.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6)
  } else if (type === 'milestone') {
    c.moveTo(x, y - r); c.lineTo(x + r * 0.95, y + r * 0.75); c.lineTo(x - r * 0.95, y + r * 0.75); c.closePath()
  } else {
    c.arc(x, y, r * 0.85, 0, Math.PI * 2)
  }
  c.lineWidth = 2
  c.strokeStyle = HALO
  c.stroke()
  if (type === 'collapse') {
    c.lineWidth = 1.8; c.strokeStyle = GOLD; c.stroke()
    c.beginPath(); c.moveTo(x - r * 0.6, y + r * 0.6); c.lineTo(x + r * 0.6, y - r * 0.6); c.stroke()
  } else {
    c.fillStyle = GOLD; c.fill()
  }
}
