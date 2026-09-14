import type { CakeOrder, RemindersSent } from '../src/types'
import { listOrders, updateOrder } from './store.ts'

// Both numbers get every reminder. Override via REMINDER_PHONES in .env (comma-separated).
const DEFAULT_PHONES = ['+12269610140', '+12269610150']
export const REMINDER_PHONES = (process.env.REMINDER_PHONES ?? DEFAULT_PHONES.join(','))
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean)

const TZ = process.env.TIMEZONE ?? 'America/Toronto'

/** Today's date as YYYY-MM-DD in the bakery's timezone. */
export function todayLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

function prettyDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function prettyTime(hhmm: string): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return ` at ${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

type Stage = keyof RemindersSent

const STAGE_LABEL: Record<Stage, string> = {
  twoDay: 'in 2 DAYS',
  oneDay: 'TOMORROW',
  dayOf: 'TODAY',
}

export function buildMessage(order: CakeOrder, stage: Stage): string {
  const balance = Math.max(0, order.price - order.depositAmount)
  const lines = [
    `🎂 Zayaka cake reminder — pickup ${STAGE_LABEL[stage]}`,
    `${order.customerName} · ${order.size} ${order.flavour}`,
    `Pickup: ${prettyDate(order.pickupDate)}${prettyTime(order.pickupTime)}`,
  ]
  if (order.cakeText) lines.push(`Writing: "${order.cakeText}"`)
  if (order.designNotes) lines.push(`Design: ${order.designNotes}`)
  if (order.price > 0) {
    lines.push(
      order.balancePaid || balance === 0
        ? `Paid in full ($${order.price})`
        : `Balance due: $${balance}${order.balanceMethod ? ` (${order.balanceMethod})` : ''}`
    )
  }
  if (order.customerPhone) lines.push(`Customer: ${order.customerPhone}`)
  return lines.join('\n')
}

/**
 * Sends one SMS via Twilio's REST API. Needs TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER in the environment. Without them
 * the reminder is logged to the console instead so nothing crashes.
 */
async function sendSms(to: string, body: string): Promise<{ ok: boolean; detail: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER
  if (!sid || !token || !from) {
    console.log(`[reminder] (SMS not configured — would send to ${to})\n${body}\n`)
    return { ok: false, detail: 'Twilio not configured — logged to console only' }
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    })
    if (res.ok) return { ok: true, detail: `sent to ${to}` }
    const err = await res.text()
    console.error(`[reminder] Twilio error for ${to}: ${err}`)
    return { ok: false, detail: `Twilio error ${res.status}` }
  } catch (e) {
    console.error('[reminder] send failed', e)
    return { ok: false, detail: String(e) }
  }
}

export async function sendReminder(order: CakeOrder, stage: Stage): Promise<{ ok: boolean; detail: string }> {
  const body = buildMessage(order, stage)
  const results = await Promise.all(REMINDER_PHONES.map((to) => sendSms(to, body)))
  const ok = results.some((r) => r.ok)
  const detail = results.map((r, i) => `${REMINDER_PHONES[i]}: ${r.detail}`).join(' | ')
  await updateOrder(order.id, {
    remindersSent: { ...order.remindersSent, [stage]: { sentAt: new Date().toISOString(), ok, detail } },
  })
  return { ok, detail }
}

/** Runs on a schedule: sends any due 2-day / 1-day / day-of reminders that haven't gone out yet. */
export async function checkAndSendReminders(): Promise<void> {
  const today = todayLocal()
  const stages: Array<{ stage: Stage; date: string }> = [
    { stage: 'dayOf', date: today },
    { stage: 'oneDay', date: addDays(today, 1) },
    { stage: 'twoDay', date: addDays(today, 2) },
  ]
  for (const order of await listOrders()) {
    if (order.status === 'completed') continue
    for (const { stage, date } of stages) {
      if (order.pickupDate === date && !order.remindersSent[stage]?.ok) {
        console.log(`[reminder] sending ${stage} reminder for ${order.customerName} (${order.pickupDate})`)
        await sendReminder(order, stage)
      }
    }
  }
}
