"""Unit and integration tests for Crop Disease Detection inference pipeline."""

import io
from pathlib import Path
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient
from PIL import Image
import torch

from app.main import app
from app.routes.disease import get_remedy_recommendation, DISEASE_TRANSFORM
from app.services.model_registry import ModelRegistry, ModelNotAvailableError

client = TestClient(app)


def _create_test_image(format_name: str = "JPEG", size: tuple = (256, 256), color: tuple = (34, 139, 34)) -> bytes:
    """Helper to generate in-memory dummy leaf image bytes."""
    buf = io.BytesIO()
    image = Image.new("RGB", size, color=color)
    image.save(buf, format=format_name)
    return buf.getvalue()


# --- Model Registry Tests ---

def test_registry_disease_model_loading():
    """Verify registry loads MobileNetV3-Large checkpoint with 37 classes in eval mode."""
    registry = ModelRegistry()
    assert registry.artifact_exists("disease_detection") is True

    bundle = registry.get_model("disease_detection")
    assert isinstance(bundle, dict)
    assert "model" in bundle
    assert "class_names" in bundle
    assert "device" in bundle

    class_names = bundle["class_names"]
    assert len(class_names) == 37
    assert class_names[0] == "Apple___Apple Black rot"
    assert class_names[-1] == "Tomato___Tomato Yellow Leaf Curl Virus"

    model = bundle["model"]
    assert isinstance(model, torch.nn.Module)
    assert model.training is False  # eval mode


def test_registry_disease_model_caching():
    """Verify registry returns cached model on subsequent calls without reloading."""
    registry = ModelRegistry()
    bundle1 = registry.get_model("disease_detection")
    bundle2 = registry.get_model("disease_detection")
    assert bundle1 is bundle2
    assert bundle1["model"] is bundle2["model"]


def test_registry_invalid_checkpoint_format(tmp_path):
    """Verify registry raises ModelNotAvailableError on invalid checkpoint file structure."""
    bad_ckpt = tmp_path / "agriconnect_disease_best.pth"
    torch.save(["not", "a", "dict"], bad_ckpt)

    reg = ModelRegistry(model_dir=tmp_path)
    with pytest.raises(ModelNotAvailableError) as exc_info:
        reg.get_model("disease_detection")
    assert "Invalid checkpoint format" in str(exc_info.value)


def test_registry_missing_checkpoint_keys(tmp_path):
    """Verify registry raises error if checkpoint is missing class_names or model_state_dict."""
    bad_ckpt = tmp_path / "agriconnect_disease_best.pth"
    torch.save({"only_some_data": 123}, bad_ckpt)

    reg = ModelRegistry(model_dir=tmp_path)
    with pytest.raises(ModelNotAvailableError) as exc_info:
        reg.get_model("disease_detection")
    assert "missing required keys" in str(exc_info.value)


# --- Input Validation Tests ---

@pytest.mark.parametrize("ext,mime", [
    ("notes.txt", "text/plain"),
    ("script.py", "text/x-python"),
    ("document.pdf", "application/pdf"),
    ("anim.gif", "image/gif"),
    ("binary.exe", "application/octet-stream"),
])
def test_unsupported_extensions_and_mimes_rejected(ext, mime):
    """Verify unsupported file extensions and MIME types return HTTP 415."""
    response = client.post(
        "/api/v1/disease/detect",
        files={"file": (ext, io.BytesIO(b"dummy payload"), mime)},
    )
    assert response.status_code == 415


def test_empty_image_upload_rejected():
    """Verify empty image file returns HTTP 415."""
    response = client.post(
        "/api/v1/disease/detect",
        files={"file": ("leaf.jpg", io.BytesIO(b""), "image/jpeg")},
    )
    assert response.status_code == 415
    data = response.json()
    assert data["detail"]["error_code"] == "EMPTY_FILE"


def test_corrupt_image_payload_rejected():
    """Verify corrupt bytes declared as image/jpeg return HTTP 415."""
    corrupt_bytes = b"NOT_A_VALID_JPEG_HEADER_CONTENT_AT_ALL_12345"
    response = client.post(
        "/api/v1/disease/detect",
        files={"file": ("leaf.jpg", io.BytesIO(corrupt_bytes), "image/jpeg")},
    )
    assert response.status_code == 415
    data = response.json()
    assert data["detail"]["error_code"] == "CORRUPT_IMAGE_PAYLOAD"


def test_file_size_exceeded_returns_413(monkeypatch):
    """Verify oversized files trigger HTTP 413."""
    from app.core.config import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_MB", 0.0001)  # ~100 bytes

    big_payload = b"X" * 500
    response = client.post(
        "/api/v1/disease/detect",
        files={"file": ("leaf.jpg", io.BytesIO(big_payload), "image/jpeg")},
    )
    assert response.status_code == 413
    data = response.json()
    assert data["detail"]["error_code"] == "FILE_TOO_LARGE"


# --- Missing Model & Inference Error Tests ---

def test_missing_model_returns_501(tmp_path, monkeypatch):
    """Verify missing model returns HTTP 501 without fabrication."""
    empty_registry = ModelRegistry(model_dir=tmp_path)
    monkeypatch.setattr("app.routes.disease.get_model_registry", lambda: empty_registry)

    img_bytes = _create_test_image("JPEG")
    response = client.post(
        "/api/v1/disease/detect",
        files={"file": ("leaf.jpg", io.BytesIO(img_bytes), "image/jpeg")},
    )
    assert response.status_code == 501
    data = response.json()
    assert data["detail"]["error_code"] == "MODEL_NOT_TRAINED"


def test_inference_runtime_error_returns_500(monkeypatch):
    """Verify unexpected forward pass exceptions return HTTP 500."""
    class BrokenModel(torch.nn.Module):
        def forward(self, x):
            raise RuntimeError("Simulated GPU out of memory / compute fault")

    mock_bundle = {
        "model": BrokenModel(),
        "class_names": ["Tomato___Tomato Early blight"],
        "device": torch.device("cpu"),
    }
    mock_reg = MagicMock()
    mock_reg.get_model.return_value = mock_bundle
    monkeypatch.setattr("app.routes.disease.get_model_registry", lambda: mock_reg)

    img_bytes = _create_test_image("JPEG")
    response = client.post(
        "/api/v1/disease/detect",
        files={"file": ("leaf.jpg", io.BytesIO(img_bytes), "image/jpeg")},
    )
    assert response.status_code == 500
    data = response.json()
    assert data["detail"]["error_code"] == "INFERENCE_ERROR"


# --- Mocked Inference Pipeline Test ---

def test_mocked_model_inference_pipeline(monkeypatch):
    """Verify endpoint correctly parses predicted class, crop, disease, and confidence."""
    # Create a mock model that outputs high logit for index 1
    mock_class_names = [
        "Apple___Apple Scab",
        "Tomato___Tomato Early blight",
        "Potato___Potato Late blight",
    ]

    class PredictableModel(torch.nn.Module):
        def forward(self, x):
            # Return fixed logits [0.1, 10.0, 0.2] so index 1 has high confidence
            return torch.tensor([[0.1, 10.0, 0.2]])

    mock_bundle = {
        "model": PredictableModel(),
        "class_names": mock_class_names,
        "device": torch.device("cpu"),
    }
    mock_reg = MagicMock()
    mock_reg.get_model.return_value = mock_bundle
    monkeypatch.setattr("app.routes.disease.get_model_registry", lambda: mock_reg)

    img_bytes = _create_test_image("PNG")
    response = client.post(
        "/api/v1/disease/detect",
        files={"file": ("test_leaf.png", io.BytesIO(img_bytes), "image/png")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["predicted_class"] == "Tomato___Tomato Early blight"
    assert data["crop"] == "Tomato"
    assert data["disease"] == "Tomato Early blight"
    assert data["confidence"] > 0.99
    assert data["model_name"] == "MobileNetV3-Large Disease Classifier"
    assert "copper-based fungicide" in data["remedy_recommendation"].lower()


# --- Real Model Inference Integration Tests ---

def test_real_model_inference_jpeg():
    """Verify end-to-end inference against the real MobileNetV3-Large checkpoint using JPEG."""
    img_bytes = _create_test_image("JPEG", size=(300, 300), color=(46, 125, 50))
    response = client.post(
        "/api/v1/disease/detect",
        files={"file": ("sample_leaf.jpg", io.BytesIO(img_bytes), "image/jpeg")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "predicted_class" in data
    assert "crop" in data
    assert "disease" in data
    assert 0.0 <= data["confidence"] <= 1.0
    assert data["model_name"] == "MobileNetV3-Large Disease Classifier"
    assert data["remedy_recommendation"] is not None


def test_real_model_inference_webp():
    """Verify end-to-end inference against the real MobileNetV3-Large checkpoint using WEBP."""
    img_bytes = _create_test_image("WEBP", size=(224, 224), color=(60, 179, 113))
    response = client.post(
        "/api/v1/disease/detect",
        files={"file": ("sample_leaf.webp", io.BytesIO(img_bytes), "image/webp")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "predicted_class" in data
    assert 0.0 <= data["confidence"] <= 1.0


# --- Preprocessing Transform Test ---

def test_disease_transform_output_tensor():
    """Verify DISEASE_TRANSFORM produces a (3, 224, 224) normalized tensor."""
    raw_img = Image.new("RGB", (320, 240), color=(50, 100, 150))
    tensor = DISEASE_TRANSFORM(raw_img)
    assert isinstance(tensor, torch.Tensor)
    assert tensor.shape == (3, 224, 224)
    assert tensor.dtype == torch.float32


# --- Remedy Advisory Unit Tests ---

def test_remedy_recommendation_branches():
    """Verify agronomic remedy recommendations provide appropriate advice."""
    assert "healthy" in get_remedy_recommendation("Apple", "Apple Healthy").lower()
    assert "fungicide" in get_remedy_recommendation("Tomato", "Tomato Early blight").lower()
    assert "sulfur" in get_remedy_recommendation("Apple", "Apple Scab").lower()
    assert "mancozeb" in get_remedy_recommendation("Apple", "Cedar apple rust").lower()
    assert "potassium bicarbonate" in get_remedy_recommendation("Cherry", "Powdery mildew").lower()
    assert "copper hydroxide" in get_remedy_recommendation("Peach", "Bacterial spot").lower()
    assert "prune" in get_remedy_recommendation("Citrus", "Citrus canker").lower()
    assert "psyllid" in get_remedy_recommendation("Citrus", "Citrus greening").lower()
    assert "ventilation" in get_remedy_recommendation("Tomato", "Tomato Leaf Mold").lower()
    assert "whiteflies" in get_remedy_recommendation("Tomato", "Tomato Yellow Leaf Curl Virus").lower()
    assert "soap" in get_remedy_recommendation("Tomato", "Tomato Spider mites").lower()
    assert "mummified" in get_remedy_recommendation("Grape", "Grape Black rot").lower()
