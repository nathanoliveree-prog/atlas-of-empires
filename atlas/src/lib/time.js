export const MIN_YEAR = -4000
export const MAX_YEAR = 2025

// Piecewise-linear scale: the deep past is compressed so recent centuries get room.
const KNOTS = [
  [-4000, 0], [-1000, 0.24], [0, 0.43], [1000, 0.62], [1500, 0.75], [1800, 0.87], [2025, 1],
]

export function yearToT(y) {
  y = Math.max(MIN_YEAR, Math.min(MAX_YEAR, y))
  for (let i = 1; i < KNOTS.length; i++) {
    const [a, ta] = KNOTS[i - 1], [b, tb] = KNOTS[i]
    if (y <= b) return ta + ((y - a) / (b - a)) * (tb - ta)
  }
  return 1
}

export function tToYear(t) {
  t = Math.max(0, Math.min(1, t))
  for (let i = 1; i < KNOTS.length; i++) {
    const [a, ta] = KNOTS[i - 1], [b, tb] = KNOTS[i]
    if (t <= tb) return a + ((t - ta) / (tb - ta)) * (b - a)
  }
  return MAX_YEAR
}

export const AXIS_TICKS = [-4000, -3000, -2000, -1000, -500, 1, 500, 1000, 1250, 1500, 1650, 1800, 1900, 2000]

// There is no year 0: 1 BCE is followed by 1 CE.
export function roundYear(y) {
  let r = Math.round(y)
  if (r === 0) r = y < 0 ? -1 : 1
  return r
}

export function yearParts(y) {
  const r = roundYear(y)
  return r < 0 ? { num: String(-r), era: 'BCE' } : { num: String(r), era: 'CE' }
}

export function formatYear(y, approx = false) {
  const { num, era } = yearParts(y)
  return `${approx ? 'c. ' : ''}${num} ${era}`
}

export function formatRange(a, b) {
  if (b >= MAX_YEAR) return `${formatYear(a)} – present`
  return `${formatYear(a)} – ${formatYear(b)}`
}

// Which two border snapshots bracket a year, and how far between them we are.
export function bracket(y, snaps) {
  if (!snaps.length) return null
  if (y <= snaps[0]) return { a: snaps[0], b: snaps[0], f: 0 }
  const last = snaps[snaps.length - 1]
  if (y >= last) return { a: last, b: last, f: 0 }
  for (let i = 0; i < snaps.length - 1; i++) {
    const a = snaps[i], b = snaps[i + 1]
    if (y >= a && y < b) return { a, b, f: (y - a) / (b - a) }
  }
  return { a: last, b: last, f: 0 }
}

// Half-width (in years) of the "nearby" window around the playhead; wider where time is compressed.
// `span` is the visible fraction of the timeline, so zooming in narrows the window.
export function halfWindow(y, span = 1) {
  const t = yearToT(y), w = 0.012 * span
  return Math.max(0.6, (tToYear(Math.min(1, t + w)) - tToYear(Math.max(0, t - w))) / 2)
}

// Round-number year ticks for a visible range.
export function yearTicks(y0, y1, maxCount) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
  const step = steps.find((s) => (y1 - y0) / s <= maxCount) || 1000
  const out = []
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) out.push(y === 0 ? 1 : y)
  return out
}
