/*
 * Build the frontend only if it isn't already built.
 *
 * `npm start` used to run a full Vite build every time. On Render that meant
 * rebuilding on every cold start — work the deploy's build step had already
 * done — and the owner waited through it before the server would answer.
 *
 * Dropping the build outright was faster but fragile: a host whose build
 * command doesn't include `npm run build` would end up with no dist/ at all
 * and serve no site. So check instead of assuming. When dist/ is there this
 * costs a few milliseconds; when it isn't, it saves the deployment.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const index = path.join(root, 'dist', 'index.html')

if (fs.existsSync(index)) {
  console.log('[start] dist/ is already built — skipping the build')
  process.exit(0)
}

console.log('[start] no dist/index.html found — building the frontend once')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const res = spawnSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true })

if (res.status !== 0) {
  console.error('[start] the build failed — the API will start but no page will be served')
  // Not fatal on purpose: the API and the reminder job are still worth having
  // up, and failing here would take the whole service down with them.
}
process.exit(0)
