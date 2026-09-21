import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/*
 * Loads .env — and it has to live in its own module that gets imported FIRST.
 *
 * This used to sit in the body of index.ts, below the imports, which meant it
 * never worked. ES modules are fully evaluated before any statement in the
 * file that imports them runs, and store.ts / storage.ts / reminders.ts all
 * read process.env at their top level:
 *
 *   const backend = process.env.DATABASE_URL ? pgStore : fileStore
 *
 * So every one of them saw an empty environment and silently picked the
 * fallback. DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY, REMINDER_PHONES
 * and TIMEZONE in .env all did nothing: the app quietly wrote to a local JSON
 * file and stored photos on local disk while appearing configured. It only
 * worked on Render because Render sets real environment variables.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))

for (const file of [path.join(__dirname, '..', '.env'), path.join(process.cwd(), '.env')]) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    // a real environment variable always wins over the file
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  break
}
