#!/usr/bin/env python3
"""Agricultural Market Price Trends Dataset Download and Verification Tool.

Used during Render builds or local setup to ensure the SQLite database
index 'price_trends.sqlite' is present and valid.

Supports both direct SQLite database files and gzip-compressed (.gz) archives.

Usage:
    python scripts/download_price_trends.py [--target-dir DIR] [--url URL] [--strict]
"""

import argparse
import gzip
import os
import sys
import urllib.request
from pathlib import Path

SQLITE_HEADER = b"SQLite format 3\x00"
GZIP_HEADER = b"\x1f\x8b"
EXPECTED_MIN_BYTES = 10 * 1024 * 1024  # At least 10MB (compact DB is ~409 MB, full DB is ~1.63 GB)


def is_gzip_file(file_path: Path) -> bool:
    """Check if file exists and starts with gzip magic bytes."""
    if not file_path.is_file() or file_path.stat().st_size < 2:
        return False
    try:
        with open(file_path, "rb") as f:
            return f.read(2) == GZIP_HEADER
    except Exception:
        return False


def decompress_gzip_file(src_path: Path, dest_path: Path) -> bool:
    """Stream decompress gzip archive into target path."""
    try:
        with gzip.open(src_path, "rb") as f_in, open(dest_path, "wb") as f_out:
            chunk_size = 1024 * 1024  # 1MB chunks
            while True:
                chunk = f_in.read(chunk_size)
                if not chunk:
                    break
                f_out.write(chunk)
        return True
    except Exception as exc:
        print(f"[Price Trends Setup] ERROR: Gzip decompression failed: {exc}")
        if dest_path.exists():
            try:
                dest_path.unlink()
            except Exception:
                pass
        return False


def verify_sqlite_file(file_path: Path, min_bytes: int = 1024) -> bool:
    """Verify that file exists, meets minimum size, and has valid SQLite 3 header."""
    if not file_path.is_file():
        return False
    try:
        size = file_path.stat().st_size
        if size < min_bytes:
            return False
        with open(file_path, "rb") as f:
            header = f.read(16)
            return header == SQLITE_HEADER
    except Exception as exc:
        print(f"[Price Trends Setup] Error reading file {file_path}: {exc}")
        return False


def find_existing_db(target_dir: Path, min_bytes: int = 1024) -> Path | None:
    """Check standard locations for existing valid price_trends.sqlite."""
    candidates = [
        target_dir / "price_trends.sqlite",
        Path("datasets/price/price_trends.sqlite"),
        Path("ai-service/datasets/price/price_trends.sqlite"),
        Path("/var/data/price_trends.sqlite"),
        Path("/var/data/datasets/price/price_trends.sqlite"),
        Path("/data/price_trends.sqlite"),
        Path("/opt/render/project/src/ai-service/datasets/price/price_trends.sqlite"),
        Path("/opt/render/project/src/datasets/price/price_trends.sqlite"),
    ]

    env_path = os.environ.get("PRICE_TRENDS_DB_PATH")
    if env_path:
        candidates.insert(0, Path(env_path).resolve())

    for c in candidates:
        if c.is_file() and verify_sqlite_file(c, min_bytes=min_bytes):
            return c
    return None


def download_file(url: str, dest_path: Path, min_bytes: int = EXPECTED_MIN_BYTES) -> bool:
    """Stream download file from url with progress indicator and optional gzip decompression."""
    tmp_download = dest_path.with_suffix(".download.tmp")
    tmp_extracted = dest_path.with_suffix(".extracted.tmp")

    # Clean up any stale temp files before starting
    for p in (tmp_download, tmp_extracted):
        if p.exists():
            try:
                p.unlink()
            except Exception:
                pass

    print(f"[Price Trends Setup] Downloading database from:\n  {url}\nTo:\n  {dest_path}")
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "AgriConnect-Deployment/1.0"},
        )
        with urllib.request.urlopen(req) as response, open(tmp_download, "wb") as out_file:
            total_size = None
            if hasattr(response, "getheader"):
                total_size = response.getheader("Content-Length")
            elif hasattr(response, "headers") and response.headers:
                total_size = response.headers.get("Content-Length")
            total_bytes = int(total_size) if total_size and str(total_size).isdigit() else None
            downloaded = 0
            chunk_size = 1024 * 1024  # 1MB chunks
            last_percent = -1

            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                out_file.write(chunk)
                downloaded += len(chunk)
                if total_bytes:
                    pct = int(downloaded * 100 / total_bytes)
                    if pct != last_percent and pct % 10 == 0:
                        print(f"[Price Trends Setup] Progress: {pct}% ({downloaded / (1024*1024):.1f} MB / {total_bytes / (1024*1024):.1f} MB)")
                        last_percent = pct
                else:
                    if downloaded % (50 * 1024 * 1024) == 0:
                        print(f"[Price Trends Setup] Downloaded: {downloaded / (1024*1024):.1f} MB")

        # Determine whether payload is a gzip archive
        is_gz = is_gzip_file(tmp_download) or url.lower().split("?")[0].endswith(".gz")
        if is_gz:
            print("[Price Trends Setup] Detected gzip compressed payload. Decompressing to SQLite database...")
            ok = decompress_gzip_file(tmp_download, tmp_extracted)
            if not ok:
                print("[Price Trends Setup] ERROR: Decompression of gzip archive failed.")
                for p in (tmp_download, tmp_extracted):
                    if p.exists():
                        try:
                            p.unlink()
                        except Exception:
                            pass
                return False
            validation_target = tmp_extracted
        else:
            validation_target = tmp_download

        # Verify uncompressed SQLite database header and size
        if not verify_sqlite_file(validation_target, min_bytes=min_bytes):
            print("[Price Trends Setup] ERROR: Resulting file is not a valid SQLite database (header mismatch or size below threshold).")
            for p in (tmp_download, tmp_extracted):
                if p.exists():
                    try:
                        p.unlink()
                    except Exception:
                        pass
            return False

        # Atomically replace destination
        if dest_path.exists():
            dest_path.unlink()
        validation_target.rename(dest_path)

        # Clean up download temp file
        if tmp_download.exists():
            try:
                tmp_download.unlink()
            except Exception:
                pass

        size_mb = dest_path.stat().st_size / (1024 * 1024)
        print(f"[Price Trends Setup] SUCCESS: Downloaded, extracted, and verified {dest_path.name} ({size_mb:.2f} MB).")
        return True

    except Exception as exc:
        print(f"[Price Trends Setup] ERROR: Download failed: {exc}")
        for p in (tmp_download, tmp_extracted):
            if p.exists():
                try:
                    p.unlink()
                except Exception:
                    pass
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Ensure price_trends.sqlite is available.")
    parser.add_argument(
        "--target-dir",
        type=Path,
        default=Path("datasets/price"),
        help="Target directory to place price_trends.sqlite (default: datasets/price)",
    )
    parser.add_argument(
        "--url",
        type=str,
        default=os.environ.get("PRICE_TRENDS_DOWNLOAD_URL"),
        help="Download URL if file is not already present (supports direct SQLite or .gz archive)",
    )
    parser.add_argument(
        "--min-bytes",
        type=int,
        default=EXPECTED_MIN_BYTES,
        help="Minimum expected uncompressed SQLite file size in bytes (default: 10MB)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit with non-zero status if database is missing and no download URL is provided",
    )
    args = parser.parse_args()

    # Step 1: Check if already present anywhere
    existing = find_existing_db(args.target_dir, min_bytes=args.min_bytes)
    if existing:
        size_mb = existing.stat().st_size / (1024 * 1024)
        print(f"[Price Trends Setup] OK: Verified existing database at {existing} ({size_mb:.2f} MB).")
        return 0

    # Step 2: Try download if URL is configured
    target_file = args.target_dir / "price_trends.sqlite"
    if args.url:
        ok = download_file(args.url, target_file, min_bytes=args.min_bytes)
        return 0 if ok else 1

    # Step 3: Missing and no URL provided
    print("[Price Trends Setup] NOTICE: 'price_trends.sqlite' was not found.")
    print("  File size: ~409 MB compact (12 staples) or ~1.63 GB full (338 commodities).")
    print("  Because it exceeds GitHub's 100MB limit, it is not checked into Git.")
    print("\nTo provide this file on Render:")
    print("  1. Option A (Render Persistent Disk - Paid Plan):")
    print("     - Add a Persistent Disk mounted at '/var/data'.")
    print("     - Copy 'price_trends.sqlite' to '/var/data/price_trends.sqlite'.")
    print("     - Set environment variable: PRICE_TRENDS_DB_PATH=/var/data/price_trends.sqlite")
    print("  2. Option B (GitHub Release Asset - Free Plan):")
    print("     - Upload 'price_trends_compact.sqlite.gz' as a GitHub Release asset.")
    print("     - Set environment variable: PRICE_TRENDS_DOWNLOAD_URL=<direct_download_url>")
    print("     - Add to Render Build Command: python scripts/download_price_trends.py\n")

    if args.strict:
        print("[Price Trends Setup] FAILED: Strict mode enabled and database is missing.")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())

