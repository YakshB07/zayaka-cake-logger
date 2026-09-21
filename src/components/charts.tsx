import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/* ══════════════════════════════════════════════════════════════════════════
   Hand-rolled SVG charts — no charting library, so the app stays dependency-
   free and the marks use the same design tokens as the rest of the page.

   Specs held to throughout (dataviz guidelines):
   · bars capped at 24px thick, 4px rounded data-end, square at the baseline
   · a 2px surface-coloured gap separates touching bars
   · 2px lines, ≥8px markers with a 2px surface ring
   · hairline solid gridlines, one step off the surface, recessive
   · a legend whenever there are 2+ series, plus a table view on every chart
   · text always wears text tokens, never the series colour
   Palette validated (light #ffffff / dark #221c1f surfaces) with the
   dataviz validator — all checks pass.
   ══════════════════════════════════════════════════════════════════════════ */

/** Charts render at real pixel size so labels never scale with the container. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setW(el.clientWidth)
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export const fmtMoney = (n: number, cents = false): string =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-CA', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`

/** Axis ticks stay short: $1.2K rather than $1,200. */
export const fmtCompact = (n: number): string => {
  const a = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(a >= 10_000 ? 0 : 1)}K`
  return `${sign}$${Math.round(a)}`
}

/** Round an axis maximum up to a clean number so ticks read 0 / 500 / 1,000. */
function niceMax(v: number): number {
  if (v <= 0) return 100
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (v <= step * mag) return step * mag
  }
  return 10 * mag
}

function ticksFor(max: number, count = 4): number[] {
  const out: number[] = []
  for (let i = 0; i <= count; i++) out.push((max / count) * i)
  return out
}

/** A bar with its data-end rounded and its baseline end square. */
function barPath(x: number, y: number, w: number, h: number, dir: 'up' | 'down' | 'right'): string {
  const r = Math.min(4, w / 2, h)
  if (h <= 0.5) return ''
  if (dir === 'up') {
    return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`
  }
  if (dir === 'down') {
    return `M${x},${y} L${x},${y + h - r} Q${x},${y + h} ${x + r},${y + h} L${x + w - r},${y + h} Q${x + w},${y + h} ${x + w},${y + h - r} L${x + w},${y} Z`
  }
  // horizontal, growing right: h is thickness, w is length
  const rr = Math.min(4, h / 2, w)
  return `M${x},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} L${x},${y + h} Z`
}

// ── shared chrome ────────────────────────────────────────────────────────────

export interface SeriesDef {
  key: string
  label: string
  color: string
}

interface FrameProps {
  title: string
  subtitle?: string
  series?: SeriesDef[]
  /** rows rendered when the reader flips to the table view */
  table: { head: string[]; rows: (string | number)[][] }
  children: React.ReactNode
  empty?: boolean
  emptyNote?: string
}

export function ChartFrame({ title, subtitle, series, table, children, empty, emptyNote }: FrameProps) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section className="chart-card">
      <header className="chart-head">
        <div>
          <h3 className="chart-title">{title}</h3>
          {subtitle && <p className="chart-sub">{subtitle}</p>}
        </div>
        <button
          type="button"
          className="chart-toggle"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
        >
          {asTable ? 'Chart' : 'Numbers'}
        </button>
      </header>

      {/* A legend is the dependable identity channel — never colour alone. */}
      {series && series.length > 1 && !asTable && (
        <ul className="chart-legend">
          {series.map((s) => (
            <li key={s.key}>
              <span className="legend-dot" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {empty ? (
        <p className="chart-empty">{emptyNote ?? 'Nothing to show here yet.'}</p>
      ) : asTable ? (
        <div className="chart-table-wrap">
          <table className="chart-table">
            <thead>
              <tr>
                {table.head.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  )
}

interface Tip {
  x: number
  y: number
  title: string
  rows: { label: string; value: string; color?: string }[]
}

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null
  // keep the bubble inside the card at both edges
  const clamped = Math.max(70, Math.min(width - 70, tip.x))
  return (
    <div className="chart-tip" style={{ left: clamped, top: tip.y }} role="presentation">
      <strong>{tip.title}</strong>
      {tip.rows.map((r) => (
        <span key={r.label}>
          {r.color && <i className="tip-dot" style={{ background: r.color }} aria-hidden="true" />}
          {r.label}
          <b>{r.value}</b>
        </span>
      ))}
    </div>
  )
}

// ── grouped columns: revenue vs costs, month by month ────────────────────────

export interface GroupedDatum {
  label: string
  longLabel: string
  values: number[]
}

export function GroupedColumns({
  data,
  series,
  height = 240,
}: {
  data: GroupedDatum[]
  series: SeriesDef[]
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)

  if (width === 0) return <div className="chart-plot" ref={ref} style={{ height }} />

  const padL = 46
  const padR = 8
  const padT = 12
  const padB = 26
  const innerW = Math.max(10, width - padL - padR)
  const innerH = height - padT - padB

  const max = niceMax(Math.max(...data.flatMap((d) => d.values), 1))
  const y = (v: number) => padT + innerH - (v / max) * innerH
  const band = innerW / Math.max(1, data.length)
  // The surface gap that separates touching bars. It shrinks with the band so
  // that a long all-time view can't push a group wider than its own slot and
  // overlap the month next door.
  const GAP = Math.min(2, band * 0.1)
  const barW = Math.min(24, Math.max(1, (band * 0.72 - GAP * (series.length - 1)) / series.length))
  const groupW = barW * series.length + GAP * (series.length - 1)

  // With many months, label every other one so they never collide.
  const labelEvery = band < 34 ? Math.ceil(34 / band) : 1

  return (
    <div className="chart-plot" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} role="img" aria-label="Revenue and costs by month">
        {ticksFor(max).map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x={padL - 8} y={y(t) + 4} className="axis-text" textAnchor="end">
              {fmtCompact(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const gx = padL + band * i + (band - groupW) / 2
          return (
            <g key={d.label + i}>
              {/* a full-height hit area, so hovering anywhere in the month works */}
              <rect
                x={padL + band * i}
                y={padT}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseEnter={() =>
                  setTip({
                    x: padL + band * i + band / 2,
                    y: padT + 4,
                    title: d.longLabel,
                    rows: series.map((s, si) => ({
                      label: s.label,
                      value: fmtMoney(d.values[si]),
                      color: s.color,
                    })),
                  })
                }
              />
              {series.map((s, si) => {
                const v = Math.max(0, d.values[si])
                const h = (v / max) * innerH
                return (
                  <path
                    key={s.key}
                    d={barPath(gx + si * (barW + GAP), y(v), barW, h, 'up')}
                    fill={s.color}
                  />
                )
              })}
            </g>
          )
        })}

        <line x1={padL} x2={width - padR} y1={y(0)} y2={y(0)} className="axis-line" />

        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text
              key={d.label + i}
              x={padL + band * i + band / 2}
              y={height - 8}
              className="axis-text"
              textAnchor="middle"
            >
              {d.label}
            </text>
          ) : null
        )}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

// ── diverging columns: profit, which can go below zero ───────────────────────

export function ProfitColumns({
  data,
  positive,
  negative,
  height = 200,
}: {
  data: { label: string; longLabel: string; value: number; orders: number }[]
  positive: string
  negative: string
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)

  if (width === 0) return <div className="chart-plot" ref={ref} style={{ height }} />

  const padL = 46
  const padR = 8
  const padT = 14
  const padB = 26
  const innerW = Math.max(10, width - padL - padR)
  const innerH = height - padT - padB

  // Only give the chart a negative region if something is actually negative
  // (and vice versa) — otherwise an all-profit chart wastes a third of its
  // height on empty space below the zero line and squashes the bars.
  const maxPos = Math.max(0, ...data.map((d) => d.value))
  const maxNeg = Math.max(0, ...data.map((d) => -d.value))
  const hi = maxPos > 0 ? niceMax(maxPos) : 0
  const lo = maxNeg > 0 ? -niceMax(maxNeg) : 0
  const span = hi - lo || 1
  const y = (v: number) => padT + innerH - ((v - lo) / span) * innerH
  const zero = y(0)

  const band = innerW / Math.max(1, data.length)
  const barW = Math.min(24, Math.max(1, band * 0.6))
  const labelEvery = band < 34 ? Math.ceil(34 / band) : 1

  return (
    <div className="chart-plot" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} role="img" aria-label="Profit by month">
        {[hi, hi / 2, 0, lo / 2, lo]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="grid-line" />
              <text x={padL - 8} y={y(t) + 4} className="axis-text" textAnchor="end">
                {fmtCompact(t)}
              </text>
            </g>
          ))}

        {data.map((d, i) => {
          const x = padL + band * i + (band - barW) / 2
          const up = d.value >= 0
          const h = Math.abs(((d.value - 0) / span) * innerH)
          return (
            <g key={d.label + i}>
              <rect
                x={padL + band * i}
                y={padT}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseEnter={() =>
                  setTip({
                    x: padL + band * i + band / 2,
                    y: padT + 4,
                    title: d.longLabel,
                    rows: [
                      { label: d.value >= 0 ? 'Profit' : 'Loss', value: fmtMoney(d.value) },
                      { label: 'Cakes', value: String(d.orders) },
                    ],
                  })
                }
              />
              <path
                d={barPath(x, up ? y(d.value) : zero, barW, h, up ? 'up' : 'down')}
                fill={up ? positive : negative}
              />
            </g>
          )
        })}

        <line x1={padL} x2={width - padR} y1={zero} y2={zero} className="axis-line" />

        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text
              key={d.label + i}
              x={padL + band * i + band / 2}
              y={height - 8}
              className="axis-text"
              textAnchor="middle"
            >
              {d.label}
            </text>
          ) : null
        )}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

// ── ranked horizontal bars: where the money goes, what sells ─────────────────

export interface RankedRow {
  id: string
  name: string
  value: number
  color: string
  note?: string
}

export function RankedBars({ rows, valueLabel }: { rows: RankedRow[]; valueLabel?: (v: number) => string }) {
  const fmt = valueLabel ?? ((v: number) => fmtMoney(v))
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="ranked">
      {rows.map((r) => (
        <li key={r.id}>
          <div className="ranked-top">
            <span className="ranked-name">
              <i className="legend-dot" style={{ background: r.color }} aria-hidden="true" />
              {r.name}
            </span>
            <span className="ranked-value">{fmt(r.value)}</span>
          </div>
          <div className="ranked-track">
            <div
              className="ranked-fill"
              style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: r.color }}
            />
          </div>
          {r.note && <span className="ranked-note">{r.note}</span>}
        </li>
      ))}
    </ul>
  )
}

// ── sparkline for the stat tiles ─────────────────────────────────────────────

export function Sparkline({ values, color, width = 84, height = 26 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const pts = values.map((v, i) => [i * step, height - 2 - ((v - min) / span) * (height - 4)] as const)
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <svg width={width} height={height} className="sparkline" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
      {/* the current period gets the full-strength accent and a surface ring */}
      <circle cx={last[0]} cy={last[1]} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />
    </svg>
  )
}

/** Progress toward a target — the track is a lighter step of the fill's own hue. */
export function Meter({ value, target, color }: { value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0
  return (
    <div className="meter" role="img" aria-label={`${Math.round(pct * 100)}% of target`}>
      <div className="meter-fill" style={{ width: `${pct * 100}%`, background: color }} />
    </div>
  )
}

/** Re-render charts when the OS flips between light and dark. */
export function useColorScheme(): 'light' | 'dark' {
  const [mode, setMode] = useState<'light' | 'dark'>(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  )
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const on = (e: MediaQueryListEvent) => setMode(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return mode
}
