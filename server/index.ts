import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import multer from 'multer'
import cron from 'node-cron'
import { listOrders, getOrder, createOrder, updateOrder, deleteOrder, UPLOADS_DIR } from './store.ts'
import { saveUploadedFiles } from './storage.ts'
import { checkAndSendReminders, sendReminder, REMINDER_PHONES } from './reminders.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 3001)

// load .env if present (no dependency needed)
const envFile = path.join(__dirname, '..', '.env')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const app = express()
app.use(express.json())

const upload = multer({
  storage: multer.memoryStorage(),
  // Kept comfortably under Vercel's ~4.5MB request-body cap. Photos are
  // uploaded one at a time from the browser, so this is the per-photo limit.
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
})

app.get('/api/orders', async (_req, res) => {
  res.json(await listOrders())
})

app.post('/api/orders', async (req, res) => {
  const order = await createOrder(req.body)
  res.status(201).json(order)
})

app.put('/api/orders/:id', async (req, res) => {
  const updated = await updateOrder(req.params.id, req.body)
  if (!updated) return res.status(404).json({ error: 'Order not found' })
  res.json(updated)
})

app.delete('/api/orders/:id', async (req, res) => {
  if (!(await deleteOrder(req.params.id))) return res.status(404).json({ error: 'Order not found' })
  res.json({ ok: true })
})

app.post('/api/upload', upload.array('photos', 6), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? []
  const urls = await saveUploadedFiles(files)
  res.json({ urls })
})

// Manually fire a reminder right now (dayOf-style message)
app.post('/api/orders/:id/remind', async (req, res) => {
  const order = await getOrder(req.params.id)
  if (!order) return res.status(404).json({ error: 'Order not found' })
  const result = await sendReminder(order, 'dayOf')
  res.json(result)
})

// Hit by an external scheduler (e.g. GitHub Actions) so reminders still fire
// even when the free hosting tier has spun the server down at 9am.
app.post('/api/cron/reminders', async (req, res) => {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  await checkAndSendReminders()
  res.json({ ok: true })
})

app.get('/api/config', (_req, res) => {
  res.json({
    smsConfigured: Boolean(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER
    ),
    reminderPhones: REMINDER_PHONES,
  })
})

app.use('/uploads', express.static(UPLOADS_DIR))

// serve the built frontend in production (npm start)
const dist = path.join(__dirname, '..', 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

// On serverless (Vercel) there's no long-running process to `.listen()` on or
// to hold a node-cron timer — the /api/cron/reminders endpoint (pinged by
// GitHub Actions) handles reminders instead. Only start the classic server
// loop when actually running as one (local dev, or a traditional host).
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🎂 Zayaka Cake Logger API on http://localhost:${PORT}`)
    console.log(`   Reminders go to: ${REMINDER_PHONES.join(', ')}`)
    // daily at 9:00 AM bakery time, plus a catch-up check on startup
    cron.schedule('0 9 * * *', () => void checkAndSendReminders(), {
      timezone: process.env.TIMEZONE ?? 'America/Toronto',
    })
    void checkAndSendReminders()
  })
}

export default app
