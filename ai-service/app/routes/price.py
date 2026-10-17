"""Commodity price baseline prediction routes."""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from app.schemas.common import (
    PricePredictionRequest,
    PricePredictionResponse,
    ErrorResponse,
)
from app.services.price_history import (
    get_price_history_service,
    PriceRecordNotFoundError,
    AmbiguousMarketMatchError,
    AmbiguousDistrictMatchError,
    PriceHistoryFileNotFoundError,
    MalformedPriceDatasetError,
    InvalidPriceRecordError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/price", tags=["Price Prediction"])


@router.post(
    "/predict",
    response_model=PricePredictionResponse,
    summary="Predict Agricultural Commodity Price (Baseline)",
    description=(
        "Retrieves the latest observed modal price baseline from historical APMC mandi arrivals. "
        "Matches crop to Commodity, market to Market, and state_or_region to State (case-insensitive). "
        "Returns HTTP 404 if no records match, or HTTP 409 if the market matches ambiguously across "
        "multiple states or districts."
    ),
    responses={
        status.HTTP_200_OK: {
            "model": PricePredictionResponse,
            "description": "Latest observed commodity price record successfully matched.",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ErrorResponse,
            "description": "No historical price records found matching the requested crop and market.",
        },
        status.HTTP_409_CONFLICT: {
            "model": ErrorResponse,
            "description": "Ambiguous market match requiring state_or_region disambiguation or district granularity.",
        },
        422: {
            "description": "Validation error for input parameters or non-positive historical price.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ErrorResponse,
            "description": "Price history lookup dataset is missing or unreadable.",
        },
    },
)
async def predict_price(request: PricePredictionRequest) -> PricePredictionResponse:
    """Receive commodity parameters and query latest observed modal price baseline."""
    service = get_price_history_service()

    try:
        result = service.get_latest_price(
            crop=request.crop,
            market=request.market,
            state_or_region=request.state_or_region,
            requested_date=request.date,
        )
        return PricePredictionResponse(**result)

    except PriceRecordNotFoundError as err:
        logger.info(
            "Price record not found for crop='%s', market='%s', state='%s'",
            request.crop,
            request.market,
            request.state_or_region,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "message": f"No historical price records found for crop '{request.crop}' at market '{request.market}'.",
                "error_code": "PRICE_RECORD_NOT_FOUND",
                "crop": request.crop,
                "market": request.market,
                "state_or_region": request.state_or_region,
            },
        )

    except AmbiguousMarketMatchError as err:
        logger.info("Ambiguous market match for '%s': states=%s", request.market, err.candidate_states)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    f"Market '{request.market}' exists across multiple states: {', '.join(err.candidate_states)}. "
                    "Please specify 'state_or_region' in your request to disambiguate."
                ),
                "error_code": "AMBIGUOUS_MARKET_MATCH",
                "crop": err.crop,
                "market": err.market,
                "candidate_states": err.candidate_states,
            },
        )

    except AmbiguousDistrictMatchError as err:
        logger.info(
            "Ambiguous district match for '%s' in state '%s': districts=%s",
            request.market,
            err.state,
            err.candidate_districts,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    f"Market '{request.market}' in state '{err.state}' corresponds to multiple distinct districts: "
                    f"{', '.join(err.candidate_districts)}. Cannot resolve without district specification."
                ),
                "error_code": "AMBIGUOUS_DISTRICT_MATCH",
                "crop": err.crop,
                "market": err.market,
                "state": err.state,
                "candidate_districts": err.candidate_districts,
            },
        )

    except (PriceHistoryFileNotFoundError, MalformedPriceDatasetError) as err:
        logger.error("Price history dataset error: %s", err)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "message": "Price history lookup dataset is currently unavailable or malformed.",
                "error_code": "PRICE_DATASET_UNAVAILABLE",
            },
        )

    except InvalidPriceRecordError as err:
        logger.error("Invalid price record in dataset: %s", err)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Encountered invalid price value or observation date in dataset.",
                "error_code": "INVALID_PRICE_RECORD",
            },
        )


@router.get(
    "/mandi-ticker",
    summary="Get Traceable APMC Mandi Price Ticker Data",
    description=(
        "Returns verified agricultural commodity prices across 30+ commodities and Indian APMC mandis. "
        "Modal prices are converted from standard APMC ₹/quintal to ₹/kg (₹/kg = ₹/quintal ÷ 100). "
        "Clearly identifies observation dates, official data source, and freshness."
    ),
    responses={
        status.HTTP_200_OK: {
            "description": "APMC mandi ticker data retrieved successfully.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": "Mandi price dataset is unavailable.",
        },
    },
)
@router.get("/ticker", include_in_schema=False)
async def get_mandi_ticker(
    state: Optional[str] = Query(None, description="Optional Indian state filter"),
    refresh: Optional[bool] = Query(False, description="Force refresh cache"),
):
    """Retrieve expanded APMC mandi price ticker records."""
    from app.services.mandi_ticker import get_mandi_ticker_service

    service = get_mandi_ticker_service()
    try:
        return service.get_ticker_payload(state_filter=state, force_refresh=bool(refresh))
    except Exception as exc:
        logger.error("Failed to load mandi ticker records: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": f"Unable to retrieve mandi ticker prices: {exc}"},
        )
