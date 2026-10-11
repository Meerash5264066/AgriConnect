"""Focused tests for price history baseline service and /api/v1/price/predict route."""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.price_history import PriceHistoryService, get_price_history_service

client = TestClient(app)

SAMPLE_CSV_CONTENT = """State,District,Market,Commodity,Arrival_Date,Modal_Price
Andhra Pradesh,Anantapur,Anantapur,Tomato,2025-09-20,1700.0
Andhra Pradesh,Anantapur,Hindupur,Dry Chillies,2025-11-04,16200.0
Madhya Pradesh,Sehore,Alampur,Wheat,2025-05-10,2400.0
Telangana,Jogulamba Gadwal,Alampur,Wheat,2025-06-15,2600.0
Assam,Goalpara,Sonari,Beetroot,2025-10-04,2400.0
Assam,Sibsagar,Sonari,Beetroot,2025-11-04,3000.0
Karnataka,Kolar,Kolar,Tomato,2025-12-01,2100.0
Karnataka,Kolar,Kolar,Tomato,2025-12-15,2250.0
"""


@pytest.fixture
def temp_price_csv(tmp_path):
    """Create a temporary price history CSV file."""
    csv_file = tmp_path / "test_price_history.csv"
    csv_file.write_text(SAMPLE_CSV_CONTENT, encoding="utf-8")
    return csv_file


def test_exact_match_with_temp_data(temp_price_csv, monkeypatch):
    """Verify exact match returns 200 with all required baseline fields."""
    service = PriceHistoryService(csv_path=temp_price_csv)
    monkeypatch.setattr("app.routes.price.get_price_history_service", lambda: service)

    response = client.post(
        "/api/v1/price/predict",
        json={
            "crop": "Tomato",
            "market": "Anantapur",
            "state_or_region": "Andhra Pradesh",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["crop"] == "Tomato"
    assert data["market"] == "Anantapur"
    assert data["state"] == "Andhra Pradesh"
    assert data["district"] == "Anantapur"
    assert data["modal_price"] == 1700.0
    assert data["currency"] == "INR"
    assert "unverified" in data["unit"]
    assert data["arrival_date"] == "2025-09-20"
    assert data["is_historical_baseline"] is True
    assert "latest observed historical" in data["data_freshness_note"].lower()
    assert "baseline" in data["disclaimer"].lower()


def test_case_and_whitespace_normalization(temp_price_csv, monkeypatch):
    """Verify matching is case-insensitive and ignores surrounding whitespace."""
    service = PriceHistoryService(csv_path=temp_price_csv)
    monkeypatch.setattr("app.routes.price.get_price_history_service", lambda: service)

    response = client.post(
        "/api/v1/price/predict",
        json={
            "crop": "  toMAto  ",
            "market": "  aNANtapur  ",
            "state_or_region": "  ANDHRA PRADESH  ",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["modal_price"] == 1700.0
    assert data["arrival_date"] == "2025-09-20"


def test_missing_record_returns_404(temp_price_csv, monkeypatch):
    """Verify non-existent crop or market returns HTTP 404 with descriptive error."""
    service = PriceHistoryService(csv_path=temp_price_csv)
    monkeypatch.setattr("app.routes.price.get_price_history_service", lambda: service)

    response = client.post(
        "/api/v1/price/predict",
        json={
            "crop": "Dragonfruit",
            "market": "NonExistentMarket",
        },
    )
    assert response.status_code == 404
    data = response.json()
    assert data["detail"]["error_code"] == "PRICE_RECORD_NOT_FOUND"


def test_ambiguous_market_across_states_returns_409(temp_price_csv, monkeypatch):
    """Verify market present in multiple states triggers HTTP 409 when state is omitted."""
    service = PriceHistoryService(csv_path=temp_price_csv)
    monkeypatch.setattr("app.routes.price.get_price_history_service", lambda: service)

    response = client.post(
        "/api/v1/price/predict",
        json={
            "crop": "Wheat",
            "market": "Alampur",
        },
    )
    assert response.status_code == 409
    data = response.json()
    assert data["detail"]["error_code"] == "AMBIGUOUS_MARKET_MATCH"
    assert "Madhya Pradesh" in data["detail"]["candidate_states"]
    assert "Telangana" in data["detail"]["candidate_states"]

    # When state is provided, it must resolve unambiguously
    resolved_response = client.post(
        "/api/v1/price/predict",
        json={
            "crop": "Wheat",
            "market": "Alampur",
            "state_or_region": "Madhya Pradesh",
        },
    )
    assert resolved_response.status_code == 200
    assert resolved_response.json()["modal_price"] == 2400.0


def test_ambiguous_market_across_districts_returns_409(temp_price_csv, monkeypatch):
    """Verify market present in multiple districts triggers HTTP 409 without arbitrary choice."""
    service = PriceHistoryService(csv_path=temp_price_csv)
    monkeypatch.setattr("app.routes.price.get_price_history_service", lambda: service)

    response = client.post(
        "/api/v1/price/predict",
        json={
            "crop": "Beetroot",
            "market": "Sonari",
            "state_or_region": "Assam",
        },
    )
    assert response.status_code == 409
    data = response.json()
    assert data["detail"]["error_code"] == "AMBIGUOUS_DISTRICT_MATCH"
    assert "Goalpara" in data["detail"]["candidate_districts"]
    assert "Sibsagar" in data["detail"]["candidate_districts"]


def test_stale_price_and_requested_date_disclosure(temp_price_csv, monkeypatch):
    """Verify that when a future date is requested, the response does not claim to be a forecast for that date."""
    service = PriceHistoryService(csv_path=temp_price_csv)
    monkeypatch.setattr("app.routes.price.get_price_history_service", lambda: service)

    response = client.post(
        "/api/v1/price/predict",
        json={
            "crop": "Tomato",
            "market": "Anantapur",
            "state_or_region": "Andhra Pradesh",
            "date": "2026-10-15",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["requested_date"] == "2026-10-15"
    assert data["arrival_date"] == "2025-09-20"
    assert data["is_historical_baseline"] is True
    assert "2026-10-15" in data["data_freshness_note"]
    assert "NOT an evaluated prediction" in data["data_freshness_note"]


def test_duplicate_arrival_dates_takes_latest(temp_price_csv, monkeypatch):
    """Verify that multiple arrivals for same state & district picks the most recent date."""
    service = PriceHistoryService(csv_path=temp_price_csv)
    monkeypatch.setattr("app.routes.price.get_price_history_service", lambda: service)

    response = client.post(
        "/api/v1/price/predict",
        json={
            "crop": "Tomato",
            "market": "Kolar",
            "state_or_region": "Karnataka",
        },
    )
    assert response.status_code == 200
    data = response.json()
    # Kolar has 2025-12-01 (2100.0) and 2025-12-15 (2250.0). Latest date is 2025-12-15
    assert data["arrival_date"] == "2025-12-15"
    assert data["modal_price"] == 2250.0


def test_request_validation_invalid_date():
    """Verify invalid date string format is rejected with HTTP 422."""
    response = client.post(
        "/api/v1/price/predict",
        json={
            "crop": "Tomato",
            "market": "Anantapur",
            "date": "2025-13-45",  # Invalid month and day
        },
    )
    assert response.status_code == 422


def test_request_validation_non_positive_price():
    """Verify non-positive historical_price is rejected with HTTP 422."""
    response = client.post(
        "/api/v1/price/predict",
        json={
            "crop": "Tomato",
            "market": "Anantapur",
            "historical_price": 0.0,
        },
    )
    assert response.status_code == 422

    response2 = client.post(
        "/api/v1/price/predict",
        json={
            "crop": "Tomato",
            "market": "Anantapur",
            "historical_price": -50.0,
        },
    )
    assert response2.status_code == 422


def test_missing_dataset_file_returns_503(tmp_path, monkeypatch):
    """Verify missing CSV file raises HTTP 503 Service Unavailable."""
    non_existent = tmp_path / "does_not_exist.csv"
    service = PriceHistoryService(csv_path=non_existent)
    monkeypatch.setattr("app.routes.price.get_price_history_service", lambda: service)

    response = client.post(
        "/api/v1/price/predict",
        json={
            "crop": "Tomato",
            "market": "Anantapur",
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"]["error_code"] == "PRICE_DATASET_UNAVAILABLE"


def test_real_dataset_lookup():
    """Verify lookup directly against the actual price_history_latest.csv."""
    response = client.post(
        "/api/v1/price/predict",
        json={
            "crop": "Tomato",
            "market": "Anantapur",
            "state_or_region": "Andhra Pradesh",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["crop"] == "Tomato"
    assert data["market"] == "Anantapur"
    assert data["state"] == "Andhra Pradesh"
    assert data["modal_price"] == 1700.0
    assert data["arrival_date"] == "2025-09-20"
    assert data["currency"] == "INR"
    assert "unverified" in data["unit"]
