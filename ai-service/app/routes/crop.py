"""Crop recommendation endpoint routes."""

import logging
from fastapi import APIRouter, File, HTTPException, UploadFile, status
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


@router.post(
    "/parse-soil-report",
    summary="Parse Uploaded Soil Laboratory Test Report",
    description=(
        "Extracts soil nutrient parameters (N, P, K, pH), secondary metrics (Organic Carbon, EC, Texture), "
        "and laboratory metadata from text-based PDFs, scanned PDFs, or JPG/PNG images. "
        "Normalizes extracted nutrient values to kg/ha and flags any missing required inputs for farmer review."
    ),
    responses={
        status.HTTP_200_OK: {
            "description": "Soil laboratory report analyzed and values extracted successfully.",
        },
        status.HTTP_400_BAD_REQUEST: {
            "description": "Unsupported file format or password-protected PDF document.",
        },
        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE: {
            "description": "Uploaded file exceeds 10 MB maximum size limit.",
        },
        status.HTTP_422_UNPROCESSABLE_ENTITY: {
            "description": "File is empty, corrupted, or unreadable.",
        },
    },
)
async def parse_soil_report(file: UploadFile = File(...)):
    """Receive uploaded soil test report, extract laboratory parameters, and normalize units."""
    from app.services.soil_report_parser import (
        get_soil_report_parser,
        InvalidFileTypeError,
        FileSizeExceededError,
        PasswordProtectedPDFError,
        CorruptReportFileError,
    )

    parser = get_soil_report_parser()

    try:
        file_bytes = await file.read()
        return parser.parse_soil_report(
            file_bytes=file_bytes,
            filename=file.filename or "soil_report.pdf",
            content_type=file.content_type,
        )

    except InvalidFileTypeError as err:
        logger.warning("Soil report validation rejected: %s", err)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": str(err), "error_code": "INVALID_FILE_TYPE"},
        )
    except PasswordProtectedPDFError as err:
        logger.warning("Password protected soil report rejected: %s", err)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": str(err), "error_code": "PASSWORD_PROTECTED_PDF"},
        )
    except FileSizeExceededError as err:
        logger.warning("Soil report size exceeded: %s", err)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"message": str(err), "error_code": "FILE_SIZE_EXCEEDED"},
        )
    except CorruptReportFileError as err:
        logger.warning("Unreadable or corrupt soil report rejected: %s", err)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": str(err), "error_code": "CORRUPT_REPORT_FILE"},
        )
    except Exception as exc:
        logger.error("Unexpected error parsing soil report: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Server encountered an error while processing the soil report: {exc}"},
        )
    finally:
        await file.close()
