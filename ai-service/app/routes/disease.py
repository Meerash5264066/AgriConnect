"""Crop leaf disease detection routes."""

import io
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError
import torch
from torchvision import transforms

from app.core.config import get_settings
from app.schemas.common import DiseaseDetectionResponse, ErrorResponse
from app.services.model_registry import get_model_registry, ModelNotAvailableError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/disease", tags=["Disease Detection"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_PIL_FORMATS = {"JPEG", "PNG", "WEBP"}

# Model evaluation transform matching training pipeline:
# RGB, resize to 256, center crop to 224x224, tensor conversion, ImageNet normalization
DISEASE_TRANSFORM = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225],
    ),
])


def get_remedy_recommendation(crop: str, disease: str) -> Optional[str]:
    """Provide agronomic treatment advisory based on detected crop and disease condition."""
    d_lower = disease.lower()
    if "healthy" in d_lower:
        return "Plant foliage appears healthy. Maintain balanced irrigation, appropriate fertilization, and routine monitoring."
    if "early blight" in d_lower or "late blight" in d_lower or "blight" in d_lower:
        return "Prune and destroy infected lower leaves. Apply copper-based fungicide or chlorothalonil. Avoid overhead watering to keep foliage dry."
    if "scab" in d_lower:
        return "Apply protective sulfur or copper fungicide during early shoot growth. Rake and dispose of fallen infected leaves to prevent reinfection."
    if "rust" in d_lower:
        return "Apply mancozeb or myclobutanil fungicide. Prune surrounding dense foliage to improve airflow and reduce humidity."
    if "powdery mildew" in d_lower or "mildew" in d_lower:
        return "Apply potassium bicarbonate, sulfur spray, or horticultural neem oil. Increase plant spacing to maximize air circulation."
    if "bacterial spot" in d_lower or "black spot" in d_lower or "spot" in d_lower:
        return "Apply copper hydroxide mixed with mancozeb. Avoid working with wet foliage and disinfect pruning shears with 70% alcohol."
    if "canker" in d_lower:
        return "Prune infected twigs and branches at least 10 cm below visible lesions. Spray copper-based bactericide during seasonal flush."
    if "greening" in d_lower:
        return "Control Asian citrus psyllid vectors with systemic insecticides or neem sprays. Remove severely infected trees to protect adjacent grove."
    if "mold" in d_lower:
        return "Reduce greenhouse humidity below 85% with active ventilation. Apply calcium chloride or appropriate fungicide to protect leaves."
    if "virus" in d_lower:
        return "Control insect vectors (whiteflies/aphids) using yellow sticky cards and insecticidal soap. Immediately rogue and destroy infected plants."
    if "mite" in d_lower:
        return "Apply insecticidal soap or horticultural oil targeting leaf undersides. Maintain adequate field hydration to discourage mite colonies."
    if "rot" in d_lower or "measles" in d_lower:
        return "Remove and discard mummified fruit and infected vines. Apply protective strobilurin or captan fungicide during pre-bloom and bloom."
    return "Isolate infected foliage, prune damaged tissue with sanitized tools, and consult a local agricultural extension officer for specific treatment."


@router.post(
    "/detect",
    response_model=DiseaseDetectionResponse,
    summary="Detect Crop Leaf Disease from Image",
    description=(
        "Accepts a crop leaf image upload, validates image integrity and dimensions, "
        "and runs deep-learning vision inference via MobileNetV3-Large across 37 crop disease classes."
    ),
    responses={
        status.HTTP_200_OK: {
            "model": DiseaseDetectionResponse,
            "description": "Successful leaf disease detection classification.",
        },
        status.HTTP_501_NOT_IMPLEMENTED: {
            "model": ErrorResponse,
            "description": "Disease vision model not yet trained or deployed.",
        },
        413: {
            "description": "Uploaded image file exceeds maximum allowed size.",
        },
        status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: {
            "description": "Unsupported image format or invalid image payload.",
        },
        status.HTTP_500_INTERNAL_SERVER_ERROR: {
            "model": ErrorResponse,
            "description": "Inference execution error.",
        },
    },
)
async def detect_disease(file: UploadFile = File(..., description="Crop leaf image file (JPEG, PNG, WEBP)")):
    """Validate uploaded leaf image and invoke MobileNetV3-Large vision inference pipeline."""
    settings = get_settings()

    # 1. Validate file extension
    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "message": (
                    f"Unsupported file extension '{suffix}'. "
                    f"Allowed extensions are: {', '.join(sorted(ALLOWED_EXTENSIONS))}."
                ),
                "error_code": "UNSUPPORTED_FILE_EXTENSION",
            },
        )

    # 2. Check declared MIME type
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "message": (
                    f"Unsupported content type '{content_type}'. "
                    f"Allowed MIME types are: {', '.join(sorted(ALLOWED_MIME_TYPES))}."
                ),
                "error_code": "UNSUPPORTED_MIME_TYPE",
            },
        )

    # 3. Stream and enforce size limit safely
    max_bytes = int(settings.max_upload_size_bytes)
    contents = await file.read(max_bytes + 1)

    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail={
                "message": f"Uploaded file exceeds maximum limit of {settings.MAX_UPLOAD_SIZE_MB} MB.",
                "error_code": "FILE_TOO_LARGE",
                "max_size_mb": settings.MAX_UPLOAD_SIZE_MB,
            },
        )

    if not contents:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "message": "Uploaded file is empty.",
                "error_code": "EMPTY_FILE",
            },
        )

    # 4. Deep image inspection using Pillow (verify binary header & integrity)
    try:
        image_stream = io.BytesIO(contents)
        with Image.open(image_stream) as img:
            image_format = img.format
            if image_format not in ALLOWED_PIL_FORMATS:
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail={
                        "message": f"Decoded image format '{image_format}' is not supported.",
                        "error_code": "INVALID_IMAGE_FORMAT",
                    },
                )
            img.verify()
    except (UnidentifiedImageError, OSError, SyntaxError) as err:
        logger.warning("Uploaded image failed verification: %s", err)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "message": "Uploaded file is corrupt or not a valid supported image.",
                "error_code": "CORRUPT_IMAGE_PAYLOAD",
            },
        )

    # 5. Retrieve model from registry
    registry = get_model_registry()
    try:
        model_bundle = registry.get_model("disease_detection")
    except ModelNotAvailableError as err:
        logger.info("Disease detection model request rejected: %s", err.message)
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={
                "message": (
                    "Crop disease vision model is not available. "
                    "Ensure agriconnect_disease_best.pth is present in the models directory."
                ),
                "error_code": "MODEL_NOT_TRAINED",
                "model": "disease_detection",
                "verified_image": {
                    "filename": filename,
                    "format": image_format,
                    "size_bytes": len(contents),
                },
            },
        )

    # Unpack model, classes, and target inference device
    if isinstance(model_bundle, dict):
        model = model_bundle["model"]
        class_names = model_bundle.get("class_names", [])
        device = model_bundle.get("device", torch.device("cpu"))
    else:
        model = model_bundle
        class_names = getattr(model_bundle, "class_names", [])
        device = getattr(model_bundle, "device", torch.device("cpu"))

    # 6. Preprocess uploaded image
    try:
        raw_image = Image.open(io.BytesIO(contents)).convert("RGB")
        input_tensor = DISEASE_TRANSFORM(raw_image).unsqueeze(0).to(device)
    except Exception as exc:
        logger.error("Failed to preprocess image for disease detection: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "message": "Failed to decode and preprocess image for disease detection.",
                "error_code": "IMAGE_PREPROCESSING_ERROR",
            },
        )

    # 7. Execute forward inference
    try:
        with torch.no_grad():
            logits = model(input_tensor)
            probs = torch.softmax(logits, dim=1)
            top_prob, top_idx = torch.max(probs, dim=1)

        confidence_val = float(top_prob.item())
        class_idx = int(top_idx.item())

        if 0 <= class_idx < len(class_names):
            predicted_class = class_names[class_idx]
        else:
            predicted_class = f"Class_{class_idx}"

    except Exception as exc:
        logger.error("Disease detection inference failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Inference failed during disease classification.",
                "error_code": "INFERENCE_ERROR",
            },
        )

    # 8. Parse Crop and Disease names from composite label
    if "___" in predicted_class:
        crop_name, disease_name = predicted_class.split("___", 1)
    else:
        crop_name = "Unknown"
        disease_name = predicted_class

    remedy = get_remedy_recommendation(crop_name, disease_name)

    return DiseaseDetectionResponse(
        predicted_class=predicted_class,
        crop=crop_name,
        disease=disease_name,
        confidence=round(confidence_val, 4),
        model_name="MobileNetV3-Large Disease Classifier",
        remedy_recommendation=remedy,
    )

