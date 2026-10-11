"""Generate reproducible synthetic demand dataset for AgriConnect demand forecasting.

This script produces ``datasets/demand/demand_history_synthetic.csv`` — a 3,600-row
monthly demand table (10 crops × 5 states × 12 months × 6 years: 2019–2024) used
exclusively for training a prototype demand-forecasting model.

IMPORTANT — DATA SOURCE DISCLOSURE
-----------------------------------
All records in this dataset are entirely synthetic.  Values are generated from
statistical rules calibrated to plausible Indian agricultural demand magnitudes;
they do not represent real procurement transactions, APMC arrivals, or any
government or private market data.  Model accuracy figures derived from this
dataset must not be cited as real agricultural forecasting performance.

Column alignment
----------------
Every column name and vocabulary term maps 1-to-1 to a real project artefact:
  crop_name          ← ProcurementDemand.cropName  / DemandPredictionRequest.crop
  location           ← Buyer.state                  / DemandPredictionRequest.location
  month              ← DemandPredictionRequest.month
  season             ← DemandPredictionRequest.season (derived via project rule)
  historical_volume_kg ← DemandPredictionRequest.historical_volume
  quality_tier       ← ProcurementDemand.quality
  expected_price_inr_per_kg ← ProcurementDemand.expectedPrice
  target_demand_kg   ← ProcurementDemand.quantityKg (aggregate per period)
  is_synthetic       ← data-quality flag (always True)
  data_source        ← always "synthetic_v1"

Usage
-----
Run from the ai-service/ directory:
    python training/generate_demand_dataset.py

Or from the project root:
    python ai-service/training/generate_demand_dataset.py
"""

from __future__ import annotations

import json
import logging
import math
import sys
from datetime import datetime, timezone
from itertools import product
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("demand_dataset_generator")

# ---------------------------------------------------------------------------
# Constants — approved in the training data specification
# ---------------------------------------------------------------------------
RANDOM_SEED: int = 42
YEARS: List[int] = list(range(2019, 2025))          # 2019–2024 inclusive
MONTHS: List[int] = list(range(1, 13))              # 1–12

CROP_VOCABULARY: List[str] = [
    "Tomato", "Onion", "Potato", "Wheat", "Rice",
    "Maize", "Chickpea", "Sugarcane", "Soybean", "Brinjal",
]

LOCATION_VOCABULARY: List[str] = [
    "Tamil Nadu", "Andhra Pradesh", "Karnataka", "Maharashtra", "Madhya Pradesh",
]

# Season classification — matches DemandPredictionRequest inference logic
MONTH_TO_SEASON: Dict[int, str] = {
    1: "Rabi", 2: "Rabi", 3: "Rabi",
    4: "Zaid", 5: "Zaid", 6: "Zaid",
    7: "Kharif", 8: "Kharif", 9: "Kharif", 10: "Kharif",
    11: "Rabi", 12: "Rabi",
}

# Kharif-season crops receive a ×1.2 multiplier in Kharif months;
# Rabi-season crops receive ×1.2 in Rabi months; both get ×0.85 in Zaid.
KHARIF_CROPS: set = {"Tomato", "Rice", "Maize", "Soybean"}
RABI_CROPS: set = {"Wheat", "Chickpea", "Potato", "Onion"}
# Sugarcane and Brinjal are perennial / year-round — no seasonal bonus
PERENNIAL_CROPS: set = {"Sugarcane", "Brinjal"}

# Log-normal parameters for base demand per (crop, location)
LN_MU: float = math.log(50_000)   # centre ≈ 50,000 kg / month
LN_SIGMA: float = 0.4

# Gaussian noise std as fraction of base demand
NOISE_SIGMA_FRACTION: float = 0.05

# Annual growth rate
YEAR_TREND: float = 0.02            # +2% per year starting from 2019

# Fraction of records that are "zero demand" disruption rows
ZERO_DEMAND_FRACTION: float = 0.03

# Clip target demand to [0, 500_000] kg
TARGET_MIN: float = 0.0
TARGET_MAX: float = 500_000.0

# Quality tier assignment: 80% Grade A, 20% Grade B per row
GRADE_A_PROBABILITY: float = 0.80

# Expected price range INR/kg (plausible wholesale range)
PRICE_MIN_INR: float = 8.0
PRICE_MAX_INR: float = 80.0
# Fraction of rows with missing (NaN) expected price — mirrors real missingness
PRICE_NAN_FRACTION: float = 0.15

EXPECTED_ROW_COUNT: int = len(CROP_VOCABULARY) * len(LOCATION_VOCABULARY) * len(MONTHS) * len(YEARS)
# 10 × 5 × 12 × 6 = 3,600


# ---------------------------------------------------------------------------
# Path helpers — robust regardless of where the script is invoked
# ---------------------------------------------------------------------------

def _resolve_output_paths() -> Tuple[Path, Path, Path]:
    """Return (csv_path, metadata_path, dataset_dir) resolved from this script's location."""
    script_dir = Path(__file__).resolve().parent           # ai-service/training/
    ai_service_root = script_dir.parent                    # ai-service/
    dataset_dir = ai_service_root / "datasets" / "demand"
    csv_path = dataset_dir / "demand_history_synthetic.csv"
    metadata_path = dataset_dir / "demand_dataset_metadata.json"
    return csv_path, metadata_path, dataset_dir


# ---------------------------------------------------------------------------
# Season derivation (pure function, matches inference-time behaviour)
# ---------------------------------------------------------------------------

def derive_season(month: int) -> str:
    """Return season string for a calendar month using the project-canonical mapping."""
    return MONTH_TO_SEASON[month]


# ---------------------------------------------------------------------------
# Seasonal multiplier (pure function)
# ---------------------------------------------------------------------------

def seasonal_multiplier(crop: str, season: str) -> float:
    """Return demand seasonal multiplier for a given (crop, season) pair."""
    if season == "Kharif" and crop in KHARIF_CROPS:
        return 1.2
    if season == "Rabi" and crop in RABI_CROPS:
        return 1.2
    if season == "Zaid":
        return 0.85
    return 1.0


# ---------------------------------------------------------------------------
# Dataset generation
# ---------------------------------------------------------------------------

def generate_dataset(rng: np.random.Generator) -> pd.DataFrame:
    """Generate the full 3,600-row synthetic demand dataset.

    Returns a DataFrame with exactly EXPECTED_ROW_COUNT rows and the
    columns specified in the training data specification (§3.2).
    """
    logger.info("Generating base demand levels per (crop, location) pair …")

    # Draw one base demand per (crop, location) from log-normal distribution.
    # Shape: (n_crops, n_locations)
    base_demand = rng.lognormal(
        mean=LN_MU,
        sigma=LN_SIGMA,
        size=(len(CROP_VOCABULARY), len(LOCATION_VOCABULARY)),
    )

    # Build Cartesian product index: year × month × crop × location
    # Maintain sort order: crop / location / year / month so that lag
    # computation is straightforward and deterministic.
    records = []
    record_id = 1

    for crop_idx, crop in enumerate(CROP_VOCABULARY):
        for loc_idx, location in enumerate(LOCATION_VOCABULARY):
            base = base_demand[crop_idx, loc_idx]
            prev_target: float = 0.0  # lag seed for the very first record

            for year in YEARS:
                year_factor = 1.0 + YEAR_TREND * (year - YEARS[0])

                for month in MONTHS:
                    season = derive_season(month)
                    s_mult = seasonal_multiplier(crop, season)
                    noise = rng.normal(loc=0.0, scale=NOISE_SIGMA_FRACTION * base)

                    raw_demand = base * s_mult * year_factor + noise
                    target = float(np.clip(raw_demand, TARGET_MIN, TARGET_MAX))
                    target = round(target, 2)

                    # Zero-demand disruption rows drawn at generation time
                    # via a per-row Bernoulli draw (not a post-hoc mask) so
                    # that the lag chain is affected realistically.
                    if rng.random() < ZERO_DEMAND_FRACTION:
                        target = 0.0

                    # Quality tier
                    quality_tier = "Grade A" if rng.random() < GRADE_A_PROBABILITY else "Grade B"

                    # Expected price (may be NaN)
                    if rng.random() < PRICE_NAN_FRACTION:
                        expected_price = float("nan")
                    else:
                        expected_price = round(
                            float(rng.uniform(PRICE_MIN_INR, PRICE_MAX_INR)), 2
                        )

                    records.append({
                        "record_id": record_id,
                        "crop_name": crop,
                        "location": location,
                        "year": year,
                        "month": month,
                        "season": season,
                        "historical_volume_kg": round(prev_target, 2),
                        "quality_tier": quality_tier,
                        "expected_price_inr_per_kg": expected_price,
                        "target_demand_kg": target,
                        "is_synthetic": True,
                        "data_source": "synthetic_v1",
                    })

                    prev_target = target
                    record_id += 1

    df = pd.DataFrame(records)
    logger.info("Raw DataFrame shape: %s", df.shape)
    return df


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_dataset(df: pd.DataFrame) -> None:
    """Run integrity checks on the generated dataset.

    Raises ValueError with a descriptive message on any failure.
    All failures are collected and reported together rather than failing fast,
    so the developer sees the full picture at once.
    """
    errors: List[str] = []

    # 1. Row count
    if len(df) != EXPECTED_ROW_COUNT:
        errors.append(
            f"Row count mismatch: expected {EXPECTED_ROW_COUNT}, got {len(df)}."
        )

    # 2. Required columns present
    required_columns = {
        "record_id", "crop_name", "location", "year", "month", "season",
        "historical_volume_kg", "quality_tier", "expected_price_inr_per_kg",
        "target_demand_kg", "is_synthetic", "data_source",
    }
    missing_cols = required_columns - set(df.columns)
    if missing_cols:
        errors.append(f"Missing columns: {sorted(missing_cols)}.")

    # 3. No duplicate (crop_name, location, year, month) composite keys
    key_cols = ["crop_name", "location", "year", "month"]
    if set(key_cols).issubset(df.columns):
        dup_count = df.duplicated(subset=key_cols).sum()
        if dup_count > 0:
            errors.append(f"Duplicate composite keys: {dup_count} duplicate rows found.")

    # 4. No missing values in non-nullable columns
    non_nullable = [
        "record_id", "crop_name", "location", "year", "month", "season",
        "historical_volume_kg", "quality_tier", "target_demand_kg",
        "is_synthetic", "data_source",
    ]
    for col in non_nullable:
        if col in df.columns:
            null_count = df[col].isna().sum()
            if null_count > 0:
                errors.append(f"Column '{col}' has {null_count} null values (non-nullable).")

    # 5. Non-negative demand quantities
    for qty_col in ["historical_volume_kg", "target_demand_kg"]:
        if qty_col in df.columns:
            neg_count = (df[qty_col] < 0).sum()
            if neg_count > 0:
                errors.append(f"Column '{qty_col}' has {neg_count} negative values.")

    # 6. Finite demand quantities (no NaN/Inf in numeric target columns)
    for qty_col in ["historical_volume_kg", "target_demand_kg"]:
        if qty_col in df.columns:
            inf_nan = (~df[qty_col].apply(lambda x: math.isfinite(x))).sum()
            if inf_nan > 0:
                errors.append(f"Column '{qty_col}' has {inf_nan} non-finite values (NaN/Inf).")

    # 7. Target demand within [0, 500_000]
    if "target_demand_kg" in df.columns:
        out_of_range = ((df["target_demand_kg"] < 0) | (df["target_demand_kg"] > 500_000)).sum()
        if out_of_range > 0:
            errors.append(
                f"Column 'target_demand_kg' has {out_of_range} values outside [0, 500000]."
            )

    # 8. Crop vocabulary coverage
    if "crop_name" in df.columns:
        actual_crops = set(df["crop_name"].unique())
        expected_crops = set(CROP_VOCABULARY)
        missing_crops = expected_crops - actual_crops
        extra_crops = actual_crops - expected_crops
        if missing_crops:
            errors.append(f"Missing crops in dataset: {sorted(missing_crops)}.")
        if extra_crops:
            errors.append(f"Unexpected crops in dataset: {sorted(extra_crops)}.")

    # 9. Location vocabulary coverage
    if "location" in df.columns:
        actual_locs = set(df["location"].unique())
        expected_locs = set(LOCATION_VOCABULARY)
        missing_locs = expected_locs - actual_locs
        extra_locs = actual_locs - expected_locs
        if missing_locs:
            errors.append(f"Missing locations in dataset: {sorted(missing_locs)}.")
        if extra_locs:
            errors.append(f"Unexpected locations in dataset: {sorted(extra_locs)}.")

    # 10. Month range 1–12
    if "month" in df.columns:
        invalid_months = (~df["month"].between(1, 12)).sum()
        if invalid_months > 0:
            errors.append(f"Column 'month' has {invalid_months} values outside [1, 12].")

    # 11. Year coverage matches YEARS list
    if "year" in df.columns:
        actual_years = sorted(df["year"].unique().tolist())
        if actual_years != YEARS:
            errors.append(f"Year coverage mismatch: expected {YEARS}, got {actual_years}.")

    # 12. Season values valid
    if "season" in df.columns:
        valid_seasons = {"Kharif", "Rabi", "Zaid"}
        invalid_seasons = (~df["season"].isin(valid_seasons)).sum()
        if invalid_seasons > 0:
            errors.append(f"Column 'season' has {invalid_seasons} values outside {valid_seasons}.")

    # 13. Season–month consistency
    if {"season", "month"}.issubset(df.columns):
        derived = df["month"].map(MONTH_TO_SEASON)
        mismatch = (df["season"] != derived).sum()
        if mismatch > 0:
            errors.append(f"Season–month consistency: {mismatch} rows have mismatched season and month.")

    # 14. is_synthetic flag always True
    if "is_synthetic" in df.columns:
        non_synthetic = (~df["is_synthetic"].astype(bool)).sum()
        if non_synthetic > 0:
            errors.append(f"Column 'is_synthetic' has {non_synthetic} non-True values.")

    # 15. data_source always "synthetic_v1"
    if "data_source" in df.columns:
        wrong_source = (df["data_source"] != "synthetic_v1").sum()
        if wrong_source > 0:
            errors.append(f"Column 'data_source' has {wrong_source} values != 'synthetic_v1'.")

    # 16. record_id monotonic and unique
    if "record_id" in df.columns:
        if not df["record_id"].is_unique:
            errors.append("Column 'record_id' is not unique.")
        if df["record_id"].min() != 1 or df["record_id"].max() != EXPECTED_ROW_COUNT:
            errors.append(
                f"Column 'record_id' range is [{df['record_id'].min()}, {df['record_id'].max()}]; "
                f"expected [1, {EXPECTED_ROW_COUNT}]."
            )

    # 17. Zero-demand fraction within expected tolerance (±2x)
    if "target_demand_kg" in df.columns:
        zero_fraction = (df["target_demand_kg"] == 0.0).mean()
        lo, hi = ZERO_DEMAND_FRACTION * 0.3, ZERO_DEMAND_FRACTION * 3.0
        if not (lo <= zero_fraction <= hi):
            errors.append(
                f"Zero-demand fraction {zero_fraction:.4f} outside tolerance "
                f"[{lo:.4f}, {hi:.4f}] for target fraction {ZERO_DEMAND_FRACTION}."
            )

    # 18. No zero rows in historical_volume_kg for non-first records
    # (only the very first record per (crop, location) series should have 0 lag)
    # We just check that not ALL historical_volume values are zero
    if "historical_volume_kg" in df.columns:
        all_zero = (df["historical_volume_kg"] == 0.0).all()
        if all_zero:
            errors.append("Column 'historical_volume_kg': all values are zero — lag chain broken.")

    if errors:
        error_msg = "\n".join(f"  [{i+1}] {e}" for i, e in enumerate(errors))
        raise ValueError(f"Dataset validation failed with {len(errors)} error(s):\n{error_msg}")

    logger.info("All %d validation checks passed.", 18)


# ---------------------------------------------------------------------------
# Metadata generation
# ---------------------------------------------------------------------------

def build_metadata(df: pd.DataFrame, csv_path: Path) -> dict:
    """Build the dataset metadata dictionary to be serialised as JSON."""
    zero_fraction = float((df["target_demand_kg"] == 0.0).mean())
    price_nan_fraction = float(df["expected_price_inr_per_kg"].isna().mean())

    return {
        "dataset_name": "AgriConnect Synthetic Demand History",
        "version": "1.0.0",
        "data_source": "synthetic",
        "data_source_warning": (
            "This dataset is entirely synthetic. Values are generated from statistical rules "
            "calibrated to plausible Indian agricultural demand magnitudes. They do not represent "
            "real procurement transactions, APMC arrivals, or any government or private market data. "
            "Model accuracy figures derived from this dataset must not be cited as real agricultural "
            "forecasting performance."
        ),
        "output_csv": str(csv_path.name),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "random_seed": RANDOM_SEED,
        "total_rows": int(len(df)),
        "expected_rows": EXPECTED_ROW_COUNT,
        "years": YEARS,
        "months": MONTHS,
        "crop_vocabulary": CROP_VOCABULARY,
        "location_vocabulary": LOCATION_VOCABULARY,
        "season_mapping": {str(k): v for k, v in MONTH_TO_SEASON.items()},
        "columns": {
            "record_id": "Monotonic integer row identifier (1-indexed).",
            "crop_name": "Crop commodity name (title-case). Matches ProcurementDemand.cropName.",
            "location": "State name. Matches Buyer.state / DemandPredictionRequest.location.",
            "year": "Calendar year (2019–2024). Used for train/val/test splitting only.",
            "month": "Calendar month 1–12. Matches DemandPredictionRequest.month.",
            "season": "Agricultural season (Kharif/Rabi/Zaid) derived from month.",
            "historical_volume_kg": (
                "Previous-month demand volume in kg (1-month lag). "
                "Maps to DemandPredictionRequest.historical_volume."
            ),
            "quality_tier": (
                "Quality grade string (Grade A / Grade B). "
                "Matches ProcurementDemand.quality."
            ),
            "expected_price_inr_per_kg": (
                "Buyer's expected price in INR per kg. "
                "Matches ProcurementDemand.expectedPrice. May be NaN."
            ),
            "target_demand_kg": (
                "Regression target — total procurement demand volume in kg for this "
                "crop/location/month period. Derived from ProcurementDemand.quantityKg."
            ),
            "is_synthetic": "Boolean flag. Always True for this dataset.",
            "data_source": "String tag. Always 'synthetic_v1'.",
        },
        "target_column": "target_demand_kg",
        "target_unit": "kg",
        "generation_assumptions": [
            f"Base demand per (crop, location) drawn from log-normal: mu=log({int(math.exp(LN_MU))}), sigma={LN_SIGMA}.",
            "Kharif crops (Tomato, Rice, Maize, Soybean) receive a ×1.2 multiplier during Kharif months.",
            "Rabi crops (Wheat, Chickpea, Potato, Onion) receive a ×1.2 multiplier during Rabi months.",
            "All crops receive a ×0.85 multiplier during Zaid months.",
            f"Annual demand growth trend: +{int(YEAR_TREND*100)}% per year from 2019 baseline.",
            f"Gaussian noise added per row: std = {int(NOISE_SIGMA_FRACTION*100)}% of base demand.",
            f"Approximately {int(ZERO_DEMAND_FRACTION*100)}% of rows have zero target demand (disruption simulation).",
            f"{int(PRICE_NAN_FRACTION*100)}% of rows have NaN expected_price_inr_per_kg.",
            "historical_volume_kg is the 1-month lag of target_demand_kg within each (crop, location) series.",
            "Values clipped to [0, 500000] kg and rounded to 2 decimal places.",
        ],
        "split_plan": {
            "method": "year-based (no random shuffle across time boundaries)",
            "train_years": list(range(2019, 2023)),
            "validation_year": 2023,
            "test_year": 2024,
            "train_records": int((df["year"] < 2023).sum()),
            "validation_records": int((df["year"] == 2023).sum()),
            "test_records": int((df["year"] == 2024).sum()),
        },
        "actual_stats": {
            "zero_demand_fraction": round(zero_fraction, 4),
            "price_nan_fraction": round(price_nan_fraction, 4),
            "target_demand_min_kg": float(df["target_demand_kg"].min()),
            "target_demand_max_kg": float(df["target_demand_kg"].max()),
            "target_demand_mean_kg": round(float(df["target_demand_kg"].mean()), 2),
            "target_demand_median_kg": round(float(df["target_demand_kg"].median()), 2),
            "historical_volume_min_kg": float(df["historical_volume_kg"].min()),
            "historical_volume_max_kg": float(df["historical_volume_kg"].max()),
        },
        "limitations": [
            "Dataset is 100% synthetic — not derived from real procurement records.",
            "Seasonal patterns are rule-based, not learned from real APMC or mandi data.",
            "Crop and location vocabularies are fixed; rows outside these vocabularies do not exist.",
            "Price–demand interactions are not modelled (price is independent noise).",
            "Year trend is a simple linear multiplier, not a real economic projection.",
            "Zero-demand rows are random Bernoulli draws, not tied to real supply disruptions.",
        ],
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main() -> None:
    logger.info("=" * 60)
    logger.info("AgriConnect Synthetic Demand Dataset Generator")
    logger.info("Seed=%d | Rows=%d | Crops=%d | Locations=%d",
                RANDOM_SEED, EXPECTED_ROW_COUNT,
                len(CROP_VOCABULARY), len(LOCATION_VOCABULARY))
    logger.info("=" * 60)

    csv_path, metadata_path, dataset_dir = _resolve_output_paths()
    dataset_dir.mkdir(parents=True, exist_ok=True)

    # Initialise RNG with project-canonical seed
    rng = np.random.default_rng(RANDOM_SEED)

    # 1. Generate
    logger.info("Step 1/4 — Generating synthetic records …")
    df = generate_dataset(rng)

    # 2. Validate
    logger.info("Step 2/4 — Running validation checks …")
    validate_dataset(df)

    # 3. Save CSV
    logger.info("Step 3/4 — Saving CSV to %s …", csv_path)
    df.to_csv(csv_path, index=False, float_format="%.2f")
    csv_size_kb = csv_path.stat().st_size / 1024
    logger.info("CSV saved: %d rows, %.1f KB", len(df), csv_size_kb)

    # 4. Save metadata
    logger.info("Step 4/4 — Saving dataset metadata to %s …", metadata_path)
    metadata = build_metadata(df, csv_path)
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    # Summary report
    logger.info("-" * 60)
    logger.info("GENERATION COMPLETE")
    logger.info("  CSV path    : %s", csv_path)
    logger.info("  Metadata    : %s", metadata_path)
    logger.info("  Shape       : %d rows × %d columns", *df.shape)
    logger.info("  Columns     : %s", list(df.columns))
    logger.info("  Year range  : %d–%d", df['year'].min(), df['year'].max())
    logger.info("  Zero-demand : %.2f%% of rows", (df['target_demand_kg'] == 0).mean() * 100)
    logger.info("  NaN price   : %.2f%% of rows", df['expected_price_inr_per_kg'].isna().mean() * 100)
    logger.info("  Target min  : %.2f kg", df['target_demand_kg'].min())
    logger.info("  Target max  : %.2f kg", df['target_demand_kg'].max())
    logger.info("  Target mean : %.2f kg", df['target_demand_kg'].mean())
    logger.info("-" * 60)


if __name__ == "__main__":
    main()
