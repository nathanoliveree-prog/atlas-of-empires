import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import polities from './data/polities.json'
import events from './data/events.json'
import rulers from './data/rulers.json'
import cities from './data/cities.json'
import MapView from './components/MapView.jsx'
import Timeline from './components/Timeline.jsx'
import Panel from './components/Panel.jsx'
import Search from './components/Search.jsx'
import { loadIndex } from './lib/borders.js'
import { REGIONS, inRegion, makePolityIndex, rulersAt } from './lib/polities.js'
import { MIN_YEAR, MAX_YEAR, bracket, formatYear, halfWindow, roundYear, tToYear, yearParts, yearToT } from './lib/time.js'

// Playback speeds in years per second.
const SPEEDS = [1, 5, 25, 100, 400]

function readUrl() {
  const q = new URLSearchParams(window.location.search)
  const y = Number(q.get('y'))
  const z0 = Number(q.get('z0')), z1 = Number(q.get('z1'))
  return {
    year: Number.isFinite(y) && q.has('y') ? Math.max(MIN_YEAR, Math.min(MAX_YEAR, y)) : -1274,
    polity: q.get('p'),
    event: q.get('e'),
    region: REGIONS.some(([k]) => k === q.get('r')) ? q.get('r') : 'all',
    view: q.has('z0') && z1 > z0 ? [Math.max(0, z0), Math.min(1, z1)] : [0, 1],
  }
}

export default function App() {
  const initial = useMemo(readUrl, [])
  const index = useMemo(() => makePolityIndex(polities), [])
  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.year - b.year), [])

  const [year, setYear] = useState(initial.year)
  const [selection, setSelection] = useState(() =>
    initial.event ? { kind: 'event', id: initial.event } : initial.polity ? { kind: 'polity', id: initial.polity } : null,
  )
  const [snapshots, setSnapshots] = useState(null)
  const [indexError, setIndexError] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(25)
  const [focus, setFocus] = useState(null)
  const [region, setRegion] = useState(initial.region)
  const [view, setView] = useState(initial.view)
  const nonce = useRef(0)
  const yearRef = useRef(year)
  yearRef.current = year
  const viewRef = useRef(view)
  viewRef.current = view

  useEffect(() => { loadIndex().then(setSnapshots).catch((e) => setIndexError(e.message)) }, [])

  const span = view[1] - view[0]
  const halfWin = halfWindow(year, span)

  const regionPolities = useMemo(() => polities.filter((p) => inRegion(p, region)), [region])
  const regionEvents = useMemo(() => {
    if (region === 'all') return sortedEvents
    const ok = new Set(regionPolities.map((p) => p.id))
    return sortedEvents.filter((e) => !e.polities?.length || e.polities.some((id) => ok.has(id)))
  }, [region, regionPolities, sortedEvents])

  // Keep a year inside the visible part of the timeline.
  const ensureVisible = useCallback((y, lead = 0.3) => {
    const [t0, t1] = viewRef.current
    const s = t1 - t0
    if (s >= 0.999) return
    const t = yearToT(y)
    if (t < t0 || t > t1) {
      const n0 = Math.min(1 - s, Math.max(0, t - s * lead))
      setView([n0, n0 + s])
    }
  }, [])


  useEffect(() => {
    if (!playing) return
    let raf, last = performance.now()
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      setYear((y) => {
        let n = y + dt * speed
        if (y < 0 && n >= 0) n += 1 // skip year 0
        if (n >= MAX_YEAR) { setPlaying(false); return MAX_YEAR }
        const [t0, t1] = viewRef.current
        const s = t1 - t0
        if (s < 0.999 && yearToT(n) > t1 - s * 0.08) {
          const n0 = Math.min(1 - s, yearToT(n) - s * 0.2)
          setView([n0, n0 + s])
        }
        return n
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed])

  useEffect(() => {
    if (playing) return
    const id = setTimeout(() => {
      const q = new URLSearchParams()
      q.set('y', String(roundYear(year)))
      if (selection?.kind === 'polity') q.set('p', selection.id)
      if (selection?.kind === 'event') q.set('e', selection.id)
      if (region !== 'all') q.set('r', region)
      if (view[1] - view[0] < 0.999) { q.set('z0', view[0].toFixed(4)); q.set('z1', view[1].toFixed(4)) }
      window.history.replaceState(null, '', `?${q}`)
    }, 300)
    return () => clearTimeout(id)
  }, [year, selection, playing, region, view])

  const requestFocus = useCallback((f) => setFocus({ ...f, nonce: ++nonce.current }), [])

  // Shared links: bring the timeline and map to what the link points at.
  useEffect(() => {
    ensureVisible(initial.year)
    const ev = initial.event && events.find((e) => e.id === initial.event)
    if (ev) requestFocus({ kind: 'point', lon: ev.lon, lat: ev.lat, minK: 2.5 })
    else if (initial.polity && index.byId.has(initial.polity)) requestFocus({ kind: 'polity', id: initial.polity, year: initial.year })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectPolity = useCallback((id, opts = {}) => {
    const p = index.byId.get(id)
    if (!p) return
    const r = roundYear(yearRef.current)
    const target = opts.jump || r < p.start || r > p.end ? (p.peak ?? p.start) : yearRef.current
    setPlaying(false)
    setSelection({ kind: 'polity', id })
    setYear(target)
    ensureVisible(target)
    if (opts.fly) requestFocus({ kind: 'polity', id, year: target })
  }, [index, requestFocus, ensureVisible])

  const selectEvent = useCallback((id) => {
    const ev = events.find((e) => e.id === id)
    if (!ev) return
    setPlaying(false)
    setSelection({ kind: 'event', id })
    setYear(ev.year)
    ensureVisible(ev.year)
    requestFocus({ kind: 'point', lon: ev.lon, lat: ev.lat, minK: 2.5 })
  }, [requestFocus, ensureVisible])

  const onPick = useCallback((hit) => {
    if (!hit) return
    if (hit.kind === 'event') return selectEvent(hit.id)
    if (hit.kind === 'site') return requestFocus({ kind: 'point', lon: hit.site.lon, lat: hit.site.lat, minK: 4 })
    if (hit.kind === 'city') { setSelection({ kind: 'city', id: hit.city.id }); return }
    const f = hit.feature
    if (!f.name) { setSelection(null); return }
    const p = index.forName(f.name, roundYear(yearRef.current))
    if (p) setSelection({ kind: 'polity', id: p.id })
    else setSelection({
      kind: 'region', name: f.name, partOf: f.props.PARTOF, subjectOf: f.props.SUBJECTO,
      precision: f.props.BORDERPRECISION, snapYear: hit.layerYear,
    })
  }, [index, selectEvent, requestFocus])

  const step = useCallback((delta) => {
    setPlaying(false)
    setYear((y) => {
      const r = roundYear(y)
      let n = r + delta
      if (r < 0 && n >= 0) n += 1 // there is no year 0
      if (r > 0 && n <= 0) n -= 1
      n = Math.max(MIN_YEAR, Math.min(MAX_YEAR, n))
      ensureVisible(n, 0.5)
      return n
    })
  }, [ensureVisible])

  const zoomTimeline = useCallback((factor) => {
    const [t0, t1] = viewRef.current
    const ns = Math.min(1, Math.max(0.0015, (t1 - t0) * factor))
    const tc = Math.min(1, Math.max(0, yearToT(yearRef.current)))
    let n0 = Math.min(1 - ns, Math.max(0, tc - ns / 2))
    setView([n0, n0 + ns])
  }, [])

  const fitTimeline = useCallback((a, b) => {
    const t0 = yearToT(a), t1 = yearToT(b)
    const pad = Math.max(0.002, (t1 - t0) * 0.04)
    setView([Math.max(0, t0 - pad), Math.min(1, t1 + pad)])
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const mag = e.shiftKey ? 10 : e.altKey ? 100 : 1
        step(e.key === 'ArrowRight' ? mag : -mag)
      } else if (e.key === ' ' && tag !== 'BUTTON') {
        e.preventDefault()
        setPlaying((p) => !p)
      } else if (e.key === 'Escape') {
        setSelection(null)
      } else if (e.key === '+' || e.key === '=') {
        zoomTimeline(0.5)
      } else if (e.key === '-' || e.key === '_') {
        zoomTimeline(2)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, zoomTimeline])

  const togglePlay = () => {
    if (!playing && year >= MAX_YEAR) setYear(MIN_YEAR)
    setPlaying((p) => !p)
  }
  const cycleSpeed = () => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])

  const { num, era } = yearParts(year)
  const br = snapshots ? bracket(year, snapshots) : null
  const snapNote = !br ? '' : br.a === br.b || br.f === 0
    ? `Border snapshot: ${formatYear(br.a)}`
    : `Borders between the ${formatYear(br.a)} and ${formatYear(br.b)} snapshots`

  // The reigning ruler of the selected empire (or of an event's main party), shown under the year.
  const rulerPolity = selection?.kind === 'polity' ? selection.id
    : selection?.kind === 'event' ? sortedEvents.find((e) => e.id === selection.id)?.polities?.find((id) => rulers[id]) : null
  const reigning = rulerPolity ? rulersAt(rulers, rulerPolity, year) : []

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="wordmark">Atlas of Empires</h1>
        <Search polities={polities} events={sortedEvents} onSelectPolity={selectPolity} onSelectEvent={selectEvent} />
        <button
          type="button"
          className={`about-btn${selection?.kind === 'about' ? ' is-on' : ''}`}
          onClick={() => setSelection((s) => (s?.kind === 'about' ? null : { kind: 'about' }))}
        >
          About the data
        </button>
      </header>

      <main className="stage">
        <div className="map-col">
          {indexError ? (
            <div className="map-status is-error" role="alert">{indexError} Reload the page to try again.</div>
          ) : (
            <MapView
              year={year}
              snapshots={snapshots}
              index={index}
              events={regionEvents}
              cities={cities}
              halfWin={halfWin}
              selection={selection}
              focus={focus}
              onPick={onPick}
            />
          )}

          <div className="year-display">
            <div className="year-big">
              <span className="year-num">{num}</span>
              <span className="year-era">{era}</span>
            </div>
            {reigning.length > 0 && (
              <div className="year-ruler">
                {rulers[rulerPolity].title}: {reigning.map((r) => r.name).join(' and ')}
              </div>
            )}
            <div className="year-note">{snapNote}</div>
          </div>

          <button type="button" className="reset-view" onClick={() => requestFocus({ kind: 'reset' })}>Whole world</button>
        </div>

        <Panel
          selection={selection}
          year={year}
          index={index}
          events={sortedEvents}
          rulers={rulers}
          cities={cities}
          halfWin={halfWin}
          onClose={() => setSelection(null)}
          onSelectPolity={selectPolity}
          onSelectEvent={selectEvent}
          onJump={(y, id) => { setPlaying(false); setYear(y); ensureVisible(y); if (id) requestFocus({ kind: 'polity', id, year: y }) }}
          onFocusPoint={(lon, lat) => requestFocus({ kind: 'point', lon, lat, minK: 4 })}
          onFocusPolity={(id) => requestFocus({ kind: 'polity', id, year })}
          onFitTimeline={fitTimeline}
        />
      </main>

      <footer className="timeline-bar">
        <div className="controls">
          <button type="button" className="play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play through time'}>
            {playing ? (
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><rect x="5" y="4" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="11.5" y="4" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
            ) : (
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M6 3.8v12.4a.8.8 0 0 0 1.2.7l10-6.2a.8.8 0 0 0 0-1.4l-10-6.2A.8.8 0 0 0 6 3.8z" fill="currentColor" /></svg>
            )}
          </button>
          <button type="button" className="speed" onClick={cycleSpeed} aria-label={`Playback speed ${speed} years per second. Change speed`}>
            {speed} yr/s
          </button>
        </div>
        <div className="timeline-main">
          <div className="timeline-tools">
            <label className="sr-only" htmlFor="region-filter">Show empires from</label>
            <select id="region-filter" value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <div className="zoom-btns" role="group" aria-label="Timeline zoom">
              <button type="button" onClick={() => zoomTimeline(2)} aria-label="Zoom timeline out" disabled={span >= 0.999}>−</button>
              <button type="button" onClick={() => zoomTimeline(0.5)} aria-label="Zoom timeline in" disabled={span <= 0.0016}>+</button>
              <button type="button" onClick={() => setView([0, 1])} disabled={span >= 0.999}>All time</button>
            </div>
            <span className="tl-range">{formatYear(tToYear(view[0]))} to {formatYear(tToYear(view[1]))}</span>
          </div>
          <div
            className="timeline-slot"
            role="slider"
            tabIndex={0}
            aria-label="Year"
            aria-valuemin={MIN_YEAR}
            aria-valuemax={MAX_YEAR}
            aria-valuenow={roundYear(year)}
            aria-valuetext={formatYear(year)}
          >
            <Timeline
              year={year}
              onYear={(y) => { setPlaying(false); setYear(y) }}
              polities={regionPolities}
              events={regionEvents}
              snapshots={snapshots || []}
              selection={selection}
              rulers={rulers}
              view={view}
              onView={setView}
              onSelectPolity={selectPolity}
              onSelectEvent={selectEvent}
            />
          </div>
        </div>
      </footer>
    </div>
  )
}
