#!/usr/bin/env python3
"""Agricultural Market Price Trends Dataset Download and Verification Tool.

Used during Render builds or local setup to ensure the 1.63 GB SQLite database
index 'price_trends.sqlite' is present and valid.

Usage:
    python scripts/download_price_trends.py [--target-dir DIR] [--url URL] [--strict]
"""

import argparse
import os
import sys
import urllib.request
from pathlib import Path

SQLITE_HEADER = b"SQLite format 3\x00"
EXPECTED_MIN_BYTES = 500 * 1024 * 1024  # At least 500MB (full DB is ~1.63 GB)


def verify_sqlite_file(file_path: Path) -> bool:
    """Verify that file exists, is non-empty, and has valid SQLite 3 header."""
    if not file_path.is_file():
        return False
    try:
        size = file_path.stat().st_size
        if size < 1024:
            return False
        with open(file_path, "rb") as f:
            header = f.read(16)
            return header == SQLITE_HEADER
    except Exception as exc:
        print(f"[Price Trends Setup] Error reading file {file_path}: {exc}")
        return False


def find_existing_db(target_dir: Path) -> Path | None:
    """Check standard locations for existing price_trends.sqlite."""
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
        if c.is_file() and verify_sqlite_file(c):
            return c
    return None


def download_file(url: str, dest_path: Path) -> bool:
    """Stream download file from url with progress indicator."""
    tmp_path = dest_path.with_suffix(".tmp")
    print(f"[Price Trends Setup] Downloading database from:\n  {url}\nTo:\n  {dest_path}")
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "AgriConnect-Deployment/1.0"},
        )
        with urllib.request.urlopen(req) as response, open(tmp_path, "wb") as out_file:
            total_size = response.getheader("Content-Length")
            total_bytes = int(total_size) if total_size and total_size.isdigit() else None
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

        # Verify downloaded file header
        if not verify_sqlite_file(tmp_path):
            print("[Price Trends Setup] ERROR: Downloaded file is not a valid SQLite database (header mismatch).")
            if tmp_path.exists():
                tmp_path.unlink()
            return False

        # Atomically rename
        if dest_path.exists():
            dest_path.unlink()
        tmp_path.rename(dest_path)
        size_mb = dest_path.stat().st_size / (1024 * 1024)
        print(f"[Price Trends Setup] SUCCESS: Downloaded and verified price_trends.sqlite ({size_mb:.2f} MB).")
        return True

    except Exception as exc:
        print(f"[Price Trends Setup] ERROR: Download failed: {exc}")
        if tmp_path.exists():
            tmp_path.unlink()
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
        help="Download URL if file is not already present",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit with non-zero status if database is missing and no download URL is provided",
    )
    args = parser.parse_args()

    # Step 1: Check if already present anywhere
    existing = find_existing_db(args.target_dir)
    if existing:
        size_mb = existing.stat().st_size / (1024 * 1024)
        print(f"[Price Trends Setup] OK: Verified existing database at {existing} ({size_mb:.2f} MB).")
        return 0

    # Step 2: Try download if URL is configured
    target_file = args.target_dir / "price_trends.sqlite"
    if args.url:
        ok = download_file(args.url, target_file)
        return 0 if ok else 1

    # Step 3: Missing and no URL provided
    print("[Price Trends Setup] NOTICE: 'price_trends.sqlite' was not found.")
    print("  File size: ~1.63 GB (5.8 million APMC arrival records).")
    print("  Because it exceeds GitHub's 100MB limit, it is not checked into Git.")
    print("\nTo provide this file on Render:")
    print("  1. Option A (Render Persistent Disk):")
    print("     - Add a Persistent Disk mounted at '/var/data'.")
    print("     - Copy 'price_trends.sqlite' to '/var/data/price_trends.sqlite'.")
    print("     - Set environment variable: PRICE_TRENDS_DB_PATH=/var/data/price_trends.sqlite")
    print("  2. Option B (Cloud Storage / GitHub Release):")
    print("     - Upload 'price_trends.sqlite' to a release or S3/R2 bucket.")
    print("     - Set environment variable: PRICE_TRENDS_DOWNLOAD_URL=<direct_download_url>")
    print("     - Add to Render Build Command: python scripts/download_price_trends.py\n")

    if args.strict:
        print("[Price Trends Setup] FAILED: Strict mode enabled and database is missing.")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
