# Lilka Catalog

[Українська версія / Ukrainian version](README.uk.md)

The website for browsing and publishing Lilka apps, wallpapers and mods:
[catalog.lilka.dev](https://catalog.lilka.dev).

Everything is in this repository:

```
site/                  the website (GitHub Pages)
api/                   lilka-catalog-api, the Cloudflare Worker that holds the
                       catalog (D1 database, R2 files) — see api/README.md
scripts/mirror_api.py  copies the catalog from the API to Pages for Lilka devices,
                       plus share pages and feed.xml for the website
scripts/announce.py    posts new and updated items to Discord
.github/workflows/
  deploy-pages.yml     site + mirror: on push, hourly, and after approvals;
                       then announces what is new
  process.yml          ClamAV scan and processing of new uploads
  api.yml              API tests on every PR; deploy from main
```

## How to publish your app, wallpaper or mod

1. Open [catalog.lilka.dev](https://catalog.lilka.dev) and click **Sign in with GitHub**.
   Only your public profile is used.
2. Go to **Publish**, fill in the name and descriptions (Ukrainian and/or
   English), the link to the source code and the files:
   - **apps and wallpapers**: the entry file (`.lua`, `.bin` firmware or an
     archive), optional extra files (up to 16, added one by one or all at
     once), the minimum Keira version;
   - **mods** (cases, printable parts): model files instead of an entry file;
   - an icon and up to 6 screenshots.
3. Every file is scanned with ClamAV. Then a moderator reviews the version.
4. Once approved, it appears on the website right away and on Lilka within an
   hour (the device mirror below is rebuilt on approval, and hourly).

Your submissions, their review status and moderator notes are in **My apps**.
A new release is **My apps → New version**. Its number has to be higher than
the earlier ones (1.2.10 > 1.2.9 > 1.2.9-beta), and the form offers the next
one. The icon and screenshots of the approved version are kept unless you
untick them; extra files can be kept too. Attach only what changed: a file
with the same name replaces the kept one.

File names: Latin letters, digits, `.`, `_` and `-`. Up to 8 MB per file and
24 MB per upload.

## How it works

```
 catalog.lilka.dev (GitHub Pages)
   site/            the website; reads the mirror below, and the API for
                    sign-in, publishing and moderation
   apps/ wallpapers/ mods/ authors.json authors_info.json
                    static mirror of the API's /catalog for Keira devices

 lilka-catalog-api (api/, Cloudflare)
   Worker + D1 + R2  apps, versions, files, users, moderation
   GitHub Actions    ClamAV scan, icon_min, image compression, package.zip
```

Diagrams of the whole flow are in [api/README.md](api/README.md).

On the website, search, the type filter and ★ favorites work on the list
already in the page (favorites live in the browser, no account needed). Every
item has its own link, `https://catalog.lilka.dev/<dir>/<id>/` (**Copy link**
in the item window), with a preview for Discord and Telegram that forwards to
the item. New and updated items are in [feed.xml](https://catalog.lilka.dev/feed.xml)
(Atom).

The API serves the catalog under `/catalog` in exactly the layout Keira's
`lilcatalog` reads from `https://catalog.lilka.dev`:

```
{apps,wallpapers,mods}/index_<page>.json     12 ids per page
<dir>/<id>/index.json                        full manifest
<dir>/<id>/index_short.json                  name, short description, entry file
<dir>/<id>/static/<file>                     entry, extra files, icon, icon_min.bin, screenshots
<dir>/<id>/package.zip                       manifest.yml + entry and extra files
authors.json
```

Two more files per kind are for the website only, and Keira never reads them:
`<dir>/listing.json` (every item with dates, rating, version, Keira version,
entry type and license) and `<dir>/<id>/versions.json` (every approved
version with its changelog). `index.json` and `index_short.json` keep exactly
the fields shipped firmware knows.

Firmware already in people's hands cannot change its catalog address, so the
deploy workflow copies that tree to Pages (`scripts/mirror_api.py`) on every
push, on every approval (`repository_dispatch: api-sync`) and hourly. The copy
fails as a whole if any file is missing, so the devices never get half a
catalog.

The website reads the public catalog from that mirror too: it is served by
GitHub's CDN for free, while every request to the API counts against the
Worker's daily limit. Only sign-in, publishing and moderation talk to the API,
whose address is in `<meta name="lilka-api">` in `site/index.html`. The mirror
itself costs one API request per run (`/catalog/export.json`, which only the
mirror job may read: `MIRROR_SECRET`), copies files of unchanged items from
Pages, and the hourly run stops early when nothing changed.

## Local development

Start the API locally (see [api/README.md](api/README.md)), copy its catalog
into `site/` and serve the site:

```bash
pip install -r requirements.txt
MIRROR_SECRET=dev-mirror-secret python3 scripts/mirror_api.py --api http://localhost:8787 --out site
cd site && python3 -m http.server 8000
```

Then open http://localhost:8000 and, so that sign-in and publishing use the
local API, run this in the browser console:

```js
localStorage.setItem('lilka-api-url', 'http://localhost:8787')
```

The copied `site/apps/`, `site/wallpapers/`, `site/mods/`, `site/authors*.json`
and `site/feed.xml` are not committed. Add `--site http://localhost:8000` so the
share pages and the feed link to your local copy, and `--announce-out FILE`
to see what would be announced (`python3 scripts/announce.py FILE --dry-run`
prints the Discord message).

## Announcements on Discord

After a deploy that brings new items or new versions, the `announce` job of
`deploy-pages.yml` posts them to Discord: one message, up to 10 items, each
with its name, version, short description, author and icon. Set the
repository secret `DISCORD_WEBHOOK_URL` (channel → Edit → Integrations →
Webhooks → New webhook → Copy URL); without it the job only logs what it
would post. What counts as new is decided against the live
`mirror-state.json`, so a run that cannot read it announces nothing rather
than the whole catalog. Mentions are switched off: names and descriptions
cannot ping anyone.

## Roles and moderation

Who may do what is one table, `MATRIX` in
[`api/src/permissions.ts`](api/src/permissions.ts); the API checks
permissions, never role names, and the site shows the same table in
**Moderation → Roles**:

| Permission | Main admin | Admin | Moderator | User |
|---|:-:|:-:|:-:|:-:|
| `review`: preview uploads, approve, reject | ✓ | ✓ | ✓ | |
| `reports`: see and close reports | ✓ | ✓ | ✓ | |
| `items.edit`: edit any item, hide or publish it, change its author and owner | ✓ | ✓ | ✓ | |
| `users.view`: every user with their activity | ✓ | ✓ | ✓ | |
| `users.manage`: trust authors, keep notes, end sessions, remove ratings | ✓ | ✓ | ✓ | |
| `users.ban`: ban and unban | ✓ | ✓ | ✓ | |
| `limits.exempt`: no limits on items, uploads and changes | ✓ | ✓ | ✓ | |
| `items.delete`: delete an item for good | ✓ | ✓ | | |
| `items.import`: import from the old repository | ✓ | ✓ | | |
| `roles.moderator`: make and remove moderators | ✓ | ✓ | | |
| `roles.admin`: make and remove admins | ✓ | | | |
| `roles.main_admin`: make and remove main admins (not themselves) | ✓ | | | |

- Every role is granted in **Moderation → Roles** or in a user's **Details**,
  to anyone who has signed in at least once, and applies at their next
  request. Roles are kept in D1 (`staff`, migration 0009) with who granted
  them and when.
- Nobody changes their own role. Admins make and remove moderators, main
  admins every role, including other main admins; so there is always at least
  one main admin. Staff are not banned: whoever may take the role away does
  that first.
- With no main admin left (or none yet, on a new database), someone with
  access to the Cloudflare account grants the first one:

  ```bash
  cd api
  npx wrangler d1 execute lilka-catalog --remote --command \
    "INSERT INTO staff (user_id, role) SELECT id, 'main_admin' FROM users WHERE login = '<github-login>'"
  ```

The **Moderation** tab shows each staff member the parts their role allows:
versions waiting for review with code and image preview, checksums and the
antivirus result; approve, reject with a reason, ban an author; open reports.
**All items** lists every app, wallpaper and mod with an owner selector and
**Manage**: edit every field including the author line, publish or hide,
review each version with its files, see and resolve the item's reports,
delete it for good (admins). **Users** lists everyone who has signed in;
**Details** shows their activity, items and reports, and lets a moderator
mark them trusted (no item limits; still scanned and reviewed), keep a
private note, end their sessions, remove their ratings, ban or unban.

New uploads are announced in a GitHub issue labelled `moderation` (see
[api/README.md](api/README.md#lifecycle-of-an-upload)).

Apps imported from the old repository belong to the `lilka-catalog` account
and keep their original author line. A moderator hands one over to its author
in **All items** once the author has signed in at least once.

## License

MIT
