"""AgriConnect AI Service entrypoint."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.routes import (
    health_router,
    crop_router,
    price_router,
    demand_router,
    disease_router,
    market_trends_router,
    chat_router,
)

settings = get_settings()

# Setup logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("agriconnect-ai")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifecycle events. Avoids loading heavy ML models at startup in Phase 13."""
    logger.info("Initializing %s v%s in %s mode", settings.APP_NAME, settings.APP_VERSION, settings.APP_ENV)
    
    # Ensure local directory scaffolding exists
    settings.model_path.mkdir(parents=True, exist_ok=True)
    settings.dataset_path.mkdir(parents=True, exist_ok=True)
    
    logger.info("AI Service foundation started successfully. Model directory: %s", settings.model_path)
    yield
    logger.info("Shutting down %s", settings.APP_NAME)


# FastAPI application instance
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Microservice providing machine learning inference capabilities for the AgriConnect platform. "
        "Includes crop recommendations, price forecasting, regional demand prediction, and leaf disease detection. "
        "Phase 13 establishes the modular architecture; Phase 14 adds trained model artifacts."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# CORS configuration: strict configured origins, local regex, and support for file:// origin (null)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_private_network_access_header(request: Request, call_next):
    """Support Chromium Private Network Access (PNA) preflights for local agritech hardware/UI."""
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


# Exception Handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle 422 validation errors with clean structured response."""
    errors = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error.get("loc", []))
        errors.append({
            "field": field,
            "message": error.get("msg", "Invalid value"),
            "type": error.get("type", "value_error"),
        })

    return JSONResponse(
        status_code=422,
        content={
            "detail": "Request validation failed. Please check the supplied input fields.",
            "error_code": "VALIDATION_ERROR",
            "errors": errors,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Sanitize internal errors to prevent leaking server details or stack traces."""
    logger.error("Unhandled server exception at %s %s: %s", request.method, request.url.path, str(exc), exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "An unexpected internal server error occurred. Please contact the system administrator.",
            "error_code": "INTERNAL_SERVER_ERROR",
        },
    )


# Root Endpoint
@app.get(
    "/",
    tags=["Root"],
    summary="AI Service Root",
    description="Returns service metadata, health check reference, and interactive documentation link.",
)
async def root():
    """Return root service information."""
    return {
        "service": "agriconnect-ai",
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
        "status": "operational",
        "docs_url": "/docs",
        "openapi_url": "/openapi.json",
        "endpoints": {
            "health": "/health",
            "readiness": "/ready",
            "crop_recommendation": f"{settings.AI_API_PREFIX}/crop/recommend",
            "price_prediction": f"{settings.AI_API_PREFIX}/price/predict",
            "demand_prediction": f"{settings.AI_API_PREFIX}/demand/predict",
            "disease_detection": f"{settings.AI_API_PREFIX}/disease/detect",
            "market_trends": f"{settings.AI_API_PREFIX}/market-trends",
        },
        "phase": "Phase 13 (AI Service Foundation & Market Trends)",
    }


# Register Health router at root level and API prefix for /health and /api/v1/health
app.include_router(health_router)
app.include_router(health_router, prefix=settings.AI_API_PREFIX)

# Register AI modules under configured API prefix (/api/v1)
app.include_router(crop_router, prefix=settings.AI_API_PREFIX)
app.include_router(price_router, prefix=settings.AI_API_PREFIX)
app.include_router(demand_router, prefix=settings.AI_API_PREFIX)
app.include_router(disease_router, prefix=settings.AI_API_PREFIX)
app.include_router(market_trends_router, prefix=settings.AI_API_PREFIX)
app.include_router(chat_router, prefix=settings.AI_API_PREFIX)
