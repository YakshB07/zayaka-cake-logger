// Must be first: every module below reads process.env at its top level, and ES
// imports are evaluated before any statement in this file. See server/env.ts.
import './env.ts'

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import multer from 'multer'
import cron from 'node-cron'
import { listOrders, getOrder, createOrder, updateOrder, deleteOrder, UPLOADS_DIR } from './store.ts'
import { saveUploadedFiles } from './storage.ts'
import { checkAndSendReminders, sendReminder, REMINDER_PHONES } from './reminders.ts'
import {
  readFinance,
  createFinanceItem,
  updateFinanceItem,
  deleteFinanceItem,
  isFinanceKind,
} from './finance-store.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 3001)

const app = express()
app.use(express.json({ limit: '1mb' }))

/*
 * Express 4 does not catch a rejected promise from an async handler. Without
 * this wrapper a failed query or a Supabase upload error became an unhandled
 * rejection: the request never got a response (the browser spinner just hung
 * forever) and Node's default behaviour is to kill the process. Every async
 * route goes through `route()` so a failure comes back as readable JSON.
 */
const route =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next)
  }

app.get(
  '/api/orders',
  route(async (_req, res) => {
    res.json(await listOrders())
  })
)

app.post(
  '/api/orders',
  route(async (req, res) => {
    res.status(201).json(await createOrder(req.body))
  })
)

app.put(
  '/api/orders/:id',
  route(async (req, res) => {
    const updated = await updateOrder(req.params.id, req.body)
    if (!updated) return res.status(404).json({ error: 'Order not found' })
    res.json(updated)
  })
)

app.delete(
  '/api/orders/:id',
  route(async (req, res) => {
    if (!(await deleteOrder(req.params.id))) return res.status(404).json({ error: 'Order not found' })
    res.json({ ok: true })
  })
)

const upload = multer({
  storage: multer.memoryStorage(),
  // Kept comfortably under Vercel's ~4.5MB request-body cap. Photos are
  // uploaded one at a time from the browser, so this is the per-photo limit.
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    // Answering `cb(null, false)` here dropped the file and still returned 200
    // with an empty list, so the browser showed no photo and no reason why.
    if (!file.mimetype.startsWith('image/')) {
      const err = new Error('Only photos can be uploaded (JPG, PNG, HEIC or WebP).')
      // tagged so the handler below answers 400 rather than a generic 500
      ;(err as Error & { code?: string }).code = 'NOT_AN_IMAGE'
      return cb(err)
    }
    cb(null, true)
  },
})

app.post(
  '/api/upload',
  upload.array('photos', 6),
  route(async (req, res) => {
    const files = (req.files as Express.Multer.File[]) ?? []
    if (files.length === 0) return res.status(400).json({ error: 'No photo came through — try again.' })
    res.json({ urls: await saveUploadedFiles(files) })
  })
)

// ── Business tracker: fixed costs, cost categories, expenses, other income ──
// All four collections come back in one request — the dashboard needs them
// together and they're small enough that splitting it up would just be slower.
app.get(
  '/api/finance',
  route(async (_req, res) => {
    res.json(await readFinance())
  })
)

app.post(
  '/api/finance/:kind',
  route(async (req, res) => {
    if (!isFinanceKind(req.params.kind)) return res.status(400).json({ error: 'Unknown record type' })
    res.status(201).json(await createFinanceItem(req.params.kind, req.body))
  })
)

app.put(
  '/api/finance/:kind/:id',
  route(async (req, res) => {
    if (!isFinanceKind(req.params.kind)) return res.status(400).json({ error: 'Unknown record type' })
    const updated = await updateFinanceItem(req.params.kind, req.params.id, req.body)
    if (!updated) return res.status(404).json({ error: 'Record not found' })
    res.json(updated)
  })
)

app.delete(
  '/api/finance/:kind/:id',
  route(async (req, res) => {
    if (!isFinanceKind(req.params.kind)) return res.status(400).json({ error: 'Unknown record type' })
    if (!(await deleteFinanceItem(req.params.kind, req.params.id)))
      return res.status(404).json({ error: 'Record not found' })
    res.json({ ok: true })
  })
)

// Manually fire a reminder right now (dayOf-style message)
app.post(
  '/api/orders/:id/remind',
  route(async (req, res) => {
    const order = await getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    res.json(await sendReminder(order, 'dayOf'))
  })
)

// Hit by an external scheduler (e.g. GitHub Actions) so reminders still fire
// even when the free hosting tier has spun the server down at 9am.
app.post(
  '/api/cron/reminders',
  route(async (req, res) => {
    const secret = process.env.CRON_SECRET
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'unauthorized' })
    }
    if (!secret) console.warn('[server] /api/cron/reminders is unprotected — set CRON_SECRET')
    await checkAndSendReminders()
    res.json({ ok: true })
  })
)

app.get('/api/config', (_req, res) => {
  res.json({
    smsConfigured: Boolean(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER
    ),
    reminderPhones: REMINDER_PHONES,
  })
})

app.use('/uploads', express.static(UPLOADS_DIR))

// An unknown /api path used to fall through to the SPA's HTML, which the
// browser then tried to parse as JSON ("Unexpected token <").
app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint' }))

// serve the built frontend in production (npm start)
const dist = path.join(__dirname, '..', 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

// Registered last: error middleware only catches what sits above it. Upload
// failures (too big, wrong type) used to come back as an HTML 500 that the
// browser couldn't read, so the form showed nothing at all.
app.use((err: Error & { code?: string; type?: string }, _req: Request, res: Response, next: NextFunction) => {
  if (!err) return next()
  if (res.headersSent) return next(err)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'That photo is too big — please use one under 4MB.' })
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Please add photos one at a time.' })
  }
  if (err.code === 'NOT_AN_IMAGE') return res.status(400).json({ error: err.message })
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: "That didn't come through properly — please try again." })
  }
  console.error('[server]', err)
  res.status(500).json({ error: err.message || 'Something went wrong on the server.' })
})

// On serverless (Vercel) there's no long-running process to `.listen()` on or
// to hold a node-cron timer — the /api/cron/reminders endpoint (pinged by
// GitHub Actions) handles reminders instead. Only start the classic server
// loop when actually running as one (local dev, or a traditional host).
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🎂 Zayaka Cake Logger API on http://localhost:${PORT}`)
    console.log(`   Storage: ${process.env.DATABASE_URL ? 'Postgres' : 'local JSON file'}`)
    console.log(`   Reminders go to: ${REMINDER_PHONES.join(', ')}`)
    const safely = () => void checkAndSendReminders().catch((e) => console.error('[reminders]', e))
    // daily at 9:00 AM bakery time, plus a catch-up check on startup
    cron.schedule('0 9 * * *', safely, { timezone: process.env.TIMEZONE ?? 'America/Toronto' })
    safely()
  })
}

export default app
