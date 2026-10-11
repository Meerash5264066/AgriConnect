"""Tests for AgriConnect AI Service endpoints and validation rules."""

import io
from fastapi.testclient import TestClient
from PIL import Image
from app.main import app

client = TestClient(app)


def test_root_endpoint():
    """Verify root GET / returns service information and navigation links."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "agriconnect-ai"
    assert data["name"] == "AgriConnect AI Service"
    assert data["status"] == "operational"
    assert "docs_url" in data
    assert "endpoints" in data


def test_health_endpoint():
    """Verify GET /health returns expected liveness payload."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "service": "agriconnect-ai",
    }


def test_readiness_endpoint():
    """Verify GET /ready returns service readiness and model statuses."""
    response = client.get("/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["service"] == "agriconnect-ai"
    assert "models" in data

    models = data["models"]
    expected_models = ["crop_recommendation", "price_prediction", "demand_prediction", "disease_detection"]
    for m in expected_models:
        assert m in models
        assert isinstance(models[m]["available"], bool)

    # Untrained model without artifact reports available and artifact_found as False
    assert models["price_prediction"]["available"] is False
    assert models["price_prediction"]["artifact_found"] is False
    # Model artifacts present on disk
    assert models["crop_recommendation"]["artifact_found"] is True
    assert models["demand_prediction"]["artifact_found"] is True
    assert models["disease_detection"]["artifact_found"] is True




def test_openapi_and_docs_available():
    """Verify OpenAPI and interactive Swagger documentation are registered."""
    docs_resp = client.get("/docs")
    assert docs_resp.status_code == 200

    openapi_resp = client.get("/openapi.json")
    assert openapi_resp.status_code == 200
    schema = openapi_resp.json()
    paths = schema.get("paths", {})

    # Ensure all four AI route groups and health checks are registered
    assert "/health" in paths
    assert "/ready" in paths
    assert "/api/v1/crop/recommend" in paths
    assert "/api/v1/price/predict" in paths
    assert "/api/v1/demand/predict" in paths
    assert "/api/v1/disease/detect" in paths
    assert "/api/v1/market-trends" in paths
    assert "/api/v1/market-trends/options" in paths



def test_crop_recommendation_missing_model_returns_501(tmp_path, monkeypatch):
    """Verify crop recommendation rejects requests with HTTP 501 when model is genuinely unavailable."""
    from app.services.model_registry import ModelRegistry
    empty_registry = ModelRegistry(model_dir=tmp_path)
    monkeypatch.setattr("app.routes.crop.get_model_registry", lambda: empty_registry)

    valid_payload = {
        "nitrogen": 90.0,
        "phosphorus": 42.0,
        "potassium": 43.0,
        "temperature": 20.87,
        "humidity": 82.00,
        "ph": 6.5,
        "rainfall": 202.93,
    }
    response = client.post("/api/v1/crop/recommend", json=valid_payload)
    assert response.status_code == 501
    data = response.json()
    assert "detail" in data
    assert data["detail"]["error_code"] == "MODEL_NOT_TRAINED"
    assert "Phase 14" in data["detail"]["message"]


def test_crop_recommendation_with_existing_model_returns_prediction():
    """Verify crop recommendation uses the existing model to return an actual prediction."""
    valid_payload = {
        "nitrogen": 90.0,
        "phosphorus": 42.0,
        "potassium": 43.0,
        "temperature": 20.87,
        "humidity": 82.00,
        "ph": 6.5,
        "rainfall": 202.93,
    }
    response = client.post("/api/v1/crop/recommend", json=valid_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["recommended_crop"] == "rice"
    assert 0.0 <= data["confidence"] <= 1.0
    assert "input_features" in data


def test_crop_recommendation_with_npk_aliases():
    """Verify crop recommendation accepts short N, P, K key aliases."""
    npk_payload = {
        "N": 90.0,
        "P": 42.0,
        "K": 43.0,
        "temperature": 20.87,
        "humidity": 82.00,
        "ph": 6.5,
        "rainfall": 202.93,
    }
    response = client.post("/api/v1/crop/recommend", json=npk_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["recommended_crop"] == "rice"
    assert data["input_features"]["nitrogen"] == 90.0


def test_crop_recommendation_invalid_numeric_inputs():
    """Verify validation on out-of-range, negative, or invalid numeric fields."""
    # Negative nitrogen
    resp1 = client.post(
        "/api/v1/crop/recommend",
        json={
            "nitrogen": -10.0,
            "phosphorus": 40.0,
            "potassium": 40.0,
            "temperature": 25.0,
            "humidity": 60.0,
            "ph": 6.5,
            "rainfall": 100.0,
        },
    )
    assert resp1.status_code == 422
    assert resp1.json()["error_code"] == "VALIDATION_ERROR"

    # Invalid pH > 14
    resp2 = client.post(
        "/api/v1/crop/recommend",
        json={
            "nitrogen": 50.0,
            "phosphorus": 40.0,
            "potassium": 40.0,
            "temperature": 25.0,
            "humidity": 60.0,
            "ph": 15.5,
            "rainfall": 100.0,
        },
    )
    assert resp2.status_code == 422

    # Non-numeric string value
    resp3 = client.post(
        "/api/v1/crop/recommend",
        json={
            "nitrogen": "invalid_number",
            "phosphorus": 40.0,
            "potassium": 40.0,
            "temperature": 25.0,
            "humidity": 60.0,
            "ph": 6.5,
            "rainfall": 100.0,
        },
    )
    assert resp3.status_code == 422


def test_price_prediction_baseline_lookup():
    """Verify price prediction returns latest observed modal price baseline."""
    valid_payload = {
        "crop": "Tomato",
        "market": "Anantapur",
        "state_or_region": "Andhra Pradesh",
    }
    response = client.post("/api/v1/price/predict", json=valid_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["crop"] == "Tomato"
    assert data["market"] == "Anantapur"
    assert data["modal_price"] == 1700.0
    assert data["arrival_date"] == "2025-09-20"
    assert data["is_historical_baseline"] is True
    assert "unverified" in data["unit"]


def test_demand_prediction_missing_model_returns_501(tmp_path, monkeypatch):
    """Verify demand prediction returns HTTP 501 while model is unavailable."""
    from app.services.model_registry import ModelRegistry
    empty_registry = ModelRegistry(model_dir=tmp_path)
    monkeypatch.setattr("app.routes.demand.get_model_registry", lambda: empty_registry)

    valid_payload = {
        "crop": "Potato",
        "location": "Mumbai",
        "season": "Rabi",
        "month": 11,
    }
    response = client.post("/api/v1/demand/predict", json=valid_payload)
    assert response.status_code == 501
    data = response.json()
    assert data["detail"]["error_code"] == "MODEL_NOT_TRAINED"


def test_disease_detection_unsupported_file_extension():
    """Verify non-image files are rejected with HTTP 415."""
    text_content = b"Not an image file"
    response = client.post(
        "/api/v1/disease/detect",
        files={"file": ("notes.txt", io.BytesIO(text_content), "text/plain")},
    )
    assert response.status_code == 415


def test_disease_detection_valid_image_with_missing_model_returns_501(tmp_path, monkeypatch):
    """Verify valid image upload returns HTTP 501 when model is genuinely missing without fake predictions."""
    from app.services.model_registry import ModelRegistry
    empty_registry = ModelRegistry(model_dir=tmp_path)
    monkeypatch.setattr("app.routes.disease.get_model_registry", lambda: empty_registry)

    img_byte_arr = io.BytesIO()
    image = Image.new("RGB", (64, 64), color="green")
    image.save(img_byte_arr, format="PNG")
    img_bytes = img_byte_arr.getvalue()

    response = client.post(
        "/api/v1/disease/detect",
        files={"file": ("leaf.png", io.BytesIO(img_bytes), "image/png")},
    )
    assert response.status_code == 501
    data = response.json()
    assert data["detail"]["error_code"] == "MODEL_NOT_TRAINED"
    assert data["detail"]["verified_image"]["filename"] == "leaf.png"
    assert data["detail"]["verified_image"]["format"] == "PNG"


def test_disease_detection_with_existing_model_returns_prediction():
    """Verify disease detection uses the real MobileNetV3-Large model to return an actual prediction."""
    img_byte_arr = io.BytesIO()
    image = Image.new("RGB", (256, 256), color=(40, 160, 40))
    image.save(img_byte_arr, format="JPEG")
    img_bytes = img_byte_arr.getvalue()

    response = client.post(
        "/api/v1/disease/detect",
        files={"file": ("leaf.jpg", io.BytesIO(img_bytes), "image/jpeg")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "predicted_class" in data
    assert "crop" in data
    assert "disease" in data
    assert "confidence" in data
    assert 0.0 <= data["confidence"] <= 1.0
    assert data["model_name"] == "MobileNetV3-Large Disease Classifier"
    assert "remedy_recommendation" in data

