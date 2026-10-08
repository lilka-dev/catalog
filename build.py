
import os
import yaml
import requests
import argparse
import json
import zipfile
import hashlib
import subprocess
import shutil
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import time
from datetime import datetime

args = argparse.ArgumentParser(description="Builds the keira app, wallpaper and mod files")
args.add_argument("--build", help="Build json files for mods and apps", action='store_true', default=False)
args.add_argument("--shortjson", help="Build short json files for mods and apps", action='store_true', default=False)
args.add_argument("--workers", help="Number of parallel workers", type=int, default=8)
args.add_argument("--verbose", "-v", help="Verbose output", action='store_true', default=False)
args.add_argument("--antivirus", help="Enable local ClamAV antivirus scanning for downloadable files", action='store_true', default=False)
args = args.parse_args()

# ============================================================================
# Check if ClamAV is available locally (prefer clamdscan daemon for speed)
# ============================================================================
CLAMDSCAN_AVAILABLE = shutil.which('clamdscan') is not None
CLAMSCAN_AVAILABLE = shutil.which('clamscan') is not None
CLAMAV_AVAILABLE = CLAMDSCAN_AVAILABLE or CLAMSCAN_AVAILABLE

# ============================================================================
# Progress tracking and logging
# ============================================================================

class ProgressTracker:
    """Thread-safe per-item result tracker that prints a final summary."""

    def __init__(self, title: str, total: int, item_type: str = "item"):
        self.title = title
        self.total = total
        self.item_type = item_type
        self.lock = threading.Lock()
        self.successes = 0
        self.warnings_count = 0
        self.errors_count = 0
        self.issues = []  # (icon, name, message)
        self.start_time = time.time()

    def success(self, name: str, message: str = "Done"):
        with self.lock:
            self.successes += 1

    def warn(self, name: str, message: str = "Completed with warnings"):
        with self.lock:
            self.warnings_count += 1
            self.issues.append(('⚠️ ', name, message))

    def error(self, name: str, message: str = "Failed"):
        with self.lock:
            self.errors_count += 1
            self.issues.append(('❌', name, message))

    def final_summary(self):
        elapsed = time.time() - self.start_time
        print(f"\n{'═' * 60}")
        print(f"📊 {self.title} - COMPLETED")
        print(f"{'─' * 60}")
        print(f"  ⏱️  Total time: {elapsed:.2f}s")
        print(f"  📦 Total {self.item_type}s: {self.total}")
        print(f"  ✅ Successful: {self.successes}")
        print(f"  ⚠️  With warnings: {self.warnings_count}")
        print(f"  ❌ Failed: {self.errors_count}")
        if self.issues:
            print(f"\n{'─' * 60}")
            print("Issues:")
            for icon, name, msg in self.issues:
                print(f"  {icon} {name}: {msg}")
        print(f"{'═' * 60}\n")


class SimpleLogger:
    """Minimal thread-safe colored logger."""

    RESET = '\033[0m'
    LEVELS = {
        'debug': ('🔍', '\033[90m'),
        'info': ('ℹ️ ', '\033[94m'),
        'success': ('✅', '\033[92m'),
        'warning': ('⚠️ ', '\033[93m'),
        'error': ('❌', '\033[91m'),
    }

    def __init__(self, verbose=False):
        self.verbose = verbose
        self.lock = threading.Lock()

    def _log(self, level: str, message: str, context: str = None):
        if level == 'debug' and not self.verbose:
            return
        icon, color = self.LEVELS[level]
        prefix = f"[{context}] " if context else ""
        with self.lock:
            print(f"{color}{icon} {prefix}{message}{self.RESET}", flush=True)

    def debug(self, msg, ctx=None): self._log('debug', msg, ctx)
    def info(self, msg, ctx=None): self._log('info', msg, ctx)
    def success(self, msg, ctx=None): self._log('success', msg, ctx)
    def warning(self, msg, ctx=None): self._log('warning', msg, ctx)
    def error(self, msg, ctx=None): self._log('error', msg, ctx)


# Initialize global logger
logger = SimpleLogger(verbose=args.verbose)

# Global warnings tracker
build_warnings = []
warnings_lock = threading.Lock()

def add_warning(name, warning_type, message, item_type=None):
    """Add a warning to the global warnings list (thread-safe)"""
    warning = {
        "name": name,
        "type": warning_type,
        "message": message
    }
    if item_type:
        warning["item_type"] = item_type
    with warnings_lock:
        build_warnings.append(warning)
    logger.warning(message, name)

# Item types that ship a Keira entryfile (apps and Lua wallpapers)
ENTRYFILE_TYPES = ("app", "wallpaper")

# Maximum dimensions for images (width, height)
MAX_IMAGE_WIDTH = 1920
MAX_IMAGE_HEIGHT = 1080
MAX_ICON_SIZE = 512
MIN_ICON_SIZE = 64  # For ESP32-S3 display
JPEG_QUALITY = 85

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
    try:
        with Image.open(icon_path) as img:
            img = _flatten_to_rgb(img)
            
            # Resize to 64x64
            img_resized = img.resize((MIN_ICON_SIZE, MIN_ICON_SIZE), Image.Resampling.LANCZOS)
            
            # Convert to RGB565 binary format
            pixels = img_resized.load()
            rgb565_data = bytearray()
            
            for y in range(MIN_ICON_SIZE):
                for x in range(MIN_ICON_SIZE):
                    r, g, b = pixels[x, y]
                    # Convert RGB888 to RGB565
                    r5 = (r >> 3) & 0x1F
                    g6 = (g >> 2) & 0x3F
                    b5 = (b >> 3) & 0x1F
                    rgb565 = (r5 << 11) | (g6 << 5) | b5
                    # Write as little-endian 16-bit value
                    rgb565_data.append(rgb565 & 0xFF)
                    rgb565_data.append((rgb565 >> 8) & 0xFF)
            
            # Save binary file
            with open(output_path, 'wb') as f:
                f.write(rgb565_data)
            
            logger.debug(f"Generated min icon: {output_path} (64x64 RGB565, {len(rgb565_data)} bytes)")
    except Exception as e:
        logger.warning(f"Could not generate min icon: {e}")

def compress_image(image_path, max_width=MAX_IMAGE_WIDTH, max_height=MAX_IMAGE_HEIGHT, quality=JPEG_QUALITY):
    """Compress and resize image if it's too large"""
    try:
        with Image.open(image_path) as img:
            original_size = os.path.getsize(image_path)
            width, height = img.size
            needs_resize = width > max_width or height > max_height

            if needs_resize:
                logger.debug(f"Resizing image from {width}x{height} to fit {max_width}x{max_height}")
                img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
            elif original_size > 500 * 1024:  # If larger than 500KB, optimize anyway
                logger.debug(f"Optimizing large image ({original_size} bytes)")
            else:
                return

            if image_path.lower().endswith('.png'):
                img.save(image_path, 'PNG', optimize=True)
            else:
                _flatten_to_rgb(img).save(image_path, 'JPEG', quality=quality, optimize=True)

            new_size = os.path.getsize(image_path)
            logger.debug(f"Compressed: {original_size} bytes -> {new_size} bytes ({100 - int(new_size/original_size*100)}% reduction)")
    except Exception as e:
        logger.warning(f"Could not compress image {image_path}: {e}")

# ============================================================================
# Security: SHA-256 / MD5 Checksums & Local ClamAV Scanning
# ============================================================================

def compute_sha256(filepath):
    """Compute SHA-256 hash of a file."""
    sha256 = hashlib.sha256()
    try:
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()
    except Exception as e:
        logger.warning(f"Could not compute SHA-256 for {filepath}: {e}")
        return None


def compute_md5(filepath):
    """Compute MD5 hash of a file."""
    md5 = hashlib.md5()
    try:
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                md5.update(chunk)
        return md5.hexdigest()
    except Exception as e:
        logger.warning(f"Could not compute MD5 for {filepath}: {e}")
        return None


def _run_clam(scanner, filepath):
    """Run a ClamAV scanner binary on a file and interpret its exit code."""
    try:
        result = subprocess.run(
            [scanner, '--no-summary', '--infected', filepath],
            capture_output=True, text=True, timeout=120
        )
    except subprocess.TimeoutExpired:
        return {"status": "error", "detail": "Scan timed out"}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:200]}
    if result.returncode == 0:
        return {"status": "clean", "detail": "No threats detected"}
    if result.returncode == 1:
        return {"status": "infected", "detail": result.stdout.strip() or "Threat detected"}
    return {"status": "error", "detail": result.stderr.strip()[:200],
            "_returncode": result.returncode}


def scan_file_clamav(filepath):
    """Scan a single file with ClamAV. Prefers clamdscan (daemon) for speed,
    falls back to clamscan if the daemon is unavailable.
    Possible statuses: 'clean', 'infected', 'error', 'unavailable'."""
    if not CLAMAV_AVAILABLE:
        return {"status": "unavailable", "detail": "ClamAV not installed"}

    # Prefer clamdscan (daemon client) — avoids reloading the signature DB
    # on every invocation (~30s saved per file).
    if CLAMDSCAN_AVAILABLE:
        result = _run_clam('clamdscan', filepath)
        # clamdscan exits with 2 when the daemon is unreachable — fall back
        if result.pop("_returncode", None) == 2 and CLAMSCAN_AVAILABLE:
            logger.warning("clamd not running, falling back to clamscan")
        else:
            return result

    result = _run_clam('clamscan', filepath)
    result.pop("_returncode", None)
    return result


def generate_security_info(output_dir, manifest, item_type):
    """Generate SHA-256 checksums and optional ClamAV scan results for all
    downloadable files. Returns a security dict to embed in index.json."""
    static_path = os.path.join(output_dir, "static")
    security = {
        "scan_date": datetime.now().isoformat(),
        "clamav_available": CLAMAV_AVAILABLE and args.antivirus,
        "files": []
    }

    # Collect paths of downloadable files
    files_to_check = []

    if item_type in ENTRYFILE_TYPES:
        ef = manifest.get('entryfile') or manifest.get('executionfile')
        if ef and ef.get('location'):
            files_to_check.append(ef['location'])
        for f in manifest.get('files', []):
            loc = f.get('location') if isinstance(f, dict) else None
            if loc:
                files_to_check.append(loc)
    elif item_type == "mod":
        for f in manifest.get('modfiles', []):
            loc = f.get('location') if isinstance(f, dict) else None
            if loc:
                files_to_check.append(loc)

    # Also check the package zip
    package_path = os.path.join(output_dir, "package.zip")
    if os.path.exists(package_path):
        files_to_check.append("__package__")  # sentinel

    for entry in files_to_check:
        if entry == "__package__":
            fpath = package_path
            fname = "package.zip"
        else:
            fname = os.path.basename(entry)
            fpath = os.path.join(static_path, fname)

        if not os.path.exists(fpath):
            continue

        file_info = {
            "file": fname,
            "size": os.path.getsize(fpath),
            "sha256": compute_sha256(fpath),
            "md5": compute_md5(fpath)
        }

        if args.antivirus and CLAMAV_AVAILABLE:
            scan_result = scan_file_clamav(fpath)
            file_info["av_scan"] = scan_result

        security["files"].append(file_info)

    return security


def download_file(path, output_dir) -> str:
    url = path['origin'] if isinstance(path, dict) else path
    filename = url.split('/')[-1]
    output_path = os.path.join(output_dir, filename)

    if args.build:
        logger.debug(f"Downloading {url}")
        response = requests.get(url, stream=True, timeout=60)
        if response.status_code == 404:
            raise FileNotFoundError(f"File not found: {url}")
        response.raise_for_status()
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(8192):
                f.write(chunk)
    else:
        response = requests.head(url, timeout=10)
        if response.status_code == 404:
            raise FileNotFoundError(f"File not found: {url}")

    return filename

def gen_static_folder(manifest, type, output_dir) -> dict:
    static_files_path = output_dir+"/static"

    os.makedirs(static_files_path, exist_ok=True)

    path_to_modapp = type+"s/"+manifest['path']
    
    # Collect all download tasks
    download_tasks = []
    
    # Handle entryfile (main execution file) - new format
    if type in ENTRYFILE_TYPES and manifest.get('entryfile'):
        download_tasks.append(('entryfile', manifest['entryfile']['location'], static_files_path))
    # Handle executionfile (legacy format) - keep for backwards compatibility
    elif type in ENTRYFILE_TYPES and manifest.get('executionfile'):
        download_tasks.append(('executionfile', manifest['executionfile']['location'], static_files_path))
    
    # Handle additional files
    if manifest.get('files'):
        for i, file in enumerate(manifest['files']):
            if file.get('location'):
                download_tasks.append((f'file_{i}', file['location'], static_files_path))
    
    # Handle modfiles for mods
    if type == "mod" and manifest.get('modfiles'):
        for i, file in enumerate(manifest['modfiles']):
            download_tasks.append((f'modfile_{i}', file['location'], static_files_path))
    
    # Execute downloads in parallel
    if download_tasks:
        download_results = {}
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {executor.submit(download_file, task[1], task[2]): task[0] for task in download_tasks}
            for future in as_completed(futures):
                task_id = futures[future]
                try:
                    download_results[task_id] = future.result()
                except Exception as e:
                    logger.warning(f"Failed to download {task_id}: {e}")
        
        # Update manifest with downloaded filenames
        if 'entryfile' in download_results:
            manifest['entryfile']['location'] = download_results['entryfile']
        elif 'executionfile' in download_results:
            manifest['executionfile']['location'] = download_results['executionfile']
        
        if manifest.get('files'):
            for i, file in enumerate(manifest['files']):
                if f'file_{i}' in download_results:
                    file['location'] = download_results[f'file_{i}']
        
        if type == "mod" and manifest.get('modfiles'):
            for i, file in enumerate(manifest['modfiles']):
                if f'modfile_{i}' in download_results:
                    file['location'] = download_results[f'modfile_{i}']

    # Process screenshots in parallel
    def process_screenshot(screenshot):
        try:
            if screenshot.startswith('https://') or screenshot.startswith('http://'):
                download_file(screenshot, static_files_path)
            else:
                source_path = os.path.join(path_to_modapp, screenshot)
                dest_path = os.path.join(static_files_path, screenshot)
                if os.path.exists(source_path):
                    shutil.copy(source_path, dest_path)
                    compress_image(dest_path, MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT)
                else:
                    logger.warning(f"Screenshot not found, skipping: {screenshot}")
        except Exception as e:
            logger.warning(f"Failed to process screenshot {screenshot}: {str(e)}")
    
    if manifest.get('screenshots'):
        with ThreadPoolExecutor(max_workers=4) as executor:
            executor.map(process_screenshot, manifest['screenshots'])
    
    # Copy and compress icon
    if manifest.get('icon'):
        try:
            if manifest['icon'].startswith('https://') or manifest['icon'].startswith('http://'):
                download_file(manifest['icon'], static_files_path)
                icon_dest_path = os.path.join(static_files_path, manifest['icon'].split('/')[-1])
            else:
                source_path = os.path.join(path_to_modapp, manifest['icon'])
                dest_path = os.path.join(static_files_path, manifest['icon'])
                if os.path.exists(source_path):
                    shutil.copy(source_path, dest_path)
                    icon_dest_path = dest_path
                    # Compress the icon (smaller size for icons)
                    compress_image(dest_path, MAX_ICON_SIZE, MAX_ICON_SIZE)
                else:
                    logger.warning(f"Icon not found, skipping: {manifest['icon']}")
                    icon_dest_path = None
            
            # Generate minimized 64x64 icon for ESP32-S3 in RGB565 format
            if icon_dest_path and os.path.exists(icon_dest_path):
                icon_name = os.path.splitext(manifest['icon'])[0]
                min_icon_name = f"{icon_name}_min.bin"
                min_icon_path = os.path.join(static_files_path, min_icon_name)
                generate_min_icon(icon_dest_path, min_icon_path)
                manifest['icon_min'] = min_icon_name
        except Exception as e:
            logger.warning(f"Failed to process icon: {str(e)}")

    return manifest


def create_package_zip(manifest, type, output_dir) -> str:
    """Create package ZIP with manifest and downloadable files."""
    package_filename = "package.zip"
    package_path = os.path.join(output_dir, package_filename)
    static_path = os.path.join(output_dir, "static")
    source_manifest_path = os.path.join(type + "s", manifest['path'], "manifest.yml")

    files_to_add = []

    if type in ENTRYFILE_TYPES:
        if manifest.get('entryfile') and manifest['entryfile'].get('location'):
            files_to_add.append(manifest['entryfile']['location'])
        elif manifest.get('executionfile') and manifest['executionfile'].get('location'):
            files_to_add.append(manifest['executionfile']['location'])

        if manifest.get('files'):
            for file in manifest['files']:
                location = file.get('location') if isinstance(file, dict) else None
                if location:
                    files_to_add.append(location)

    elif type == "mod":
        if manifest.get('modfiles'):
            for file in manifest['modfiles']:
                location = file.get('location') if isinstance(file, dict) else None
                if location:
                    files_to_add.append(location)

    if not files_to_add:
        return None

    with zipfile.ZipFile(package_path, 'w', zipfile.ZIP_DEFLATED) as package_zip:
        if os.path.exists(source_manifest_path):
            package_zip.write(source_manifest_path, arcname="manifest.yml")

        added_files = set()
        for item in files_to_add:
            location = item
            if isinstance(item, dict):
                location = item.get('origin')
            if not location:
                continue

            filename = os.path.basename(location)
            if filename in added_files:
                continue

            file_path = os.path.join(static_path, filename)
            if os.path.exists(file_path):
                package_zip.write(file_path, arcname=filename)
                added_files.add(filename)

    return package_filename

def process_manifest(manifest, type) -> None:
    output_dir = os.path.join("./build", type+"s", manifest['path'])

    if args.build:
        os.makedirs("./build", exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        
        manifest = gen_static_folder(manifest, type, output_dir)
        package_filename = create_package_zip(manifest, type, output_dir)

        if type in ENTRYFILE_TYPES:
            short_data = {
                "name": manifest["name"],
                "short_description": manifest["short_description"]
            }
            # Include localized name/short_description for the catalog UI
            if manifest.get("languages"):
                short_data["languages"] = manifest["languages"]
            if manifest.get("localization"):
                short_data["localization"] = {
                    lang: {k: v for k, v in entry.items() if k in ("name", "short_description")}
                    for lang, entry in manifest["localization"].items()
                }
            # Include entryfile if it exists (new format)
            if manifest.get("entryfile"):
                short_data["entryfile"] = manifest["entryfile"]
            # Include executionfile if it exists (legacy format)
            elif manifest.get("executionfile"):
                short_data["entryfile"] = manifest["executionfile"]  # Map to entryfile for consistency
            
            with open(os.path.join(output_dir, 'index_short.json'), 'w', encoding='utf-8') as file:
                json.dump(short_data, file, indent=2, ensure_ascii=False)
            
        full_data = {
            "name": manifest["name"],
            "description": manifest["description"],
            "short_description": manifest["short_description"],
            "author": manifest["author"],
            "sources": manifest["sources"],
            "screenshots": manifest.get("screenshots", [])
        }
        
        # Include localization data (name, short_description, description, changelog
        # per language) plus the list of available languages for the catalog UI.
        if manifest.get("languages"):
            full_data["languages"] = manifest["languages"]
        if manifest.get("localization"):
            full_data["localization"] = manifest["localization"]
        
        # Only include icon if it exists
        if manifest.get("icon"):
            full_data["icon"] = manifest["icon"]
        
        # Include minimized icon for ESP32-S3 if it exists
        if manifest.get("icon_min"):
            full_data["icon_min"] = manifest["icon_min"]
        
        # Only include changelog if it exists and is not empty
        if manifest.get("changelog"):
            full_data["changelog"] = manifest["changelog"]
        
        if type in ENTRYFILE_TYPES:
            # Include entryfile if it exists (new format)
            if manifest.get("entryfile"):
                full_data["entryfile"] = manifest["entryfile"]
            # Include executionfile if it exists (legacy format) - map to entryfile
            elif manifest.get("executionfile"):
                full_data["entryfile"] = manifest["executionfile"]
            
            # Include additional files if they exist
            if manifest.get("files"):
                full_data["files"] = manifest["files"]
        elif type == "mod":
            # Only include modfiles if they exist
            if manifest.get("modfiles"):
                full_data["modfiles"] = manifest["modfiles"]

        if package_filename is not None:
            full_data["package"] = package_filename

        # Generate security info (SHA-256 checksums + optional ClamAV scan)
        security_info = generate_security_info(output_dir, manifest, type)
        full_data["security"] = security_info
        
        with open(os.path.join(output_dir, 'index.json'), 'w', encoding='utf-8') as file:
            json.dump(full_data, file, indent=2, ensure_ascii=False)


def gen_json_index_manifests(manifests, type) -> None:
    per_page = 12
    pages = (len(manifests) + per_page - 1) // per_page
    output_dir = os.path.join("./build", type+"s")
    os.makedirs(output_dir, exist_ok=True)
    for i in range(pages):
        data = {
            "page": i,
            "total_pages": pages,
            "manifests": manifests[i * per_page:(i + 1) * per_page],
        }
        with open(os.path.join(output_dir, f"index_{i}.json"), 'w', encoding='utf-8') as file:
            json.dump(data, file, indent=2, ensure_ascii=False)


def check_folder_structure(folder) -> bool:
    return os.path.isfile(os.path.join(folder, 'manifest.yml'))

def infer_type_from_extension(filename: str) -> str:
    """Infer the expected entryfile type from the file extension.
    
    Returns:
        'lua' for .lua files
        'archive' for .zip, .tar, .tar.gz, .tgz files
        'binary' for .bin files
        None if extension is unknown
    """
    filename_lower = filename.lower()
    if filename_lower.endswith('.lua'):
        return 'lua'
    elif filename_lower.endswith(('.zip', '.tar', '.tar.gz', '.tgz')):
        return 'archive'
    elif filename_lower.endswith('.bin'):
        return 'binary'
    return None

def validate_entryfile_type(src, entryfile: dict, item_type: str) -> None:
    """Validate that the declared entryfile type matches the actual file extension.
    
    Args:
        src: The source app/mod name for warning messages
        entryfile: The entryfile dict containing 'type' and 'location'
        item_type: 'app' or 'mod'
    """
    if not entryfile:
        return
    
    declared_type = entryfile.get('type')
    location = entryfile.get('location')
    
    if not declared_type or not location:
        return
    
    # Handle location as dict with 'origin' or as plain string
    if isinstance(location, dict):
        filename = location.get('origin', '')
    else:
        filename = str(location)
    
    # Get the filename from URL or path
    if filename:
        filename = filename.split('/')[-1].split('?')[0]  # Handle URLs with query params
    
    inferred_type = infer_type_from_extension(filename)
    
    if inferred_type and inferred_type != declared_type:
        add_warning(
            src, 
            "type_mismatch", 
            f"Entryfile type mismatch: declared '{declared_type}' but file '{filename}' suggests '{inferred_type}'",
            item_type
        )

def validate_app_files(src, manifest, type) -> bool:
    """Validate that all required files exist. Returns True if valid, False otherwise.
    Only returns False for critical errors that should skip the app/mod.
    Uses parallel HTTP requests for faster validation."""
    path_to_app = os.path.join(type + "s", src)
    validation_results = {'is_valid': True}
    results_lock = threading.Lock()
    
    logger.debug(f"Validating files...", src)
    
    # Validate entryfile type matches file extension
    if type in ENTRYFILE_TYPES:
        entryfile = manifest.get('entryfile') or manifest.get('executionfile')
        validate_entryfile_type(src, entryfile, type)
    
    # Local file checks (fast, no need to parallelize)
    if manifest.get('icon'):
        icon_path = os.path.join(path_to_app, manifest['icon'])
        if not os.path.exists(icon_path) and not (manifest['icon'].startswith('http://') or manifest['icon'].startswith('https://')):
            add_warning(src, "missing_icon", f"Icon file not found: {manifest['icon']}", type)
    
    if manifest.get('screenshots'):
        for screenshot in manifest['screenshots']:
            if not (screenshot.startswith('http://') or screenshot.startswith('https://')):
                screenshot_path = os.path.join(path_to_app, screenshot)
                if not os.path.exists(screenshot_path):
                    add_warning(src, "missing_screenshot", f"Screenshot file not found: {screenshot}", type)
    
    # Collect HTTP validation tasks
    http_tasks = []
    
    if manifest.get('sources'):
        sources = manifest['sources']
        if isinstance(sources, dict) and sources.get('location', {}).get('origin'):
            repo_url = sources['location']['origin']
            if 'github.com' in repo_url:
                http_tasks.append(('repo', repo_url, True))  # (type, url, is_critical)
    
    if type in ENTRYFILE_TYPES:
        exec_file = manifest.get('entryfile') or manifest.get('executionfile')
        if isinstance(exec_file, dict) and exec_file.get('location'):
            location = exec_file['location']
            if isinstance(location, dict) and location.get('origin'):
                exec_url = location['origin']
                http_tasks.append(('exec', exec_url, False))  # Not critical
    
    def check_url(task):
        task_type, url, is_critical = task
        try:
            response = requests.head(url, timeout=5)
            if response.status_code == 404:
                if task_type == 'repo':
                    add_warning(src, "repo_not_found", f"Repository not found: {url}", type)
                    if is_critical:
                        with results_lock:
                            validation_results['is_valid'] = False
                elif task_type == 'exec':
                    add_warning(src, "exec_file_not_found", f"Execution file not found: {url}", type)
        except Exception as e:
            if task_type == 'repo':
                add_warning(src, "repo_check_failed", f"Could not verify repository: {str(e)}", type)
            elif task_type == 'exec':
                add_warning(src, "exec_file_check_failed", f"Could not verify execution file: {str(e)}", type)
    
    # Execute HTTP checks in parallel
    if http_tasks:
        with ThreadPoolExecutor(max_workers=4) as executor:
            executor.map(check_url, http_tasks)
    
    return validation_results['is_valid']

# ============================================================================
# Localization support
# ============================================================================
# Supported UI/content languages. Ukrainian is the default/fallback language
# because most of the existing catalog content is written in Ukrainian.
SUPPORTED_LANGUAGES = ['uk', 'en']
DEFAULT_LANGUAGE = 'uk'


def _read_text_file(path) -> str:
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def resolve_localized_markdown(src, type, ref) -> dict:
    """Resolve a markdown file reference into a ``{lang: content}`` mapping.

    For a reference such as ``DESCRIPTION.md`` this looks for localized
    siblings ``DESCRIPTION.uk.md`` and ``DESCRIPTION.en.md``. If no localized
    file is found for the default language, it falls back to the plain
    ``DESCRIPTION.md`` file so existing single-language apps keep working.
    """
    base_dir = os.path.join(type + "s", src)
    root, ext = os.path.splitext(ref)
    result = {}

    for lang in SUPPORTED_LANGUAGES:
        candidate = os.path.join(base_dir, f"{root}.{lang}{ext}")
        if os.path.exists(candidate):
            try:
                result[lang] = _read_text_file(candidate)
            except Exception as e:
                add_warning(src, "file_read_error",
                            f"Failed to read {root}.{lang}{ext}: {str(e)}", type)

    # Fallback to the non-localized base file for the default language
    base_file = os.path.join(base_dir, ref)
    if os.path.exists(base_file):
        try:
            base_content = _read_text_file(base_file)
            result.setdefault(DEFAULT_LANGUAGE, base_content)
        except Exception as e:
            add_warning(src, "file_read_error",
                        f"Failed to read {ref}: {str(e)}", type)

    return result


def resolve_localized_text(src, type, value) -> dict:
    """Resolve a manifest text field into a ``{lang: text}`` mapping.

    Supports three manifest authoring styles:
    - plain string -> ``{DEFAULT_LANGUAGE: value}``
    - ``@file.md`` reference -> localized markdown resolution (``.uk.md`` / ``.en.md``)
    - mapping ``{uk: ..., en: ...}`` -> inline localized values where each value
      may itself be a plain string or an ``@file.md`` reference.
    """
    if value is None:
        return {}

    if isinstance(value, dict):
        result = {}
        for lang, lang_value in value.items():
            if lang not in SUPPORTED_LANGUAGES:
                add_warning(src, "unknown_language",
                            f"Unsupported language code '{lang}' (expected one of {SUPPORTED_LANGUAGES})", type)
                continue
            if isinstance(lang_value, str) and lang_value.startswith('@'):
                ref_path = os.path.join(type + "s", src, lang_value[1:])
                if os.path.exists(ref_path):
                    try:
                        result[lang] = _read_text_file(ref_path)
                    except Exception as e:
                        add_warning(src, "file_read_error",
                                    f"Failed to read {lang_value[1:]}: {str(e)}", type)
                else:
                    add_warning(src, "missing_file",
                                f"Localized file not found: {lang_value[1:]}", type)
            elif lang_value is not None:
                result[lang] = lang_value
        return result

    if isinstance(value, str):
        if value.startswith('@'):
            return resolve_localized_markdown(src, type, value[1:])
        return {DEFAULT_LANGUAGE: value}

    # Unknown scalar type, coerce to string under the default language
    return {DEFAULT_LANGUAGE: str(value)}


def pick_default_language(localized: dict) -> str:
    """Return text for the default language, falling back to any available one."""
    if not localized:
        return ""
    if localized.get(DEFAULT_LANGUAGE):
        return localized[DEFAULT_LANGUAGE]
    for lang in SUPPORTED_LANGUAGES:
        if localized.get(lang):
            return localized[lang]
    for value in localized.values():
        if value:
            return value
    return ""


def build_localization_map(manifest) -> tuple:
    """Combine per-field localized maps into a ``{lang: {field: text}}`` map.

    Returns a tuple of ``(localization, languages)``.
    """
    field_keys = {
        'name': 'name_localized',
        'short_description': 'short_description_localized',
        'description': 'description_localized',
        'changelog': 'changelog_localized',
    }

    localization = {}
    languages = set()
    for lang in SUPPORTED_LANGUAGES:
        entry = {}
        for field, source_key in field_keys.items():
            value = manifest.get(source_key, {}).get(lang)
            if value:
                entry[field] = value
        if entry:
            localization[lang] = entry
            languages.add(lang)

    return localization, sorted(languages, key=lambda l: SUPPORTED_LANGUAGES.index(l))


def check_manifest(src, type) -> dict:
    manifest_path = os.path.join(type+"s", src, 'manifest.yml')
    logger.debug(f"Reading {manifest_path}", src)
    
    try:
        with open(manifest_path, 'r') as file:
            manifest = yaml.safe_load(file)
    except Exception as e:
        add_warning(src, "manifest_error", f"Failed to read manifest.yml: {str(e)}", type)
        return None
    
    # A fully commented-out or empty manifest parses to None; skip it cleanly.
    if not isinstance(manifest, dict):
        add_warning(src, "disabled_manifest", "manifest.yml is empty or commented out (skipped)", type)
        return None
    
    if 'name' in manifest:
        manifest['name_localized'] = resolve_localized_text(src, type, manifest['name'])
        manifest['name'] = pick_default_language(manifest['name_localized'])
        logger.debug(f"Name: {manifest['name']}", src)
    else:
        add_warning(src, "missing_field", "Name not found in manifest file", type)
        return None
    
    if type in ENTRYFILE_TYPES:
        if 'keira_version' in manifest:
            logger.debug(f"keira_version: {manifest['keira_version']}", src)
        else:
            add_warning(src, "missing_field", "keira_version not found in manifest file", type)
            return None

    if 'description' in manifest:
        manifest['description_localized'] = resolve_localized_text(src, type, manifest['description'])
    else:
        manifest['description_localized'] = {}
    manifest['description'] = pick_default_language(manifest['description_localized'])
    
    if 'short_description' in manifest:
        manifest['short_description_localized'] = resolve_localized_text(src, type, manifest['short_description'])
        if not manifest['short_description_localized']:
            add_warning(src, "file_read_error", "Failed to resolve short_description", type)
            return None
        manifest['short_description'] = pick_default_language(manifest['short_description_localized'])
    else:
        add_warning(src, "missing_field", "Short Description not found in manifest file", type)
        return None
    
    if 'changelog' in manifest:
        manifest['changelog_localized'] = resolve_localized_text(src, type, manifest['changelog'])
    else:
        manifest['changelog_localized'] = {}
    manifest['changelog'] = pick_default_language(manifest['changelog_localized'])

    if 'author' not in manifest:
        add_warning(src, "missing_field", "Author not found in manifest file", type)
        return None
    
    if 'icon' not in manifest:
        add_warning(src, "missing_field", "Icon not found in manifest file (optional)", type)
        # Don't return None - icon is now optional
    
    if 'sources' in manifest:
        if 'type' not in manifest['sources']:
            add_warning(src, "missing_field", "sources type not found in manifest file", type)
            return None
        if 'location' in manifest['sources']:
            if 'origin' not in manifest['sources']['location']:
                add_warning(src, "missing_field", "sources origin not found in manifest file", type)
                return None
        else:
            add_warning(src, "missing_field", "sources location not found in manifest file", type)
            return None
    else:
        add_warning(src, "missing_field", "sources not found in manifest file", type)
        return None
    
    if type in ENTRYFILE_TYPES:
        # Check for entryfile (new format) or executionfile (legacy)
        if 'entryfile' not in manifest and 'executionfile' not in manifest:
            add_warning(src, "missing_field", "entryfile/executionfile not found in manifest file (optional)", type)
    elif type == "mod":
        if 'modfiles' not in manifest:
            add_warning(src, "missing_field", "modfiles not found in manifest file (optional)", type)
            manifest['modfiles'] = []
    else:
        add_warning(src, "unknown_type", f"Unknown type: {type}", type)
        return None
    
    # Validate all files exist
    if not validate_app_files(src, manifest, type):
        return None
    
    # Build combined localization map and the list of available languages
    manifest['localization'], manifest['languages'] = build_localization_map(manifest)
    
    manifest['path'] = src.split('/')[-1]

    return manifest
        

def scan_folder(folder) -> list[str]:
    return sorted(d for d in os.listdir(folder) if os.path.isdir(os.path.join(folder, d)))

def process_folder(items, type):
    """Process apps/mods in parallel with progress tracking"""
    progress = ProgressTracker(f"Processing {type.capitalize()}s", len(items), type)

    def process_single(item):
        try:
            if not check_folder_structure(os.path.join('.', type + 's', item)):
                add_warning(item, "missing_manifest", "manifest.yml file not found", type)
                progress.error(item, "manifest.yml not found")
                return None
            manifest = check_manifest(item, type)
            if manifest is None:
                progress.error(item, "Validation failed")
                return None
            process_manifest(manifest, type)
            # Check if there were warnings for this item
            item_warnings = [w for w in build_warnings if w.get('name') == item]
            if item_warnings:
                progress.warn(item, f"Done with {len(item_warnings)} warning(s)")
            else:
                progress.success(item, "Built successfully")
            return item
        except Exception as e:
            progress.error(item, f"Error: {str(e)[:30]}")
            return None

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        results = [r for r in executor.map(process_single, items) if r]

    progress.final_summary()
    return sorted(results)

def gen_authors_index(apps, wallpapers, mods) -> None:
    """Generate authors.json grouping all manifests by author."""
    authors = {}

    for item_type, items in (("apps", apps), ("wallpapers", wallpapers), ("mods", mods)):
        for item in items:
            manifest_path = os.path.join("./build", item_type, item, "index.json")
            if not os.path.exists(manifest_path):
                continue
            try:
                with open(manifest_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                author = data.get("author", "Unknown")
                entry = {
                    "name": data.get("name", item),
                    "short_description": data.get("short_description", ""),
                    "icon": data.get("icon", ""),
                    "path": item,
                    "type": item_type
                }
                if data.get("languages"):
                    entry["languages"] = data["languages"]
                if data.get("localization"):
                    entry["localization"] = {
                        lang: {k: v for k, v in fields.items() if k in ("name", "short_description")}
                        for lang, fields in data["localization"].items()
                    }
                authors.setdefault(author, []).append(entry)
            except Exception as e:
                logger.warning(f"Failed to read manifest for authors index: {e}", item)

    # Sort authors alphabetically, sort items within each author
    sorted_authors = {}
    for author in sorted(authors.keys(), key=lambda a: a.lower()):
        sorted_authors[author] = sorted(authors[author], key=lambda x: x["name"].lower())

    output_path = os.path.join("./build", "authors.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(sorted_authors, f, indent=2, ensure_ascii=False)

    logger.success(f"Generated authors.json with {len(sorted_authors)} authors")


def main():
    start_time = time.time()
    
    # Header
    print(f"\n\033[1m{'═' * 60}\033[0m")
    print(f"\033[1m🚀 LILKA CATALOG BUILD SYSTEM\033[0m")
    print(f"\033[1m{'═' * 60}\033[0m")
    print(f"  📅 Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  👷 Workers: {args.workers}")
    print(f"  🔧 Build mode: {'FULL BUILD' if args.build else 'VALIDATION ONLY'}")
    print(f"  🛡️  Antivirus: {'ClamAV ENABLED' if args.antivirus else 'DISABLED (use --antivirus)'}")
    if args.antivirus and not CLAMAV_AVAILABLE:
        print(f"  ⚠️  ClamAV not found! Install with: sudo apt install clamav clamav-daemon")
    elif args.antivirus and not CLAMDSCAN_AVAILABLE:
        print(f"  ⚠️  clamdscan not found — using clamscan (slow). Install clamav-daemon for faster scans.")
    print(f"{'─' * 60}\n")
    
    apps: list[str] = scan_folder('./apps')
    wallpapers: list[str] = scan_folder('./wallpapers')
    mods: list[str] = scan_folder('./mods')

    print(f"📱 Found \033[1m{len(apps)}\033[0m apps")
    print(f"🖼️  Found \033[1m{len(wallpapers)}\033[0m wallpapers")
    print(f"🔩 Found \033[1m{len(mods)}\033[0m mods\n")

    # Process in parallel and get successfully processed items
    processed_apps = process_folder(apps, 'app')
    processed_wallpapers = process_folder(wallpapers, 'wallpaper')
    processed_mods = process_folder(mods, 'mod')

    if args.build:
        print(f"\n\033[94mℹ️  Generating index files...\033[0m")
        gen_json_index_manifests(processed_apps, "app")
        gen_json_index_manifests(processed_wallpapers, "wallpaper")
        gen_json_index_manifests(processed_mods, "mod")
        gen_authors_index(processed_apps, processed_wallpapers, processed_mods)
        print(f"\033[92m✅ Index files generated\033[0m")
    
    # Write warnings to JSON file
    warnings_data = {
        "build_date": datetime.now().isoformat(),
        "total_warnings": len(build_warnings),
        "warnings": build_warnings
    }
    
    os.makedirs("./build", exist_ok=True)
    with open("./build/warnings.json", 'w') as f:
        json.dump(warnings_data, f, indent=2)
    
    elapsed_time = time.time() - start_time
    
    # Final Summary
    print(f"\n\033[1m{'═' * 60}\033[0m")
    print(f"\033[1m📊 BUILD SUMMARY\033[0m")
    print(f"{'─' * 60}")
    print(f"  ⏱️  Total time: \033[1m{elapsed_time:.2f}s\033[0m")
    print(f"  📱 Apps processed: \033[92m{len(processed_apps)}\033[0m / {len(apps)}")
    print(f"  🖼️  Wallpapers processed: \033[92m{len(processed_wallpapers)}\033[0m / {len(wallpapers)}")
    print(f"  🔩 Mods processed: \033[92m{len(processed_mods)}\033[0m / {len(mods)}")
    print(f"  ⚠️  Total warnings: \033[93m{len(build_warnings)}\033[0m")
    print(f"  📄 Warnings file: build/warnings.json")
    print(f"\033[1m{'═' * 60}\033[0m\n")

if __name__ == '__main__': 
    main()
