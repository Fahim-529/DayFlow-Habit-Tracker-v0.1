/**
 * DayFlow — Electron Main Process (Windows desktop)
 *
 * What it does:
 *  1. Starts the bundled Next.js server on 127.0.0.1 (never exposed to the network).
 *  2. Opens a locked-down window pointing at that local server.
 *
 * App data (accounts, habits, tasks...) is stored by the web layer in IndexedDB,
 * inside Electron's per-user data folder (%APPDATA%\DayFlow). Uploaded PDFs are
 * only kept briefly in %APPDATA%\DayFlow\uploads while their text is extracted.
 *
 * Security:
 *  - contextIsolation + sandbox on, nodeIntegration off
 *  - the server listens on 127.0.0.1 only
 *  - navigation is limited to the local app; external links open in the system browser
 *  - all permission requests (camera, mic, location...) are denied
 *  - no API keys or secrets are bundled; optional AI keys are read from
 *    %APPDATA%\DayFlow\.env at runtime
 */

const { app, BrowserWindow, dialog, shell, session } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const net = require('net')
const http = require('http')

// Fixed port on purpose: IndexedDB/localStorage are tied to the origin, so a
// changing port would make the user's data "disappear".
const PORT = 38417
const HOST = '127.0.0.1'
const APP_ORIGIN = `http://${HOST}:${PORT}`
const DEV_ORIGIN = 'http://localhost:3000'
const isDev = process.argv.includes('--dev')

let mainWindow = null
let serverProcess = null
let quitting = false
let serverLogPath = null
let serverLogStream = null

function logServer(message) {
  const line = `[${new Date().toISOString()}] ${message}\r\n`
  try {
    if (!serverLogStream) {
      const logDir = path.join(app.getPath('userData'), 'logs')
      fs.mkdirSync(logDir, { recursive: true })
      serverLogPath = path.join(logDir, 'server.log')
      serverLogStream = fs.createWriteStream(serverLogPath, { flags: 'a' })
    }
    serverLogStream.write(line)
  } catch (err) {
    console.error('Unable to write DayFlow server log:', err)
  }
}

function readServerLogTail(maxChars = 5000) {
  try {
    if (!serverLogPath || !fs.existsSync(serverLogPath)) return '(No server log was created.)'
    const content = fs.readFileSync(serverLogPath, 'utf8')
    return content.slice(-maxChars) || '(Server log is empty.)'
  } catch (err) {
    return `Could not read server log: ${err.message}`
  }
}

// ---------- helpers ----------

function getServerEntry() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'standalone', 'server.js')
    : path.join(__dirname, '..', '..', '.next', 'standalone', 'server.js')
}

/** Reads %APPDATA%\DayFlow\.env and returns ONLY the whitelisted AI_* keys. */
function readUserEnv() {
  const allowed = new Set(['AI_API_KEY', 'AI_API_URL', 'AI_MODEL'])
  const result = {}
  try {
    const file = path.join(app.getPath('userData'), '.env')
    if (!fs.existsSync(file)) return result
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m || !allowed.has(m[1])) continue
      result[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch (err) {
    console.error('Could not read user .env:', err.message)
  }
  return result
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
    tester.once('error', () => resolve(false))
    tester.once('listening', () => tester.close(() => resolve(true)))
    tester.listen(port, HOST)
  })
}

function waitForServer(timeoutMs = 40000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: HOST, port: PORT, path: '/', timeout: 2000 }, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', retry)
      req.on('timeout', () => {
        req.destroy()
        retry()
      })
    }
    const retry = () => {
      if (Date.now() - started > timeoutMs) return reject(new Error('Local server did not start in time.'))
      setTimeout(attempt, 400)
    }
    attempt()
  })
}

async function startServer() {
  const entry = getServerEntry()
  if (!fs.existsSync(entry)) {
    throw new Error(
      `Server files not found:\n${entry}\n\nRun "npm run build" and "node scripts/prepare-standalone.js" first.`
    )
  }
  if (!(await isPortFree(PORT))) {
    throw new Error(
      `Port ${PORT} is already in use by another program.\nClose it (or any other running DayFlow) and try again.`
    )
  }

  const uploadDir = path.join(app.getPath('userData'), 'uploads')
  fs.mkdirSync(uploadDir, { recursive: true })

  logServer(`Starting bundled server. entry=${entry}; execPath=${process.execPath}; cwd=${path.dirname(entry)}`)
  const serverEnv = {
      ...process.env,
      ...readUserEnv(),
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOSTNAME: HOST,
      DAYFLOW_DESKTOP: '1',
      DAYFLOW_UPLOAD_DIR: uploadDir,
    }
  // Avoid accidentally passing Electron's app-specific switches to the Node server.
  delete serverEnv.ELECTRON_NO_ATTACH_CONSOLE

  serverProcess = spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  const child = serverProcess
  child.stdout.on('data', (chunk) => logServer(`stdout: ${String(chunk).trimEnd()}`))
  child.stderr.on('data', (chunk) => logServer(`stderr: ${String(chunk).trimEnd()}`))
  child.once('error', (err) => logServer(`spawn error: ${err.stack || err.message || err}`))
  child.once('exit', (code, signal) => {
    logServer(`Server process exited. code=${code}; signal=${signal || 'none'}`)
    if (serverProcess === child) serverProcess = null
    if (!quitting) {
      dialog.showErrorBox(
        'DayFlow local server stopped',
        `The local server stopped unexpectedly (code ${code}).\n\nDiagnostic log:\n${serverLogPath || '(unavailable)'}\n\nLast server output:\n${readServerLogTail()}`
      )
      app.quit()
    }
  })

  try {
    await waitForServer()
    logServer(`Server is responding at ${APP_ORIGIN}`)
  } catch (err) {
    logServer(`Startup check failed: ${err.stack || err.message || err}`)
    throw new Error(`${err.message}\n\nServer log: ${serverLogPath || '(unavailable)'}\n\nLast server output:\n${readServerLogTail()}`)
  }
}

function stopServer() {
  if (serverProcess) {
    try {
      serverProcess.kill()
    } catch {
      // already gone
    }
    serverProcess = null
  }
  if (serverLogStream) {
    try { serverLogStream.end() } catch {}
    serverLogStream = null
  }
}

// ---------- window ----------

function createWindow(origin) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#ffffff',
    title: 'DayFlow',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  mainWindow.setMenuBarVisibility(false)

  // Only the local app may load inside the window.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault()
      openExternalSafely(url)
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url)
    return { action: 'deny' }
  })

  mainWindow.loadURL(`${origin}/`)
  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (isDev) mainWindow.webContents.openDevTools()
}

function openExternalSafely(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') shell.openExternal(url)
  } catch {
    // ignore malformed URLs
  }
}

// ---------- lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))

    try {
      if (isDev) {
        createWindow(DEV_ORIGIN)
      } else {
        await startServer()
        createWindow(APP_ORIGIN)
      }
    } catch (err) {
      dialog.showErrorBox('DayFlow could not start', String(err && err.message ? err.message : err))
      stopServer()
      app.quit()
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && (isDev || serverProcess)) {
        createWindow(isDev ? DEV_ORIGIN : APP_ORIGIN)
      }
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', () => {
    quitting = true
    stopServer()
  })
}
