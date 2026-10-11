"""Model registry service for managing AI model lifecycle and availability."""

import logging
from pathlib import Path
from typing import Any, Dict, Optional
from app.core.config import get_settings
from app.schemas.common import ModelStatusInfo

logger = logging.getLogger(__name__)


class ModelNotAvailableError(RuntimeError):
    """Raised when an inference operation is requested for an unavailable/untrained model."""
    def __init__(self, model_name: str, message: str):
        super().__init__(message)
        self.model_name = model_name
        self.message = message


class ModelRegistry:
    """Registry tracking machine learning model artifacts, versions, and memory cache."""

    # Predefined model specifications
    MODEL_DEFINITIONS = {
        "crop_recommendation": {
            "name": "Soil & Climate Crop Recommender",
            "artifact": "crop_recommendation_model.joblib",
            "framework": "scikit-learn / LightGBM",
            "description": "Multi-class crop recommendation based on N, P, K, pH, temp, humidity, rainfall",
        },
        "price_prediction": {
            "name": "Agricultural Commodity Price Forecaster",
            "artifact": "price_prediction_model.joblib",
            "framework": "scikit-learn / XGBoost",
            "description": "Market and mandi price regression model",
        },
        "demand_prediction": {
            "name": "Produce Demand Forecaster",
            "artifact": "demand_prediction_model.joblib",
            "framework": "scikit-learn / XGBoost",
            "description": "Regional demand volume estimation",
        },
        "disease_detection": {
            "name": "Crop Leaf Disease Vision Classifier",
            "artifact": "agriconnect_disease_best.pth",
            "framework": "PyTorch / torchvision (MobileNetV3-Large)",
            "description": "MobileNetV3-Large 37-class crop leaf disease classifier",
        },
    }

    def __init__(self, model_dir: Optional[Path] = None):
        settings = get_settings()
        self.model_dir = model_dir or settings.model_path
        self._loaded_models: Dict[str, Any] = {}

    def artifact_exists(self, model_key: str) -> bool:
        """Check if expected model artifact file exists on disk."""
        meta = self.MODEL_DEFINITIONS.get(model_key)
        if not meta:
            return False
        artifact_path = self.model_dir / meta["artifact"]
        return artifact_path.is_file()

    def get_model_status(self, model_key: str) -> ModelStatusInfo:
        """Return structured status metadata for a model."""
        meta = self.MODEL_DEFINITIONS.get(model_key)
        if not meta:
            return ModelStatusInfo(
                name=model_key,
                available=False,
                status="unknown",
                artifact_found=False,
                expected_artifact="none",
                message=f"Model '{model_key}' is not registered in the system.",
            )

        exists = self.artifact_exists(model_key)
        is_loaded = model_key in self._loaded_models

        if exists and is_loaded:
            status = "ready"
            msg = "Model artifact loaded and ready for inference."
        elif exists and not is_loaded:
            status = "artifact_present_unloaded"
            msg = "Model artifact exists on disk; will load on first inference."
        else:
            status = "not_trained"
            msg = (
                f"Model artifact '{meta['artifact']}' not found in '{self.model_dir}'. "
                "Dataset ingestion and model training are scheduled for Phase 14."
            )

        return ModelStatusInfo(
            name=meta["name"],
            available=(exists and is_loaded),
            status=status,
            artifact_found=exists,
            expected_artifact=meta["artifact"],
            message=msg,
        )

    def get_all_models_status(self) -> Dict[str, ModelStatusInfo]:
        """Return status for all registered agricultural models."""
        return {key: self.get_model_status(key) for key in self.MODEL_DEFINITIONS}

    def get_model(self, model_key: str) -> Any:
        """Retrieve model instance from memory cache or load if artifact exists.
        
        Raises ModelNotAvailableError if artifact is missing.
        Never fabricates predictions or returns synthetic substitutes.
        """
        if model_key not in self.MODEL_DEFINITIONS:
            raise ModelNotAvailableError(
                model_name=model_key,
                message=f"Unknown model identifier '{model_key}'.",
            )

        meta = self.MODEL_DEFINITIONS[model_key]
        artifact_path = self.model_dir / meta["artifact"]

        if not artifact_path.is_file():
            logger.warning(
                "Requested inference on unavailable model '%s'. Artifact missing at '%s'.",
                model_key,
                artifact_path,
            )
            raise ModelNotAvailableError(
                model_name=model_key,
                message=(
                    f"Model '{meta['name']}' is not available because artifact '{meta['artifact']}' "
                    "does not exist. Training and validation will be completed in Phase 14."
                ),
            )

    def _load_disease_model(self, artifact_path: Path) -> Dict[str, Any]:
        """Load and reconstruct MobileNetV3-Large disease classifier from PyTorch checkpoint."""
        try:
            import torch
            import torchvision.models as models
        except ImportError as exc:
            logger.error("PyTorch or torchvision is not installed: %s", exc)
            raise ModelNotAvailableError(
                model_name="disease_detection",
                message="PyTorch/torchvision dependencies are required for disease model inference.",
            ) from exc

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info("Loading disease model checkpoint from '%s' onto device '%s'", artifact_path, device)

        try:
            checkpoint = torch.load(artifact_path, map_location=device, weights_only=False)
        except Exception as exc:
            logger.error("Failed to read disease checkpoint '%s': %s", artifact_path, exc)
            raise ModelNotAvailableError(
                model_name="disease_detection",
                message=f"Corrupt or unreadable checkpoint artifact at '{artifact_path}'.",
            ) from exc

        if not isinstance(checkpoint, dict):
            raise ModelNotAvailableError(
                model_name="disease_detection",
                message=f"Invalid checkpoint format in '{artifact_path}': expected dict, got {type(checkpoint).__name__}.",
            )

        if "model_state_dict" not in checkpoint or "class_names" not in checkpoint:
            raise ModelNotAvailableError(
                model_name="disease_detection",
                message=f"Checkpoint in '{artifact_path}' missing required keys 'model_state_dict' or 'class_names'.",
            )

        class_names = checkpoint["class_names"]
        if not isinstance(class_names, (list, tuple)) or len(class_names) == 0:
            raise ModelNotAvailableError(
                model_name="disease_detection",
                message=f"Checkpoint class_names must be a non-empty list of class labels, got {type(class_names)}.",
            )

        num_classes = len(class_names)
        logger.info("Reconstructing MobileNetV3-Large classifier with %d output classes", num_classes)

        model = models.mobilenet_v3_large(weights=None)
        in_features = model.classifier[3].in_features
        model.classifier[3] = torch.nn.Linear(in_features, num_classes)

        try:
            model.load_state_dict(checkpoint["model_state_dict"], strict=True)
        except Exception as exc:
            logger.error("Failed to load weights into MobileNetV3-Large architecture: %s", exc)
            raise ModelNotAvailableError(
                model_name="disease_detection",
                message=f"Model state dict failed strict architecture match: {exc}",
            ) from exc

        model.to(device)
        model.eval()

        return {
            "model": model,
            "class_names": list(class_names),
            "device": device,
            "metadata": {
                "architecture": checkpoint.get("architecture", "MobileNet_V3_Large"),
                "best_epoch": checkpoint.get("best_epoch"),
                "val_accuracy": checkpoint.get("val_accuracy"),
                "image_size": checkpoint.get("image_size", 224),
            },
        }

    def get_model(self, model_key: str) -> Any:
        """Retrieve model instance from memory cache or load if artifact exists.
        
        Raises ModelNotAvailableError if artifact is missing.
        Never fabricates predictions or returns synthetic substitutes.
        """
        if model_key not in self.MODEL_DEFINITIONS:
            raise ModelNotAvailableError(
                model_name=model_key,
                message=f"Unknown model identifier '{model_key}'.",
            )

        meta = self.MODEL_DEFINITIONS[model_key]
        artifact_path = self.model_dir / meta["artifact"]

        if not artifact_path.is_file():
            logger.warning(
                "Requested inference on unavailable model '%s'. Artifact missing at '%s'.",
                model_key,
                artifact_path,
            )
            raise ModelNotAvailableError(
                model_name=model_key,
                message=(
                    f"Model '{meta['name']}' is not available because artifact '{meta['artifact']}' "
                    "does not exist. Training and validation will be completed in Phase 14."
                ),
            )

        # Lazy loading & caching
        if model_key not in self._loaded_models:
            logger.info("Loading model artifact for '%s' from '%s'", model_key, artifact_path)
            if model_key == "disease_detection":
                self._loaded_models[model_key] = self._load_disease_model(artifact_path)
            else:
                import joblib
                self._loaded_models[model_key] = joblib.load(artifact_path)

        return self._loaded_models[model_key]



# Singleton instance
_registry_instance: Optional[ModelRegistry] = None


def get_model_registry() -> ModelRegistry:
    """Return singleton ModelRegistry instance."""
    global _registry_instance
    if _registry_instance is None:
        _registry_instance = ModelRegistry()
    return _registry_instance
