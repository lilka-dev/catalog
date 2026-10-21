#!/usr/bin/env python3
"""One-time import of the old catalog repo (apps/, wallpapers/, mods/) into the API.

Each folder becomes an app owned by the `lilka-catalog` account, under the same
folder name (Keira caches entries by it) and the same author line. Manifests
are read with build.py's rules: localized maps, `@DESCRIPTION.md` references
with `.uk.md`/`.en.md` siblings, local paths or URLs for every file. Folders
that build.py skipped (empty manifest, missing required field) are skipped
here too.

Imports skip the moderator: after a clean scan by the processing workflow
they are published on their own.

Usage:
    python3 scripts/import_catalog.py ../catalog --api https://... --token <moderator session token>
    options: --only NAME ... | --replace (re-import, overwriting earlier imports) | --dry-run

The token is the `lilka-token` value from the catalog site's localStorage
after signing in as a moderator.
"""

import argparse
import json
import os
import re
import sys

import requests
import yaml

KINDS = {"apps": "app", "wallpapers": "wallpaper", "mods": "mod"}
LANGUAGES = ["uk", "en"]
DEFAULT_LANGUAGE = "uk"


def read_text(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def resolve_markdown(folder, ref):
    """`@DESCRIPTION.md` -> {uk: DESCRIPTION.uk.md, en: DESCRIPTION.en.md}, base file as uk fallback."""
    root, ext = os.path.splitext(ref)
    result = {}
    for lang in LANGUAGES:
        candidate = os.path.join(folder, f"{root}.{lang}{ext}")
        if os.path.exists(candidate):
            result[lang] = read_text(candidate)
    base = os.path.join(folder, ref)
    if os.path.exists(base):
        result.setdefault(DEFAULT_LANGUAGE, read_text(base))
    return result


def resolve_text(folder, value):
    """build.py's resolve_localized_text."""
    if value is None:
        return {}
    if isinstance(value, dict):
        result = {}
        for lang, text in value.items():
            if lang not in LANGUAGES or text is None:
                continue
            if isinstance(text, str) and text.startswith("@"):
                path = os.path.join(folder, text[1:])
                if os.path.exists(path):
                    result[lang] = read_text(path)
            else:
                result[lang] = str(text)
        return result
    if isinstance(value, str):
        return resolve_markdown(folder, value[1:]) if value.startswith("@") else {DEFAULT_LANGUAGE: value}
    return {DEFAULT_LANGUAGE: str(value)}


def origin_of(location):
    return location.get("origin") if isinstance(location, dict) else location


# Manifests that link into the catalog repo itself; those files left `main`
# with this import, so they are read from the checkout being imported
SELF_URL = re.compile(r"^https://raw\.githubusercontent\.com/lilka-dev/catalog/(?:refs/heads/)?[^/]+/(.+)$")


def load_file(folder, location, root=None):
    """(name, bytes) from a URL or a path next to the manifest; the name is the
    last URL segment exactly as build.py's download_file saved it."""
    own = SELF_URL.match(location) if root else None
    if own and os.path.isfile(os.path.join(root, own.group(1))):
        with open(os.path.join(root, own.group(1)), "rb") as f:
            return location.split("/")[-1], f.read()
    if location.startswith(("http://", "https://")):
        response = requests.get(location, timeout=120)
        response.raise_for_status()
        return location.split("/")[-1], response.content
    with open(os.path.join(folder, location), "rb") as f:
        return os.path.basename(location), f.read()


def build_item(root, dirname, name):
    folder = os.path.join(root, dirname, name)
    kind = KINDS[dirname]
    path = os.path.join(folder, "manifest.yml")
    if not os.path.isfile(path):
        return None, "no manifest.yml"
    with open(path, "r", encoding="utf-8") as f:
        manifest = yaml.safe_load(f)
    if not isinstance(manifest, dict):
        return None, "manifest is empty or commented out"

    for field in ("name", "short_description", "author", "sources"):
        if field not in manifest:
            return None, f"missing {field}"
    if kind != "mod" and "keira_version" not in manifest:
        return None, "missing keira_version"
    sources = manifest["sources"]
    if not isinstance(sources, dict) or "type" not in sources or not origin_of(sources.get("location")):
        return None, "bad sources"

    meta = {
        "slug": name,
        "kind": kind,
        "author": str(manifest["author"]),
        "name": resolve_text(folder, manifest["name"]),
        "short_description": resolve_text(folder, manifest["short_description"]),
        "description": resolve_text(folder, manifest.get("description")),
        "changelog": resolve_text(folder, manifest.get("changelog")),
        "sources": {"type": sources["type"], "origin": origin_of(sources["location"])},
        "license": manifest.get("license"),
    }
    fields = {
        "version": str(manifest.get("version") or "1.0.0"),
        "meta": json.dumps(meta, ensure_ascii=False),
    }
    files = []

    if kind != "mod":
        fields["keira_version"] = str(manifest["keira_version"])
        entry = manifest.get("entryfile") or manifest.get("executionfile")
        if not entry or not origin_of(entry.get("location")):
            return None, "no entry file"
        fields["entry_type"] = entry.get("type", "")
        files.append(("entry", load_file(folder, origin_of(entry["location"]), root)))
        extra = manifest.get("files") or []
    else:
        extra = manifest.get("modfiles") or []
    described = []
    for item in extra:
        location = origin_of(item.get("location")) if isinstance(item, dict) else None
        if location:
            fname, data = load_file(folder, location, root)
            files.append(("files", (fname, data)))
            # build.py replaced `location` in place, keeping `type`/`description` and their order
            described.append({k: (fname if k == "location" else v) for k, v in item.items()})
    meta["files"] = described
    fields["meta"] = json.dumps(meta, ensure_ascii=False)

    # Missing images were only a warning in build.py; keep the app without them
    if manifest.get("icon"):
        try:
            files.append(("icon", load_file(folder, manifest["icon"])))
        except (OSError, requests.RequestException) as e:
            print(f"    icon skipped: {e}")
    for shot in manifest.get("screenshots") or []:
        try:
            files.append(("screenshots", load_file(folder, shot)))
        except (OSError, requests.RequestException) as e:
            print(f"    screenshot {shot} skipped: {e}")
    return (fields, files), None


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("catalog", help="path to the catalog repo checkout")
    parser.add_argument("--api", default=os.environ.get("API_URL"), required=not os.environ.get("API_URL"))
    parser.add_argument("--token", default=os.environ.get("LILKA_TOKEN"))
    parser.add_argument("--only", nargs="*", help="folder names to import")
    parser.add_argument("--replace", action="store_true", help="overwrite apps imported earlier")
    parser.add_argument("--dry-run", action="store_true", help="read everything, send nothing")
    args = parser.parse_args()
    if not args.token and not args.dry_run:
        sys.exit("--token (or LILKA_TOKEN) is required")

    url = args.api.rstrip("/") + "/mod/import" + ("?replace" if args.replace else "")
    done, skipped, failed = 0, [], []
    for dirname in KINDS:
        base = os.path.join(args.catalog, dirname)
        if not os.path.isdir(base):
            continue
        for name in sorted(os.listdir(base)):
            if not os.path.isdir(os.path.join(base, name)) or (args.only and name not in args.only):
                continue
            print(f"{dirname}/{name}")
            try:
                item, reason = build_item(args.catalog, dirname, name)
            except (OSError, requests.RequestException, yaml.YAMLError) as e:
                item, reason = None, f"could not read: {e}"
            if not item:
                print(f"    skipped: {reason}")
                skipped.append(f"{dirname}/{name}: {reason}")
                continue
            fields, files = item
            if args.dry_run:
                print(f"    ok: {len(files)} file(s)")
                done += 1
                continue
            response = requests.post(
                url,
                headers={"Authorization": f"Bearer {args.token}"},
                data=fields,
                files=[(role, (fname, data)) for role, (fname, data) in files],
                timeout=300,
            )
            if response.ok:
                print(f"    imported as version {response.json()['version_id']}")
                done += 1
            else:
                print(f"    FAILED {response.status_code}: {response.text}")
                failed.append(f"{dirname}/{name}: {response.text}")

    print(f"\n{done} imported, {len(skipped)} skipped, {len(failed)} failed")
    for line in skipped:
        print(f"  skipped {line}")
    for line in failed:
        print(f"  failed  {line}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
