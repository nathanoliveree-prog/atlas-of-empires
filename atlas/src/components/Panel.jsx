import { useEffect, useMemo, useRef } from 'react'
import { formatYear, formatRange, roundYear } from '../lib/time.js'
import { cityName, precisionLabel, rulersAt } from '../lib/polities.js'

const KIND_LABEL = { primary: 'Written sources', archaeology: 'Archaeology', scholarship: 'Scholarship' }
const TYPE_LABEL = { battle: 'Battle', founding: 'Founding', collapse: 'Collapse', treaty: 'Treaty', milestone: 'Milestone' }

function Sources({ sources }) {
  const groups = ['primary', 'archaeology', 'scholarship']
    .map((k) => [k, sources.filter((s) => (s.kind || 'primary') === k)])
    .filter(([, list]) => list.length)
  return groups.map(([k, list]) => (
    <section key={k} className="sources">
      <h3>{KIND_LABEL[k]}</h3>
      <ul>
        {list.map((s, i) => (
          <li key={i}>
            <cite>{s.cite}</cite>
            {s.note && <span className="source-note"> {s.note}</span>}
          </li>
        ))}
      </ul>
    </section>
  ))
}

function Rulers({ polityId, rulers, year, onJump }) {
  const r = rulers[polityId]
  if (!r) return null
  const y = roundYear(year)
  const current = rulersAt(rulers, polityId, y)
  return (
    <section>
      <h3>Rulers</h3>
      {current.length > 0 ? (
        <p className="meta"><span className="meta-label">{r.title} in {formatYear(y)}</span> {current.map((c) => `${c.name} (${formatRange(c.start, c.end)})`).join('; ')}</p>
      ) : (
        <p className="muted">No ruler listed for {formatYear(y)}.</p>
      )}
      <details className="ruler-list">
        <summary>All {r.list.length} rulers</summary>
        <ul>
          {r.list.map((x) => (
            <li key={`${x.name}-${x.start}`}>
              <button type="button" className={`ruler-row${current.includes(x) ? ' is-current' : ''}`} onClick={() => onJump(x.start)}>
                <span className="event-date">{x.start === x.end ? formatYear(x.start) : x.start < 0 && x.end > 0 ? formatRange(x.start, x.end) : `${Math.abs(x.start)}–${Math.abs(x.end)}${x.end < 0 ? ' BCE' : ''}`}</span>
                <span className="event-title">{x.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}

function PolityChip({ p, onClick }) {
  return (
    <button type="button" className="chip" onClick={onClick}>
      <span className="swatch" style={{ background: p.color }} aria-hidden="true" />
      {p.name}
    </button>
  )
}

function EventRow({ ev, onClick, current }) {
  return (
    <li>
      <button type="button" className={`event-row${current ? ' is-current' : ''}`} onClick={onClick}>
        <span className="event-date">{formatYear(ev.year, ev.approx)}</span>
        <span className="event-title">{ev.title}</span>
      </button>
    </li>
  )
}

function Around({ year, index, events, rulers, halfWin, onSelectPolity, onSelectEvent }) {
  const y = roundYear(year)
  const active = index.all.filter((p) => y >= p.start && y <= p.end)
  const reigning = active
    .map((p) => ({ p, list: rulersAt(rulers, p.id, y) }))
    .filter((r) => r.list.length)
  const nearby = useMemo(
    () => events
      .map((ev) => ({ ev, d: Math.abs(ev.year - y) }))
      .filter((e) => e.d <= halfWin * 3)
      .sort((a, b) => a.d - b.d)
      .slice(0, 8)
      .sort((a, b) => a.ev.year - b.ev.year),
    [y, halfWin, events],
  )
  return (
    <>
      <h2 className="panel-title">The world around {formatYear(y)}</h2>
      <section>
        <h3>Powers with profiles</h3>
        {active.length ? (
          <div className="chips">{active.map((p) => <PolityChip key={p.id} p={p} onClick={() => onSelectPolity(p.id, { fly: true })} />)}</div>
        ) : (
          <p className="muted">None of the profiled powers exists in this year. Click any region on the map to see what the border data records.</p>
        )}
      </section>
      {reigning.length > 0 && (
        <section>
          <h3>Who ruled</h3>
          <ul className="ruler-now">
            {reigning.map(({ p, list }) => (
              <li key={p.id}>
                <button type="button" className="link" onClick={() => onSelectPolity(p.id, { fly: true })}>{p.name}</button>
                <span>{list.map((r) => r.name).join(' and ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3>Events nearby</h3>
        {nearby.length ? (
          <ul className="event-list">{nearby.map(({ ev }) => <EventRow key={ev.id} ev={ev} onClick={() => onSelectEvent(ev.id)} />)}</ul>
        ) : (
          <p className="muted">No recorded events in this span. Press play or drag the timeline to move through time.</p>
        )}
      </section>
    </>
  )
}

function PolityView({ p, year, events, index, rulers, onJump, onSelectEvent, onFocusPoint, onFocusPolity, onFitTimeline }) {
  const y = roundYear(year)
  const exists = y >= p.start && y <= p.end
  const related = events.filter((e) => e.polities?.includes(p.id)).sort((a, b) => a.year - b.year)
  return (
    <>
      <div className="panel-kicker"><span className="swatch big" style={{ background: p.color }} aria-hidden="true" />{formatRange(p.start, p.end)}</div>
      <h2 className="panel-title">{p.name}</h2>
      {!exists && <p className="notice">Not in existence in {formatYear(y)}.</p>}
      <p className="summary">{p.summary}</p>
      {p.capital && <p className="meta"><span className="meta-label">Capital</span> {p.capital}</p>}
      <div className="actions">
        <button type="button" onClick={() => onJump(p.start, p.id)}>Go to rise</button>
        {p.peak != null && <button type="button" onClick={() => onJump(p.peak, p.id)}>Go to height</button>}
        {p.end < 2025 && <button type="button" onClick={() => onJump(p.end, p.id)}>Go to fall</button>}
        <button type="button" onClick={() => onFocusPolity(p.id)}>Show on map</button>
        <button type="button" onClick={() => onFitTimeline(p.start, Math.min(p.end, 2025))}>Zoom timeline to its lifespan</button>
      </div>
      <Rulers polityId={p.id} rulers={rulers} year={year} onJump={(y) => onJump(y, null)} />
      <Sources sources={p.sources || []} />
      {p.sites?.length > 0 && (
        <section>
          <h3>Sites</h3>
          <ul className="site-list">
            {p.sites.map((s) => (
              <li key={s.name}><button type="button" className="link" onClick={() => onFocusPoint(s.lon, s.lat)}>{s.name}</button></li>
            ))}
          </ul>
        </section>
      )}
      {related.length > 0 && (
        <section>
          <h3>Timeline</h3>
          <ul className="event-list">{related.map((ev) => <EventRow key={ev.id} ev={ev} current={Math.abs(ev.year - y) < 1} onClick={() => onSelectEvent(ev.id)} />)}</ul>
        </section>
      )}
    </>
  )
}

function EventView({ ev, index, onSelectPolity, onFocusPoint }) {
  const involved = (ev.polities || []).map((id) => index.byId.get(id)).filter(Boolean)
  return (
    <>
      <div className="panel-kicker">{TYPE_LABEL[ev.type] || 'Event'}, {formatYear(ev.year, ev.approx)}</div>
      <h2 className="panel-title">{ev.title}</h2>
      <p className="summary">{ev.summary}</p>
      <div className="actions">
        <button type="button" onClick={() => onFocusPoint(ev.lon, ev.lat)}>Show on map</button>
      </div>
      <Sources sources={ev.sources || []} />
      {involved.length > 0 && (
        <section>
          <h3>Involved</h3>
          <div className="chips">{involved.map((p) => <PolityChip key={p.id} p={p} onClick={() => onSelectPolity(p.id, { fly: true })} />)}</div>
        </section>
      )}
    </>
  )
}

function RegionView({ region, index, onSelectPolity }) {
  const related = index.anyForName(region.name)
  return (
    <>
      <div className="panel-kicker">Region in the {formatYear(region.snapYear)} border snapshot</div>
      <h2 className="panel-title">{region.name}</h2>
      {region.partOf && region.partOf !== region.name && <p className="meta"><span className="meta-label">Part of</span> {region.partOf}</p>}
      {region.subjectOf && region.subjectOf !== region.name && region.subjectOf !== region.partOf && (
        <p className="meta"><span className="meta-label">Under</span> {region.subjectOf}</p>
      )}
      <p className="meta"><span className="meta-label">Precision</span> {precisionLabel(region.precision)}</p>
      {related ? (
        <p className="summary">
          The detailed profile of <strong>{related.name}</strong> covers {formatRange(related.start, related.end)}.
          The border dataset uses this label outside that span, often for successor states.{' '}
          <button type="button" className="link" onClick={() => onSelectPolity(related.id, { jump: true, fly: true })}>Open the profile</button>
        </p>
      ) : (
        <p className="muted">No detailed profile for this region yet. Its outline comes from the historical-basemaps dataset.</p>
      )}
    </>
  )
}

function CityView({ city, year, onFocusPoint }) {
  const y = roundYear(year)
  return (
    <>
      <div className="panel-kicker">City</div>
      <h2 className="panel-title">{cityName(city, y)}</h2>
      <section>
        <h3>Names over time</h3>
        <ul className="event-list">
          {city.names.map((n, i) => {
            const from = i === 0 ? city.from : city.names[i - 1].until + 1
            const to = n.until ?? city.to
            return (
              <li key={i} className="name-row">
                <span className="event-date">{to == null ? `from ${formatYear(from)}` : formatRange(from, to)}</span>
                <span className="event-title">{n.name}</span>
              </li>
            )
          })}
        </ul>
        <p className="muted">Founding dates for ancient cities are approximate.</p>
      </section>
      <div className="actions">
        <button type="button" onClick={() => onFocusPoint(city.lon, city.lat)}>Show on map</button>
      </div>
    </>
  )
}

function About() {
  return (
    <>
      <h2 className="panel-title">About this atlas</h2>
      <section className="prose">
        <h3>Borders</h3>
        <p>
          Outlines come from the open historical-basemaps dataset by André Ourednik and contributors, which records the world at
          {' '}50 dates between 4000 BCE and 2010 CE. Dots on the timeline axis mark those dates. Between them, the map cross-fades
          from one snapshot to the next, so in-between years are an approximation rather than a record.
        </p>
        <p>
          Before about 1000 BCE most outlines mark the reach of a culture or a cluster of cities, not a frontier. Labels in
          italics are cultures and peoples rather than states. Every region lists its border precision when you click it.
        </p>
        <p>
          Coastlines, rivers and lakes come from Natural Earth and show today's geography; country colours are trimmed to the
          modern shoreline. Ancient coasts differed in places, for example at the head of the Persian Gulf and around Ephesus,
          whose harbour silted up.
        </p>
        <h3>Profiles, rulers and events</h3>
        <p>
          Each profile and event cites the written sources (texts, inscriptions, archives) and archaeological work it rests on.
          Ruler lists give reign dates as usually cited; co-rulers and rival claimants
          overlap, and some early dates are uncertain. City names change with the year shown. Ancient dates follow standard conventions, including the middle chronology for Mesopotamia, and are marked “c.” when
          approximate. Traditional dates, such as the founding of Rome, are labelled as such.
        </p>
        <h3>Map symbols</h3>
        <ul className="legend">
          <li><span className="g g-battle" aria-hidden="true" />Battle</li>
          <li><span className="g g-founding" aria-hidden="true" />Founding</li>
          <li><span className="g g-collapse" aria-hidden="true" />Collapse</li>
          <li><span className="g g-treaty" aria-hidden="true" />Treaty</li>
          <li><span className="g g-milestone" aria-hidden="true" />Milestone</li>
        </ul>
        <h3>Keyboard</h3>
        <p>
          Left and right arrows move one year; hold Shift for ten, Alt for a hundred. Space plays and pauses. Plus and minus zoom
          the timeline, as does the scroll wheel over it. Escape closes this panel.
        </p>
        <h3>Credits</h3>
        <p>
          Border data: historical-basemaps, GPL-3.0 (github.com/aourednik/historical-basemaps). Verify borders against other sources
          before using them in academic work. Coastlines, rivers and lakes: Natural Earth (public domain).
        </p>
      </section>
    </>
  )
}

export default function Panel(props) {
  const { selection, index, events, onClose } = props
  const bodyRef = useRef(null)
  useEffect(() => { bodyRef.current?.scrollTo?.(0, 0) }, [selection?.kind, selection?.id, selection?.name])

  let content
  if (!selection) content = <Around {...props} />
  else if (selection.kind === 'polity') {
    const p = index.byId.get(selection.id)
    content = p ? <PolityView p={p} {...props} /> : null
  } else if (selection.kind === 'event') {
    const ev = events.find((e) => e.id === selection.id)
    content = ev ? <EventView ev={ev} {...props} /> : null
  } else if (selection.kind === 'region') content = <RegionView region={selection} {...props} />
  else if (selection.kind === 'about') content = <About />

  return (
    <aside className={`panel${selection ? '' : ' is-idle'}`} aria-label="Details">
      {selection && (
        <button type="button" className="panel-close" onClick={onClose} aria-label="Close details">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      )}
      <div className="panel-body" ref={bodyRef}>{content}</div>
    </aside>
  )
}
