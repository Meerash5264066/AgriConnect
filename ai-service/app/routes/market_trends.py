"""Agricultural market trend analysis routes."""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.common import (
    ErrorResponse,
    MarketFilterOptionsResponse,
    MarketTrendsResponse,
)
from app.services.market_trends import (
    DatasetUnavailableError,
    InvalidFilterError,
    get_market_trends_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market-trends", tags=["Market Trend Analysis"])


@router.get(
    "/options",
    response_model=MarketFilterOptionsResponse,
    summary="Get Available Market Filter Options",
    description="Returns available commodities, states, districts, markets, and date range for dynamic UI selectors.",
    responses={
        status.HTTP_200_OK: {
            "model": MarketFilterOptionsResponse,
            "description": "Available filter parameters retrieved successfully.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ErrorResponse,
            "description": "Market price dataset is not accessible.",
        },
    },
)
async def get_filter_options(
    commodity: Optional[str] = Query(None, description="Selected commodity to filter states/markets for"),
    state: Optional[str] = Query(None, description="Selected state to filter districts/markets for"),
    district: Optional[str] = Query(None, description="Selected district to filter markets for"),
) -> MarketFilterOptionsResponse:
    """Retrieve dynamic dropdown selections for agricultural market trends."""
    service = get_market_trends_service()
    try:
        return service.get_filter_options(commodity=commodity, state=state, district=district)
    except DatasetUnavailableError as err:
        logger.error("Dataset unavailable: %s", err)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "message": "Market price dataset index is currently unavailable.",
                "error_code": "DATASET_UNAVAILABLE",
            },
        )
    except Exception as exc:
        logger.error("Failed to retrieve filter options: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Failed to retrieve market trend filter options.",
                "error_code": "INTERNAL_ERROR",
            },
        )


@router.get(
    "",
    response_model=MarketTrendsResponse,
    summary="Analyze Agricultural Commodity Market Price Trends",
    description=(
        "Analyzes historical APMC arrival modal prices for a commodity and market over time. "
        "Calculates aggregated time series (daily, weekly, monthly), period-over-period percentage changes, "
        "summary price statistics, statistical trend classification (Rising, Falling, Stable), "
        "peer market comparisons, and farmer-friendly insights."
    ),
    responses={
        status.HTTP_200_OK: {
            "model": MarketTrendsResponse,
            "description": "Market trend analysis successfully generated.",
        },
        status.HTTP_400_BAD_REQUEST: {
            "model": ErrorResponse,
            "description": "Invalid query parameters, unsupported aggregation, or date syntax.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ErrorResponse,
            "description": "Market price dataset index is missing or unreadable.",
        },
    },
)
async def get_market_trends(
    commodity: str = Query("Tomato", min_length=2, max_length=100, description="Crop or commodity name (e.g. Tomato, Onion, Potato)"),
    state: Optional[str] = Query(None, max_length=100, description="Indian State name (e.g. Maharashtra, Tamil Nadu)"),
    district: Optional[str] = Query(None, max_length=100, description="District name"),
    market: Optional[str] = Query(None, max_length=100, description="Specific APMC Mandi or market center"),
    start_date: Optional[str] = Query(None, description="Start date filter in YYYY-MM-DD format"),
    end_date: Optional[str] = Query(None, description="End date filter in YYYY-MM-DD format"),
    aggregation: str = Query("daily", description="Time frequency: 'daily', 'weekly', or 'monthly'"),
) -> MarketTrendsResponse:
    """Execute statistical market trend analysis on historical APMC modal prices."""
    service = get_market_trends_service()
    try:
        return service.analyze_market_trends(
            commodity=commodity,
            state=state,
            district=district,
            market=market,
            start_date=start_date,
            end_date=end_date,
            aggregation=aggregation,
        )
    except InvalidFilterError as err:
        logger.warning("Invalid filter in market trends query: %s", err)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": str(err),
                "error_code": "INVALID_FILTER",
            },
        )
    except DatasetUnavailableError as err:
        logger.error("Dataset unavailable in market trends query: %s", err)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "message": "Market price dataset index is currently unavailable.",
                "error_code": "DATASET_UNAVAILABLE",
            },
        )
    except Exception as exc:
        logger.error("Failed to process market trends query: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Unexpected error occurred during market trend analysis.",
                "error_code": "INTERNAL_ERROR",
            },
        )
