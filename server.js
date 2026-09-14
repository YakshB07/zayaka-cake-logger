// Zayaka Bakes n' Bites — Cake Order Logger server
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const REMINDER_LOG_FILE = path.join(DATA_DIR, 'reminder-log.json');

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const DEFAULT_SETTINGS = {
  reminderNumbers: ['+12269610140', '+12269610150'],
  reminderHour: 9, // 9:00 AM local
  lastDigestDate: null,
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

const getOrders = () => readJson(ORDERS_FILE, []);
const saveOrders = (orders) => writeJson(ORDERS_FILE, orders);
const getSettings = () => ({ ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) });
const saveSettings = (s) => writeJson(SETTINGS_FILE, s);
const getReminderLog = () => readJson(REMINDER_LOG_FILE, []);
const saveReminderLog = (log) => writeJson(REMINDER_LOG_FILE, log.slice(-100));

// ---------- uploads ----------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ---------- order helpers ----------
function normalizeOrder(body, existing) {
  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: existing ? existing.id : crypto.randomUUID(),
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    customerName: (body.customerName || '').trim(),
    customerPhone: (body.customerPhone || '').trim(),
    orderDate: body.orderDate || (existing ? existing.orderDate : new Date().toISOString().slice(0, 10)),
    pickupDate: body.pickupDate || '',
    pickupTime: body.pickupTime || '',
    size: body.size || '',
    flavour: (body.flavour || '').trim(),
    cakeText: (body.cakeText || '').trim(),
    designNotes: (body.designNotes || '').trim(),
    price: num(body.price),
    depositAmount: num(body.depositAmount),
    depositMethod: body.depositMethod || '',
    balanceMethod: body.balanceMethod || '',
    balancePaid: body.balancePaid === 'true' || body.balancePaid === true,
    status: body.status || (existing ? existing.status : 'upcoming'),
    image: existing ? existing.image : null,
    remindersSent: existing ? existing.remindersSent || [] : [],
  };
}

// ---------- API ----------
app.get('/api/orders', (_req, res) => res.json(getOrders()));

app.post('/api/orders', upload.single('image'), (req, res) => {
  const order = normalizeOrder(req.body, null);
  if (!order.customerName || !order.pickupDate || !order.size || !order.flavour) {
    return res.status(400).json({ error: 'Name, pickup date, size and flavour are required.' });
  }
  if (req.file) order.image = req.file.filename;
  const orders = getOrders();
  orders.push(order);
  saveOrders(orders);
  res.json(order);
});

app.put('/api/orders/:id', upload.single('image'), (req, res) => {
  const orders = getOrders();
  const idx = orders.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Order not found' });
  const updated = normalizeOrder(req.body, orders[idx]);
  if (req.file) {
    if (orders[idx].image) {
      fs.unlink(path.join(UPLOAD_DIR, orders[idx].image), () => {});
    }
    updated.image = req.file.filename;
  } else if (req.body.removeImage === 'true') {
    if (orders[idx].image) fs.unlink(path.join(UPLOAD_DIR, orders[idx].image), () => {});
    updated.image = null;
  }
  orders[idx] = updated;
  saveOrders(orders);
  res.json(updated);
});

app.patch('/api/orders/:id/status', (req, res) => {
  const orders = getOrders();
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (req.body.status) order.status = req.body.status;
  if (typeof req.body.balancePaid === 'boolean') order.balancePaid = req.body.balancePaid;
  saveOrders(orders);
  res.json(order);
});

app.delete('/api/orders/:id', (req, res) => {
  const orders = getOrders();
  const order = orders.find((o) => o.id === req.params.id);
  if (order && order.image) fs.unlink(path.join(UPLOAD_DIR, order.image), () => {});
  saveOrders(orders.filter((o) => o.id !== req.params.id));
  res.json({ ok: true });
});

app.get('/api/settings', (_req, res) => {
  const s = getSettings();
  res.json({
    reminderNumbers: s.reminderNumbers,
    reminderHour: s.reminderHour,
    smsConfigured: twilioConfigured(),
    log: getReminderLog().slice(-20).reverse(),
  });
});

app.put('/api/settings', (req, res) => {
  const s = getSettings();
  if (Array.isArray(req.body.reminderNumbers)) {
    s.reminderNumbers = req.body.reminderNumbers
      .map((n) => String(n).replace(/[^\d+]/g, ''))
      .filter(Boolean)
      .map((n) => (n.startsWith('+') ? n : '+1' + n.replace(/^1/, '')));
  }
  if (Number.isInteger(req.body.reminderHour)) s.reminderHour = req.body.reminderHour;
  saveSettings(s);
  res.json({ ok: true, reminderNumbers: s.reminderNumbers, reminderHour: s.reminderHour });
});

app.post('/api/reminders/send-now', async (_req, res) => {
  try {
    const result = await sendDigest(true);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// ---------- SMS reminders ----------
function twilioConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

let twilioClient = null;
function getTwilio() {
  if (!twilioClient && twilioConfigured()) {
    twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

function localDateStr(d) {
  const dt = d || new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return localDateStr(dt);
}

function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(t) {
  if (!t) return '';
  const [h, min] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
}

function orderLine(o) {
  const parts = [`${o.customerName} — ${o.size} ${o.flavour}`];
  if (o.pickupTime) parts.push(`@ ${fmtTime(o.pickupTime)}`);
  const price = o.price || 0;
  const deposit = o.depositAmount || 0;
  const balance = Math.max(0, price - deposit);
  if (o.balancePaid || (price > 0 && balance === 0)) parts.push('(paid in full)');
  else if (balance > 0) parts.push(`— $${balance} due${o.balanceMethod ? ' by ' + o.balanceMethod : ''}`);
  if (o.cakeText) parts.push(`— "${o.cakeText}"`);
  return '• ' + parts.join(' ');
}

function buildDigest() {
  const today = localDateStr();
  const orders = getOrders().filter((o) => o.status === 'upcoming');
  const buckets = [
    { label: 'TODAY', date: today },
    { label: 'TOMORROW', date: addDays(today, 1) },
    { label: 'IN 2 DAYS', date: addDays(today, 2) },
  ];
  const sections = [];
  let count = 0;
  for (const b of buckets) {
    const list = orders
      .filter((o) => o.pickupDate === b.date)
      .sort((a, z) => (a.pickupTime || '').localeCompare(z.pickupTime || ''));
    if (list.length) {
      count += list.length;
      sections.push(`${b.label} (${fmtDate(b.date)}):\n${list.map(orderLine).join('\n')}`);
    }
  }
  if (!count) return null;
  return `Zayaka Cake Orders 🎂\n${sections.join('\n\n')}`;
}

async function sendDigest(force) {
  const settings = getSettings();
  const today = localDateStr();
  if (!force && settings.lastDigestDate === today) return { sent: false, reason: 'already sent today' };

  const message = buildDigest();
  if (!message) {
    if (!force) {
      settings.lastDigestDate = today;
      saveSettings(settings);
    }
    return { sent: false, reason: 'no pickups in the next 2 days' };
  }

  const log = getReminderLog();
  const results = [];
  if (twilioConfigured()) {
    const client = getTwilio();
    for (const to of settings.reminderNumbers) {
      try {
        await client.messages.create({ from: process.env.TWILIO_FROM, to, body: message });
        results.push({ to, ok: true });
      } catch (err) {
        results.push({ to, ok: false, error: String(err.message || err) });
      }
    }
  } else {
    console.log('\n[REMINDER — SMS not configured, would have sent]:\n' + message + '\n');
    results.push({ to: settings.reminderNumbers.join(', '), ok: false, error: 'SMS not configured (no Twilio credentials in .env)' });
  }

  log.push({ at: new Date().toISOString(), message, results, forced: Boolean(force) });
  saveReminderLog(log);

  if (!force || results.some((r) => r.ok)) {
    settings.lastDigestDate = today;
    saveSettings(settings);
  }
  return { sent: results.some((r) => r.ok), message, results };
}

// Check every 10 minutes; fire once per day at/after the configured hour.
setInterval(() => {
  const settings = getSettings();
  const now = new Date();
  if (now.getHours() >= settings.reminderHour && settings.lastDigestDate !== localDateStr()) {
    sendDigest(false).catch((err) => console.error('Reminder error:', err));
  }
}, 10 * 60 * 1000);

// Also check shortly after startup (in case the machine was off at reminder time).
setTimeout(() => {
  const settings = getSettings();
  const now = new Date();
  if (now.getHours() >= settings.reminderHour && settings.lastDigestDate !== localDateStr()) {
    sendDigest(false).catch((err) => console.error('Reminder error:', err));
  }
}, 5000);

app.listen(PORT, () => {
  console.log(`\n🎂 Zayaka Cake Logger running at http://localhost:${PORT}`);
  console.log(twilioConfigured() ? 'SMS reminders: ENABLED (Twilio configured)' : 'SMS reminders: NOT configured — copy .env.example to .env and add Twilio credentials.');
});
