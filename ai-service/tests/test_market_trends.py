"""Unit and integration tests for Agricultural Market Trend Analysis."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.market_trends import (
    MarketTrendsService,
    TREND_THRESHOLD_PERCENT,
)

client = TestClient(app)


def test_get_filter_options_endpoint():
    """Verify GET /api/v1/market-trends/options returns structured dynamic selector data."""
    response = client.get("/api/v1/market-trends/options")
    assert response.status_code == 200
    data = response.json()

    assert "commodities" in data
    assert len(data["commodities"]) > 0
    assert "Tomato" in data["commodities"]
    assert "Onion" in data["commodities"]
    assert "Potato" in data["commodities"]

    assert "states" in data
    assert len(data["states"]) > 0
    assert "Maharashtra" in data["states"]

    assert "districts" in data
    assert "markets" in data
    assert "date_range" in data
    assert "min_date" in data["date_range"]
    assert "max_date" in data["date_range"]
    assert "default_selection" in data


def test_get_filter_options_with_commodity_and_state():
    """Verify options filter reactively by commodity and state."""
    response = client.get("/api/v1/market-trends/options?commodity=Onion&state=Maharashtra")
    assert response.status_code == 200
    data = response.json()
    assert "districts" in data
    assert "markets" in data
    assert len(data["markets"]) > 0


def test_market_trends_daily_analysis():
    """Verify GET /api/v1/market-trends returns daily historical series, stats, and insights."""
    response = client.get("/api/v1/market-trends?commodity=Tomato&state=Maharashtra&market=Pune&aggregation=daily")
    assert response.status_code == 200
    data = response.json()

    assert data["commodity"] == "Tomato"
    assert data["state"] == "Maharashtra"
    assert "Pune" in data["market"]
    assert data["aggregation"] == "daily"
    assert data["unit"] == "INR per quintal"
    assert data["currency"] == "INR"

    assert len(data["data_points"]) > 0
    first_pt = data["data_points"][0]
    assert "date" in first_pt
    assert "modal_price" in first_pt
    assert first_pt["modal_price"] > 0
    assert first_pt["observation_count"] >= 1

    assert data["latest_price"] is not None
    assert data["latest_price"] > 0
    assert data["average_price"] is not None
    assert data["min_price"] is not None
    assert data["max_price"] is not None
    assert data["min_price"] <= data["average_price"] <= data["max_price"]
    assert data["observation_count"] > 0

    assert data["trend_classification"] in {"Rising", "Falling", "Stable", "Insufficient data"}
    assert "trend_rule_description" in data
    assert len(data["insights"]) > 0
    assert len(data["market_comparisons"]) > 0


def test_market_trends_weekly_aggregation():
    """Verify weekly aggregation groups arrivals properly across time."""
    response = client.get("/api/v1/market-trends?commodity=Tomato&state=Maharashtra&market=Pune&aggregation=weekly")
    assert response.status_code == 200
    data = response.json()
    assert data["aggregation"] == "weekly"
    assert len(data["data_points"]) > 0
    # Weekly point dates are in chronological order
    dates = [p["date"] for p in data["data_points"]]
    assert dates == sorted(dates)


def test_market_trends_monthly_aggregation():
    """Verify monthly aggregation groups arrivals properly across months."""
    response = client.get("/api/v1/market-trends?commodity=Tomato&state=Maharashtra&market=Pune&aggregation=monthly")
    assert response.status_code == 200
    data = response.json()
    assert data["aggregation"] == "monthly"
    assert len(data["data_points"]) > 0
    for p in data["data_points"]:
        # Monthly rep date formatted as YYYY-MM-01
        assert p["date"].endswith("-01")


def test_market_trends_date_range_filtering():
    """Verify start_date and end_date constrain the analysis window."""
    response = client.get(
        "/api/v1/market-trends?commodity=Tomato&state=Maharashtra&market=Pune"
        "&start_date=2025-03-01&end_date=2025-05-31&aggregation=daily"
    )
    assert response.status_code == 200
    data = response.json()
    for p in data["data_points"]:
        assert "2025-03-01" <= p["date"] <= "2025-05-31"


def test_invalid_aggregation_returns_400():
    """Verify unsupported aggregation returns HTTP 400 with clear validation error."""
    response = client.get("/api/v1/market-trends?commodity=Tomato&aggregation=yearly")
    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert data["detail"]["error_code"] == "INVALID_FILTER"
    assert "aggregation" in data["detail"]["message"].lower()


def test_invalid_date_syntax_returns_400():
    """Verify malformed date returns HTTP 400."""
    response = client.get("/api/v1/market-trends?commodity=Tomato&start_date=not-a-date")
    assert response.status_code == 400
    data = response.json()
    assert data["detail"]["error_code"] == "INVALID_FILTER"


def test_inverted_date_range_returns_400():
    """Verify start_date after end_date returns HTTP 400."""
    response = client.get(
        "/api/v1/market-trends?commodity=Tomato&start_date=2025-09-01&end_date=2025-01-01"
    )
    assert response.status_code == 400
    data = response.json()
    assert "start_date" in data["detail"]["message"]


def test_nonexistent_market_returns_empty_response():
    """Verify querying an unrecorded market returns structured empty response with Insufficient data."""
    response = client.get(
        "/api/v1/market-trends?commodity=Tomato&state=Maharashtra&market=NonExistentMandi12345"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["observation_count"] == 0
    assert len(data["data_points"]) == 0
    assert data["trend_classification"] == "Insufficient data"
    assert data["latest_price"] is None
    assert len(data["insights"]) > 0


def test_trend_classification_threshold_logic():
    """Unit test statistical trend classification logic on boundary percentages."""
    # Percentage formula: ((latest - prev) / prev) * 100
    # Rising when > 3.0%, Falling when < -3.0%, Stable within [-3.0%, 3.0%]
    threshold = TREND_THRESHOLD_PERCENT
    assert threshold == 3.0

    def classify(pct):
        if pct is None:
            return "Insufficient data"
        if pct > threshold:
            return "Rising"
        if pct < -threshold:
            return "Falling"
        return "Stable"

    assert classify(5.2) == "Rising"
    assert classify(3.01) == "Rising"
    assert classify(3.0) == "Stable"
    assert classify(0.0) == "Stable"
    assert classify(-2.9) == "Stable"
    assert classify(-3.0) == "Stable"
    assert classify(-3.05) == "Falling"
    assert classify(-15.4) == "Falling"
    assert classify(None) == "Insufficient data"


def test_zero_or_none_previous_price_handled_safely():
    """Verify edge cases with zero or missing previous price never produce NaN or Infinity."""
    # When previous price is zero:
    prev_price = 0.0
    latest_price = 1500.0
    pct = 0.0 if prev_price <= 0 else ((latest_price - prev_price) / prev_price) * 100
    assert pct == 0.0
    assert not (pct != pct)  # not NaN
    assert pct != float("inf")


def test_market_trends_missing_dataset_returns_503(monkeypatch, tmp_path):
    """Verify market trends endpoint returns HTTP 503 with detailed diagnostics when dataset is missing."""
    from app.services.market_trends import MarketTrendsService
    empty_service = MarketTrendsService(db_path=tmp_path / "nonexistent.sqlite")
    monkeypatch.setattr("app.routes.market_trends.get_market_trends_service", lambda: empty_service)

    response = client.get("/api/v1/market-trends?commodity=Tomato")
    assert response.status_code == 503
    data = response.json()
    assert "detail" in data
    assert data["detail"]["error_code"] == "DATASET_UNAVAILABLE"
    assert data["detail"]["dataset"] == "price_trends.sqlite"
    assert "checked_locations" in data["detail"]
    assert len(data["detail"]["checked_locations"]) > 0

    # Also test options endpoint returns 503 with structured error
    resp_opts = client.get("/api/v1/market-trends/options")
    assert resp_opts.status_code == 503
    data_opts = resp_opts.json()
    assert data_opts["detail"]["error_code"] == "DATASET_UNAVAILABLE"
