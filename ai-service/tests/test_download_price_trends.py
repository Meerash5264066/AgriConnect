"""Unit tests for the price trends database download and verification tool."""

import gzip
import sqlite3
from pathlib import Path
import pytest

from scripts.download_price_trends import (
    SQLITE_HEADER,
    GZIP_HEADER,
    is_gzip_file,
    verify_sqlite_file,
    decompress_gzip_file,
    download_file,
    find_existing_db,
)


@pytest.fixture
def sample_sqlite_db(tmp_path: Path) -> Path:
    """Create a minimal valid SQLite database for testing."""
    db_file = tmp_path / "sample.sqlite"
    conn = sqlite3.connect(str(db_file))
    conn.execute("CREATE TABLE test_data (id INTEGER PRIMARY KEY, name TEXT)")
    conn.execute("INSERT INTO test_data (name) VALUES ('Tomato')")
    conn.commit()
    conn.close()
    return db_file


@pytest.fixture
def sample_gzip_db(tmp_path: Path, sample_sqlite_db: Path) -> Path:
    """Create a gzip-compressed valid SQLite database."""
    gz_file = tmp_path / "sample.sqlite.gz"
    with open(sample_sqlite_db, "rb") as f_in, gzip.open(gz_file, "wb") as f_out:
        f_out.writelines(f_in)
    return gz_file


def test_is_gzip_file_detection(tmp_path: Path, sample_sqlite_db: Path, sample_gzip_db: Path):
    """Verify is_gzip_file correctly identifies gzip and non-gzip files."""
    assert is_gzip_file(sample_gzip_db) is True
    assert is_gzip_file(sample_sqlite_db) is False

    # Plain text file
    txt_file = tmp_path / "plain.txt"
    txt_file.write_text("Hello world")
    assert is_gzip_file(txt_file) is False

    # Empty file
    empty_file = tmp_path / "empty.bin"
    empty_file.write_bytes(b"")
    assert is_gzip_file(empty_file) is False


def test_verify_sqlite_file_valid_and_invalid(tmp_path: Path, sample_sqlite_db: Path):
    """Verify verify_sqlite_file validates headers and minimum byte thresholds."""
    # Valid SQLite file
    assert verify_sqlite_file(sample_sqlite_db, min_bytes=100) is True

    # Too small threshold
    assert verify_sqlite_file(sample_sqlite_db, min_bytes=100_000_000) is False

    # Corrupt header
    corrupt_file = tmp_path / "corrupt.sqlite"
    corrupt_file.write_bytes(b"NOT A SQLITE FILE HEADER 1234567890")
    assert verify_sqlite_file(corrupt_file, min_bytes=10) is False

    # Non-existent file
    assert verify_sqlite_file(tmp_path / "does_not_exist.sqlite") is False


def test_decompress_gzip_file_success(tmp_path: Path, sample_sqlite_db: Path, sample_gzip_db: Path):
    """Verify decompress_gzip_file produces identical byte content."""
    dest_file = tmp_path / "decompressed.sqlite"
    ok = decompress_gzip_file(sample_gzip_db, dest_file)
    assert ok is True
    assert dest_file.exists()
    assert dest_file.read_bytes() == sample_sqlite_db.read_bytes()


def test_decompress_gzip_file_invalid_data(tmp_path: Path):
    """Verify decompress_gzip_file fails safely on corrupt gzip data and cleans up destination."""
    bad_gz = tmp_path / "corrupt.gz"
    # Gzip magic bytes followed by garbage
    bad_gz.write_bytes(GZIP_HEADER + b"\x08\x00corrupted garbage data")
    dest_file = tmp_path / "failed.sqlite"

    ok = decompress_gzip_file(bad_gz, dest_file)
    assert ok is False
    assert not dest_file.exists()


def test_direct_sqlite_download_compatibility(tmp_path: Path, sample_sqlite_db: Path):
    """Verify download_file directly handles uncompressed SQLite payloads."""
    target_dest = tmp_path / "target_direct.sqlite"
    url = sample_sqlite_db.as_uri()

    ok = download_file(url, target_dest, min_bytes=100)
    assert ok is True
    assert target_dest.exists()
    assert verify_sqlite_file(target_dest, min_bytes=100) is True
    assert target_dest.read_bytes() == sample_sqlite_db.read_bytes()

    # Ensure temp files are cleaned up
    assert not target_dest.with_suffix(".download.tmp").exists()
    assert not target_dest.with_suffix(".extracted.tmp").exists()


def test_gzip_download_and_extraction(tmp_path: Path, sample_sqlite_db: Path, sample_gzip_db: Path):
    """Verify download_file automatically detects, extracts, and validates gzip archives."""
    target_dest = tmp_path / "target_from_gz.sqlite"
    url = sample_gzip_db.as_uri()

    ok = download_file(url, target_dest, min_bytes=100)
    assert ok is True
    assert target_dest.exists()
    # Target file is decompressed SQLite, not gzip
    assert verify_sqlite_file(target_dest, min_bytes=100) is True
    assert target_dest.read_bytes() == sample_sqlite_db.read_bytes()

    # Ensure all temp files are cleaned up
    assert not target_dest.with_suffix(".download.tmp").exists()
    assert not target_dest.with_suffix(".extracted.tmp").exists()


def test_download_corrupt_gzip_payload_fails_cleanly(tmp_path: Path):
    """Verify invalid gzip download fails and cleans up temporary files without touching target."""
    corrupt_gz = tmp_path / "corrupt_payload.gz"
    corrupt_gz.write_bytes(GZIP_HEADER + b"\x00\x00\xff\xffnot a valid stream")
    target_dest = tmp_path / "target_should_not_exist.sqlite"

    ok = download_file(corrupt_gz.as_uri(), target_dest, min_bytes=100)
    assert ok is False
    assert not target_dest.exists()
    assert not target_dest.with_suffix(".download.tmp").exists()
    assert not target_dest.with_suffix(".extracted.tmp").exists()


def test_download_valid_gzip_with_invalid_sqlite_fails_cleanly(tmp_path: Path):
    """Verify gzip archive containing non-SQLite data fails header verification and cleans up."""
    dummy_text = tmp_path / "not_sqlite.txt"
    dummy_text.write_text("Just some text inside a gzip, definitely not SQLite")
    gz_file = tmp_path / "not_sqlite.gz"
    with open(dummy_text, "rb") as f_in, gzip.open(gz_file, "wb") as f_out:
        f_out.writelines(f_in)

    target_dest = tmp_path / "target_invalid_sqlite.sqlite"
    ok = download_file(gz_file.as_uri(), target_dest, min_bytes=10)
    assert ok is False
    assert not target_dest.exists()
    assert not target_dest.with_suffix(".download.tmp").exists()
    assert not target_dest.with_suffix(".extracted.tmp").exists()


def test_atomic_replacement_preserves_existing_target_on_failure(tmp_path: Path, sample_sqlite_db: Path):
    """Verify that if a target database already exists, a failed download does NOT overwrite or delete it."""
    target_dest = tmp_path / "preexisting.sqlite"
    target_dest.write_bytes(sample_sqlite_db.read_bytes())
    initial_content = target_dest.read_bytes()

    bad_file = tmp_path / "bad.bin"
    bad_file.write_bytes(b"Bad content that will fail SQLite check")

    ok = download_file(bad_file.as_uri(), target_dest, min_bytes=100)
    assert ok is False
    # Original target remains completely intact
    assert target_dest.exists()
    assert target_dest.read_bytes() == initial_content


def test_find_existing_db(tmp_path: Path, sample_sqlite_db: Path, monkeypatch: pytest.MonkeyPatch):
    """Verify find_existing_db finds a valid sqlite file in target directory."""
    monkeypatch.delenv("PRICE_TRENDS_DB_PATH", raising=False)
    target_file = tmp_path / "price_trends.sqlite"
    target_file.write_bytes(sample_sqlite_db.read_bytes())

    found = find_existing_db(tmp_path, min_bytes=100)
    assert found is not None
    assert found == target_file
