"""Schema package initialization."""
from app.schemas.common import (
    HealthResponse,
    ReadinessResponse,
    ModelStatusInfo,
    ErrorResponse,
    CropRecommendationRequest,
    CropRecommendationResponse,
    PricePredictionRequest,
    PricePredictionResponse,
    DemandPredictionRequest,
    DiseaseDetectionResponse,
)

__all__ = [
    "HealthResponse",
    "ReadinessResponse",
    "ModelStatusInfo",
    "ErrorResponse",
    "CropRecommendationRequest",
    "CropRecommendationResponse",
    "PricePredictionRequest",
    "PricePredictionResponse",
    "DemandPredictionRequest",
    "DiseaseDetectionResponse",
]
