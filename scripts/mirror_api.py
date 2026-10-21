#!/usr/bin/env python3
"""Copy the catalog from lilka-catalog-api into a static tree for GitHub Pages.

Keira's lilcatalog reads https://catalog.lilka.dev/{apps,wallpapers}/... as
plain files, and firmware already in people's hands cannot change that URL.
The API serves the exact same layout under /catalog, so the mirror is a file
for file copy of it:

    {apps,wallpapers,mods}/index_<page>.json
    <dir>/<id>/index.json, index_short.json, package.zip, static/<file>
    authors.json

Every request to the API counts against the Worker's daily limit, so the copy
is cheap:

- all JSON documents come from one request, /catalog/export.json;
- with --skip-unchanged the run stops there when the export's stamp is the one
  the live mirror was built from (mirror-state.json on Pages);
- files of items whose version did not change are copied from the live Pages
  site, not from the API. Versions never change after approval, so this is
  the same bytes.

Any failed download fails the whole run, so Pages never gets a half catalog.

Usage:
    python3 scripts/mirror_api.py --api https://...workers.dev --out build [--skip-unchanged]
"""

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

import requests

STATE_FILE = "mirror-state.json"


def path_url(base, path):
    # Names like `bmp280%2Bbme280_lilka.lua` must reach the server literally
    return base.rstrip("/") + "/" + "/".join(quote(part, safe="") for part in path.split("/"))


def write(out, path, data):
    target = os.path.join(out, *path.split("/"))
    os.makedirs(os.path.dirname(target), exist_ok=True)
    mode = "w" if isinstance(data, str) else "wb"
    with open(target, mode, **({"encoding": "utf-8"} if mode == "w" else {})) as f:
        f.write(data)


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
    parser.add_argument("--skip-unchanged", action="store_true",
                        help="do nothing when the catalog is the one already published")
    args = parser.parse_args()

    api = args.api.rstrip("/") + "/catalog"
    session = requests.Session()

    response = session.get(f"{api}/export.json", timeout=120)
    response.raise_for_status()
    export = response.json()
    items = export["items"]
    # An empty API (wrong address, broken import) must not wipe the catalog
    # that devices see; keep the last deployed mirror instead
    if not items:
        sys.exit("the API has no published apps; refusing to publish an empty mirror")

    previous = {}
    try:
        live = session.get(f"{args.pages.rstrip('/')}/{STATE_FILE}", timeout=30)
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
                write(args.out, path, r.content)
                counts["pages"] += 1
                return
        r = session.get(path_url(api, path), timeout=120)
        r.raise_for_status()
        write(args.out, path, r.content)
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

    write(args.out, STATE_FILE, json.dumps({
        "stamp": export["stamp"],
        "items": {base: {"version": item["version"]} for base, item in items.items()},
    }, indent=2))
    print(f"{len(items)} items, {len(export['documents'])} documents from 1 API request; "
          f"files: {counts['pages']} reused from Pages, {counts['api']} from the API")
    github_output(changed="true")


if __name__ == "__main__":
    main()
