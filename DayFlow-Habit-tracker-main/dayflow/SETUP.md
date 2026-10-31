# DayFlow — Setup & Build Guide (Windows desktop)

DayFlow is a local-first habit tracker. Your data stays on your computer
(browser database inside the app's user-data folder). The optional AI and
cloud-sync features are off unless you configure them.

## 1. Requirements

- Windows 10/11 (64-bit)
- Node.js 20 or newer (22 is fine) — check with `node -v`
- Internet connection for the first `npm install` only

## 2. Install and test in a window (no installer yet)

Open **PowerShell** or **Command Prompt** in the project folder, then:

```bash
npm install
npm test            # optional: runs the scheduling unit tests
npm run type-check  # optional: TypeScript check
npm run electron:preview
```

`electron:preview` builds the site and opens DayFlow as a desktop app.
Register an account (password: 8+ characters) and try it out.

Browser-only development: `npm run dev`, then open http://localhost:3000.
Desktop with hot reload: `npm run electron:dev`.

## 3. Build the Windows installer

```bash
npm run dist
```

The installer appears at `release\DayFlow-Setup-1.0.0.exe`. Double-click it
to install. Build it **on Windows** (the bundled server includes
Windows-specific files).

`npm run pack` makes an unpacked app folder in `release\win-unpacked\`
(faster, good for testing).

Windows SmartScreen may warn "unknown publisher" because the installer is
not code-signed. Click "More info" -> "Run anyway". Signing requires a paid
code-signing certificate.

## 4. Where your data lives

- App data (accounts, habits, tasks, progress): `%APPDATA%\DayFlow\`
  (inside the app's browser storage). Uninstalling does not delete it.
- Uploaded PDFs are kept only while text is being extracted, then deleted.
- The app always uses port **38417** on 127.0.0.1 (this computer only).
  Your data is tied to that address — don't change the port, or your data
  will appear to vanish.
- Back up with the sidebar's **Export** button. **Delete data** removes your
  local account and everything in it permanently.

## 5. Optional: AI features

Without a key, PDF import and weekly summaries still work using built-in
logic. To enable AI (any OpenAI-compatible endpoint):

- Desktop app: create `%APPDATA%\DayFlow\.env` containing
  ```
  AI_API_KEY=your_key
  AI_API_URL=https://your-provider/v1/chat/completions
  AI_MODEL=your-model-name
  ```
  then restart DayFlow.
- Development (`npm run dev`): copy `.env.example` to `.env.local` and fill it in.

Never put keys in files that get committed or shared.

## 6. Optional: cloud sync (Supabase) — experimental

Run `src/lib/supabase/schema.sql` in the Supabase SQL editor, then set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
and rebuild. Use the **anon** key only — never the service-role key.
This feature is not needed for normal use.

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm install` fails on a package version | Delete `node_modules` and `package-lock.json`, run `npm install` again |
| "Port 38417 is already in use" | Close other DayFlow windows (check Task Manager) |
| "Server files not found" when running `npm run electron:preview` | Run it via npm (it builds first), not `electron .` directly |
| Installer build fails downloading Electron/NSIS | Check internet/firewall/proxy, then rerun `npm run dist` |
| PDF import says "Failed to extract text" | Make sure the PDF has selectable text (scanned image PDFs have none) |
| Forgot password | Local accounts can't be recovered; use another account or delete data |
