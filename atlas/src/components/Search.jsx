import { useMemo, useState } from 'react'
import { formatRange } from '../lib/time.js'

export default function Search({ polities, events, onSelectPolity, onSelectEvent }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    const ps = polities
      .filter((p) => p.name.toLowerCase().includes(s) || (p.match || []).some((m) => m.toLowerCase().includes(s)))
      .map((p) => ({ kind: 'polity', id: p.id, label: p.name, sub: formatRange(p.start, p.end), color: p.color }))
    const es = events
      .filter((e) => e.title.toLowerCase().includes(s))
      .map((e) => ({ kind: 'event', id: e.id, label: e.title, sub: 'Event' }))
    return [...ps, ...es].slice(0, 8)
  }, [q, polities, events])

  function choose(r) {
    if (!r) return
    if (r.kind === 'polity') onSelectPolity(r.id, { jump: true, fly: true })
    else onSelectEvent(r.id)
    setQ(''); setOpen(false)
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]) }
    else if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur() }
  }

  return (
    <div className="search">
      <label htmlFor="search-input" className="sr-only">Find an empire or event</label>
      <input
        id="search-input"
        type="search"
        placeholder="Find an empire or event"
        value={q}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="search-results"
        aria-activedescendant={open && results[active] ? `sr-${active}` : undefined}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {open && results.length > 0 && (
        <ul id="search-results" className="search-results" role="listbox">
          {results.map((r, i) => (
            <li key={r.kind + r.id} id={`sr-${i}`} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'is-active' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r)}>
                {r.color ? <span className="swatch" style={{ background: r.color }} aria-hidden="true" /> : <span className="swatch is-event" aria-hidden="true" />}
                <span className="sr-label">{r.label}</span>
                <span className="sr-sub">{r.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
