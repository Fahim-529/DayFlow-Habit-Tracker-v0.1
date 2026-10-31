# DayFlow — Security Audit & Fix Log

## Fixed (critical / high)
1. **Arbitrary file read** — `/api/pdf/extract` opened any path the client sent
   (e.g. `C:\Users\...\secrets`). Now only server-generated UUID names inside the
   upload folder are accepted; the temp file is deleted after extraction.
2. **Server path leaked to client** by `/api/pdf/upload` — removed.
3. **Weak password storage** — unsalted SHA-256. Now bcrypt (salted); old hashes
   are upgraded automatically at next login.
4. **Password hash leaked into localStorage** via the auth store — no longer persisted.
5. **Access token placed in a redirect URL** (Supabase callback) — now an httpOnly
   cookie; the `next` redirect target is restricted to local paths (open-redirect fix).
6. **SQL injection surface** in the Electron IPC layer (table names built into SQL) —
   removed: the unused SQLite/IPC layer and the native `better-sqlite3` dependency are gone.
7. **No Electron hardening** — added sandbox, navigation lock, window-open handler,
   permission denial, single-instance lock, 127.0.0.1-only server.

## Fixed (medium / low)
- Upload accepted any file named `.pdf`; now checks the `%PDF-` signature and size up front.
- Added API guard middleware (Origin/CSRF check; DNS-rebinding check on desktop).
- Added security headers + Content-Security-Policy.
- Login: generic error (no username enumeration), 5-try lockout for 30 s, 8-char minimum password.
- AI routes now validate request bodies.
- `/api/data/export` and `/api/data/delete` pretended to succeed; they now return 501.
- Supabase schema: missing delete/update policies added; invalid trigger SQL fixed.
- Removed unused/risky deps (`next-pwa`, `@supabase/ssr`, `mammoth`, `better-sqlite3`);
  removed the service-role key and unused `LOCAL_ENCRYPTION_KEY` from `.env.example`.

## Known limitations (not changed)
- Local accounts are a convenience lock, not strong protection: data is not
  encrypted at rest. Anyone with access to your Windows user profile can read it.
- Installer is not code-signed (SmartScreen warning).
- Cloud sync is experimental and untested end-to-end.
- Run `npm audit` after install and update packages periodically.
