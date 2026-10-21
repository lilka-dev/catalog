# lilka-catalog-api

Backend that lets people share Lilka apps and wallpapers on
[catalog.lilka.dev](https://catalog.lilka.dev) without opening a pull request.
It runs on Cloudflare: a Worker for the API, D1 (SQLite) for data, R2 for files.

```
 catalog site / web IDE ──fetch + Bearer──▶ Worker ── D1 (users, apps, versions, ratings, reports)
                                              │  └── R2 (uploaded files, v/<version id>/<name>)
             GitHub OAuth (sign-in only) ◀────┤
                                              │ repository_dispatch "scan-version"
                                              ▼
                       GitHub Action: ClamAV ──▶ POST /scan/versions/:id
                                              │
                       moderator approves ────┤ repository_dispatch "api-sync"
                                              ▼
         catalog repo build: scripts/sync_community.py ──▶ build.py ──▶ GitHub Pages ──▶ Keira
```

The device side does not change. Approved apps are exported as ordinary
`manifest.yml` documents, and the catalog's own `build.py` downloads, scans and
packs them like any app from the repo.

## Lifecycle of an upload

1. `POST /apps` creates a **draft** app (slug, names, descriptions, source URL).
2. `POST /apps/:slug/versions` uploads files → version is `pending_scan`. Files
   are private: only the owner and moderators can fetch them.
3. The scan workflow downloads them with the shared secret and reports
   `clean` → `pending_review`, or `infected`.
4. A moderator approves (`pending_review` only) → version `approved`, app
   `published`, catalog rebuild is dispatched.
5. Owner or moderator can hide the app (`PATCH status: hidden`); it drops out
   of the export and the next catalog build.

## API

All bodies are JSON unless noted. Authenticated calls send
`Authorization: Bearer <token>`.

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/auth/login?return=<url>` | anyone | Redirects to GitHub. `return` must be on `ALLOWED_ORIGINS` |
| GET | `/auth/callback` | GitHub | Redirects to `return#lilka_token=<token>` |
| POST | `/auth/logout` | user | Ends the session |
| GET | `/auth/me` | user | Current user |
| GET | `/apps?kind=&q=&page=` | anyone | Published apps, 24 per page |
| GET | `/apps/:slug` | anyone / owner | Detail with versions; owner also sees drafts and statuses |
| POST | `/apps` | user | Create draft |
| PATCH | `/apps/:slug` | owner, mod | Edit metadata, `status: hidden \| published` |
| POST | `/apps/:slug/versions` | owner, mod | Multipart: `version`, `keira_version`, `entry_type`, `changelog`, files `entry`, `files[]`, `icon`, `screenshots[]` |
| PUT | `/apps/:slug/rating` | user (not owner) | `{ "stars": 1..5 }` |
| POST | `/apps/:slug/reports` | user | `{ "reason": "..." }` |
| GET | `/users/:login/apps` | anyone | Apps of a user (all of them for the user themself) |
| GET | `/files/:slug/:version/:name` | anyone if approved | File download; `?download` forces attachment |
| GET | `/mod/queue?status=` | mod | Versions by status, default `pending_review` |
| POST | `/mod/versions/:id/approve` | mod | `{ "note"?: "..." }` |
| POST | `/mod/versions/:id/reject` | mod | `{ "note": "reason" }` |
| GET | `/mod/reports` | mod | Open reports |
| POST | `/mod/reports/:id/resolve` | mod | |
| POST | `/mod/users/:login/ban` / `unban` | mod | Ban hides all their apps and ends sessions |
| GET | `/scan/pending`, `/scan/versions/:id`, `/scan/files/:id/:name` | scanner | For the ClamAV workflow |
| POST | `/scan/versions/:id` | scanner | `{ "result": "clean" \| "infected", "detail" }` |
| GET | `/export/manifests` | anyone | Published apps as catalog manifests |

Limits: 8 MB per file, 24 MB per upload, 16 extra files, 6 screenshots, 5
versions waiting for review per user. File names: letters, digits, `.`, `_`,
`-` (the catalog flattens files by name).

### Signing in from a page

```js
const API = 'https://lilka-catalog-api.<account>.workers.dev';

// Button
location.href = `${API}/auth/login?return=${encodeURIComponent(location.href)}`;

// On page load
const m = location.hash.match(/lilka_token=([^&]+)/);
if (m) {
    localStorage.setItem('lilka_token', m[1]);
    history.replaceState(null, '', location.pathname + location.search);
}
const token = localStorage.getItem('lilka_token');
const me = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
```

Sessions are bearer tokens rather than cookies because the API is on a
different site than the catalog and browsers block third-party cookies.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev            # http://localhost:8787
npm run smoke          # in another terminal: 33 end-to-end checks
npm run typecheck
```

GitHub sign-in does not work locally unless you create a separate OAuth App
with callback `http://localhost:8787/auth/callback`; `scripts/smoke.sh` writes
users and sessions straight into the local D1 instead.

## Deploying

Everything works on the free `*.workers.dev` address; no access to the
lilka.dev DNS is needed.

1. Create the resources and put the printed `database_id` into `wrangler.toml`:
   ```bash
   npx wrangler login
   npx wrangler d1 create lilka-catalog
   npx wrangler r2 bucket create lilka-catalog-files
   npm run db:migrate
   ```
2. Create a GitHub OAuth App (org `lilka-dev` → Settings → Developer settings
   → OAuth Apps). Callback URL: `https://lilka-catalog-api.<account>.workers.dev/auth/callback`.
3. In `wrangler.toml` set `PUBLIC_URL`, `GITHUB_CLIENT_ID`, `MODERATORS`, and
   trim `ALLOWED_ORIGINS` to production sites.
4. Secrets:
   ```bash
   npx wrangler secret put GITHUB_CLIENT_SECRET
   npx wrangler secret put SCAN_SECRET            # any long random string
   npx wrangler secret put GITHUB_DISPATCH_TOKEN  # fine-grained PAT: Contents read/write on catalog-api and catalog
   ```
5. `npm run deploy`
6. In this repo on GitHub: variable `API_URL`, secret `SCAN_SECRET` (same value).
7. In the catalog repo: variable `COMMUNITY_API_URL` = the Worker URL.

Later, with lilka.dev on Cloudflare DNS, add a custom domain such as
`api.lilka.dev` to the Worker and update `PUBLIC_URL` and the OAuth callback.

## Not done yet

- UI: sign-in, upload form, "my apps" and the moderation queue on the catalog
  site; "Publish" from the web IDE.
- Mods (`.case`) — only apps and wallpapers for now.
- Rate limiting beyond the pending-review cap (Cloudflare's rate limiting
  binding is the natural next step).
