import { useEffect, useRef, useState } from 'react'
import { select } from 'd3-selection'
import { zoom, zoomIdentity } from 'd3-zoom'
import 'd3-transition'
import { MapEngine } from '../lib/mapEngine.js'
import { loadBase, loadFineLand, loadSnapshot } from '../lib/borders.js'
import { citiesAt } from '../lib/polities.js'
import { bracket, formatYear } from '../lib/time.js'

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function MapView({ year, snapshots, index, events, cities, halfWin, selection, focus, onPick }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const zoomRef = useRef(null)
  const hoverRaf = useRef(0)
  const [tip, setTip] = useState(null)
  const [status, setStatus] = useState(null)
  const [retry, setRetry] = useState(0)

  // Create the engine, zoom behaviour and resize observer once.
  useEffect(() => {
    const canvas = canvasRef.current
    const engine = new MapEngine(canvas, {
      colorFor: index.colorFor,
      resolvePolity: (name, y) => index.forName(name, y, 500, 200),
    })
    engineRef.current = engine
    let fineRequested = false
    const z = zoom()
      .scaleExtent([0.5, 16])
      .on('zoom', (e) => {
        engine.setTransform(e.transform)
        setTip(null)
        // Sharper coastlines once zoomed in.
        if (!fineRequested && e.transform.k >= 2.2) {
          fineRequested = true
          loadFineLand().then((f) => engine.setFineLand(f)).catch(() => { fineRequested = false })
        }
      })
    loadBase().then((b) => engine.setBase(b)).catch(() => {})
    zoomRef.current = z
    const sel = select(canvas).call(z)
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      engine.resize(width, height, Math.min(window.devicePixelRatio || 1, 2))
      z.extent([[0, 0], [width, height]])
      if (engine.extent) z.translateExtent(engine.extent).scaleExtent([engine.minK, 16])
    })
    ro.observe(wrapRef.current)
    return () => { ro.disconnect(); sel.on('.zoom', null); engine.destroy() }
  }, [index])

  // Load and cross-fade the two snapshots that bracket the current year.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !snapshots?.length) return
    const br = bracket(year, snapshots)
    let cancelled = false
    const ease = (f) => f * f * (3 - 2 * f)
    const apply = () => {
      const A = engine.getPrepared(br.a)
      const B = br.b === br.a ? null : engine.getPrepared(br.b)
      if (!A || (br.b !== br.a && !B)) return false
      engine.setLayers(A, B, B ? ease(br.f) : 0)
      return true
    }
    if (!apply()) {
      setStatus({ kind: 'loading' })
      Promise.all([br.a, br.b].map((y) => loadSnapshot(y).then((s) => engine.addSnapshot(s))))
        .then(() => { if (!cancelled) { apply(); setStatus(null) } })
        .catch((e) => { if (!cancelled) setStatus({ kind: 'error', message: e.message }) })
    }
    const ia = snapshots.indexOf(br.a), ib = snapshots.indexOf(br.b)
    for (const y of [snapshots[ib + 1], snapshots[ia - 1]]) {
      if (y !== undefined) loadSnapshot(y).then((s) => engine.addSnapshot(s, true)).catch(() => {})
    }
    return () => { cancelled = true }
  }, [year, snapshots])

  // Event markers fade in and out around the playhead.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    const list = []
    for (const ev of events) {
      const dy = Math.abs(ev.year - year)
      if (dy <= halfWin) list.push({ ev, alpha: 1 - dy / halfWin })
    }
    const selId = selection?.kind === 'event' ? selection.id : null
    if (selId && !list.some((e) => e.ev.id === selId)) {
      const ev = events.find((e) => e.id === selId)
      if (ev) list.push({ ev, alpha: 1 })
    }
    engine.setEvents(list)
  }, [year, halfWin, events, selection])

  // Cities existing in this year, under the name they had then.
  const cityKey = Math.round(year)
  useEffect(() => {
    engineRef.current?.setCities(citiesAt(cities, cityKey))
  }, [cityKey, cities])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    const polity = selection?.kind === 'polity' ? index.byId.get(selection.id) : null
    engine.setSelection({
      polityId: polity?.id,
      eventId: selection?.kind === 'event' ? selection.id : null,
      sites: polity?.sites || [],
    })
  }, [selection, index])

  // Animated camera moves requested by the app.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !focus) return
    let cancelled = false
    // On first load the canvas may not be measured yet; wait for it.
    if (!engine.path) {
      let tries = 0
      const wait = setInterval(() => {
        if (engine.path || ++tries > 40) { clearInterval(wait); if (engine.path && !cancelled) setRetry((n) => n + 1) }
      }, 100)
      return () => { cancelled = true; clearInterval(wait) }
    }
    const go = (t) => {
      if (!t || cancelled) return
      select(canvasRef.current).transition().duration(reducedMotion() ? 0 : 900)
        .call(zoomRef.current.transform, zoomIdentity.translate(t.x, t.y).scale(t.k))
    }
    if (focus.kind === 'point') {
      go(engine.transformForPoint(focus.lon, focus.lat, focus.minK || 3))
    } else if (focus.kind === 'polity') {
      const polity = index.byId.get(focus.id)
      const br = bracket(focus.year, snapshots || [])
      const snapYear = br ? (br.f < 0.5 ? br.a : br.b) : null
      const finish = () => { const b = engine.boundsForPolity(polity, snapYear); if (b) go(engine.transformForBounds(b)) }
      if (snapYear == null) finish()
      else loadSnapshot(snapYear).then((s) => { engine.addSnapshot(s); finish() }).catch(finish)
    } else if (focus.kind === 'reset') {
      const k = engine.minK || 1
      go({ k, x: (engine.w * (1 - k)) / 2, y: (engine.h * (1 - k)) / 2 })
    }
    return () => { cancelled = true }
  }, [focus, retry])

  function localPoint(e) {
    const r = canvasRef.current.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  function describe(hit) {
    if (!hit) return null
    if (hit.kind === 'event') {
      const ev = events.find((x) => x.id === hit.id)
      return ev && { title: ev.title, sub: formatYear(ev.year, ev.approx) }
    }
    if (hit.kind === 'site') return { title: hit.site.name, sub: 'Archaeological or historic site' }
    if (hit.kind === 'city') {
      const others = [...new Set(hit.city.names.map((n) => n.name))].filter((n) => n !== hit.city.label)
      return { title: hit.city.label, sub: others.length ? `Also known as ${others.join(', ')}` : 'City' }
    }
    const p = hit.feature.props
    if (!hit.feature.name) return null
    const parent = p.PARTOF && p.PARTOF !== p.NAME ? `Part of ${p.PARTOF}` : p.SUBJECTO && p.SUBJECTO !== p.NAME ? `Under ${p.SUBJECTO}` : null
    return { title: hit.feature.name, sub: parent }
  }

  function onPointerMove(e) {
    if (e.buttons || e.pointerType === 'touch') return
    const [x, y] = localPoint(e)
    cancelAnimationFrame(hoverRaf.current)
    hoverRaf.current = requestAnimationFrame(() => {
      const engine = engineRef.current
      if (!engine) return
      const hit = engine.pick(x, y)
      engine.setHover(hit)
      const d = describe(hit)
      canvasRef.current.style.cursor = d ? 'pointer' : 'grab'
      setTip(d ? { ...d, x, y } : null)
    })
  }

  function onPointerLeave() {
    cancelAnimationFrame(hoverRaf.current)
    engineRef.current?.setHover(null)
    setTip(null)
  }

  function onClick(e) {
    if (e.defaultPrevented) return
    const [x, y] = localPoint(e)
    onPick(engineRef.current?.pick(x, y) || null)
  }

  const tipStyle = tip && wrapRef.current
    ? (() => {
        const w = wrapRef.current.clientWidth
        const left = tip.x > w - 240 ? tip.x - 14 : tip.x + 14
        return { left, top: tip.y + 14, transform: tip.x > w - 240 ? 'translateX(-100%)' : 'none' }
      })()
    : null

  return (
    <div className="map" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
        role="img"
        aria-label={`World map showing empires and peoples around ${formatYear(year)}. Drag to pan, scroll or pinch to zoom, click a region for details.`}
      />
      {tip && (
        <div className="map-tip" style={tipStyle} aria-hidden="true">
          <div className="map-tip-title">{tip.title}</div>
          {tip.sub && <div className="map-tip-sub">{tip.sub}</div>}
        </div>
      )}
      {status?.kind === 'loading' && <div className="map-status">Loading borders…</div>}
      {status?.kind === 'error' && (
        <div className="map-status is-error" role="alert">
          {status.message} Check your connection, then move the timeline to retry.
        </div>
      )}
    </div>
  )
}
