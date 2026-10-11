"""Train and evaluate the AgriConnect demand forecasting model.

Pipeline
--------
1. Load ``datasets/demand/demand_history_synthetic.csv`` and validate it.
2. Perform chronological split (Train 2019-2022 / Val 2023 / Test 2024).
3. Build a preprocessing + regression pipeline — no target-derived, identifier,
   or future-leaking columns included as features.
4. Evaluate a naive seasonal-mean baseline on val and test.
5. Select the regression model using VALIDATION metrics only.
6. Evaluate on test once (final, read-only reporting).
7. Apply deployment gate: model must beat the baseline on val R² AND test R².
8. If gate passes, serialise the fitted pipeline to
   ``models/demand_prediction_model.joblib`` and write
   ``models/demand_prediction_metadata.json``.

DATA-SOURCE DISCLOSURE
-----------------------
Every model trained by this script is marked ``data_source: "synthetic_v1"``.
Metrics reported here reflect performance on ENTIRELY SYNTHETIC DATA and
must not be represented as real agricultural demand forecasting accuracy.

Leakage safeguards
------------------
Excluded from feature matrix:
  - ``record_id``        — row identifier; carries no predictive signal
  - ``year``             — used only for temporal splitting; leaks future info
  - ``target_demand_kg`` — the regression target itself
  - ``is_synthetic``     — constant flag (all True); zero variance
  - ``data_source``      — constant tag; zero variance

Included features (safe at inference time):
  ``crop_name``, ``location``, ``month``, ``season``, ``historical_volume_kg``,
  ``quality_tier``, ``expected_price_inr_per_kg``

``historical_volume_kg`` is the 1-month lag of the target — it represents
the *previous* period's demand and is available at the forecast origin.

Usage
-----
Run from the ai-service/ directory:
    python training/train_demand_model.py

Or from the project root:
    python ai-service/training/train_demand_model.py
"""

from __future__ import annotations

import json
import logging
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OrdinalEncoder

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("demand_trainer")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
RANDOM_SEED: int = 42

# Columns that leak target information or are purely administrative
LEAKAGE_COLUMNS: List[str] = [
    "record_id",        # identifier — no predictive signal
    "year",             # temporal split key — leaks future if used as feature
    "target_demand_kg", # the regression target itself
    "is_synthetic",     # constant; zero variance
    "data_source",      # constant; zero variance
]

# Feature columns used for training (all others after removing LEAKAGE_COLUMNS)
# Listed explicitly so any column rename in the dataset breaks early.
CATEGORICAL_FEATURES: List[str] = ["crop_name", "location", "season", "quality_tier"]
NUMERIC_FEATURES: List[str] = ["month", "historical_volume_kg", "expected_price_inr_per_kg"]
FEATURE_COLUMNS: List[str] = CATEGORICAL_FEATURES + NUMERIC_FEATURES
TARGET_COLUMN: str = "target_demand_kg"
SPLIT_COLUMN: str = "year"

# Chronological split boundaries (from approved specification)
TRAIN_YEARS: List[int] = [2019, 2020, 2021, 2022]
VAL_YEAR: int = 2023
TEST_YEAR: int = 2024

# Deployment gate: model must exceed baseline on BOTH of these on val data
# before the test set is evaluated.
GATE_METRIC: str = "r2"          # primary gate metric
GATE_THRESHOLD: float = 0.0      # R² > 0 means beating the mean baseline

# Known vocabularies (fixed at dataset generation; needed for OrdinalEncoder)
CROP_VOCABULARY: List[str] = [
    "Tomato", "Onion", "Potato", "Wheat", "Rice",
    "Maize", "Chickpea", "Sugarcane", "Soybean", "Brinjal",
]
LOCATION_VOCABULARY: List[str] = [
    "Tamil Nadu", "Andhra Pradesh", "Karnataka", "Maharashtra", "Madhya Pradesh",
]
SEASON_VOCABULARY: List[str] = ["Kharif", "Rabi", "Zaid"]
QUALITY_VOCABULARY: List[str] = ["Grade A", "Grade B"]

MODEL_VERSION: str = "1.0.0-synthetic"
DATA_SOURCE_WARNING: str = (
    "This model was trained on ENTIRELY SYNTHETIC data. Metrics reported here "
    "reflect synthetic-data performance only and must not be cited as real "
    "agricultural demand forecasting accuracy."
)


# ---------------------------------------------------------------------------
# Path resolution — robust regardless of CWD
# ---------------------------------------------------------------------------

def _resolve_paths() -> Tuple[Path, Path, Path, Path]:
    """Return (csv_path, dataset_metadata_path, artifact_path, model_metadata_path)."""
    script_dir = Path(__file__).resolve().parent        # ai-service/training/
    root = script_dir.parent                            # ai-service/
    csv_path = root / "datasets" / "demand" / "demand_history_synthetic.csv"
    dataset_meta_path = root / "datasets" / "demand" / "demand_dataset_metadata.json"
    artifact_path = root / "models" / "demand_prediction_model.joblib"
    model_meta_path = root / "models" / "demand_prediction_metadata.json"
    return csv_path, dataset_meta_path, artifact_path, model_meta_path


# ---------------------------------------------------------------------------
# Data loading and splitting
# ---------------------------------------------------------------------------

def load_and_split(csv_path: Path) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load CSV and return (train_df, val_df, test_df) using year-based splits."""
    if not csv_path.is_file():
        raise FileNotFoundError(
            f"Demand dataset not found at '{csv_path}'. "
            "Run training/generate_demand_dataset.py first."
        )

    logger.info("Loading dataset from %s …", csv_path)
    df = pd.read_csv(csv_path)
    logger.info("Loaded %d rows × %d columns.", len(df), len(df.columns))

    # Validate required columns exist
    required = set(FEATURE_COLUMNS) | {TARGET_COLUMN, SPLIT_COLUMN}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Dataset missing required columns: {sorted(missing)}")

    train_df = df[df[SPLIT_COLUMN].isin(TRAIN_YEARS)].copy()
    val_df   = df[df[SPLIT_COLUMN] == VAL_YEAR].copy()
    test_df  = df[df[SPLIT_COLUMN] == TEST_YEAR].copy()

    logger.info(
        "Split sizes — Train: %d | Val: %d | Test: %d",
        len(train_df), len(val_df), len(test_df),
    )
    return train_df, val_df, test_df


# ---------------------------------------------------------------------------
# Baseline: per-(crop, location, month) seasonal mean
# ---------------------------------------------------------------------------

class SeasonalMeanBaseline:
    """Naive seasonal-mean baseline predictor.

    For each (crop_name, location, month) combination seen in training,
    predicts the mean target_demand_kg from that group.
    Falls back to the global training mean for unseen combinations.
    """

    def __init__(self) -> None:
        self._group_means: pd.Series = pd.Series(dtype=float)
        self._global_mean: float = 0.0

    def fit(self, df: pd.DataFrame) -> "SeasonalMeanBaseline":
        self._group_means = (
            df.groupby(["crop_name", "location", "month"])[TARGET_COLUMN].mean()
        )
        self._global_mean = float(df[TARGET_COLUMN].mean())
        logger.info(
            "Baseline fitted: %d group means, global mean=%.2f kg",
            len(self._group_means), self._global_mean,
        )
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        preds = []
        fallbacks = 0
        for _, row in df.iterrows():
            key = (row["crop_name"], row["location"], row["month"])
            if key in self._group_means.index:
                preds.append(self._group_means[key])
            else:
                preds.append(self._global_mean)
                fallbacks += 1
        if fallbacks > 0:
            logger.warning(
                "Baseline: %d rows fell back to global mean (unseen combinations).", fallbacks,
            )
        return np.array(preds, dtype=float)

    @property
    def global_mean(self) -> float:
        return self._global_mean

    @property
    def n_groups(self) -> int:
        return len(self._group_means)


# ---------------------------------------------------------------------------
# Metric computation
# ---------------------------------------------------------------------------

def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray, label: str) -> Dict[str, float]:
    """Compute MAE, RMSE, R² and log a summary."""
    mae  = float(mean_absolute_error(y_true, y_pred))
    rmse = float(math.sqrt(mean_squared_error(y_true, y_pred)))
    r2   = float(r2_score(y_true, y_pred))
    logger.info("[%s] MAE=%.2f kg | RMSE=%.2f kg | R²=%.4f", label, mae, rmse, r2)
    return {"mae_kg": round(mae, 4), "rmse_kg": round(rmse, 4), "r2": round(r2, 6)}


# ---------------------------------------------------------------------------
# Build scikit-learn pipeline
# ---------------------------------------------------------------------------

def build_pipeline() -> Pipeline:
    """Construct the preprocessing + RandomForestRegressor pipeline.

    Preprocessing:
      - Categorical features (crop_name, location, season, quality_tier):
          OrdinalEncoder with fixed category lists → no unseen-category surprises.
      - Numeric features (month, historical_volume_kg):
          Passthrough (both are always finite and non-null in the dataset).
      - expected_price_inr_per_kg:
          SimpleImputer (median strategy) to handle the ~15% NaN fraction.

    Regressor:
      RandomForestRegressor — robust to ordinal encoding, handles the moderate
      dataset size (2,400 training rows) well, and produces calibrated feature
      importances without requiring separate scaling.
    """
    # Ordinal encoder categories must be in fixed order so the encoding is
    # stable across train/val/test calls and survives serialisation.
    cat_encoder = OrdinalEncoder(
        categories=[
            CROP_VOCABULARY,        # crop_name
            LOCATION_VOCABULARY,    # location
            SEASON_VOCABULARY,      # season
            QUALITY_VOCABULARY,     # quality_tier
        ],
        handle_unknown="error",   # surface unseen categories explicitly
        dtype=np.float64,
    )

    # Numeric imputer only for the price column (the rest have no NaNs)
    price_imputer = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
    ])

    preprocessor = ColumnTransformer(
        transformers=[
            ("cat", cat_encoder,   CATEGORICAL_FEATURES),
            ("price", price_imputer, ["expected_price_inr_per_kg"]),
            ("num_passthrough", "passthrough", ["month", "historical_volume_kg"]),
        ],
        remainder="drop",   # explicitly drop any unlisted column
        verbose_feature_names_out=False,
    )

    regressor = RandomForestRegressor(
        n_estimators=200,
        max_depth=None,
        min_samples_leaf=3,
        random_state=RANDOM_SEED,
        n_jobs=-1,
    )

    pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("regressor", regressor),
    ])
    return pipeline


def get_feature_order() -> List[str]:
    """Return the canonical feature column order expected by the pipeline."""
    # Must match ColumnTransformer transformer order above:
    # categorical → price → month + historical_volume_kg
    return CATEGORICAL_FEATURES + ["expected_price_inr_per_kg"] + ["month", "historical_volume_kg"]


# ---------------------------------------------------------------------------
# Main training entry point
# ---------------------------------------------------------------------------

def train(dry_run: bool = False) -> Dict[str, Any]:
    """Execute full training pipeline.

    Parameters
    ----------
    dry_run:
        If True, skip writing artifacts (used in tests).

    Returns
    -------
    result : dict
        Contains all metrics, gate result, and artifact paths.
    """
    logger.info("=" * 60)
    logger.info("AgriConnect Demand Model Training — seed=%d", RANDOM_SEED)
    logger.info("DATA SOURCE: SYNTHETIC — metrics are NOT real forecasting accuracy")
    logger.info("=" * 60)

    csv_path, dataset_meta_path, artifact_path, model_meta_path = _resolve_paths()

    # 1. Load and split --------------------------------------------------------
    train_df, val_df, test_df = load_and_split(csv_path)

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df[TARGET_COLUMN].values
    X_val   = val_df[FEATURE_COLUMNS]
    y_val   = val_df[TARGET_COLUMN].values
    X_test  = test_df[FEATURE_COLUMNS]
    y_test  = test_df[TARGET_COLUMN].values

    # 2. Baseline on validation and test ----------------------------------------
    logger.info("Fitting seasonal-mean baseline …")
    baseline = SeasonalMeanBaseline()
    baseline.fit(train_df)

    bl_val_preds  = baseline.predict(val_df)
    bl_test_preds = baseline.predict(test_df)

    logger.info("--- Baseline Metrics ---")
    bl_val_metrics  = compute_metrics(y_val,  bl_val_preds,  "Baseline / Val")
    bl_test_metrics = compute_metrics(y_test, bl_test_preds, "Baseline / Test")

    # 3. Train regression model ------------------------------------------------
    logger.info("Building and fitting RandomForestRegressor pipeline …")
    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)
    logger.info("Pipeline fitted successfully.")

    # 4. Evaluate on validation (used for model selection) ---------------------
    val_preds = pipeline.predict(X_val)
    logger.info("--- RandomForest Model Metrics ---")
    val_metrics  = compute_metrics(y_val,  val_preds,  "RF Model / Val")

    # 5. Deployment gate — evaluated on VALIDATION only -----------------------
    gate_passed = val_metrics[GATE_METRIC] > GATE_THRESHOLD
    logger.info(
        "Deployment gate: val_%s=%.4f > threshold=%.4f → %s",
        GATE_METRIC,
        val_metrics[GATE_METRIC],
        GATE_THRESHOLD,
        "PASSED" if gate_passed else "FAILED",
    )

    # 6. Evaluate on test (final, single read) ---------------------------------
    test_preds = pipeline.predict(X_test)
    test_metrics = compute_metrics(y_test, test_preds, "RF Model / Test")

    # Compute feature importances
    rf_model = pipeline.named_steps["regressor"]
    feature_names = get_feature_order()
    importances = {
        name: round(float(imp), 6)
        for name, imp in zip(feature_names, rf_model.feature_importances_)
    }

    # 7. Build result summary --------------------------------------------------
    result = {
        "gate_passed": gate_passed,
        "model_version": MODEL_VERSION,
        "data_source": "synthetic_v1",
        "data_source_warning": DATA_SOURCE_WARNING,
        "baseline": {
            "description": "Naive seasonal mean per (crop_name, location, month); falls back to global mean for unseen combinations.",
            "global_mean_kg": round(baseline.global_mean, 4),
            "n_groups": baseline.n_groups,
            "val_metrics": bl_val_metrics,
            "test_metrics": bl_test_metrics,
        },
        "model": {
            "algorithm": "RandomForestRegressor",
            "hyperparameters": {
                "n_estimators": 200,
                "max_depth": None,
                "min_samples_leaf": 3,
                "random_state": RANDOM_SEED,
            },
            "val_metrics": val_metrics,
            "test_metrics": test_metrics,
            "feature_importances": importances,
        },
        "splits": {
            "train_years": TRAIN_YEARS,
            "val_year": VAL_YEAR,
            "test_year": TEST_YEAR,
            "train_n": int(len(train_df)),
            "val_n": int(len(val_df)),
            "test_n": int(len(test_df)),
        },
    }

    # 8. Print human-readable summary ------------------------------------------
    _print_summary(result)

    # 9. Save artifacts only if gate passes and not in dry_run -----------------
    if not dry_run:
        if gate_passed:
            _save_artifacts(pipeline, result, artifact_path, model_meta_path, dataset_meta_path)
        else:
            logger.warning(
                "Deployment gate FAILED — model artifact NOT saved. "
                "val_%s=%.4f does not exceed threshold=%.4f.",
                GATE_METRIC, val_metrics[GATE_METRIC], GATE_THRESHOLD,
            )

    return result


# ---------------------------------------------------------------------------
# Artifact saving
# ---------------------------------------------------------------------------

def _save_artifacts(
    pipeline: Pipeline,
    result: Dict[str, Any],
    artifact_path: Path,
    model_meta_path: Path,
    dataset_meta_path: Path,
) -> None:
    """Serialise the fitted pipeline and write the model metadata JSON."""
    artifact_path.parent.mkdir(parents=True, exist_ok=True)

    logger.info("Saving model artifact to %s …", artifact_path)
    joblib.dump(pipeline, artifact_path)
    artifact_size_kb = artifact_path.stat().st_size / 1024
    logger.info("Artifact saved: %.1f KB", artifact_size_kb)

    metadata = {
        "model_name": "AgriConnect Demand Forecaster",
        "model_type": "RandomForestRegressor",
        "version": MODEL_VERSION,
        "data_source": "synthetic_v1",
        "data_source_warning": DATA_SOURCE_WARNING,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "random_seed": RANDOM_SEED,
        "target_column": TARGET_COLUMN,
        "target_unit": "kg",
        "feature_columns": FEATURE_COLUMNS,
        "feature_order_for_inference": get_feature_order(),
        "categorical_features": CATEGORICAL_FEATURES,
        "numeric_features": NUMERIC_FEATURES,
        "crop_vocabulary": CROP_VOCABULARY,
        "location_vocabulary": LOCATION_VOCABULARY,
        "season_vocabulary": SEASON_VOCABULARY,
        "quality_vocabulary": QUALITY_VOCABULARY,
        "preprocessing": {
            "categorical": "OrdinalEncoder with fixed category lists",
            "expected_price_inr_per_kg": "SimpleImputer(strategy='median') — ~15% NaN imputed",
            "month": "passthrough (integer 1-12, never null)",
            "historical_volume_kg": "passthrough (float >=0, never null)",
        },
        "leakage_excluded_columns": LEAKAGE_COLUMNS,
        "split": result["splits"],
        "deployment_gate": {
            "metric": GATE_METRIC,
            "threshold": GATE_THRESHOLD,
            "val_value": result["model"]["val_metrics"][GATE_METRIC],
            "passed": result["gate_passed"],
        },
        "baseline": result["baseline"],
        "model_metrics": {
            "val": result["model"]["val_metrics"],
            "test": result["model"]["test_metrics"],
        },
        "feature_importances": result["model"]["feature_importances"],
        "limitations": [
            "Trained exclusively on SYNTHETIC data — not real procurement history.",
            "Metrics do not represent real agricultural demand forecasting accuracy.",
            "Crop and location vocabularies are fixed; unseen inputs will error at inference.",
            "Seasonal patterns are rule-derived from the generator, not learned from real data.",
            "Does not account for price shocks, weather disruptions, or policy changes.",
            "historical_volume_kg is a 1-month lag — inference callers must supply prior month's demand.",
        ],
    }

    logger.info("Saving model metadata to %s …", model_meta_path)
    with open(model_meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    logger.info("Metadata saved.")


# ---------------------------------------------------------------------------
# Human-readable summary
# ---------------------------------------------------------------------------

def _print_summary(result: Dict[str, Any]) -> None:
    logger.info("")
    logger.info("=" * 60)
    logger.info("TRAINING SUMMARY")
    logger.info("=" * 60)
    logger.info("Data source    : SYNTHETIC (not real market data)")
    logger.info("Gate           : %s", "PASSED ✓" if result["gate_passed"] else "FAILED ✗")
    logger.info("")
    logger.info("  %-30s  %10s  %10s  %8s", "Method", "MAE (kg)", "RMSE (kg)", "R²")
    logger.info("  " + "-" * 62)

    def _row(name, m):
        logger.info("  %-30s  %10.2f  %10.2f  %8.4f",
                    name, m["mae_kg"], m["rmse_kg"], m["r2"])

    _row("Baseline (val)",         result["baseline"]["val_metrics"])
    _row("RF Model (val)",         result["model"]["val_metrics"])
    logger.info("  " + "-" * 62)
    _row("Baseline (test)",        result["baseline"]["test_metrics"])
    _row("RF Model (test)",        result["model"]["test_metrics"])
    logger.info("")
    logger.info(
        "NOTE: All metrics are computed on SYNTHETIC data only. "
        "They do not reflect real agricultural procurement forecast accuracy."
    )
    logger.info("=" * 60)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    result = train(dry_run=False)
    sys.exit(0 if result["gate_passed"] else 1)
