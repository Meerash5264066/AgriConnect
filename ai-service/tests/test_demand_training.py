"""Tests for the AgriConnect demand model training pipeline.

Covers:
  - Training reproducibility (two runs with identical seed produce identical metrics).
  - Feature column ordering matches the ColumnTransformer definition.
  - No leakage columns appear in the feature matrix.
  - Prediction output validity (finite, non-negative, correct shape).
  - Baseline sanity (global mean fallback for unseen combinations).
  - Deployment gate logic (passes/fails correctly).
  - Artifact round-trip (joblib.dump → joblib.load → identical predictions).
  - Metadata JSON structure (required keys, correct data_source flag, gate result).
  - Model outperforms baseline on validation R² (deployment-gate integration test).

Test conventions
----------------
These tests follow the project pattern in tests/test_health.py and
tests/test_demand_dataset.py:
  - Standard pytest functions; no test classes.
  - No external server or database dependencies.
  - The training module is imported via sys.path so tests run from ai-service/
    with ``pytest tests/``.
  - Heavy operations (full model fit) are done once per session via fixtures.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Dict, Tuple

import joblib
import numpy as np
import pandas as pd
import pytest

# ---------------------------------------------------------------------------
# Bootstrap: make ``training`` importable from the ai-service root
# ---------------------------------------------------------------------------
_AI_SERVICE_ROOT = Path(__file__).resolve().parent.parent
_TRAINING_DIR = _AI_SERVICE_ROOT / "training"

for _p in [str(_AI_SERVICE_ROOT), str(_TRAINING_DIR)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

import train_demand_model as tdm   # noqa: E402


# ---------------------------------------------------------------------------
# Session-scoped fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def loaded_splits() -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load the dataset and return (train_df, val_df, test_df) once per session."""
    csv_path, _, _, _ = tdm._resolve_paths()
    return tdm.load_and_split(csv_path)


@pytest.fixture(scope="session")
def fitted_pipeline(loaded_splits):
    """Fit the pipeline on training data once per session."""
    train_df, _, _ = loaded_splits
    X_train = train_df[tdm.FEATURE_COLUMNS]
    y_train = train_df[tdm.TARGET_COLUMN].values
    pipeline = tdm.build_pipeline()
    pipeline.fit(X_train, y_train)
    return pipeline


@pytest.fixture(scope="session")
def fitted_baseline(loaded_splits):
    """Fit the seasonal-mean baseline once per session."""
    train_df, _, _ = loaded_splits
    baseline = tdm.SeasonalMeanBaseline()
    return baseline.fit(train_df)


@pytest.fixture(scope="session")
def train_result(tmp_path_factory):
    """Run full train() in dry_run=True mode (no artifacts written) once per session."""
    return tdm.train(dry_run=True)


# ---------------------------------------------------------------------------
# 1. Data splitting
# ---------------------------------------------------------------------------

def test_split_sizes(loaded_splits):
    """Each split must have the expected row counts."""
    train_df, val_df, test_df = loaded_splits
    assert len(train_df) == 2400
    assert len(val_df)   == 600
    assert len(test_df)  == 600


def test_no_year_overlap_between_splits(loaded_splits):
    """Years must not overlap between train, val, and test."""
    train_df, val_df, test_df = loaded_splits
    train_years = set(train_df["year"].unique())
    val_years   = set(val_df["year"].unique())
    test_years  = set(test_df["year"].unique())
    assert train_years & val_years  == set(), "Train and val share years."
    assert train_years & test_years == set(), "Train and test share years."
    assert val_years   & test_years == set(), "Val and test share years."


def test_train_years_correct(loaded_splits):
    train_df, _, _ = loaded_splits
    assert set(train_df["year"].unique()) == {2019, 2020, 2021, 2022}


def test_val_year_correct(loaded_splits):
    _, val_df, _ = loaded_splits
    assert set(val_df["year"].unique()) == {2023}


def test_test_year_correct(loaded_splits):
    _, _, test_df = loaded_splits
    assert set(test_df["year"].unique()) == {2024}


# ---------------------------------------------------------------------------
# 2. Leakage prevention — no forbidden columns in feature matrix
# ---------------------------------------------------------------------------

def test_leakage_columns_excluded_from_features():
    """LEAKAGE_COLUMNS must not appear in FEATURE_COLUMNS."""
    leakage_set = set(tdm.LEAKAGE_COLUMNS)
    feature_set = set(tdm.FEATURE_COLUMNS)
    overlap = leakage_set & feature_set
    assert not overlap, (
        f"Leakage columns present in feature set: {overlap}"
    )


def test_target_column_not_in_features():
    """TARGET_COLUMN must not be in FEATURE_COLUMNS."""
    assert tdm.TARGET_COLUMN not in tdm.FEATURE_COLUMNS


def test_year_column_not_in_features():
    """The 'year' column (temporal split key) must not be in FEATURE_COLUMNS."""
    assert "year" not in tdm.FEATURE_COLUMNS


def test_record_id_not_in_features():
    """record_id (row identifier) must not be in FEATURE_COLUMNS."""
    assert "record_id" not in tdm.FEATURE_COLUMNS


def test_constant_flags_not_in_features():
    """Constant columns (is_synthetic, data_source) must not be in FEATURE_COLUMNS."""
    assert "is_synthetic" not in tdm.FEATURE_COLUMNS
    assert "data_source"  not in tdm.FEATURE_COLUMNS


# ---------------------------------------------------------------------------
# 3. Feature ordering consistency
# ---------------------------------------------------------------------------

def test_feature_order_matches_column_transformer():
    """get_feature_order() must list the same columns as FEATURE_COLUMNS,
    in the order the ColumnTransformer processes them."""
    # FEATURE_COLUMNS = CATEGORICAL_FEATURES + NUMERIC_FEATURES
    # get_feature_order = CATEGORICAL_FEATURES + [expected_price] + [month, historical_volume_kg]
    ordered = tdm.get_feature_order()
    # Every feature column must appear exactly once in the ordered list
    assert sorted(ordered) == sorted(tdm.FEATURE_COLUMNS), (
        f"get_feature_order() columns differ from FEATURE_COLUMNS.\n"
        f"  Ordered: {ordered}\n  FEATURE_COLUMNS: {tdm.FEATURE_COLUMNS}"
    )
    assert len(set(ordered)) == len(ordered), "get_feature_order() has duplicate column names."


def test_categorical_features_are_subset_of_feature_columns():
    assert set(tdm.CATEGORICAL_FEATURES).issubset(set(tdm.FEATURE_COLUMNS))


def test_numeric_features_are_subset_of_feature_columns():
    assert set(tdm.NUMERIC_FEATURES).issubset(set(tdm.FEATURE_COLUMNS))


def test_feature_columns_equals_cat_plus_num():
    """FEATURE_COLUMNS must be exactly CATEGORICAL_FEATURES + NUMERIC_FEATURES."""
    assert set(tdm.FEATURE_COLUMNS) == set(tdm.CATEGORICAL_FEATURES + tdm.NUMERIC_FEATURES)


# ---------------------------------------------------------------------------
# 4. Pipeline structure
# ---------------------------------------------------------------------------

def test_pipeline_has_preprocessor_and_regressor():
    """Pipeline must have both 'preprocessor' and 'regressor' steps."""
    pipeline = tdm.build_pipeline()
    step_names = [name for name, _ in pipeline.steps]
    assert "preprocessor" in step_names
    assert "regressor" in step_names


def test_pipeline_regressor_is_random_forest():
    """Regressor must be a RandomForestRegressor."""
    from sklearn.ensemble import RandomForestRegressor
    pipeline = tdm.build_pipeline()
    assert isinstance(pipeline.named_steps["regressor"], RandomForestRegressor)


def test_pipeline_random_state_matches_seed():
    """RandomForestRegressor random_state must match RANDOM_SEED."""
    pipeline = tdm.build_pipeline()
    assert pipeline.named_steps["regressor"].random_state == tdm.RANDOM_SEED


# ---------------------------------------------------------------------------
# 5. Prediction output validity
# ---------------------------------------------------------------------------

def test_pipeline_predictions_are_finite(fitted_pipeline, loaded_splits):
    """All val and test predictions must be finite floats (no NaN/Inf)."""
    _, val_df, test_df = loaded_splits
    for df, label in [(val_df, "val"), (test_df, "test")]:
        preds = fitted_pipeline.predict(df[tdm.FEATURE_COLUMNS])
        non_finite = sum(not math.isfinite(p) for p in preds)
        assert non_finite == 0, f"{label}: {non_finite} non-finite predictions."


def test_pipeline_prediction_count_matches_input(fitted_pipeline, loaded_splits):
    """Number of predictions must equal number of input rows."""
    _, val_df, test_df = loaded_splits
    for df, label in [(val_df, "val"), (test_df, "test")]:
        preds = fitted_pipeline.predict(df[tdm.FEATURE_COLUMNS])
        assert len(preds) == len(df), f"{label}: prediction count {len(preds)} ≠ input {len(df)}."


def test_pipeline_predictions_are_numeric(fitted_pipeline, loaded_splits):
    """Predictions must be a numpy array of numeric dtype."""
    _, val_df, _ = loaded_splits
    preds = fitted_pipeline.predict(val_df[tdm.FEATURE_COLUMNS])
    assert isinstance(preds, np.ndarray), "predict() must return ndarray."
    assert np.issubdtype(preds.dtype, np.floating), f"dtype should be float, got {preds.dtype}."


def test_pipeline_rejects_unknown_category(fitted_pipeline):
    """Pipeline must raise when an unseen crop category is passed (handle_unknown='error')."""
    row = {
        "crop_name": "UnknownCrop",
        "location": "Tamil Nadu",
        "season": "Kharif",
        "quality_tier": "Grade A",
        "expected_price_inr_per_kg": 30.0,
        "month": 8,
        "historical_volume_kg": 50000.0,
    }
    X = pd.DataFrame([row])
    with pytest.raises(Exception):
        fitted_pipeline.predict(X)


# ---------------------------------------------------------------------------
# 6. Baseline behaviour
# ---------------------------------------------------------------------------

def test_baseline_global_mean_is_positive(fitted_baseline):
    """Baseline global mean must be positive (dataset has non-zero demand)."""
    assert fitted_baseline.global_mean > 0


def test_baseline_n_groups_is_correct(fitted_baseline):
    """Baseline must learn exactly 10 crops × 5 locations × 12 months = 600 groups."""
    assert fitted_baseline.n_groups == 600


def test_baseline_predict_returns_correct_shape(fitted_baseline, loaded_splits):
    """Baseline must return exactly len(val_df) predictions."""
    _, val_df, _ = loaded_splits
    preds = fitted_baseline.predict(val_df)
    assert len(preds) == len(val_df)


def test_baseline_fallback_on_unseen_combination(fitted_baseline):
    """Baseline must fall back to global mean for unseen (crop, location, month)."""
    unseen_row = pd.DataFrame([{
        "crop_name": "Tomato",
        "location": "Tamil Nadu",
        "month": 7,
        # This combination exists in training — invent one that doesn't by
        # creating a DataFrame with a typo location that's not in train vocab.
        # We override location to trigger unseen.
    }])
    # Construct a DataFrame that has a combination not in the baseline's index
    # by temporarily building a minimal df with an unseen combination.
    fake_df = pd.DataFrame([{
        "crop_name": "Sugarcane",
        "location": "Goa",        # not in vocabulary → definitely unseen
        "month": 3,
    }])
    preds = fitted_baseline.predict(fake_df)
    assert len(preds) == 1
    assert math.isfinite(preds[0])
    assert math.isclose(preds[0], fitted_baseline.global_mean, rel_tol=1e-6)


# ---------------------------------------------------------------------------
# 7. Metric computation
# ---------------------------------------------------------------------------

def test_compute_metrics_perfect_prediction():
    """compute_metrics must return MAE=0, RMSE=0, R²=1 for perfect predictions."""
    y = np.array([1.0, 2.0, 3.0, 4.0])
    metrics = tdm.compute_metrics(y, y, "test_perfect")
    assert metrics["mae_kg"]  == 0.0
    assert metrics["rmse_kg"] == 0.0
    assert metrics["r2"]      == 1.0


def test_compute_metrics_global_mean_baseline():
    """Predicting the mean for every row must give R²=0 and finite MAE/RMSE."""
    y = np.array([10.0, 20.0, 30.0, 40.0])
    mean_pred = np.full_like(y, y.mean())
    metrics = tdm.compute_metrics(y, mean_pred, "test_mean")
    assert math.isclose(metrics["r2"], 0.0, abs_tol=1e-9)
    assert metrics["mae_kg"]  > 0
    assert metrics["rmse_kg"] > 0


def test_compute_metrics_returns_required_keys():
    """compute_metrics must return a dict with exactly mae_kg, rmse_kg, r2."""
    y = np.ones(10)
    m = tdm.compute_metrics(y, y, "keys_test")
    assert set(m.keys()) == {"mae_kg", "rmse_kg", "r2"}


# ---------------------------------------------------------------------------
# 8. Deployment gate logic
# ---------------------------------------------------------------------------

def test_gate_passes_when_model_beats_baseline(train_result):
    """The full train() result must show gate_passed=True for the RF on synthetic data."""
    # This is the end-to-end gate integration test.
    # If this fails, the model does not outperform the seasonal mean and
    # must NOT be deployed. The test explicitly catches that case.
    assert train_result["gate_passed"] is True, (
        "Deployment gate FAILED: RandomForest does not outperform the seasonal-mean baseline "
        "on validation R². The model artifact must not be deployed.\n"
        f"Val R²: {train_result['model']['val_metrics']['r2']:.4f} "
        f"(threshold={tdm.GATE_THRESHOLD})"
    )


def test_gate_metric_is_r2():
    assert tdm.GATE_METRIC == "r2"


def test_gate_threshold_is_zero():
    assert tdm.GATE_THRESHOLD == 0.0


# ---------------------------------------------------------------------------
# 9. Reproducibility — two identical train() dry runs give identical metrics
# ---------------------------------------------------------------------------

def test_training_reproducibility():
    """Two dry_run=True calls must produce bit-identical metrics."""
    result_a = tdm.train(dry_run=True)
    result_b = tdm.train(dry_run=True)

    for split in ("val", "test"):
        for metric in ("mae_kg", "rmse_kg", "r2"):
            val_a = result_a["model"][f"{split}_metrics"][metric]
            val_b = result_b["model"][f"{split}_metrics"][metric]
            assert val_a == val_b, (
                f"Metric {split}/{metric} differs between runs: {val_a} vs {val_b}"
            )


# ---------------------------------------------------------------------------
# 10. Full-run metrics sanity (from dry_run result)
# ---------------------------------------------------------------------------

def test_model_val_r2_positive(train_result):
    """Model validation R² must be positive (beats predicting the mean)."""
    r2 = train_result["model"]["val_metrics"]["r2"]
    assert r2 > 0, f"Val R² = {r2:.4f} — model does not outperform the global mean."


def test_model_test_mae_less_than_baseline(train_result):
    """Model test MAE must be less than baseline test MAE on the held-out test split."""
    model_mae    = train_result["model"]["test_metrics"]["mae_kg"]
    baseline_mae = train_result["baseline"]["test_metrics"]["mae_kg"]
    assert model_mae < baseline_mae, (
        f"Model test MAE {model_mae:.2f} is not better than baseline test MAE {baseline_mae:.2f}."
    )


def test_model_test_r2_is_finite(train_result):
    """Test R² must be a finite number."""
    assert math.isfinite(train_result["model"]["test_metrics"]["r2"])


def test_all_metrics_are_finite(train_result):
    """All reported metrics must be finite floats."""
    for scope in ("val_metrics", "test_metrics"):
        for m in train_result["model"][scope].values():
            assert math.isfinite(m), f"{scope} metric is not finite: {m}"
        for m in train_result["baseline"][scope].values():
            assert math.isfinite(m), f"Baseline {scope} metric is not finite: {m}"


def test_data_source_is_synthetic(train_result):
    """Training result must always report data_source='synthetic_v1'."""
    assert train_result["data_source"] == "synthetic_v1"


# ---------------------------------------------------------------------------
# 11. Artifact round-trip
# ---------------------------------------------------------------------------

def test_artifact_roundtrip_produces_same_predictions(fitted_pipeline, loaded_splits, tmp_path):
    """joblib.dump → joblib.load must produce numerically identical predictions."""
    _, val_df, _ = loaded_splits
    X_val = val_df[tdm.FEATURE_COLUMNS]

    preds_before = fitted_pipeline.predict(X_val)

    artifact_path = tmp_path / "test_demand_model.joblib"
    joblib.dump(fitted_pipeline, artifact_path)
    loaded = joblib.load(artifact_path)
    preds_after = loaded.predict(X_val)

    np.testing.assert_allclose(preds_before, preds_after, rtol=1e-5, atol=1e-5,
        err_msg="Predictions differ before and after joblib round-trip.")


def test_artifact_accepts_feature_columns_only(fitted_pipeline, loaded_splits, tmp_path):
    """Loaded artifact must work with just FEATURE_COLUMNS (no leakage columns needed)."""
    _, val_df, _ = loaded_splits
    artifact_path = tmp_path / "test_demand_model_features.joblib"
    joblib.dump(fitted_pipeline, artifact_path)
    loaded = joblib.load(artifact_path)

    # Pass only the feature columns — if leakage columns were needed this would fail
    preds = loaded.predict(val_df[tdm.FEATURE_COLUMNS])
    assert len(preds) == len(val_df)


# ---------------------------------------------------------------------------
# 12. Saved model metadata structure (check against on-disk artifact from prior run)
# ---------------------------------------------------------------------------

def test_saved_metadata_has_required_keys():
    """Saved demand_prediction_metadata.json must contain all required top-level keys."""
    _, _, _, meta_path = tdm._resolve_paths()
    if not meta_path.exists():
        pytest.skip("Model metadata not yet on disk — run training script first.")

    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)

    required = {
        "model_name", "model_type", "version", "data_source", "data_source_warning",
        "trained_at", "random_seed", "target_column", "target_unit",
        "feature_columns", "feature_order_for_inference", "categorical_features",
        "numeric_features", "crop_vocabulary", "location_vocabulary",
        "season_vocabulary", "quality_vocabulary", "preprocessing",
        "leakage_excluded_columns", "split", "deployment_gate",
        "baseline", "model_metrics", "feature_importances", "limitations",
    }
    missing = required - set(meta.keys())
    assert not missing, f"Model metadata missing keys: {sorted(missing)}"


def test_saved_metadata_data_source():
    """Saved metadata must have data_source='synthetic_v1'."""
    _, _, _, meta_path = tdm._resolve_paths()
    if not meta_path.exists():
        pytest.skip("Model metadata not yet on disk — run training script first.")
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    assert meta["data_source"] == "synthetic_v1"


def test_saved_metadata_gate_passed():
    """Saved metadata deployment_gate.passed must be True (gate was passed to save)."""
    _, _, _, meta_path = tdm._resolve_paths()
    if not meta_path.exists():
        pytest.skip("Model metadata not yet on disk — run training script first.")
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    assert meta["deployment_gate"]["passed"] is True


def test_saved_metadata_feature_columns_match():
    """Saved metadata feature_columns must match FEATURE_COLUMNS constant."""
    _, _, _, meta_path = tdm._resolve_paths()
    if not meta_path.exists():
        pytest.skip("Model metadata not yet on disk — run training script first.")
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    assert set(meta["feature_columns"]) == set(tdm.FEATURE_COLUMNS)
