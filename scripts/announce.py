#!/usr/bin/env python3
"""Post new and updated catalog items to a Discord channel.

scripts/mirror_api.py works out which items are new on the mirror or have a
new version, and the deploy workflow hands that list over in the ANNOUNCE
environment variable once the new mirror is live. This posts one message with
an embed per item (Discord allows 10) to the webhook in DISCORD_WEBHOOK_URL.

Nothing is posted without a webhook or without items, so the workflow can run
it every time. Only the standard library: the job installs nothing.

Usage:
    ANNOUNCE='[...]' DISCORD_WEBHOOK_URL=... python3 scripts/announce.py
    python3 scripts/announce.py announce.json --dry-run    # print the message
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

MAX_EMBEDS = 10
# Ukrainian, like the community's Discord
LABELS = {
    "apps": ("Новий застосунок", "Оновлення застосунку"),
    "wallpapers": ("Нові шпалери", "Оновлення шпалер"),
    "mods": ("Новий мод", "Оновлення мода"),
}
COLORS = {"new": 0x2F7BFF, "updated": 0xFFD500}


def embed(item):
    new = item.get("status") == "new"
    label = LABELS.get(item.get("kind"), ("Нове в каталозі", "Оновлення в каталозі"))[0 if new else 1]
    title = item.get("name") or "?"
    if item.get("version"):
        title += f" {item['version']}"
    result = {
        "author": {"name": label},
        "title": title[:256],
        "url": item.get("url"),
        "description": (item.get("summary") or "")[:1000],
        "color": COLORS["new" if new else "updated"],
    }
    if item.get("author"):
        result["footer"] = {"text": item["author"][:200]}
    if item.get("icon"):
        result["thumbnail"] = {"url": item["icon"]}
    return result


def message(items, site):
    shown = items[:MAX_EMBEDS]
    body = {
        "username": "Lilka Catalog",
        "embeds": [embed(item) for item in shown],
        # Names and descriptions are written by authors: no @everyone or role pings
        "allowed_mentions": {"parse": []},
    }
    if len(items) > len(shown):
        body["content"] = f"…і ще {len(items) - len(shown)} в каталозі: {site}"
    return body


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("file", nargs="?", help="JSON list from mirror_api.py --announce-out (default: $ANNOUNCE)")
    parser.add_argument("--site", default=os.environ.get("SITE_URL", "https://catalog.lilka.dev"))
    parser.add_argument("--dry-run", action="store_true", help="print the message instead of posting it")
    args = parser.parse_args()

    if args.file:
        with open(args.file, encoding="utf-8") as f:
            raw = f.read()
    else:
        raw = os.environ.get("ANNOUNCE", "")
    items = json.loads(raw) if raw.strip() else []
    if not items:
        print("nothing new to announce")
        return

    body = message(items, args.site.rstrip("/") + "/")
    if args.dry_run:
        print(json.dumps(body, ensure_ascii=False, indent=2))
        return
    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if not webhook:
        print(f"{len(items)} item(s) to announce, but DISCORD_WEBHOOK_URL is not set")
        return

    request = urllib.request.Request(
        webhook,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "lilka-catalog-announce"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            print(f"announced {len(body['embeds'])} of {len(items)} item(s): HTTP {response.status}")
    except urllib.error.HTTPError as e:
        # The webhook address is a secret: never print it
        sys.exit(f"Discord refused the message: HTTP {e.code} {e.read()[:300]!r}")
    except urllib.error.URLError as e:
        sys.exit(f"could not reach Discord: {e.reason}")


if __name__ == "__main__":
    main()
