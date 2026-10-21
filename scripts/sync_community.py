#!/usr/bin/env python3
"""Pull community apps from lilka-catalog-api into apps/ and wallpapers/.

Each published app becomes a regular catalog folder with a manifest.yml, so
build.py treats it exactly like an app from this repo: it downloads the entry
file, scans it with ClamAV and packs package.zip.

The icon and screenshots are downloaded next to the manifest instead of being
left as URLs: build.py names icon_min after the icon path, and with a URL that
name would contain the whole address.

A folder created by this script carries a `.community` marker. Folders without
it belong to the repo and are never overwritten; a community app that collides
with one is skipped with a warning.

Usage:
    python3 scripts/sync_community.py --api https://lilka-catalog-api.<account>.workers.dev
"""

import argparse
import os
import shutil
import sys

import requests
import yaml

MARKER = ".community"
KIND_DIRS = {"app": "apps", "wallpaper": "wallpapers"}


def fetch_image(url: str, dest_dir: str) -> str:
    name = url.split("/")[-1]
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    with open(os.path.join(dest_dir, name), "wb") as f:
        f.write(response.content)
    return name


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api", default=os.environ.get("COMMUNITY_API_URL"), help="API base URL")
    args = parser.parse_args()
    if not args.api:
        print("No API URL given (--api or COMMUNITY_API_URL), skipping community apps")
        return 0

    response = requests.get(args.api.rstrip("/") + "/export/manifests", timeout=60)
    response.raise_for_status()
    items = response.json()["items"]

    wanted = set()
    for item in items:
        root = KIND_DIRS.get(item["kind"])
        if not root:
            print(f"! {item['dir']}: unknown kind {item['kind']}, skipped")
            continue
        folder = os.path.join(root, item["dir"])
        if os.path.isdir(folder) and not os.path.exists(os.path.join(folder, MARKER)):
            print(f"! {folder}: a repo app already uses this name, community app skipped")
            continue

        if os.path.isdir(folder):
            shutil.rmtree(folder)
        os.makedirs(folder)
        manifest = item["manifest"]
        try:
            if manifest.get("icon"):
                manifest["icon"] = fetch_image(manifest["icon"], folder)
            manifest["screenshots"] = [fetch_image(url, folder) for url in manifest.get("screenshots", [])]
        except requests.RequestException as e:
            print(f"! {folder}: could not download images ({e}), skipped")
            shutil.rmtree(folder)
            continue

        with open(os.path.join(folder, "manifest.yml"), "w", encoding="utf-8") as f:
            yaml.safe_dump(manifest, f, allow_unicode=True, sort_keys=False)
        with open(os.path.join(folder, MARKER), "w") as f:
            f.write(f"{manifest.get('community', {}).get('version', '')}\n")
        wanted.add(folder)
        print(f"+ {folder}")

    # Apps that were hidden or banned since the last sync
    for root in KIND_DIRS.values():
        if not os.path.isdir(root):
            continue
        for name in os.listdir(root):
            folder = os.path.join(root, name)
            if os.path.exists(os.path.join(folder, MARKER)) and folder not in wanted:
                shutil.rmtree(folder)
                print(f"- {folder}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
