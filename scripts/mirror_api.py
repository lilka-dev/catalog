#!/usr/bin/env python3
"""Copy the catalog from lilka-catalog-api into a static tree for GitHub Pages.

Keira's lilcatalog reads https://catalog.lilka.dev/{apps,wallpapers}/... as
plain files, and firmware already in people's hands cannot change that URL.
The API serves the exact same layout under /catalog, so the mirror is a file
for file copy of it:

    {apps,wallpapers,mods}/index_<page>.json
    <dir>/<id>/index.json, index_short.json, package.zip, static/<file>
    authors.json

Any failed download fails the whole run, so Pages never gets a half catalog.

Usage:
    python3 scripts/mirror_api.py --api https://lilka-catalog-api....workers.dev --out build
"""

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

import requests

DIRS = ("apps", "wallpapers", "mods")


class Mirror:
    def __init__(self, api, out):
        self.base = api.rstrip("/") + "/catalog"
        self.out = out
        self.session = requests.Session()
        self.files = 0

    def url(self, *parts):
        # Names like `bmp280%2Bbme280_lilka.lua` must reach the API literally
        return "/".join([self.base] + [quote(p, safe="") for p in parts])

    def fetch(self, *parts, optional=False):
        response = self.session.get(self.url(*parts), timeout=120)
        if optional and response.status_code == 404:
            return None
        response.raise_for_status()
        path = os.path.join(self.out, *parts)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(response.content)
        self.files += 1
        return response.content

    def item(self, dirname, item_id):
        doc = json.loads(self.fetch(dirname, item_id, "index.json"))
        if dirname != "mods":
            self.fetch(dirname, item_id, "index_short.json")
        static = set()
        if doc.get("entryfile"):
            static.add(doc["entryfile"]["location"])
        for key in ("files", "modfiles"):
            for f in doc.get(key) or []:
                static.add(f["location"])
        for key in ("icon", "icon_min"):
            if doc.get(key):
                static.add(doc[key])
        static.update(doc.get("screenshots") or [])
        for name in sorted(static):
            self.fetch(dirname, item_id, "static", name)
        if doc.get("package"):
            self.fetch(dirname, item_id, doc["package"])

    def run(self):
        jobs = []
        for dirname in DIRS:
            first = self.fetch(dirname, "index_0.json", optional=True)
            if first is None:
                continue
            index = json.loads(first)
            ids = list(index["manifests"])
            for page in range(1, index["total_pages"]):
                ids += json.loads(self.fetch(dirname, f"index_{page}.json"))["manifests"]
            print(f"{dirname}: {len(ids)}")
            jobs += [(dirname, item_id) for item_id in ids]
        # An empty API (import not run yet, wrong address) must not wipe the
        # catalog that devices see; keep the last deployed mirror instead
        if not jobs:
            sys.exit("the API has no published apps; refusing to publish an empty mirror")
        self.fetch("authors.json")

        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {pool.submit(self.item, d, i): f"{d}/{i}" for d, i in jobs}
            errors = []
            for future, name in futures.items():
                try:
                    future.result()
                except Exception as e:
                    errors.append(f"{name}: {e}")
        if errors:
            print("\n".join(errors), file=sys.stderr)
            sys.exit(f"{len(errors)} item(s) failed, mirror not written completely")
        print(f"{self.files} files mirrored")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api", default=os.environ.get("API_URL"), required=not os.environ.get("API_URL"))
    parser.add_argument("--out", default="build")
    args = parser.parse_args()
    Mirror(args.api, args.out).run()


if __name__ == "__main__":
    main()
