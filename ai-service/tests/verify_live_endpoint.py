"""Verification script for live Crop Disease Detection endpoint."""

import io
import json
import urllib.request
from PIL import Image, ImageDraw


def run_live_verification():
    # 1. Generate realistic test leaf image
    img = Image.new("RGB", (256, 256), color=(245, 245, 240))
    draw = ImageDraw.Draw(img)

    # Leaf blade contour
    leaf_coords = [(128, 15), (215, 110), (195, 190), (128, 245), (60, 190), (40, 110)]
    draw.polygon(leaf_coords, fill=(34, 139, 34))

    # Midrib and lateral veins
    draw.line([(128, 15), (128, 245)], fill=(107, 142, 35), width=3)
    for y in range(45, 215, 25):
        draw.line([(128, y), (128 + 45, y + 25)], fill=(107, 142, 35), width=2)
        draw.line([(128, y), (128 - 45, y + 25)], fill=(107, 142, 35), width=2)

    # Some blight lesions / spots
    draw.ellipse([(140, 80), (160, 100)], fill=(139, 69, 19))
    draw.ellipse([(90, 130), (115, 155)], fill=(139, 69, 19))

    # Save to buffer
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    img_bytes = buf.getvalue()

    # Save a copy as test artifact
    img.save("datasets/disease/verified_test_leaf.jpg", format="JPEG")
    print("Saved test leaf image to datasets/disease/verified_test_leaf.jpg")

    # 2. Build multipart/form-data payload
    boundary = "----WebKitFormBoundarySampleLeafTest12345"
    delimiter = f"--{boundary}\r\n".encode("utf-8")
    end_marker = f"\r\n--{boundary}--\r\n".encode("utf-8")

    header = (
        'Content-Disposition: form-data; name="file"; filename="verified_test_leaf.jpg"\r\n'
        'Content-Type: image/jpeg\r\n\r\n'
    ).encode("utf-8")

    body = delimiter + header + img_bytes + end_marker

    url = "http://127.0.0.1:8000/api/v1/disease/detect"
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
        },
        method="POST",
    )

    print(f"Sending live request to {url}...")
    with urllib.request.urlopen(req, timeout=15) as resp:
        status_code = resp.status
        raw_data = resp.read().decode("utf-8")
        result = json.loads(raw_data)

    print(f"\nResponse HTTP Status: {status_code}")
    print(f"Predicted Class:      {result.get('predicted_class')}")
    print(f"Crop:                 {result.get('crop')}")
    print(f"Disease:              {result.get('disease')}")
    print(f"Confidence:           {result.get('confidence')}")
    print(f"Model Name:           {result.get('model_name')}")
    print(f"Remedy:               {result.get('remedy_recommendation')}")
    print("\nFull JSON Response:")
    print(json.dumps(result, indent=2))

    assert status_code == 200
    assert "predicted_class" in result
    assert "confidence" in result
    assert result["model_name"] == "MobileNetV3-Large Disease Classifier"
    print("\n[SUCCESS] Live endpoint verification passed!")


if __name__ == "__main__":
    run_live_verification()
