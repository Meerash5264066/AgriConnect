"""Health and readiness probe routes."""

from fastapi import APIRouter
from app.core.config import get_settings
from app.schemas.common import HealthResponse, ReadinessResponse
from app.services.model_registry import get_model_registry

router = APIRouter(tags=["Health & Diagnostics"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health Check Probe",
    description="Returns basic liveness status to confirm the FastAPI AI service process is running.",
)
async def health_check() -> HealthResponse:
    """Return basic health liveness status."""
    return HealthResponse(status="healthy", service="agriconnect-ai")


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    summary="Readiness Check Probe",
    description=(
        "Verifies that the application is initialized and capable of receiving requests. "
        "Reports individual machine learning model artifact readiness."
    ),
)
async def readiness_check() -> ReadinessResponse:
    """Return readiness status including model training/availability status."""
    settings = get_settings()
    registry = get_model_registry()
    model_statuses = registry.get_all_models_status()

    return ReadinessResponse(
        status="ready",
        service="agriconnect-ai",
        version=settings.APP_VERSION,
        models=model_statuses,
    )
