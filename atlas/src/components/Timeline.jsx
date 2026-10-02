import { useEffect, useMemo, useRef, useState } from 'react'
import { AXIS_TICKS, MAX_YEAR, formatYear, formatRange, tToYear, yearToT, yearTicks } from '../lib/time.js'

const PAD = 14

export function shortName(name) {
  return name
    .replace(/^(Kingdom|Empire|Republic|Despotate|Grand Duchy|Crown) of /, '')
    .replace(/ (Empire|dynasty|Kingdom|Caliphate|civilization|city-states|Khaganate|Sultanate)\b.*$/, '')
    .replace(/^Muscovy, Russian Empire and USSR$/, 'Russia')
    .replace(/^Great Britain \/ United Kingdom$/, 'Britain')
}

function pack(items, getX0, getX1, gap) {
  const ends = []
  return items.map((it) => {
    const x0 = getX0(it), x1 = getX1(it)
    let lane = ends.findIndex((e) => e + gap <= x0)
    if (lane === -1) { lane = ends.length; ends.push(x1) } else ends[lane] = x1
    return { it, x0, x1, lane }
  })
}

export default function Timeline({
  year, onYear, polities, events, snapshots, selection, rulers, view, onView, onSelectPolity, onSelectEvent,
}) {
  const boxRef = useRef(null)
  const drag = useRef(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const [w, setW] = useState(() => Math.max(280, Math.min(900, window.innerWidth - 80)))

  useEffect(() => {
    const el = boxRef.current
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)))
    ro.observe(el)
    // Wheel zooms around the cursor; horizontal scroll (or Shift+wheel) pans.
    const onWheel = (e) => {
      e.preventDefault()
      const [t0, t1] = viewRef.current
      const span = t1 - t0
      const r = el.getBoundingClientRect()
      const frac = Math.min(1, Math.max(0, (e.clientX - r.left - PAD) / (r.width - PAD * 2)))
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey
      if (horizontal) {
        const d = ((e.shiftKey ? e.deltaY : e.deltaX) / r.width) * span
        const n0 = Math.min(1 - span, Math.max(0, t0 + d))
        onView([n0, n0 + span])
      } else {
        const ns = Math.min(1, Math.max(0.0015, span * Math.exp(e.deltaY * 0.0015)))
        const tc = t0 + frac * span
        let n0 = tc - frac * ns
        n0 = Math.min(1 - ns, Math.max(0, n0))
        onView([n0, n0 + ns])
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { ro.disconnect(); el.removeEventListener('wheel', onWheel) }
  }, [onView])

  const [t0, t1] = view
  const span = t1 - t0
  const compact = w < 640
  const LANE = compact ? 7 : 10.5
  const BAR = compact ? 5.5 : 9.5
  const MAX_LANES = compact ? 8 : 13
  const inner = w - PAD * 2
  const x = (y) => PAD + ((yearToT(y) - t0) / span) * inner
  const y0 = tToYear(t0), y1 = tToYear(t1)

  const selPolityId = selection?.kind === 'polity' ? selection.id : null
  const rulerList = selPolityId && rulers[selPolityId] ? rulers[selPolityId].list : null

  const EV_TOP = 2, EV_H = 10
  const rulerRows = useMemo(() => {
    if (!rulerList) return null
    const vis = rulerList.filter((r) => r.end >= y0 && r.start <= y1)
    const packed = pack(vis, (r) => x(r.start), (r) => Math.max(x(r.end), x(r.start) + 2), -0.5)
    const rows = Math.min(3, Math.max(1, 0, ...packed.map((p) => p.lane + 1)))
    return { packed: packed.filter((p) => p.lane < 3), rows }
  }, [rulerList, w, t0, t1])
  const RULER_H = compact ? 11 : 15
  const RULER_TOP = EV_TOP + EV_H + 4
  const LANES_TOP = RULER_TOP + (rulerRows ? rulerRows.rows * RULER_H + 5 : 0)

  const { placed, count, hidden } = useMemo(() => {
    // The selected empire always gets the first lane.
    const vis = polities.filter((p) => p.end >= y0 && p.start <= y1)
      .sort((a, b) => (b.id === selPolityId) - (a.id === selPolityId) || a.start - b.start || b.end - a.end)
    const packed = pack(vis, (p) => Math.max(PAD - 4, x(p.start)), (p) => Math.min(w - PAD + 4, Math.max(x(Math.min(p.end, MAX_YEAR)), x(p.start) + 4)), 3)
    const shown = packed.filter((p) => p.lane < MAX_LANES)
    return { placed: shown, count: Math.max(1, Math.min(MAX_LANES, Math.max(0, ...packed.map((p) => p.lane + 1)))), hidden: packed.length - shown.length }
  }, [polities, w, t0, t1, MAX_LANES, selPolityId])

  const axisY = LANES_TOP + count * LANE + 6
  const H = axisY + 20

  const ticks = useMemo(() => {
    const cand = span > 0.9 ? AXIS_TICKS : yearTicks(y0, y1, Math.max(4, Math.floor(inner / 70)))
    const out = []
    let lastRight = -Infinity
    for (const t of cand) {
      const tx = x(t)
      if (tx < PAD - 1 || tx > w - PAD + 1) continue
      const label = formatYear(t)
      const lw = label.length * 6.9
      const anchor = tx < 40 ? 'start' : tx > w - 40 ? 'end' : 'middle'
      const left = anchor === 'start' ? tx : anchor === 'end' ? tx - lw : tx - lw / 2
      if (left < lastRight + 10) continue
      out.push({ t, tx, label, anchor })
      lastRight = left + lw
    }
    return out
  }, [w, t0, t1])

  const selEvent = selection?.kind === 'event' ? selection.id : null
  const px = x(year)
  const visEvents = events.filter((e) => e.year >= y0 && e.year <= y1)
  const visPolity = selPolityId ? polities.find((p) => p.id === selPolityId) : null

  const yearAt = (clientX) => {
    const r = boxRef.current.getBoundingClientRect()
    return tToYear(t0 + ((clientX - r.left - PAD) / (r.width - PAD * 2)) * span)
  }

  function onPointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.currentTarget.setPointerCapture(e.pointerId)
    const ds = e.target.dataset || {}
    drag.current = { x0: e.clientX, moved: false, polity: ds.polity, event: ds.event, ruler: ds.ruler }
    if (!ds.event && !ds.ruler) onYear(yearAt(e.clientX))
  }
  function onPointerMove(e) {
    const d = drag.current
    if (!d) return
    if (Math.abs(e.clientX - d.x0) > 3) d.moved = true
    if (d.moved) onYear(yearAt(e.clientX))
  }
  function onPointerUp() {
    const d = drag.current
    drag.current = null
    if (!d || d.moved) return
    if (d.event) onSelectEvent(d.event)
    else if (d.ruler) onYear(Number(d.ruler))
    else if (d.polity) onSelectPolity(d.polity, { fly: true })
  }

  return (
    <div className="timeline" ref={boxRef}>
      <svg
        width={w}
        height={H}
        viewBox={`0 0 ${w} ${H}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        aria-hidden="true"
      >
        <defs>
          <clipPath id="tl-clip"><rect x={PAD - 4} y={0} width={inner + 8} height={H} /></clipPath>
        </defs>
        {ticks.map((t) => (
          <line key={t.t} x1={t.tx} x2={t.tx} y1={EV_TOP + EV_H + 2} y2={axisY} className="tl-grid" />
        ))}

        <g clipPath="url(#tl-clip)">
          {visEvents.map((ev) => {
            const ex = x(ev.year)
            return (
              <g key={ev.id} className={`tl-event${ev.id === selEvent ? ' is-selected' : ''}`}>
                <line x1={ex} x2={ex} y1={EV_TOP} y2={EV_TOP + EV_H} />
                <rect data-event={ev.id} x={ex - 3.5} y={EV_TOP - 1} width={7} height={EV_H + 2} fill="transparent">
                  <title>{`${formatYear(ev.year, ev.approx)}: ${ev.title}`}</title>
                </rect>
              </g>
            )
          })}

          {rulerRows?.packed.map(({ it: r, x0, x1, lane }, i) => {
            const y = RULER_TOP + lane * RULER_H
            const active = year >= r.start && year < r.end + 1
            const fits = x1 - x0 > r.name.length * 5.6 + 8
            return (
              <g key={`${r.name}-${r.start}`} className={`tl-ruler${active ? ' is-active' : ''}`}>
                <rect
                  data-ruler={r.start}
                  x={x0} y={y} width={Math.max(1.5, x1 - x0 - 1)} height={RULER_H - 2} rx={2}
                  fill={visPolity?.color || '#888'} opacity={active ? 1 : i % 2 ? 0.42 : 0.6}
                >
                  <title>{`${r.name}, ${formatRange(r.start, r.end)}`}</title>
                </rect>
                {fits && !compact && (
                  <text x={x0 + 4} y={y + (RULER_H - 2) / 2 + 0.5} className="tl-ruler-label" pointerEvents="none">{r.name}</text>
                )}
              </g>
            )
          })}

          {placed.map(({ it: p, x0, x1, lane }) => {
            const active = year >= p.start && year <= p.end
            const y = LANES_TOP + lane * LANE
            const label = shortName(p.name)
            const lx = Math.max(x0, PAD)
            const fits = !compact && x1 - lx > label.length * 5 + 10
            return (
              <g key={p.id} className={`tl-bar${active ? ' is-active' : ''}${p.id === selPolityId ? ' is-selected' : ''}`}>
                <rect data-polity={p.id} x={x0} y={y} width={Math.max(2, x1 - x0)} height={BAR} rx={2} fill={p.color}>
                  <title>{`${p.name}, ${formatRange(p.start, p.end)}`}</title>
                </rect>
                {fits && <text x={lx + 5} y={y + BAR / 2 + 0.5} className="tl-bar-label" pointerEvents="none">{label}</text>}
              </g>
            )
          })}
        </g>

        <line x1={PAD} x2={w - PAD} y1={axisY} y2={axisY} className="tl-axis" />
        {snapshots.filter((s) => s >= y0 && s <= y1).map((s) => (
          <circle key={s} cx={x(s)} cy={axisY} r={1.6} className="tl-snap">
            <title>{`Border snapshot: ${formatYear(s)}`}</title>
          </circle>
        ))}
        {ticks.map((t) => (
          <text key={t.t} x={t.tx} y={axisY + 14} className="tl-tick" textAnchor={t.anchor}>{t.label}</text>
        ))}
        {hidden > 0 && (
          <text x={w - PAD} y={LANES_TOP + count * LANE + 1} className="tl-more" textAnchor="end">
            {hidden} more; filter by region or zoom in
          </text>
        )}

        {px >= PAD - 1 && px <= w - PAD + 1 && (
          <>
            <line x1={px} x2={px} y1={0} y2={axisY} className="tl-playhead" />
            <circle cx={px} cy={axisY} r={5.5} className="tl-handle" />
          </>
        )}
      </svg>
    </div>
  )
}
