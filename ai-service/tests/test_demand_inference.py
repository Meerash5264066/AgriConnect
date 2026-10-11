"""Tests for the demand prediction FastAPI inference endpoint.

Verifies:
  - Positive-path predictions with full payload and all required response fields.
  - Case and whitespace normalization on crop and location.
  - Common city-to-state location resolution (e.g. Mumbai -> Maharashtra).
  - Season derivation from calendar month.
  - Calendar month derivation from season.
  - Rejection with HTTP 422 when both month and season are missing.
  - Rejection with HTTP 422 on season-month mismatch.
  - Rejection with HTTP 422 for unsupported crop, location, season, quality tier.
  - Rejection with HTTP 422 for negative or invalid historical volume.
  - Inference succeeds when historical volume is omitted without fabricating a fallback.
  - HTTP 501 when model is unavailable (ModelNotAvailableError).
  - HTTP 503 when model loading fails with an unexpected exception.
  - Explicit presence of experimental status notes, baseline status, and synthetic disclaimers.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.model_registry import ModelNotAvailableError, ModelRegistry

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_model_registry_cache():
    """Ensure singleton registry cache does not leak loaded models to subsequent test modules."""
    yield
    from app.services.model_registry import get_model_registry
    get_model_registry()._loaded_models.clear()


# ---------------------------------------------------------------------------
# Positive Path & Schema Verification
# ---------------------------------------------------------------------------

def test_positive_prediction_full_payload():
    """Verify inference succeeds with complete valid payload and returns required schema fields."""
    payload = {
        "crop": "Tomato",
        "location": "Tamil Nadu",
        "month": 8,
        "season": "Kharif",
        "historical_volume": 52000.0,
        "quality_tier": "Grade A",
    }
    response = client.post("/api/v1/demand/predict", json=payload)
    assert response.status_code == 200
    data = response.json()

    # Core attributes
    assert data["crop"] == "Tomato"
    assert data["location"] == "Tamil Nadu"
    assert data["month"] == 8
    assert data["season"] == "Kharif"
    assert isinstance(data["predicted_demand_kg"], (int, float))
    assert data["predicted_demand_kg"] >= 0.0
    assert data["unit"] == "kg"
    assert data["model_version"] == "1.0.0-synthetic"
    assert "RandomForest" in data["model_name"]

    # Experimental and synthetic disclosures
    assert data["model_status"] == "experimental"
    assert data["is_synthetic"] is True
    assert "synthetic" in data["disclaimer"].lower()
    assert "procurement" in data["disclaimer"].lower()
    assert "baseline" in data["model_status_note"].lower()

    # Baseline status verification: lookup table not in metadata
    assert data["baseline_demand_kg"] is None
    assert "metadata" in data["baseline_note"].lower()

    # Resolved input features
    assert data["input_features"]["crop_name"] == "Tomato"
    assert data["input_features"]["location"] == "Tamil Nadu"
    assert data["input_features"]["quality_tier"] == "Grade A"
    assert data["input_features"]["historical_volume_kg"] == 52000.0


def test_positive_prediction_different_crop_and_state():
    """Verify inference for a different crop and state combination (Wheat in Madhya Pradesh)."""
    payload = {
        "crop": "Wheat",
        "location": "Madhya Pradesh",
        "month": 2,
        "season": "Rabi",
        "historical_volume": 65000.0,
        "quality_tier": "Grade B",
    }
    response = client.post("/api/v1/demand/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["crop"] == "Wheat"
    assert data["location"] == "Madhya Pradesh"
    assert data["predicted_demand_kg"] >= 0.0
    assert data["input_features"]["quality_tier"] == "Grade B"


# ---------------------------------------------------------------------------
# Normalization & Aliases
# ---------------------------------------------------------------------------

def test_case_and_whitespace_normalization():
    """Verify whitespace stripping and case-insensitive matching."""
    payload = {
        "crop": "  pOTAto  ",
        "location": "  maHARashtra  ",
        "month": 11,
        "season": " rAbI ",
    }
    response = client.post("/api/v1/demand/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["crop"] == "Potato"
    assert data["location"] == "Maharashtra"
    assert data["season"] == "Rabi"


def test_city_to_state_mapping():
    """Verify common regional market cities resolve to their canonical states."""
    test_cities = [
        ("Mumbai", "Maharashtra"),
        ("chennai", "Tamil Nadu"),
        ("Bangalore", "Karnataka"),
        ("bhopal", "Madhya Pradesh"),
        ("Hyderabad", "Andhra Pradesh"),
    ]
    for city, expected_state in test_cities:
        payload = {
            "crop": "Onion",
            "location": city,
            "month": 1,
        }
        response = client.post("/api/v1/demand/predict", json=payload)
        assert response.status_code == 200, f"Failed for city {city}: {response.text}"
        data = response.json()
        assert data["location"] == expected_state


# ---------------------------------------------------------------------------
# Month & Season Derivation
# ---------------------------------------------------------------------------

def test_derive_season_from_month():
    """Verify missing season is automatically derived from calendar month."""
    cases = [(8, "Kharif"), (2, "Rabi"), (5, "Zaid"), (11, "Rabi"), (7, "Kharif")]
    for month, expected_season in cases:
        payload = {
            "crop": "Rice",
            "location": "Tamil Nadu",
            "month": month,
        }
        response = client.post("/api/v1/demand/predict", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["month"] == month
        assert data["season"] == expected_season


def test_derive_month_from_season():
    """Verify missing month is automatically derived from canonical season mid-point."""
    cases = [("Kharif", 8), ("Rabi", 2), ("Zaid", 5)]
    for season, expected_month in cases:
        payload = {
            "crop": "Maize",
            "location": "Karnataka",
            "season": season,
        }
        response = client.post("/api/v1/demand/predict", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["season"] == season
        assert data["month"] == expected_month


def test_missing_both_month_and_season_returns_422():
    """Verify request is rejected with HTTP 422 if neither month nor season is provided."""
    payload = {
        "crop": "Tomato",
        "location": "Tamil Nadu",
    }
    response = client.post("/api/v1/demand/predict", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert data["detail"]["error_code"] == "MISSING_TIME_CONTEXT"


def test_season_month_mismatch_returns_422():
    """Verify conflict between month and season produces a clear HTTP 422 error."""
    payload = {
        "crop": "Tomato",
        "location": "Tamil Nadu",
        "month": 8,       # August is Kharif
        "season": "Rabi",  # Incompatible
    }
    response = client.post("/api/v1/demand/predict", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert data["detail"]["error_code"] == "SEASON_MONTH_MISMATCH"


# ---------------------------------------------------------------------------
# Vocabulary & Input Validation
# ---------------------------------------------------------------------------

def test_unsupported_crop_returns_422():
    """Verify out-of-vocabulary crop returns HTTP 422 with supported list."""
    payload = {
        "crop": "Dragonfruit",
        "location": "Tamil Nadu",
        "month": 8,
    }
    response = client.post("/api/v1/demand/predict", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert data["detail"]["error_code"] == "UNSUPPORTED_CROP"
    assert "Tomato" in data["detail"]["supported_crops"]


def test_unsupported_location_returns_422():
    """Verify out-of-vocabulary location returns HTTP 422 with supported list."""
    payload = {
        "crop": "Tomato",
        "location": "London",
        "month": 8,
    }
    response = client.post("/api/v1/demand/predict", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert data["detail"]["error_code"] == "UNSUPPORTED_LOCATION"
    assert "Tamil Nadu" in data["detail"]["supported_locations"]


def test_unsupported_season_returns_422():
    """Verify unknown season string returns HTTP 422."""
    payload = {
        "crop": "Tomato",
        "location": "Tamil Nadu",
        "season": "Autumn",
    }
    response = client.post("/api/v1/demand/predict", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert data["detail"]["error_code"] == "UNSUPPORTED_SEASON"


def test_invalid_month_out_of_range_returns_422():
    """Verify month outside 1..12 is rejected."""
    payload = {
        "crop": "Tomato",
        "location": "Tamil Nadu",
        "month": 13,
    }
    response = client.post("/api/v1/demand/predict", json=payload)
    assert response.status_code == 422


def test_negative_historical_volume_returns_422():
    """Verify negative historical volume is rejected."""
    payload = {
        "crop": "Tomato",
        "location": "Tamil Nadu",
        "month": 8,
        "historical_volume": -50.0,
    }
    response = client.post("/api/v1/demand/predict", json=payload)
    assert response.status_code == 422


def test_unsupported_quality_tier_returns_422():
    """Verify quality tier outside 'Grade A' and 'Grade B' is rejected."""
    payload = {
        "crop": "Tomato",
        "location": "Tamil Nadu",
        "month": 8,
        "quality_tier": "Grade C",
    }
    response = client.post("/api/v1/demand/predict", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert data["detail"]["error_code"] == "UNSUPPORTED_QUALITY_TIER"


def test_omitted_historical_volume_succeeds_without_invented_fallback():
    """Verify inference succeeds when historical volume is omitted without fabricating a number."""
    payload = {
        "crop": "Tomato",
        "location": "Tamil Nadu",
        "month": 8,
    }
    response = client.post("/api/v1/demand/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["predicted_demand_kg"] >= 0.0
    # Input feature confirms null/NaN passed, not an invented constant
    assert data["input_features"]["historical_volume_kg"] is None


# ---------------------------------------------------------------------------
# Artifact Lifecycle & Registry Mocking
# ---------------------------------------------------------------------------

def test_missing_artifact_returns_501(tmp_path, monkeypatch):
    """Verify missing model artifact produces HTTP 501 MODEL_NOT_TRAINED."""
    empty_registry = ModelRegistry(model_dir=tmp_path)
    monkeypatch.setattr("app.routes.demand.get_model_registry", lambda: empty_registry)

    payload = {
        "crop": "Tomato",
        "location": "Tamil Nadu",
        "month": 8,
    }
    response = client.post("/api/v1/demand/predict", json=payload)
    assert response.status_code == 501
    data = response.json()
    assert data["detail"]["error_code"] == "MODEL_NOT_TRAINED"


def test_artifact_load_failure_returns_503(monkeypatch):
    """Verify unexpected exception during model retrieval produces HTTP 503."""
    class FailingRegistry:
        def get_model(self, key):
            raise IOError("Simulated corrupt model artifact on disk")

    monkeypatch.setattr("app.routes.demand.get_model_registry", lambda: FailingRegistry())

    payload = {
        "crop": "Tomato",
        "location": "Tamil Nadu",
        "month": 8,
    }
    response = client.post("/api/v1/demand/predict", json=payload)
    assert response.status_code == 503
    data = response.json()
    assert data["detail"]["error_code"] == "MODEL_LOAD_FAILED"
