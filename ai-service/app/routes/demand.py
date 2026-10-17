"""Produce demand forecasting routes."""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, status

from app.schemas.common import (
    DemandPredictionRequest,
    DemandPredictionResponse,
    ErrorResponse,
)
from app.services.model_registry import ModelNotAvailableError, get_model_registry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/demand", tags=["Demand Prediction"])

# Supported vocabularies matching demand_prediction_metadata.json
CROP_VOCABULARY: List[str] = [
    "Tomato", "Onion", "Potato", "Wheat", "Rice",
    "Maize", "Chickpea", "Sugarcane", "Soybean", "Brinjal",
]
LOCATION_VOCABULARY: List[str] = [
    "Tamil Nadu", "Andhra Pradesh", "Karnataka", "Maharashtra", "Madhya Pradesh",
]
SEASON_VOCABULARY: List[str] = ["Kharif", "Rabi", "Zaid"]
QUALITY_VOCABULARY: List[str] = ["Grade A", "Grade B"]

# Calendar month to season mapping (project-canonical)
MONTH_TO_SEASON: Dict[int, str] = {
    1: "Rabi",
    2: "Rabi",
    3: "Rabi",
    4: "Zaid",
    5: "Zaid",
    6: "Zaid",
    7: "Kharif",
    8: "Kharif",
    9: "Kharif",
    10: "Kharif",
    11: "Rabi",
    12: "Rabi",
}

# Mid-season representative month derivation for missing months
SEASON_TO_MONTH: Dict[str, int] = {
    "Kharif": 8,  # August (peak Kharif monsoon)
    "Rabi": 2,    # February (peak Rabi winter)
    "Zaid": 5,    # May (peak Zaid summer)
}

# Regional city-to-state alias mappings for user convenience
CITY_TO_STATE: Dict[str, str] = {
    "mumbai": "Maharashtra",
    "pune": "Maharashtra",
    "nagpur": "Maharashtra",
    "chennai": "Tamil Nadu",
    "coimbatore": "Tamil Nadu",
    "madurai": "Tamil Nadu",
    "bangalore": "Karnataka",
    "bengaluru": "Karnataka",
    "mysore": "Karnataka",
    "hyderabad": "Andhra Pradesh",
    "visakhapatnam": "Andhra Pradesh",
    "vijayawada": "Andhra Pradesh",
    "bhopal": "Madhya Pradesh",
    "indore": "Madhya Pradesh",
}


@router.post(
    "/predict",
    response_model=DemandPredictionResponse,
    summary="Predict Agricultural Produce Demand",
    description=(
        "Forecasts regional crop procurement demand volumes based on commodity, location, season, "
        "and historic demand indicators using the Phase 14 experimental Random Forest regressor. "
        "Returns HTTP 501 if model artifact is not yet trained or available."
    ),
    responses={
        status.HTTP_200_OK: {
            "model": DemandPredictionResponse,
            "description": "Successful demand forecast with experimental status disclosures.",
        },
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "description": "Validation error or unsupported categorical vocabulary input.",
        },
        status.HTTP_501_NOT_IMPLEMENTED: {
            "model": ErrorResponse,
            "description": "Model is not yet trained or available.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ErrorResponse,
            "description": "Model artifact could not be loaded.",
        },
    },
)
async def predict_demand(request: DemandPredictionRequest) -> DemandPredictionResponse:
    """Receive validated demand parameters, normalize inputs, and invoke forecasting pipeline."""
    registry = get_model_registry()

    # 1. Model Availability Guard ----------------------------------------------
    try:
        model = registry.get_model("demand_prediction")
    except ModelNotAvailableError as err:
        logger.info("Demand prediction model request rejected: %s", err.message)
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={
                "message": (
                    "Demand prediction model is not available. "
                    "Historical demand dataset ingestion and model training are scheduled for Phase 14."
                ),
                "error_code": "MODEL_NOT_TRAINED",
                "model": "demand_prediction",
            },
        )
    except Exception as exc:
        logger.error("Failed to load demand prediction model: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "message": "Demand prediction model artifact could not be loaded.",
                "error_code": "MODEL_LOAD_FAILED",
                "model": "demand_prediction",
            },
        )

    # 2. Crop Normalization & Validation ---------------------------------------
    crop_clean = request.crop.strip() if request.crop else ""
    crop_map = {c.lower(): c for c in CROP_VOCABULARY}
    if crop_clean.lower() not in crop_map:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error_code": "UNSUPPORTED_CROP",
                "message": f"Crop '{request.crop}' is not supported by the demand forecasting model.",
                "supported_crops": CROP_VOCABULARY,
            },
        )
    canonical_crop = crop_map[crop_clean.lower()]

    # 3. Location Normalization & Validation -----------------------------------
    loc_clean = request.location.strip() if request.location else ""
    loc_map = {l.lower(): l for l in LOCATION_VOCABULARY}
    if loc_clean.lower() in loc_map:
        canonical_location = loc_map[loc_clean.lower()]
    elif loc_clean.lower() in CITY_TO_STATE:
        canonical_location = CITY_TO_STATE[loc_clean.lower()]
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error_code": "UNSUPPORTED_LOCATION",
                "message": f"Location '{request.location}' is not supported by the demand forecasting model.",
                "supported_locations": LOCATION_VOCABULARY,
            },
        )

    # 4. Month & Season Validation and Derivation ------------------------------
    if request.month is None and request.season is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error_code": "MISSING_TIME_CONTEXT",
                "message": (
                    "At least one of 'month' (1-12) or 'season' ('Kharif', 'Rabi', 'Zaid') "
                    "must be provided."
                ),
            },
        )

    season_map = {s.lower(): s for s in SEASON_VOCABULARY}
    canonical_season: Optional[str] = None
    if request.season is not None:
        season_clean = request.season.strip().lower()
        if season_clean not in season_map:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error_code": "UNSUPPORTED_SEASON",
                    "message": f"Season '{request.season}' is not recognized.",
                    "supported_seasons": SEASON_VOCABULARY,
                },
            )
        canonical_season = season_map[season_clean]

    canonical_month: Optional[int] = None
    if request.month is not None:
        if not (1 <= request.month <= 12):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error_code": "INVALID_MONTH",
                    "message": f"Month must be between 1 and 12, got {request.month}.",
                },
            )
        canonical_month = int(request.month)
        expected_season = MONTH_TO_SEASON[canonical_month]

        if canonical_season is not None and canonical_season != expected_season:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error_code": "SEASON_MONTH_MISMATCH",
                    "message": (
                        f"Season '{request.season}' does not match calendar month "
                        f"{request.month} (expected '{expected_season}')."
                    ),
                },
            )
        if canonical_season is None:
            canonical_season = expected_season
    else:
        # month is None; derive representative mid-season month from season
        assert canonical_season is not None
        canonical_month = SEASON_TO_MONTH[canonical_season]

    # 5. Quality Tier Normalization & Validation -------------------------------
    quality_map = {q.lower(): q for q in QUALITY_VOCABULARY}
    if request.quality_tier is not None:
        q_clean = request.quality_tier.strip().lower()
        if q_clean not in quality_map:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error_code": "UNSUPPORTED_QUALITY_TIER",
                    "message": f"Quality tier '{request.quality_tier}' is invalid. Supported: {QUALITY_VOCABULARY}.",
                },
            )
        canonical_quality = quality_map[q_clean]
    else:
        canonical_quality = "Grade A"  # 80% majority class in training metadata

    # 6. Historical Volume Validation ------------------------------------------
    if request.historical_volume is not None:
        if request.historical_volume < 0.0 or not math.isfinite(request.historical_volume):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error_code": "INVALID_HISTORICAL_VOLUME",
                    "message": "historical_volume must be a non-negative finite number.",
                },
            )
        hist_vol: float = float(request.historical_volume)
    else:
        # Do not invent arbitrary numbers; pass NaN directly to scikit-learn estimator
        hist_vol = np.nan

    # 7. Construct Feature Matrix in Documented Canonical Order ---------------
    # feature_order_for_inference: crop_name, location, season, quality_tier,
    #                              expected_price_inr_per_kg, month, historical_volume_kg
    feature_row = pd.DataFrame([{
        "crop_name": canonical_crop,
        "location": canonical_location,
        "season": canonical_season,
        "quality_tier": canonical_quality,
        "expected_price_inr_per_kg": np.nan,  # SimpleImputer median handles this
        "month": canonical_month,
        "historical_volume_kg": hist_vol,
    }])

    # 8. Model Invocation ------------------------------------------------------
    try:
        raw_pred = float(model.predict(feature_row)[0])
        # Demand cannot be negative; clip to [0, 500,000] per specification
        predicted_demand = round(max(0.0, min(500000.0, raw_pred)), 2)
    except Exception as exc:
        logger.error("Demand model inference failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Inference failed during demand prediction.",
        )

    # 9. Return Response -------------------------------------------------------
    return DemandPredictionResponse(
        crop=canonical_crop,
        location=canonical_location,
        month=canonical_month,
        season=canonical_season,
        predicted_demand_kg=predicted_demand,
        baseline_demand_kg=None,  # Seasonal group lookup table is not stored in metadata artifact
        input_features={
            "crop_name": canonical_crop,
            "location": canonical_location,
            "month": canonical_month,
            "season": canonical_season,
            "quality_tier": canonical_quality,
            "historical_volume_kg": None if math.isnan(hist_vol) else hist_vol,
            "expected_price_inr_per_kg": None,
        },
    )
