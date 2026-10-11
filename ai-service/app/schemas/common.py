"""Pydantic schemas for request validation and response models."""

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# --- Health & Readiness Schemas ---

class HealthResponse(BaseModel):
    """Health check response."""
    status: str = Field(default="healthy", description="Service health status")
    service: str = Field(default="agriconnect-ai", description="Service identifier")


class ModelStatusInfo(BaseModel):
    """Status metadata for an individual machine learning model."""
    name: str = Field(..., description="Model identifier name")
    available: bool = Field(..., description="Whether model artifact is loaded and ready")
    status: str = Field(..., description="Training/deployment lifecycle status")
    artifact_found: bool = Field(..., description="Whether model weights exist on disk")
    expected_artifact: str = Field(..., description="Expected artifact filename")
    message: str = Field(..., description="Detailed status message")


class ReadinessResponse(BaseModel):
    """Readiness probe response including model registry status."""
    status: str = Field(default="ready", description="Application readiness status")
    service: str = Field(default="agriconnect-ai", description="Service identifier")
    version: str = Field(..., description="Service version")
    models: Dict[str, ModelStatusInfo] = Field(..., description="Model readiness dictionary")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO timestamp of the readiness check",
    )


# --- Error Schemas ---

class ErrorResponse(BaseModel):
    """Standardized error response payload."""
    detail: str = Field(..., description="Human-readable error description")
    error_code: str = Field(..., description="Machine-readable error classification")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO timestamp of the error",
    )
    extra: Optional[Dict[str, Any]] = Field(default=None, description="Optional diagnostic data")


# --- AI Task Request & Response Schemas ---

def _validate_finite_number(value: float, field_name: str) -> float:
    """Validate that numeric input is finite (not NaN, +Inf, -Inf)."""
    if not math.isfinite(value):
        raise ValueError(f"{field_name} must be a finite numeric value, received {value}")
    return value


class CropRecommendationRequest(BaseModel):
    """Request payload for soil and climate-based crop recommendation.
    
    Features align with standard agricultural crop recommendation datasets:
    - N: Nitrogen ratio in soil (kg/ha)
    - P: Phosphorus ratio in soil (kg/ha)
    - K: Potassium ratio in soil (kg/ha)
    - Temperature: Ambient temperature in degrees Celsius
    - Humidity: Relative humidity percentage
    - Soil pH: Soil pH value (0.0 to 14.0)
    - Rainfall: Precipitation in millimeters
    """
    nitrogen: float = Field(
        ...,
        ge=0.0,
        le=500.0,
        description="Ratio of Nitrogen content in soil (kg/ha)",
        examples=[90.0],
    )
    phosphorus: float = Field(
        ...,
        ge=0.0,
        le=500.0,
        description="Ratio of Phosphorus content in soil (kg/ha)",
        examples=[42.0],
    )
    potassium: float = Field(
        ...,
        ge=0.0,
        le=500.0,
        description="Ratio of Potassium content in soil (kg/ha)",
        examples=[43.0],
    )
    temperature: float = Field(
        ...,
        ge=-10.0,
        le=60.0,
        description="Ambient temperature in degrees Celsius",
        examples=[20.87],
    )
    humidity: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Relative humidity in percentage (0-100%)",
        examples=[82.00],
    )
    ph: float = Field(
        ...,
        ge=0.0,
        le=14.0,
        description="Soil pH value (0-14 scale)",
        examples=[6.5],
    )
    rainfall: float = Field(
        ...,
        ge=0.0,
        le=2000.0,
        description="Precipitation / rainfall in millimeters",
        examples=[202.93],
    )

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Support both N/P/K and nitrogen/phosphorus/potassium
            if "N" in data and "nitrogen" not in data:
                data["nitrogen"] = data["N"]
            if "P" in data and "phosphorus" not in data:
                data["phosphorus"] = data["P"]
            if "K" in data and "potassium" not in data:
                data["potassium"] = data["K"]
        return data

    @field_validator("nitrogen", "phosphorus", "potassium", "temperature", "humidity", "ph", "rainfall", mode="after")
    @classmethod
    def check_finite(cls, v: float, info) -> float:
        return _validate_finite_number(v, info.field_name)


class PricePredictionRequest(BaseModel):
    """Request payload for agricultural crop price prediction."""
    crop: str = Field(..., min_length=2, max_length=100, description="Crop name (e.g. 'Wheat', 'Tomato')", examples=["Tomato"])
    market: str = Field(..., min_length=2, max_length=100, description="Market or Mandi identifier", examples=["Azadpur Mandi"])
    state_or_region: Optional[str] = Field(None, max_length=100, description="State or geographic region", examples=["Delhi"])
    date: Optional[str] = Field(None, description="ISO format date for forecast (YYYY-MM-DD)", examples=["2026-10-15"])
    season: Optional[str] = Field(None, max_length=50, description="Agricultural season (Kharif, Rabi, Zaid)", examples=["Kharif"])
    historical_price: Optional[float] = Field(None, ge=0.0, description="Recent market price benchmark per quintal")

    @field_validator("historical_price", mode="after")
    @classmethod
    def check_finite_price(cls, v: Optional[float], info) -> Optional[float]:
        if v is not None:
            v = _validate_finite_number(v, info.field_name)
            if v <= 0:
                raise ValueError("historical_price must be a positive number greater than 0")
        return v

    @field_validator("date", mode="after")
    @classmethod
    def check_valid_date(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip()
            try:
                datetime.strptime(clean, "%Y-%m-%d")
            except ValueError:
                raise ValueError("date must be a valid ISO format date (YYYY-MM-DD)")
            return clean
        return v


class CropRecommendationResponse(BaseModel):
    """Response payload for soil and climate crop recommendation."""
    recommended_crop: str = Field(..., description="Recommended crop label", examples=["rice"])
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model prediction confidence score", examples=[0.935])
    input_features: Dict[str, Any] = Field(..., description="Soil and climate features provided")
    model_version: str = Field(default="RandomForest-v1", description="Model version identifier")


class PricePredictionResponse(BaseModel):
    """Response payload for agricultural commodity price prediction/baseline."""
    crop: str = Field(..., description="Crop / Commodity name", examples=["Tomato"])
    market: str = Field(..., description="Market / Mandi identifier", examples=["Anantapur"])
    state: str = Field(..., description="State name", examples=["Andhra Pradesh"])
    district: str = Field(..., description="District name", examples=["Anantapur"])
    modal_price: float = Field(..., gt=0.0, description="Observed modal price in INR", examples=[1700.0])
    currency: str = Field(default="INR", description="Currency symbol/code")
    unit: str = Field(
        default="unverified (typically per quintal in Mandi arrival reports)",
        description="Reporting unit for price",
    )
    arrival_date: str = Field(..., description="Date of latest price observation (YYYY-MM-DD)", examples=["2025-09-20"])
    requested_date: Optional[str] = Field(
        default=None,
        description="Forecast date requested by the client, if provided",
        examples=["2026-10-15"],
    )
    is_historical_baseline: bool = Field(
        default=True,
        description="True indicates this is a historical observed baseline, not a future forecast",
    )
    data_freshness_note: str = Field(
        ...,
        description="Disclosure explaining observation recency and relationship to requested date",
    )
    source: str = Field(
        default="AgriConnect Previous-Price Baseline",
        description="Method or data source used for price determination",
    )
    disclaimer: str = Field(
        default=(
            "This value is the latest observed historical modal price from the 2025 dataset. "
            "It is an unadjusted baseline reference and does not guarantee current market prices "
            "or future price movements."
        ),
        description="Advisory disclaimer regarding baseline pricing",
    )


class DemandPredictionRequest(BaseModel):
    """Request payload for agricultural product demand forecasting."""
    crop: str = Field(..., min_length=2, max_length=100, description="Crop name", examples=["Potato"])
    location: str = Field(..., min_length=2, max_length=100, description="Target market or city", examples=["Maharashtra"])
    season: Optional[str] = Field(None, max_length=50, description="Agricultural season (Kharif, Rabi, Zaid)", examples=["Rabi"])
    month: Optional[int] = Field(None, ge=1, le=12, description="Target calendar month (1-12)", examples=[11])
    historical_volume: Optional[float] = Field(None, ge=0.0, description="Historical volume sold in kilograms")
    quality_tier: Optional[str] = Field(None, max_length=50, description="Produce quality tier ('Grade A' or 'Grade B')", examples=["Grade A"])

    @field_validator("historical_volume", mode="after")
    @classmethod
    def check_finite_demand(cls, v: Optional[float], info) -> Optional[float]:
        if v is not None:
            return _validate_finite_number(v, info.field_name)
        return v


class DemandPredictionResponse(BaseModel):
    """Response payload for agricultural commodity demand forecasting."""
    crop: str = Field(..., description="Target crop / commodity", examples=["Potato"])
    location: str = Field(..., description="Target regional location or state", examples=["Maharashtra"])
    month: int = Field(..., ge=1, le=12, description="Forecast target calendar month (1-12)", examples=[11])
    season: str = Field(..., description="Agricultural season (Kharif, Rabi, Zaid)", examples=["Rabi"])
    predicted_demand_kg: float = Field(..., ge=0.0, description="Predicted demand volume in kilograms", examples=[43846.79])
    baseline_demand_kg: Optional[float] = Field(
        default=None,
        description="Naive seasonal-mean benchmark demand in kg if group lookup is available, else null",
        examples=[None],
    )
    baseline_note: Optional[str] = Field(
        default="Per-(crop, location, month) seasonal lookup table not present in metadata artifact; aggregate baseline metrics recorded in training metadata only",
        description="Explanation of baseline availability and lookup data status",
    )
    unit: str = Field(default="kg", description="Demand volume measurement unit")
    model_version: str = Field(default="1.0.0-synthetic", description="Model version identifier")
    model_name: str = Field(default="AgriConnect Demand Forecaster (RandomForest)", description="Forecasting model name")
    model_status: str = Field(
        default="experimental",
        description="Model deployment status: 'experimental' because it did not outperform seasonal baseline on validation metrics",
    )
    model_status_note: str = Field(
        default=(
            "Model is marked experimental because it did not outperform the naive seasonal-mean baseline "
            "on validation metrics (Val MAE: 7,231.24 kg vs Baseline: 7,039.31 kg; Val R²: 0.6535 vs Baseline: 0.6725). "
            "The R² > 0 deployment gate indicates non-trivial mean performance but not baseline superiority."
        ),
        description="Detailed explanation of experimental status and validation benchmark comparison",
    )
    is_synthetic: bool = Field(
        default=True,
        description="True indicates the model was trained entirely on synthetic data",
    )
    input_features: Dict[str, Any] = Field(..., description="Features resolved and supplied to the inference pipeline")
    disclaimer: str = Field(
        default=(
            "This demand prediction is generated by an experimental model trained exclusively on synthetic data. "
            "It did not outperform the naive seasonal-mean baseline during validation and must not be used for "
            "actual procurement contracts, commercial commitments, or financial planning."
        ),
        description="Advisory disclaimer regarding experimental synthetic model output",
    )


class DiseaseDetectionResponse(BaseModel):
    """Disease detection prediction response schema."""
    predicted_class: str = Field(..., description="Full class label identified by the classifier (e.g. 'Tomato___Tomato Early blight')", examples=["Tomato___Tomato Early blight"])
    crop: str = Field(..., description="Identified or provided crop type", examples=["Tomato"])
    disease: str = Field(..., description="Detected plant disease or 'Healthy'", examples=["Tomato Early blight"])
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model prediction confidence score", examples=[0.9452])
    model_name: str = Field(default="MobileNetV3-Large Disease Classifier", description="Vision classifier model name")
    remedy_recommendation: Optional[str] = Field(None, description="Recommended agronomic remedy or treatment")


# --- Phase 13: Market Trend Analysis Schemas ---

class MarketTrendPoint(BaseModel):
    """Aggregated modal price point across a time slice (day, week, or month)."""
    date: str = Field(..., description="Observation date or period label (YYYY-MM-DD or YYYY-MM)")
    modal_price: float = Field(..., description="Representative/average modal price in INR per quintal")
    min_price: Optional[float] = Field(None, description="Lowest observed price in interval")
    max_price: Optional[float] = Field(None, description="Highest observed price in interval")
    observation_count: int = Field(default=1, description="Number of underlying arrivals reported")


class MarketComparisonItem(BaseModel):
    """Peer market comparison metrics for the same commodity."""
    market: str = Field(..., description="Mandi/Market identifier")
    state: str = Field(..., description="State name")
    district: str = Field(..., description="District name")
    latest_price: float = Field(..., description="Latest recorded modal price in INR per quintal")
    average_price: float = Field(..., description="Average modal price across period in INR per quintal")
    last_date: str = Field(..., description="Date of last observed arrival")
    observation_count: int = Field(..., description="Number of valid market observations")


class MarketTrendsResponse(BaseModel):
    """Comprehensive agricultural market trend analysis payload."""
    commodity: str = Field(..., description="Target agricultural crop/commodity")
    state: Optional[str] = Field(None, description="Selected state name")
    district: Optional[str] = Field(None, description="Selected district name")
    market: str = Field(..., description="Selected APMC Mandi or primary market")
    start_date: Optional[str] = Field(None, description="Analysis window start date (YYYY-MM-DD)")
    end_date: Optional[str] = Field(None, description="Analysis window end date (YYYY-MM-DD)")
    aggregation: str = Field(default="daily", description="Time aggregation frequency: 'daily', 'weekly', or 'monthly'")
    unit: str = Field(default="INR per quintal", description="Standard APMC price reporting unit")
    currency: str = Field(default="INR", description="Currency symbol/code")
    data_points: List[MarketTrendPoint] = Field(default_factory=list, description="Historical price time-series points")
    latest_price: Optional[float] = Field(None, description="Most recent modal price in window")
    latest_date: Optional[str] = Field(None, description="Date of latest price observation")
    previous_price: Optional[float] = Field(None, description="Previous period's modal price for comparison")
    previous_date: Optional[str] = Field(None, description="Date of previous comparison price observation")
    absolute_change: Optional[float] = Field(None, description="Absolute price difference (latest - previous)")
    percentage_change: Optional[float] = Field(None, description="Percentage change ((latest - previous) / previous) * 100")
    min_price: Optional[float] = Field(None, description="Lowest modal price observed in window")
    max_price: Optional[float] = Field(None, description="Highest modal price observed in window")
    average_price: Optional[float] = Field(None, description="Arithmetic mean of modal prices in window")
    observation_count: int = Field(default=0, description="Total valid records analyzed")
    trend_classification: str = Field(..., description="Statistical trend class: 'Rising', 'Falling', 'Stable', or 'Insufficient data'")
    trend_rule_description: str = Field(..., description="Formal definition of the threshold rule used for trend classification")
    insights: List[str] = Field(default_factory=list, description="Farmer-friendly natural language insights derived from data")
    market_comparisons: List[MarketComparisonItem] = Field(default_factory=list, description="Peer market comparisons for the same commodity")
    data_source: str = Field(
        default="AgriConnect APMC Daily Arrivals Dataset (2025)",
        description="Data provenance reference",
    )
    disclaimer: str = Field(
        default=(
            "Historical market trend classifications and price statistics reflect recorded mandi arrivals from the 2025 dataset. "
            "They are factual historical analyses and do not constitute guaranteed future market predictions or profit forecasts."
        ),
        description="Consumer advisory disclosure",
    )


class MarketFilterOptionsResponse(BaseModel):
    """Available filter options for reactive frontend cascading dropdowns."""
    commodities: List[str] = Field(..., description="Available distinct agricultural commodities")
    states: List[str] = Field(..., description="Available states for selected or default commodity")
    districts: List[str] = Field(default_factory=list, description="Available districts for selected state")
    markets: List[str] = Field(default_factory=list, description="Available mandis for selected state/district")
    date_range: Dict[str, str] = Field(..., description="Earliest and latest dates available in dataset")
    default_selection: Dict[str, str] = Field(..., description="Sensible default commodity, state, and market")


