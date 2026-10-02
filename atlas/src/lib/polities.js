const GENERIC = /hunter|gatherer|culture|farmers|nomad|pastoral|tribes|foragers|fishing|peoples|shellfish|marine mammal|aboriginal|neolithic|cultures|bronze age/i

export const LAND = '#2B3833'
const MUTED = ['#3E4B44', '#444A3E', '#3D4852', '#4A453F', '#3F4A49']
const STATE = ['#7F6A8F', '#6F8A5C', '#9A7A4F', '#5F7F95', '#8F5F5F', '#6B8F86', '#94845A', '#7A6F9A', '#8A6A7A', '#5E8A6E', '#86704E', '#6A7FA0']

function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

export function isGeneric(name) { return GENERIC.test(name) }

export function makePolityIndex(polities) {
  const byName = new Map()
  for (const p of polities) for (const n of p.match || []) {
    if (!byName.has(n)) byName.set(n, [])
    byName.get(n).push(p)
  }
  const byId = new Map(polities.map((p) => [p.id, p]))
  // Strict: the profile only applies inside its own date range.
  function forName(name, year, slackBefore = 0, slackAfter = 0) {
    const list = name && byName.get(name)
    if (!list) return null
    // A profile whose own dates contain the year always wins over one matched only by slack.
    return list.find((p) => year >= p.start && year <= p.end)
      || list.find((p) => year >= p.start - slackBefore && year <= p.end + slackAfter) || null
  }
  // Loose: the dataset's label exists but may be outside the profile's dates (e.g. Neo-Hittite states).
  function anyForName(name) { const list = name && byName.get(name); return list ? list[0] : null }
  function colorFor(name, year) {
    if (!name) return LAND
    const p = forName(name, year, 500, 200)
    if (p) return p.color
    const h = hash(name)
    return GENERIC.test(name) ? MUTED[h % MUTED.length] : STATE[h % STATE.length]
  }
  return { all: polities, byId, forName, anyForName, colorFor }
}

export function precisionLabel(p) {
  if (p === 3) return 'Borders fixed by treaty or law'
  if (p === 2) return 'Borders moderately precise'
  return 'Borders approximate'
}

export const REGIONS = [
  ['all', 'All regions'],
  ['europe', 'Europe and the Mediterranean'],
  ['mideast', 'Middle East and North Africa'],
  ['africa', 'Africa south of the Sahara'],
  ['steppe', 'Steppe and Central Asia'],
  ['southasia', 'South Asia'],
  ['eastasia', 'East and Southeast Asia'],
  ['americas', 'The Americas'],
]

export function inRegion(p, region) {
  return region === 'all' || (p.regions || []).includes(region)
}

// Rulers whose reign includes the year (co-rulers and rivals can overlap).
export function rulersAt(rulers, polityId, year) {
  const r = rulers[polityId]
  if (!r) return []
  return r.list.filter((x) => year >= x.start && year <= x.end + 0.999)
}

export function cityName(city, year) {
  for (const n of city.names) if (n.until == null || year <= n.until) return n.name
  return city.names[city.names.length - 1].name
}

export function citiesAt(cities, year) {
  return cities
    .filter((c) => year >= c.from && (c.to == null || year <= c.to))
    .map((c) => ({ ...c, label: cityName(c, year) }))
}
