#!/usr/bin/env python3
"""Copy the catalog from lilka-catalog-api into a static tree for GitHub Pages.

Keira's lilcatalog reads https://catalog.lilka.dev/{apps,wallpapers}/... as
plain files, and firmware already in people's hands cannot change that URL.
The API serves the exact same layout under /catalog, so the mirror is a file
for file copy of it:

    {apps,wallpapers,mods}/index_<page>.json
    <dir>/<id>/index.json, index_short.json, package.zip, static/<file>
    authors.json

and adds what only the website uses, made from the same documents:

    <dir>/<id>/index.html   the item's link with a preview for chats, which
                            forwards to the item on the site
    feed.xml                Atom feed of the latest new and updated items

Every request to the API counts against the Worker's daily limit, so the copy
is cheap:

- all JSON documents come from one request, /catalog/export.json;
- with --skip-unchanged the run stops there when the export's stamp is the one
  the live mirror was built from (mirror-state.json on Pages);
- files of items whose version did not change are copied from the live Pages
  site, not from the API. Versions never change after approval, so this is
  the same bytes.

Any failed download fails the whole run, so Pages never gets a half catalog.

Only this job may read /catalog: it sends MIRROR_SECRET, which the API checks.

It also works out which items are new or have a new version compared with
the live mirror, for scripts/announce.py (workflow output `announce`, or
--announce-out FILE).

Usage:
    MIRROR_SECRET=... python3 scripts/mirror_api.py --api https://...workers.dev --out build [--skip-unchanged]
"""

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from html import escape
from urllib.parse import quote, unquote

import requests

STATE_FILE = "mirror-state.json"
DIRS = ("apps", "wallpapers", "mods")
SITE_NAME = "Lilka Apps & Mods"
FEED_SIZE = 50


def path_url(base, path):
    # Names like `bmp280%2Bbme280_lilka.lua` must reach the server literally
    return base.rstrip("/") + "/" + "/".join(quote(part, safe="") for part in path.split("/"))


def write(out, path, data):
    target = os.path.join(out, *path.split("/"))
    os.makedirs(os.path.dirname(target), exist_ok=True)
    mode = "w" if isinstance(data, str) else "wb"
    with open(target, mode, **({"encoding": "utf-8"} if mode == "w" else {})) as f:
        f.write(data)


def write_file(out, path, data):
    """A static file, plus a copy under its percent-decoded name.

    Some names hold a literal escape, e.g. `bmp280%2Bbme280_lilka.lua`. Keira
    and the website request the name as written, and GitHub Pages decodes the
    path first, so it looks for `bmp280+bme280_lilka.lua`. The decoded copy is
    what that request finds; the literal one stays for encoded requests.
    """
    write(out, path, data)
    folder, name = path.rsplit("/", 1)
    decoded = unquote(name)
    # Only the file name is decoded, and never into another path: `%2F..`
    # must not write outside the item's folder
    if decoded != name and "/" not in decoded and "\\" not in decoded and decoded not in (".", ".."):
        write(out, f"{folder}/{decoded}", data)


def listing(documents, folder):
    """Entries of <folder>/listing.json from the export; [] when it has none."""
    text = documents.get(f"{folder}/listing.json")
    return json.loads(text).get("items", []) if text else []


def item_url(site, folder, slug):
    return f"{site.rstrip('/')}/{folder}/{quote(slug, safe='')}/"


def static_url(site, folder, slug, name):
    return f"{item_url(site, folder, slug)}static/{quote(name, safe='')}"


def iso_time(value):
    """`YYYY-MM-DD HH:MM:SS` (UTC, as the API stores it) to RFC 3339."""
    return value.replace(" ", "T") + "Z" if value else None


def share_page(site, folder, entry, doc):
    """<dir>/<id>/index.html: Open Graph tags for Discord, Telegram and the
    like, which read the first response and run no scripts, then a plain
    redirect to the item on the site."""
    slug = entry["path"]
    name = entry.get("name") or slug
    summary = entry.get("short_description") or ""
    url = item_url(site, folder, slug)
    shots = doc.get("screenshots") or []
    image_name = shots[0] if shots else doc.get("icon")
    image = static_url(site, folder, slug, image_name) if image_name else None
    target = f"../../?type={folder}&item={quote(slug, safe='')}"
    title = f"{name} {entry['version']}" if entry.get("version") else name
    tags = [
        ("og:site_name", SITE_NAME),
        ("og:type", "website"),
        ("og:title", title),
        ("og:description", summary),
        ("og:url", url),
    ]
    if image:
        tags.append(("og:image", image))
    meta = "\n".join(f'    <meta property="{key}" content="{escape(value)}">' for key, value in tags)
    card = "summary_large_image" if shots else "summary"
    return f"""<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{escape(title)} · {escape(SITE_NAME)}</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
    <meta name="description" content="{escape(summary)}">
{meta}
    <meta name="twitter:card" content="{card}">
    <link rel="canonical" href="{escape(url)}">
    <meta http-equiv="refresh" content="0; url={escape(target)}">
    <style>body{{font-family:system-ui,sans-serif;margin:3rem 1rem;text-align:center;color:#1d1d1f;background:#f5f5f7}}a{{color:#0066cc}}</style>
</head>
<body>
    <h1>{escape(name)}</h1>
    <p>{escape(summary)}</p>
    <p><a href="{escape(target)}">Відкрити в каталозі · Open in the catalog</a></p>
</body>
</html>
"""


def atom_feed(site, documents):
    """feed.xml: the FEED_SIZE most recently updated items of every kind, an
    entry per item and version, so a new version shows up as a new entry."""
    entries = []
    for folder in DIRS:
        for entry in listing(documents, folder):
            when = entry.get("updated") or entry.get("added")
            if when:
                entries.append((when, folder, entry))
    entries.sort(key=lambda e: e[0], reverse=True)
    entries = entries[:FEED_SIZE]
    root = site.rstrip("/") + "/"
    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="uk">',
        f"  <title>{escape(SITE_NAME)}</title>",
        "  <subtitle>Нові та оновлені застосунки, шпалери й моди для Лілки · "
        "New and updated apps, wallpapers and mods for Lilka</subtitle>",
        f'  <link rel="alternate" type="text/html" href="{escape(root)}"/>',
        f'  <link rel="self" type="application/atom+xml" href="{escape(root)}feed.xml"/>',
        f"  <id>{escape(root)}</id>",
        f"  <updated>{iso_time(entries[0][0]) if entries else time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}</updated>",
    ]
    for when, folder, entry in entries:
        url = item_url(site, folder, entry["path"])
        version = entry.get("version")
        name = entry.get("name") or entry["path"]
        lines += [
            "  <entry>",
            f"    <title>{escape(f'{name} {version}' if version else name)}</title>",
            f'    <link rel="alternate" type="text/html" href="{escape(url)}"/>',
            f"    <id>{escape(url)}#{escape(version or when)}</id>",
            f"    <updated>{iso_time(when)}</updated>",
            f"    <author><name>{escape(entry.get('author') or '')}</name></author>",
            f'    <category term="{folder}"/>',
            f"    <summary>{escape(entry.get('short_description') or '')}</summary>",
            "  </entry>",
        ]
    lines.append("</feed>")
    return "\n".join(lines) + "\n"


def announcements(site, documents, items, old_items):
    """Items that are new on the mirror or have a new version since the live
    one, oldest first. Without the live state there is nothing to compare
    with, and announcing nothing beats announcing the whole catalog."""
    if not old_items:
        return []
    found = []
    for folder in DIRS:
        for entry in listing(documents, folder):
            base = f"{folder}/{entry['path']}"
            if base not in items:
                continue
            before = old_items.get(base)
            if before and before.get("version") == items[base]["version"]:
                continue
            icon = entry.get("icon")
            found.append({
                "kind": folder,
                "status": "updated" if before else "new",
                "name": entry.get("name") or entry["path"],
                "version": entry.get("version"),
                "author": entry.get("author"),
                "summary": (entry.get("short_description") or "")[:300],
                "url": item_url(site, folder, entry["path"]),
                "icon": static_url(site, folder, entry["path"], icon) if icon else None,
                "updated": entry.get("updated"),
            })
    found.sort(key=lambda a: a["updated"] or "")
    return found


def github_output(**values):
    target = os.environ.get("GITHUB_OUTPUT")
    if target:
        with open(target, "a") as f:
            for key, value in values.items():
                f.write(f"{key}={value}\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api", default=os.environ.get("API_URL"), required=not os.environ.get("API_URL"))
    parser.add_argument("--pages", default=os.environ.get("PAGES_URL", "https://catalog.lilka.dev"),
                        help="live mirror to reuse unchanged files from")
    parser.add_argument("--out", default="build")
    parser.add_argument("--site", default=os.environ.get("SITE_URL", "https://catalog.lilka.dev"),
                        help="public address of the website, for share pages and the feed")
    parser.add_argument("--announce-out", help="also write the items to announce to this file")
    parser.add_argument("--skip-unchanged", action="store_true",
                        help="do nothing when the catalog is the one already published")
    args = parser.parse_args()

    api = args.api.rstrip("/") + "/catalog"
    secret = os.environ.get("MIRROR_SECRET", "")
    if not secret:
        sys.exit("MIRROR_SECRET is required")
    session = requests.Session()
    # Only for API requests; Pages downloads must not carry it
    api_headers = {"Authorization": f"Bearer {secret}"}

    response = session.get(f"{api}/export.json", headers=api_headers, timeout=120)
    response.raise_for_status()
    export = response.json()
    items = export["items"]
    # An empty API (wrong address, broken import) must not wipe the catalog
    # that devices see; keep the last deployed mirror instead
    if not items:
        sys.exit("the API has no published apps; refusing to publish an empty mirror")

    previous = {}
    try:
        # A fresh copy, not the CDN's: a stale state would announce an update twice
        live = session.get(f"{args.pages.rstrip('/')}/{STATE_FILE}", params={"t": int(time.time())}, timeout=30)
        if live.ok:
            previous = live.json()
    except (requests.RequestException, ValueError):
        previous = {}

    if args.skip_unchanged and previous.get("stamp") == export["stamp"]:
        print(f"catalog unchanged ({export['stamp'][:12]}), nothing to publish")
        github_output(changed="false")
        return

    for path, text in export["documents"].items():
        write(args.out, path, text)

    old = previous.get("items", {})
    jobs = []
    for base, item in items.items():
        same = old.get(base, {}).get("version") == item["version"]
        jobs += [(f"{base}/{name}", same) for name in item["files"]]

    counts = {"pages": 0, "api": 0}

    def fetch(job):
        path, same = job
        if same:
            # Unchanged version: identical bytes are already on Pages
            r = session.get(path_url(args.pages, path), timeout=120)
            if r.ok:
                write_file(args.out, path, r.content)
                counts["pages"] += 1
                return
        r = session.get(path_url(api, path), headers=api_headers, timeout=120)
        r.raise_for_status()
        write_file(args.out, path, r.content)
        counts["api"] += 1

    errors = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        for job, future in [(job, pool.submit(fetch, job)) for job in jobs]:
            try:
                future.result()
            except Exception as e:
                errors.append(f"{job[0]}: {e}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(f"{len(errors)} file(s) failed, mirror not written completely")

    # The website's own files, from the same documents
    for folder in DIRS:
        for entry in listing(export["documents"], folder):
            doc = json.loads(export["documents"].get(f"{folder}/{entry['path']}/index.json", "{}"))
            write(args.out, f"{folder}/{entry['path']}/index.html", share_page(args.site, folder, entry, doc))
    write(args.out, "feed.xml", atom_feed(args.site, export["documents"]))
    news = announcements(args.site, export["documents"], items, old)
    if args.announce_out:
        write(os.path.dirname(os.path.abspath(args.announce_out)), os.path.basename(args.announce_out),
              json.dumps(news, ensure_ascii=False, indent=2))

    write(args.out, STATE_FILE, json.dumps({
        "stamp": export["stamp"],
        "items": {base: {"version": item["version"]} for base, item in items.items()},
    }, indent=2))
    print(f"{len(items)} items, {len(export['documents'])} documents from 1 API request; "
          f"files: {counts['pages']} reused from Pages, {counts['api']} from the API; "
          f"{len(news)} new or updated item(s) to announce")
    # One line of JSON: names and descriptions cannot break the output format
    github_output(changed="true", announce=json.dumps(news, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
