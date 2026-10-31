/**
 * Copies the static assets that Next's standalone server needs but does not
 * copy by itself, so the desktop app can serve the full site.
 * Run automatically by `npm run dist`, `npm run pack` and `npm run electron:preview`.
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const standalone = path.join(root, '.next', 'standalone')

if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  console.error('ERROR: .next/standalone/server.js not found. Run "next build" first.')
  process.exit(1)
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return
  fs.rmSync(to, { recursive: true, force: true })
  fs.cpSync(from, to, { recursive: true })
}

copyDir(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'))
copyDir(path.join(root, 'public'), path.join(standalone, 'public'))

// Never ship secrets or local data inside the installer.
for (const f of ['.env', '.env.local', '.env.production', '.env.development']) {
  fs.rmSync(path.join(standalone, f), { force: true })
}
fs.rmSync(path.join(standalone, 'uploads'), { recursive: true, force: true })

console.log('Standalone build prepared.')
