# Lilka Catalog

[Українська версія / Ukrainian version](README.uk.md)

The website for browsing and publishing Lilka apps, wallpapers and mods:
[catalog.lilka.dev](https://catalog.lilka.dev).

Everything is in this repository:

```
site/                  the website (GitHub Pages)
api/                   lilka-catalog-api, the Cloudflare Worker that holds the
                       catalog (D1 database, R2 files) — see api/README.md
scripts/mirror_api.py  copies the catalog from the API to Pages for Lilka devices
.github/workflows/
  deploy-pages.yml     site + mirror: on push, hourly, and after approvals
  process.yml          ClamAV scan and processing of new uploads
  api.yml              API tests on every PR; deploy from main
```

## How to publish your app, wallpaper or mod

1. Open [catalog.lilka.dev](https://catalog.lilka.dev) and click **Sign in with GitHub**.
   Only your public profile is used.
2. Go to **Publish**, fill in the name and descriptions (Ukrainian and/or
   English), the link to the source code and the files:
   - **apps and wallpapers**: the entry file (`.lua`, `.js`, `.bin` firmware or
     an archive), optional extra files, the minimum Keira version;
   - **mods** (cases, printable parts): model files instead of an entry file;
   - an icon and up to 6 screenshots.
3. Every file is scanned with ClamAV. Then a moderator reviews the version.
4. Once approved, it appears on the website right away and on Lilka within an
   hour (the device mirror below is rebuilt on approval, and hourly).

Your submissions, their review status and moderator notes are in **My apps**.
A new release is **My apps → New version**.

File names: Latin letters, digits, `.`, `_` and `-`. Up to 8 MB per file and
24 MB per upload.

## How it works

```
 catalog.lilka.dev (GitHub Pages)
   site/            the website; reads the mirror below, and the API for
                    sign-in, publishing and moderation
   apps/ wallpapers/ mods/ authors.json
                    static mirror of the API's /catalog for Keira devices

 lilka-catalog-api (api/, Cloudflare)
   Worker + D1 + R2  apps, versions, files, users, moderation
   GitHub Actions    ClamAV scan, icon_min, image compression, package.zip
```

Diagrams of the whole flow are in [api/README.md](api/README.md).

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

The copied `site/apps/`, `site/wallpapers/`, `site/mods/` and
`site/authors.json` are not committed.

## Moderators

Moderators are GitHub numeric user ids in `MODERATORS` of `api/wrangler.toml`.
They see a **Moderation** tab: versions waiting for review with code and image
preview, checksums and the antivirus result; approve, reject with a reason, ban
an author; open reports.

Apps imported from the old repository belong to the `lilka-catalog` account
and keep their original author line. A moderator can hand one over to its
author once they have signed in: `PATCH /apps/<id>` with `{"owner": "<login>"}`.

## License

MIT
