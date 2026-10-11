"""Tests for the synthetic demand dataset generator.

These tests verify:
  - Reproducibility: running the generator twice with seed=42 produces
    identical DataFrames.
  - Dataset shape: exactly 3,600 rows and the required 12 columns.
  - Column presence: all specification-required columns exist.
  - Category coverage: all 10 crops and 5 locations are present.
  - Date coverage: all 6 years (2019–2024) and all 12 months are present.
  - Composite key uniqueness: no duplicate (crop_name, location, year, month).
  - Non-negativity: historical_volume_kg and target_demand_kg are ≥ 0.
  - Finiteness: historical_volume_kg and target_demand_kg contain no NaN/Inf.
  - Range: target_demand_kg is within [0, 500_000].
  - Season–month consistency: season column matches MONTH_TO_SEASON mapping.
  - Data-quality flags: is_synthetic is True and data_source is "synthetic_v1".
  - Lag chain: historical_volume_kg equals the previous row's target_demand_kg
    within each (crop, location) series.
  - Zero-demand fraction within tolerance.
  - Metadata structure: build_metadata returns required keys and correct types.
  - validate_dataset: raises ValueError on intentionally corrupted data.

Convention note
---------------
These tests follow the existing project pattern in `tests/test_health.py`:
  - Standard pytest functions (no pytest classes).
  - No external service dependencies or fixtures that require a running server.
  - Importable directly from the ai-service root as ``pytest tests/``.

The generator module is imported via a sys.path insertion to ensure the test
can locate ``training/generate_demand_dataset`` regardless of the working
directory, consistent with how the existing tests resolve ``app``.
"""

from __future__ import annotations

import importlib
import math
import sys
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd
import pytest

# ---------------------------------------------------------------------------
# Bootstrap: make ``training`` importable from the ai-service root
# ---------------------------------------------------------------------------
_AI_SERVICE_ROOT = Path(__file__).resolve().parent.parent   # ai-service/
_TRAINING_DIR = _AI_SERVICE_ROOT / "training"

if str(_AI_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_SERVICE_ROOT))
if str(_TRAINING_DIR) not in sys.path:
    sys.path.insert(0, str(_TRAINING_DIR))

import generate_demand_dataset as gen  # noqa: E402 (path manipulation required first)


# ---------------------------------------------------------------------------
# Shared fixture: generate the dataset once per test session via seed=42
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def base_df() -> pd.DataFrame:
    """Return the canonical seed-42 DataFrame (generated once for the session)."""
    rng = np.random.default_rng(gen.RANDOM_SEED)
    return gen.generate_dataset(rng)


# ---------------------------------------------------------------------------
# 1. Reproducibility
# ---------------------------------------------------------------------------

def test_reproducibility():
    """Two independent runs with seed=42 must produce identical DataFrames."""
    rng_a = np.random.default_rng(gen.RANDOM_SEED)
    rng_b = np.random.default_rng(gen.RANDOM_SEED)
    df_a = gen.generate_dataset(rng_a)
    df_b = gen.generate_dataset(rng_b)
    pd.testing.assert_frame_equal(df_a, df_b, check_exact=True)


def test_different_seed_produces_different_data():
    """A different seed must yield different target_demand_kg values."""
    rng_42 = np.random.default_rng(42)
    rng_99 = np.random.default_rng(99)
    df_42 = gen.generate_dataset(rng_42)
    df_99 = gen.generate_dataset(rng_99)
    # At least some rows must differ
    assert not df_42["target_demand_kg"].equals(df_99["target_demand_kg"]), (
        "Different seeds produced identical target_demand_kg — generator is not using the RNG."
    )


# ---------------------------------------------------------------------------
# 2. Shape
# ---------------------------------------------------------------------------

def test_row_count(base_df):
    """Dataset must contain exactly 3,600 rows."""
    assert len(base_df) == gen.EXPECTED_ROW_COUNT, (
        f"Expected {gen.EXPECTED_ROW_COUNT} rows, got {len(base_df)}."
    )


def test_column_count(base_df):
    """Dataset must contain exactly 12 columns as specified."""
    expected_columns = {
        "record_id", "crop_name", "location", "year", "month", "season",
        "historical_volume_kg", "quality_tier", "expected_price_inr_per_kg",
        "target_demand_kg", "is_synthetic", "data_source",
    }
    actual_columns = set(base_df.columns)
    assert actual_columns == expected_columns, (
        f"Column mismatch.\n  Missing : {expected_columns - actual_columns}\n"
        f"  Extra   : {actual_columns - expected_columns}"
    )


# ---------------------------------------------------------------------------
# 3. Category and date coverage
# ---------------------------------------------------------------------------

def test_all_crops_present(base_df):
    """All 10 crops from CROP_VOCABULARY must appear in the dataset."""
    assert set(base_df["crop_name"].unique()) == set(gen.CROP_VOCABULARY), (
        f"Crop coverage mismatch: {set(base_df['crop_name'].unique())} vs {set(gen.CROP_VOCABULARY)}"
    )


def test_all_locations_present(base_df):
    """All 5 state locations from LOCATION_VOCABULARY must appear."""
    assert set(base_df["location"].unique()) == set(gen.LOCATION_VOCABULARY)


def test_all_years_present(base_df):
    """All years 2019–2024 must appear."""
    assert sorted(base_df["year"].unique().tolist()) == gen.YEARS


def test_all_months_present(base_df):
    """All months 1–12 must appear."""
    assert sorted(base_df["month"].unique().tolist()) == gen.MONTHS


def test_all_seasons_present(base_df):
    """All three seasons — Kharif, Rabi, Zaid — must appear."""
    assert set(base_df["season"].unique()) == {"Kharif", "Rabi", "Zaid"}


# ---------------------------------------------------------------------------
# 4. Composite key uniqueness
# ---------------------------------------------------------------------------

def test_no_duplicate_composite_keys(base_df):
    """Every (crop_name, location, year, month) combination must be unique."""
    key_cols = ["crop_name", "location", "year", "month"]
    dup_count = base_df.duplicated(subset=key_cols).sum()
    assert dup_count == 0, f"Found {dup_count} duplicate composite keys."


# ---------------------------------------------------------------------------
# 5. Non-negativity and finiteness
# ---------------------------------------------------------------------------

def test_target_demand_non_negative(base_df):
    """target_demand_kg must be ≥ 0 for every row."""
    assert (base_df["target_demand_kg"] >= 0).all()


def test_historical_volume_non_negative(base_df):
    """historical_volume_kg must be ≥ 0 for every row."""
    assert (base_df["historical_volume_kg"] >= 0).all()


def test_target_demand_finite(base_df):
    """target_demand_kg must not contain NaN or Inf."""
    assert base_df["target_demand_kg"].apply(math.isfinite).all()


def test_historical_volume_finite(base_df):
    """historical_volume_kg must not contain NaN or Inf."""
    assert base_df["historical_volume_kg"].apply(math.isfinite).all()


def test_target_demand_within_clip_range(base_df):
    """target_demand_kg must be within [0, 500_000] kg."""
    assert (base_df["target_demand_kg"] <= 500_000).all()
    assert (base_df["target_demand_kg"] >= 0).all()


# ---------------------------------------------------------------------------
# 6. Non-nullable columns have no nulls
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("col", [
    "record_id", "crop_name", "location", "year", "month", "season",
    "historical_volume_kg", "quality_tier", "target_demand_kg",
    "is_synthetic", "data_source",
])
def test_non_nullable_column_has_no_nulls(base_df, col):
    """Non-nullable columns must have zero null values."""
    null_count = base_df[col].isna().sum()
    assert null_count == 0, f"Column '{col}' has {null_count} null values."


# ---------------------------------------------------------------------------
# 7. Season–month consistency
# ---------------------------------------------------------------------------

def test_season_month_consistency(base_df):
    """Every season value must match MONTH_TO_SEASON for its month."""
    derived = base_df["month"].map(gen.MONTH_TO_SEASON)
    mismatch = (base_df["season"] != derived).sum()
    assert mismatch == 0, (
        f"{mismatch} rows have a season that doesn't match their month."
    )


# ---------------------------------------------------------------------------
# 8. Data-quality flags
# ---------------------------------------------------------------------------

def test_is_synthetic_flag(base_df):
    """is_synthetic must be True for every row."""
    assert base_df["is_synthetic"].astype(bool).all()


def test_data_source_flag(base_df):
    """data_source must be 'synthetic_v1' for every row."""
    assert (base_df["data_source"] == "synthetic_v1").all()


# ---------------------------------------------------------------------------
# 9. record_id is monotonic and unique
# ---------------------------------------------------------------------------

def test_record_id_unique(base_df):
    """record_id must be unique across all rows."""
    assert base_df["record_id"].is_unique


def test_record_id_range(base_df):
    """record_id must run from 1 to EXPECTED_ROW_COUNT."""
    assert base_df["record_id"].min() == 1
    assert base_df["record_id"].max() == gen.EXPECTED_ROW_COUNT


# ---------------------------------------------------------------------------
# 10. Lag chain — historical_volume_kg == previous month's target_demand_kg
# ---------------------------------------------------------------------------

def test_lag_chain_within_series(base_df):
    """Within each (crop, location) series, historical_volume_kg[t] must equal
    target_demand_kg[t-1]. The very first month of each series has lag = 0."""
    errors = []
    for (crop, loc), group in base_df.groupby(["crop_name", "location"], sort=True):
        group_sorted = group.sort_values(["year", "month"]).reset_index(drop=True)
        for i in range(1, len(group_sorted)):
            prev_target = group_sorted.loc[i - 1, "target_demand_kg"]
            curr_hist = group_sorted.loc[i, "historical_volume_kg"]
            if not math.isclose(prev_target, curr_hist, rel_tol=1e-6, abs_tol=1e-4):
                errors.append(
                    f"({crop}, {loc}) row {i}: "
                    f"historical_volume_kg={curr_hist} ≠ prev target={prev_target}"
                )
        # First row must have historical_volume_kg == 0
        first_hist = group_sorted.loc[0, "historical_volume_kg"]
        if first_hist != 0.0:
            errors.append(
                f"({crop}, {loc}) first row: historical_volume_kg={first_hist} should be 0.0"
            )
    assert not errors, f"Lag-chain errors ({len(errors)} found):\n" + "\n".join(errors[:5])


# ---------------------------------------------------------------------------
# 11. Zero-demand fraction within tolerance
# ---------------------------------------------------------------------------

def test_zero_demand_fraction_within_tolerance(base_df):
    """Zero-demand fraction must be within 30%–300% of the target fraction."""
    zero_frac = (base_df["target_demand_kg"] == 0.0).mean()
    lo = gen.ZERO_DEMAND_FRACTION * 0.3
    hi = gen.ZERO_DEMAND_FRACTION * 3.0
    assert lo <= zero_frac <= hi, (
        f"Zero-demand fraction {zero_frac:.4f} outside tolerance [{lo:.4f}, {hi:.4f}]."
    )


# ---------------------------------------------------------------------------
# 12. Quality tier values
# ---------------------------------------------------------------------------

def test_quality_tier_values(base_df):
    """quality_tier must only contain 'Grade A' or 'Grade B'."""
    assert set(base_df["quality_tier"].unique()).issubset({"Grade A", "Grade B"})


# ---------------------------------------------------------------------------
# 13. Metadata structure
# ---------------------------------------------------------------------------

def test_metadata_required_keys(base_df):
    """build_metadata must return a dict with all required top-level keys."""
    dummy_path = Path("demand_history_synthetic.csv")
    meta = gen.build_metadata(base_df, dummy_path)

    required_keys = {
        "dataset_name", "version", "data_source", "data_source_warning",
        "output_csv", "generated_at", "random_seed", "total_rows",
        "expected_rows", "years", "months", "crop_vocabulary",
        "location_vocabulary", "season_mapping", "columns", "target_column",
        "target_unit", "generation_assumptions", "split_plan",
        "actual_stats", "limitations",
    }
    missing = required_keys - set(meta.keys())
    assert not missing, f"Metadata missing keys: {missing}"


def test_metadata_data_source_is_synthetic(base_df):
    """Metadata data_source must be 'synthetic'."""
    meta = gen.build_metadata(base_df, Path("test.csv"))
    assert meta["data_source"] == "synthetic"


def test_metadata_row_counts_match(base_df):
    """Metadata total_rows must match actual DataFrame length."""
    meta = gen.build_metadata(base_df, Path("test.csv"))
    assert meta["total_rows"] == len(base_df) == gen.EXPECTED_ROW_COUNT


def test_metadata_split_plan_sums(base_df):
    """Train + validation + test record counts must sum to total rows."""
    meta = gen.build_metadata(base_df, Path("test.csv"))
    sp = meta["split_plan"]
    total = sp["train_records"] + sp["validation_records"] + sp["test_records"]
    assert total == gen.EXPECTED_ROW_COUNT, (
        f"Split totals {total} ≠ {gen.EXPECTED_ROW_COUNT}"
    )


def test_metadata_seed(base_df):
    """Metadata random_seed must equal the module-level RANDOM_SEED constant."""
    meta = gen.build_metadata(base_df, Path("test.csv"))
    assert meta["random_seed"] == gen.RANDOM_SEED == 42


# ---------------------------------------------------------------------------
# 14. validate_dataset passes on valid data
# ---------------------------------------------------------------------------

def test_validate_dataset_passes_on_valid_data(base_df):
    """validate_dataset must not raise on the canonical seed-42 dataset."""
    gen.validate_dataset(base_df)  # Should not raise


# ---------------------------------------------------------------------------
# 15. validate_dataset catches intentional corruption
# ---------------------------------------------------------------------------

def test_validate_dataset_catches_wrong_row_count(base_df):
    """validate_dataset must raise ValueError when rows are removed."""
    corrupt = base_df.iloc[:-1].copy()   # Remove last row
    with pytest.raises(ValueError, match="Row count mismatch"):
        gen.validate_dataset(corrupt)


def test_validate_dataset_catches_missing_column(base_df):
    """validate_dataset must raise ValueError when a required column is dropped."""
    corrupt = base_df.drop(columns=["target_demand_kg"])
    with pytest.raises(ValueError, match="Missing columns"):
        gen.validate_dataset(corrupt)


def test_validate_dataset_catches_negative_target(base_df):
    """validate_dataset must raise ValueError when target demand is negative."""
    corrupt = base_df.copy()
    corrupt.loc[corrupt.index[0], "target_demand_kg"] = -1.0
    with pytest.raises(ValueError, match="negative values"):
        gen.validate_dataset(corrupt)


def test_validate_dataset_catches_null_in_crop_name(base_df):
    """validate_dataset must raise ValueError when crop_name contains a null."""
    corrupt = base_df.copy()
    corrupt.loc[corrupt.index[0], "crop_name"] = None
    with pytest.raises(ValueError, match="null values"):
        gen.validate_dataset(corrupt)


def test_validate_dataset_catches_duplicate_keys(base_df):
    """validate_dataset must raise ValueError on duplicate composite keys."""
    corrupt = pd.concat([base_df, base_df.iloc[:1]], ignore_index=True)
    with pytest.raises(ValueError, match="Duplicate composite keys"):
        gen.validate_dataset(corrupt)


def test_validate_dataset_catches_wrong_season(base_df):
    """validate_dataset must raise ValueError when season is inconsistent with month."""
    corrupt = base_df.copy()
    # Force month=7 row (Kharif) to have season=Rabi
    mask = corrupt["month"] == 7
    corrupt.loc[mask, "season"] = "Rabi"
    with pytest.raises(ValueError, match="Season.month consistency"):
        gen.validate_dataset(corrupt)


# ---------------------------------------------------------------------------
# 16. Derive season helper
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("month,expected_season", [
    (1, "Rabi"), (2, "Rabi"), (3, "Rabi"),
    (4, "Zaid"), (5, "Zaid"), (6, "Zaid"),
    (7, "Kharif"), (8, "Kharif"), (9, "Kharif"), (10, "Kharif"),
    (11, "Rabi"), (12, "Rabi"),
])
def test_derive_season(month, expected_season):
    """derive_season must return the correct season for all 12 calendar months."""
    assert gen.derive_season(month) == expected_season


# ---------------------------------------------------------------------------
# 17. Seasonal multiplier helper
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("crop,season,expected", [
    ("Tomato", "Kharif", 1.2),
    ("Rice", "Kharif", 1.2),
    ("Wheat", "Rabi", 1.2),
    ("Chickpea", "Rabi", 1.2),
    ("Tomato", "Rabi", 1.0),       # Kharif crop in Rabi — no bonus
    ("Wheat", "Kharif", 1.0),      # Rabi crop in Kharif — no bonus
    ("Tomato", "Zaid", 0.85),
    ("Wheat", "Zaid", 0.85),
    ("Sugarcane", "Kharif", 1.0),  # Perennial — no bonus
    ("Brinjal", "Rabi", 1.0),      # Perennial — no bonus
])
def test_seasonal_multiplier(crop, season, expected):
    """seasonal_multiplier must return the correct factor per spec §3.6."""
    assert gen.seasonal_multiplier(crop, season) == expected
