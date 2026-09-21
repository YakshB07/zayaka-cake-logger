export function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Parses YYYY-MM-DD into a local Date, or null when it isn't one.
 *
 * A blank or broken date used to flow straight through: `''.split('-')` gives
 * [NaN], and the card then rendered "In NaN days" over "INVALID DATE".
 */
function parseYmd(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd ?? '')) return null
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (Number.isNaN(dt.getTime())) return null
  // "2026-13-45" is well-formed but not a date — JS would roll it forward to
  // Feb 2027 and show that instead, which is worse than showing nothing.
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null
}

/** Whole days from today until the given YYYY-MM-DD (NaN when there is no date). */
export function daysUntil(ymd: string): number {
  const target = parseYmd(ymd)
  if (!target) return NaN
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export function formatDate(ymd: string): string {
  const dt = parseYmd(ymd)
  if (!dt) return 'No date set'
  return dt.toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function dateParts(ymd: string): { month: string; day: string; weekday: string } {
  const dt = parseYmd(ymd)
  if (!dt) return { month: '--', day: '?', weekday: 'No pickup date set' }
  return {
    month: dt.toLocaleDateString('en-CA', { month: 'short' }).toUpperCase(),
    day: String(dt.getDate()),
    weekday: dt.toLocaleDateString('en-CA', { weekday: 'long' }),
  }
}

export function formatTime(hhmm: string): string {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm ?? '')) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function countdownLabel(ymd: string): { text: string; tone: 'today' | 'soon' | 'later' | 'past' } {
  const n = daysUntil(ymd)
  if (Number.isNaN(n)) return { text: 'No date', tone: 'later' }
  if (n < 0) return { text: `${-n}d ago`, tone: 'past' }
  if (n === 0) return { text: 'Today', tone: 'today' }
  if (n === 1) return { text: 'Tomorrow', tone: 'soon' }
  if (n === 2) return { text: 'In 2 days', tone: 'soon' }
  return { text: `In ${n} days`, tone: 'later' }
}

export function money(n: number): string {
  // a NaN anywhere upstream used to surface to her as the literal text "$NaN"
  if (!Number.isFinite(n)) n = 0
  // thousands separated, cents only when they mean something ($1,220 not $1220),
  // and the sign outside the dollar sign ("-$50", never "$-50")
  const whole = n % 1 === 0
  const body = Math.abs(n).toLocaleString('en-CA', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
  return `${n < 0 ? '-' : ''}$${body}`
}
