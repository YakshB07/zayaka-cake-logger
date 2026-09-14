export function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Whole days from today until the given YYYY-MM-DD (negative = past). */
export function daysUntil(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export function formatDate(ymd: string): string {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function dateParts(ymd: string): { month: string; day: string; weekday: string } {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return {
    month: dt.toLocaleDateString('en-CA', { month: 'short' }).toUpperCase(),
    day: String(d),
    weekday: dt.toLocaleDateString('en-CA', { weekday: 'long' }),
  }
}

export function formatTime(hhmm: string): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function countdownLabel(ymd: string): { text: string; tone: 'today' | 'soon' | 'later' | 'past' } {
  const n = daysUntil(ymd)
  if (n < 0) return { text: `${-n}d ago`, tone: 'past' }
  if (n === 0) return { text: 'Today', tone: 'today' }
  if (n === 1) return { text: 'Tomorrow', tone: 'soon' }
  if (n === 2) return { text: 'In 2 days', tone: 'soon' }
  return { text: `In ${n} days`, tone: 'later' }
}

export function money(n: number): string {
  return `$${n % 1 === 0 ? n : n.toFixed(2)}`
}
