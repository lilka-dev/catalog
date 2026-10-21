#!/usr/bin/env python3
"""Process uploaded versions: ClamAV scan, images, icon_min, package.zip.

For every version waiting in `pending_scan` this downloads its files from the
API, scans them, and when they are clean generates what the catalog serves next
to them, then reports back:

- screenshots shrunk to 1920x1080 and the icon to 512x512 (as build.py did)
- `<icon>_min.bin`: the icon as 64x64 RGB565, which Keira's lilcatalog draws
- `package.zip`: manifest.yml + entry and extra files, the website's download
- the security record: size, SHA-256, MD5 and ClamAV verdict per download

The image and icon code is build.py's from the old catalog repo, unchanged, so
devices and the website get exactly the files they got before.

Usage:
    API_URL=... SCAN_SECRET=... python3 scripts/process.py [version_id ...]
"""

import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime

import requests
import yaml
from PIL import Image

MAX_IMAGE_WIDTH = 1920
MAX_IMAGE_HEIGHT = 1080
MAX_ICON_SIZE = 512
MIN_ICON_SIZE = 64  # For ESP32-S3 display
JPEG_QUALITY = 85

CLAMDSCAN = shutil.which("clamdscan")
CLAMSCAN = shutil.which("clamscan")


def log(message):
    print(message, flush=True)


# ---------------------------------------------------------------- images ----
# Copied from the catalog's build.py.

def _flatten_to_rgb(img):
    """Convert an image with alpha/palette to RGB on a white background."""
    if img.mode in ('RGBA', 'LA', 'P'):
        if img.mode == 'P':
            img = img.convert('RGBA')
        background = Image.new('RGB', img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[-1])
        return background
    if img.mode != 'RGB':
        return img.convert('RGB')
    return img


def generate_min_icon(icon_path, output_path):
    """Generate 64x64 minimized icon for ESP32-S3 in RGB565 binary format"""
    with Image.open(icon_path) as img:
        img = _flatten_to_rgb(img)
        img_resized = img.resize((MIN_ICON_SIZE, MIN_ICON_SIZE), Image.Resampling.LANCZOS)
        pixels = img_resized.load()
        rgb565_data = bytearray()
        for y in range(MIN_ICON_SIZE):
            for x in range(MIN_ICON_SIZE):
                r, g, b = pixels[x, y]
                r5 = (r >> 3) & 0x1F
                g6 = (g >> 2) & 0x3F
                b5 = (b >> 3) & 0x1F
                rgb565 = (r5 << 11) | (g6 << 5) | b5
                # Little-endian 16-bit, as Keira reads it
                rgb565_data.append(rgb565 & 0xFF)
                rgb565_data.append((rgb565 >> 8) & 0xFF)
        with open(output_path, 'wb') as f:
            f.write(rgb565_data)


def compress_image(image_path, max_width=MAX_IMAGE_WIDTH, max_height=MAX_IMAGE_HEIGHT, quality=JPEG_QUALITY):
    """Compress and resize image if it's too large"""
    try:
        with Image.open(image_path) as img:
            original_size = os.path.getsize(image_path)
            width, height = img.size
            needs_resize = width > max_width or height > max_height

            if needs_resize:
                img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
            elif original_size <= 500 * 1024:  # Small enough: leave as is
                return

            if image_path.lower().endswith('.png'):
                img.save(image_path, 'PNG', optimize=True)
            else:
                _flatten_to_rgb(img).save(image_path, 'JPEG', quality=quality, optimize=True)
    except Exception as e:
        log(f"  could not compress {os.path.basename(image_path)}: {e}")


# -------------------------------------------------------------- security ----

def file_hashes(path):
    sha256, md5 = hashlib.sha256(), hashlib.md5()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            sha256.update(chunk)
            md5.update(chunk)
    return sha256.hexdigest(), md5.hexdigest()


def clam(path):
    """Returns {'status': clean|infected|error, 'detail': ...}, like build.py's scan_file_clamav."""
    scanners = [s for s in (CLAMDSCAN, CLAMSCAN) if s]
    if not scanners:
        return {"status": "error", "detail": "ClamAV not installed"}
    for scanner in scanners:
        args = [scanner, '--no-summary', '--infected']
        # The daemon runs as another user: hand it the open file instead of a path
        if scanner == CLAMDSCAN:
            args.append('--fdpass')
        try:
            result = subprocess.run(args + [path], capture_output=True, text=True, timeout=300)
        except subprocess.TimeoutExpired:
            return {"status": "error", "detail": "Scan timed out"}
        if result.returncode == 0:
            return {"status": "clean", "detail": "No threats detected"}
        if result.returncode == 1:
            return {"status": "infected", "detail": result.stdout.strip() or "Threat detected"}
        # 2 from clamdscan: daemon unreachable — try clamscan
    return {"status": "error", "detail": (result.stderr or result.stdout).strip()[:200]}


# --------------------------------------------------------------- package ----

def package_manifest(info):
    """manifest.yml inside package.zip, in the repo's manifest format with local file names."""
    app, version = info["app"], info["version"]
    manifest = {
        "name": app["name"],
        "short_description": app["short_description"],
    }
    if app["description"]:
        manifest["description"] = app["description"]
    if version["changelog"]:
        manifest["changelog"] = version["changelog"]
    manifest["author"] = app["author"]
    if app.get("license"):
        manifest["license"] = app["license"]
    if version.get("keira_version"):
        manifest["keira_version"] = version["keira_version"]
    manifest["sources"] = app["sources"]
    manifest["version"] = version["version"]
    if version.get("entry"):
        manifest["entryfile"] = {"type": version["entry_type"], "location": version["entry"]}
    key = "modfiles" if app["kind"] == "mod" else "files"
    if version["files"]:
        manifest[key] = [{"location": name} for name in version["files"]]
    if version.get("icon"):
        manifest["icon"] = version["icon"]
    if version["screenshots"]:
        manifest["screenshots"] = version["screenshots"]
    return yaml.safe_dump(manifest, allow_unicode=True, sort_keys=False)


# --------------------------------------------------------------- process ----

def process(session, api, version_id, prefix=""):
    info = session.get(f"{api}/scan/versions/{version_id}", timeout=60)
    info.raise_for_status()
    info = info.json()
    app, version = info["app"], info["version"]
    log(f"{prefix} {app['dir']}/{app['slug']} {version['version']}")
    if info["status"] != "pending_scan":
        log(f"  already {info['status']}, skipped")
        return

    work = tempfile.mkdtemp()
    try:
        paths = {}
        for f in info["files"]:
            path = os.path.join(work, f["name"])
            with session.get(f["url"], stream=True, timeout=120) as response:
                response.raise_for_status()
                with open(path, "wb") as out:
                    for chunk in response.iter_content(65536):
                        out.write(chunk)
            paths[f["name"]] = path

        # Everything is scanned, images included; archives are unpacked by ClamAV itself
        verdicts = {name: clam(path) for name, path in paths.items()}
        infected = {name: v for name, v in verdicts.items() if v["status"] == "infected"}
        errors = {name: v for name, v in verdicts.items() if v["status"] == "error"}
        if infected:
            detail = "\n".join(f"{name}: {v['detail']}" for name, v in infected.items())
            log(f"  INFECTED\n{detail}")
            report(session, api, version_id, {"result": "infected", "detail": detail}, [])
            return
        if errors:
            # Leave it pending: the next run retries instead of passing unscanned files
            log(f"  scan failed, will retry: {errors}")
            return

        before = {name: open(path, "rb").read() for name, path in paths.items()}
        # Same order as build.py: screenshots first, then the icon copied again
        # from the original and shrunk on its own, so a file used as both ends
        # up as the icon, and icon_min matches what build.py made bit for bit
        for name in version["screenshots"]:
            compress_image(paths[name], MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT)
        artifacts = []
        icon_min = None
        if version.get("icon"):
            icon_path = paths[version["icon"]]
            with open(icon_path, "wb") as f:
                f.write(before[version["icon"]])
            compress_image(icon_path, MAX_ICON_SIZE, MAX_ICON_SIZE)
            icon_min = f"{os.path.splitext(version['icon'])[0]}_min.bin"
            try:
                generate_min_icon(icon_path, os.path.join(work, icon_min))
                artifacts.append(icon_min)
            except Exception as e:
                log(f"  could not make icon_min: {e}")
                icon_min = None
        artifacts += [name for name, path in paths.items() if open(path, "rb").read() != before[name]]

        # package.zip only when there is something to install, as in build.py
        downloads = ([version["entry"]] if version.get("entry") else []) + version["files"]
        package = None
        if downloads:
            package = "package.zip"
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as z:
                z.writestr("manifest.yml", package_manifest(info))
                for name in downloads:
                    z.write(paths[name], arcname=name)
            with open(os.path.join(work, package), "wb") as f:
                f.write(buffer.getvalue())
            artifacts.append(package)
            verdicts[package] = clam(os.path.join(work, package))

        security = {"scan_date": datetime.now().isoformat(), "clamav_available": True, "files": []}
        for name in downloads + ([package] if package else []):
            path = os.path.join(work, name)
            sha256, md5 = file_hashes(path)
            security["files"].append({
                "file": name,
                "size": os.path.getsize(path),
                "sha256": sha256,
                "md5": md5,
                "av_scan": verdicts[name],
            })

        report(session, api, version_id, {
            "result": "clean",
            "detail": "ClamAV: " + (subprocess.run([CLAMSCAN or CLAMDSCAN, "--version"], capture_output=True, text=True).stdout.strip()),
            "security": json.dumps(security),
            "icon_min": icon_min or "",
            "package": package or "",
        }, [(name, os.path.join(work, name)) for name in artifacts])
    finally:
        shutil.rmtree(work, ignore_errors=True)


def report(session, api, version_id, fields, files):
    handles = [("artifact", (name, open(path, "rb"))) for name, path in files]
    try:
        response = session.post(f"{api}/scan/versions/{version_id}", data=fields, files=handles or None, timeout=300)
    finally:
        for _, (_, handle) in handles:
            handle.close()
    if not response.ok:
        raise RuntimeError(f"report failed: {response.status_code} {response.text}")
    log(f"  -> {response.json().get('status')}")


def main():
    api = os.environ.get("API_URL", "").rstrip("/")
    secret = os.environ.get("SCAN_SECRET", "")
    missing = [name for name, value in (("API_URL", api), ("SCAN_SECRET", secret)) if not value]
    if missing:
        # In Actions: Settings -> Secrets and variables -> Actions; SCAN_SECRET
        # must be a repository *secret* with the same value as the Worker's
        sys.exit(f"missing {', '.join(missing)}")
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {secret}"

    ids = [int(a) for a in sys.argv[1:]]
    if not ids:
        response = session.get(f"{api}/scan/pending", timeout=60)
        response.raise_for_status()
        ids = response.json()["ids"]
    # One line per item; the internal version id only shows up on failures
    log(f"{len(ids)} item(s) to process")

    failed = 0
    for number, version_id in enumerate(ids, 1):
        try:
            process(session, api, version_id, f"[{number}/{len(ids)}]")
        except Exception as e:
            failed += 1
            log(f"[{number}/{len(ids)}] version id {version_id}: failed: {e}")
    if failed:
        sys.exit(f"{failed} item(s) failed")


if __name__ == "__main__":
    main()
