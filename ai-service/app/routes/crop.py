"""Crop recommendation endpoint routes."""

import logging
from fastapi import APIRouter, HTTPException, status
from app.schemas.common import CropRecommendationRequest, ErrorResponse
from app.services.model_registry import get_model_registry, ModelNotAvailableError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/crop", tags=["Crop Recommendation"])


@router.post(
    "/recommend",
    summary="Recommend Optimal Crop",
    description=(
        "Recommends suitable crops based on soil nutrient composition (N, P, K), "
        "soil pH, and environmental climate parameters (temperature, humidity, rainfall). "
        "Returns HTTP 501 until model training and evaluation are completed in Phase 14."
    ),
    responses={
        status.HTTP_501_NOT_IMPLEMENTED: {
            "model": ErrorResponse,
            "description": "Model is not yet trained or available.",
        },
        422: {
            "description": "Validation error for numeric soil or climate parameters.",
        },
    },
)
async def recommend_crop(request: CropRecommendationRequest):
    """Receive validated soil/climate features and invoke crop recommendation model."""
    registry = get_model_registry()

    try:
        # Attempt to retrieve model; raises ModelNotAvailableError if weights do not exist
        model = registry.get_model("crop_recommendation")
    except ModelNotAvailableError as err:
        logger.info("Crop recommendation model request rejected: %s", err.message)
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={
                "message": (
                    "Crop recommendation model is not available. "
                    "Dataset ingestion, training, and evaluation are scheduled for Phase 14."
                ),
                "error_code": "MODEL_NOT_TRAINED",
                "model": "crop_recommendation",
            },
        )

    # Real inference on verified model
    import numpy as np
    import pandas as pd
    from app.schemas.common import CropRecommendationResponse

    features = pd.DataFrame([{
        "N": request.nitrogen,
        "P": request.phosphorus,
        "K": request.potassium,
        "temperature": request.temperature,
        "humidity": request.humidity,
        "ph": request.ph,
        "rainfall": request.rainfall,
    }])

    try:
        pred = model.predict(features)
        recommended_crop = str(pred[0])
        confidence = float(np.max(model.predict_proba(features))) if hasattr(model, "predict_proba") else 1.0
        return CropRecommendationResponse(
            recommended_crop=recommended_crop,
            confidence=round(confidence, 4),
            input_features=request.model_dump(),
            model_version="RandomForest-v1",
        )
    except Exception as exc:
        logger.error("Crop recommendation model inference error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Inference failed during crop recommendation.",
        )
