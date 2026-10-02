// Validates src/data before every build so a typo can't ship a broken site.
import { readFileSync } from 'node:fs'

const polities = JSON.parse(readFileSync(new URL('../src/data/polities.json', import.meta.url)))
const events = JSON.parse(readFileSync(new URL('../src/data/events.json', import.meta.url)))
const rulers = JSON.parse(readFileSync(new URL('../src/data/rulers.json', import.meta.url)))
const cities = JSON.parse(readFileSync(new URL('../src/data/cities.json', import.meta.url)))
const REGIONS = ['europe', 'mideast', 'africa', 'steppe', 'southasia', 'eastasia', 'americas']
const errors = []
const KINDS = ['primary', 'archaeology', 'scholarship']
const TYPES = ['battle', 'founding', 'collapse', 'treaty', 'milestone']
const ids = new Set()

const coord = (lat, lon) => typeof lat === 'number' && typeof lon === 'number' && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
const checkSources = (where, list) => {
  if (!Array.isArray(list) || !list.length) errors.push(`${where}: needs at least one source`)
  for (const s of list || []) {
    if (!s.cite) errors.push(`${where}: a source is missing "cite"`)
    if (s.kind && !KINDS.includes(s.kind)) errors.push(`${where}: source kind "${s.kind}" must be one of ${KINDS.join(', ')}`)
  }
}

for (const p of polities) {
  const w = `polity "${p.id || p.name}"`
  if (!p.id || !p.name) errors.push(`${w}: needs "id" and "name"`)
  if (ids.has(p.id)) errors.push(`${w}: duplicate id`)
  ids.add(p.id)
  if (!Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start > p.end) errors.push(`${w}: "start" and "end" must be whole years with start <= end`)
  if (p.peak != null && (p.peak < p.start || p.peak > p.end)) errors.push(`${w}: "peak" must fall between start and end`)
  if (!/^#[0-9a-fA-F]{6}$/.test(p.color || '')) errors.push(`${w}: "color" must be a hex colour like #A8434F`)
  if (!Array.isArray(p.match)) errors.push(`${w}: "match" must be a list (can be empty)`)
  if (!Array.isArray(p.regions) || !p.regions.length || p.regions.some((r) => !REGIONS.includes(r))) errors.push(`${w}: "regions" must list one or more of ${REGIONS.join(', ')}`)
  checkSources(w, p.sources)
  for (const s of p.sites || []) if (!s.name || !coord(s.lat, s.lon)) errors.push(`${w}: site "${s.name}" needs a name and valid lat/lon`)
}

const evIds = new Set()
for (const e of events) {
  const w = `event "${e.id || e.title}"`
  if (!e.id || !e.title) errors.push(`${w}: needs "id" and "title"`)
  if (evIds.has(e.id)) errors.push(`${w}: duplicate id`)
  evIds.add(e.id)
  if (!Number.isInteger(e.year) || e.year === 0) errors.push(`${w}: "year" must be a whole number, negative for BCE, never 0`)
  if (!TYPES.includes(e.type)) errors.push(`${w}: "type" must be one of ${TYPES.join(', ')}`)
  if (!coord(e.lat, e.lon)) errors.push(`${w}: needs valid "lat" and "lon"`)
  for (const id of e.polities || []) if (!ids.has(id)) errors.push(`${w}: unknown polity id "${id}"`)
  checkSources(w, e.sources)
}

for (const [id, r] of Object.entries(rulers)) {
  const w = `rulers "${id}"`
  if (!ids.has(id)) errors.push(`${w}: no polity with this id`)
  if (!r.title || !Array.isArray(r.list)) errors.push(`${w}: needs "title" and "list"`)
  for (const x of r.list || []) {
    if (!x.name || !Number.isInteger(x.start) || !Number.isInteger(x.end) || x.start > x.end) errors.push(`${w}: "${x.name}" needs a name and whole-year start <= end`)
  }
}

const cityIds = new Set()
for (const c of cities) {
  const w = `city "${c.id}"`
  if (!c.id || cityIds.has(c.id)) errors.push(`${w}: missing or duplicate id`)
  cityIds.add(c.id)
  if (!coord(c.lat, c.lon)) errors.push(`${w}: needs valid lat/lon`)
  if (![1, 2, 3].includes(c.rank)) errors.push(`${w}: "rank" must be 1, 2 or 3`)
  if (!Number.isInteger(c.from) || (c.to != null && c.to < c.from)) errors.push(`${w}: "from" must be a whole year and "to" (if set) after it`)
  if (!Array.isArray(c.names) || !c.names.length || c.names.some((n) => !n.name)) errors.push(`${w}: needs at least one name`)
}

if (errors.length) {
  console.error(`Data check failed with ${errors.length} problem(s):\n- ` + errors.join('\n- '))
  process.exit(1)
}
console.log(`Data OK: ${polities.length} profiles, ${events.length} events, ${Object.values(rulers).reduce((n, r) => n + r.list.length, 0)} rulers, ${cities.length} cities.`)
