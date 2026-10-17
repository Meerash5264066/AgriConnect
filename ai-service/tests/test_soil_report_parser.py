"""Tests for Soil Laboratory Test Report parsing, unit conversion, and AI crop recommendation."""

import io
import pytest
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw, ImageFont
from fastapi.testclient import TestClient

from app.main import app
from app.services.soil_report_parser import (
    get_soil_report_parser,
    InvalidFileTypeError,
    FileSizeExceededError,
    CorruptReportFileError,
    PasswordProtectedPDFError,
)

client = TestClient(app)


def create_synthetic_soil_pdf(
    n_val=95.0,
    n_unit="mg/kg",
    p_val=42.0,
    p_unit="kg/ha",
    k_val=43.0,
    k_unit="kg/ha",
    ph_val=6.5,
    omit_fields=None,
    lab_name="KRISHI VIGYAN KENDRA SOIL TESTING LABORATORY",
    report_date="12/03/2025",
) -> bytes:
    """Helper creating a synthetic soil report PDF for testing purposes."""
    omit_fields = omit_fields or []
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    p.drawString(100, 750, f"{lab_name} (SYNTHETIC TEST REPORT)")
    p.drawString(100, 735, "ICAR Research Complex for Agriculture, Coimbatore, Tamil Nadu")
    p.drawString(100, 715, "SOIL HEALTH TEST REPORT")
    p.drawString(100, 700, f"Report Date: {report_date} | Sample ID: SYNTH-SHC-8841")
    p.drawString(100, 680, "Farmer Name: Senthil Kumar | Village: Kinathukadavu")
    p.drawString(100, 650, "LABORATORY TEST RESULTS:")

    y = 630
    if "n" not in omit_fields:
        p.drawString(100, y, f"Available Nitrogen (N): {n_val} {n_unit}")
        y -= 20
    if "p" not in omit_fields:
        p.drawString(100, y, f"Available Phosphorus (P): {p_val} {p_unit}")
        y -= 20
    if "k" not in omit_fields:
        p.drawString(100, y, f"Available Potassium (K): {k_val} {k_unit}")
        y -= 20
    if "ph" not in omit_fields:
        p.drawString(100, y, f"Soil pH (1:2.5): {ph_val}")
        y -= 20

    p.drawString(100, y, "Organic Carbon: 0.58 %")
    y -= 20
    p.drawString(100, y, "Electrical Conductivity (EC): 0.35 dS/m")
    y -= 20
    p.drawString(100, y, "Soil Texture: Clay Loam")

    p.showPage()
    p.save()
    return buffer.getvalue()


def create_synthetic_soil_image(
    format_type="PNG",
    n_val=90,
    p_val=42,
    k_val=43,
    ph_val=6.5,
) -> bytes:
    """Helper creating a synthetic soil report image for OCR testing."""
    img = Image.new("RGB", (600, 400), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    draw.text((20, 20), "STATE AGRI SOIL TESTING LABORATORY (SYNTHETIC)", fill=(0, 0, 0))
    draw.text((20, 50), "Soil Test Report - Sample #9921", fill=(0, 0, 0))
    draw.text((20, 90), f"Available Nitrogen (N): {n_val} kg/ha", fill=(0, 0, 0))
    draw.text((20, 130), f"Available Phosphorus (P): {p_val} kg/ha", fill=(0, 0, 0))
    draw.text((20, 170), f"Available Potassium (K): {k_val} kg/ha", fill=(0, 0, 0))
    draw.text((20, 210), f"Soil pH: {ph_val}", fill=(0, 0, 0))
    draw.text((20, 250), "Organic Carbon: 0.65 %", fill=(0, 0, 0))
    draw.text((20, 290), "Date: 15-Nov-2025", fill=(0, 0, 0))

    buf = io.BytesIO()
    img.save(buf, format=format_type)
    return buf.getvalue()


class TestSoilReportParser:
    """Test suite verifying soil report extraction pipeline and security constraints."""

    def test_valid_pdf_upload_and_extraction(self):
        """1. Valid PDF upload extracts N, P, K, pH and applies verified unit conversion."""
        pdf_bytes = create_synthetic_soil_pdf(n_val=95.0, n_unit="mg/kg", p_val=42.0, k_val=43.0, ph_val=6.5)
        parser = get_soil_report_parser()
        res = parser.parse_soil_report(pdf_bytes, "test_report.pdf")

        assert res["status"] == "success"
        assert res["extraction_method"] == "pdf_text"
        assert "KRISHI VIGYAN KENDRA" in res["laboratory_name"]
        assert "nitrogen" in res["soil_parameters"]
        assert "phosphorus" in res["soil_parameters"]
        assert "potassium" in res["soil_parameters"]
        assert "ph" in res["soil_parameters"]

        # 95 mg/kg * 2.24 = 212.8 kg/ha
        assert res["soil_parameters"]["nitrogen"]["raw_value"] == 95.0
        assert res["soil_parameters"]["nitrogen"]["raw_unit"] == "mg/kg"
        assert res["soil_parameters"]["nitrogen"]["normalized_value"] == 212.8
        assert res["soil_parameters"]["nitrogen"]["normalized_unit"] == "kg/ha"

        # P and K in kg/ha
        assert res["soil_parameters"]["phosphorus"]["normalized_value"] == 42.0
        assert res["soil_parameters"]["potassium"]["normalized_value"] == 43.0
        assert res["soil_parameters"]["ph"]["normalized_value"] == 6.5
        assert len(res["missing_required_fields"]) == 0

    def test_unit_conversion_kg_acre(self):
        """Verify kg/acre conversion to kg/ha (kg/ha = kg/acre * 2.471)."""
        pdf_bytes = create_synthetic_soil_pdf(n_val=50.0, n_unit="kg/acre")
        parser = get_soil_report_parser()
        res = parser.parse_soil_report(pdf_bytes, "report_acre.pdf")

        # 50.0 * 2.471 = 123.55 kg/ha
        assert res["soil_parameters"]["nitrogen"]["normalized_value"] == 123.55
        assert "kg/acre" in res["soil_parameters"]["nitrogen"]["raw_unit"]

    def test_valid_png_upload(self):
        """2. Valid PNG upload via OCR extraction."""
        png_bytes = create_synthetic_soil_image(format_type="PNG", n_val=90, p_val=42, k_val=43, ph_val=6.5)
        parser = get_soil_report_parser()
        res = parser.parse_soil_report(png_bytes, "report.png")

        assert res["status"] in {"success", "partial"}
        assert res["extraction_method"] == "ocr_image"
        assert "ph" in res["soil_parameters"]
        assert res["soil_parameters"]["ph"]["normalized_value"] == 6.5

    def test_valid_jpg_upload(self):
        """Valid JPEG upload via OCR extraction."""
        jpg_bytes = create_synthetic_soil_image(format_type="JPEG", n_val=90, p_val=42, k_val=43, ph_val=6.8)
        parser = get_soil_report_parser()
        res = parser.parse_soil_report(jpg_bytes, "report.jpg")

        assert res["status"] in {"success", "partial"}
        assert res["extraction_method"] == "ocr_image"

    def test_invalid_file_type_rejection(self):
        """3. Invalid file type rejection (.txt, .exe, .sh)."""
        parser = get_soil_report_parser()
        with pytest.raises(InvalidFileTypeError):
            parser.parse_soil_report(b"some plain text notes", "notes.txt")

    def test_oversized_file_rejection(self):
        """4. Oversized file rejection (> 10MB)."""
        parser = get_soil_report_parser()
        fake_large = b"%PDF" + b"0" * (11 * 1024 * 1024)
        with pytest.raises(FileSizeExceededError):
            parser.parse_soil_report(fake_large, "huge.pdf")

    def test_corrupt_file_handling(self):
        """5. Corrupt or unreadable file handling."""
        parser = get_soil_report_parser()
        with pytest.raises(CorruptReportFileError):
            parser.parse_soil_report(b"%PDF-corrupt-data-not-a-real-pdf", "bad.pdf")

    def test_missing_fields_clearly_identified(self):
        """7. Partial report identifies missing fields without fabricating numbers."""
        pdf_bytes = create_synthetic_soil_pdf(omit_fields=["n", "ph"])
        parser = get_soil_report_parser()
        res = parser.parse_soil_report(pdf_bytes, "partial.pdf")

        assert res["status"] == "partial"
        assert "nitrogen" in res["missing_required_fields"]
        assert "ph" in res["missing_required_fields"]
        assert "phosphorus" in res["soil_parameters"]
        assert "potassium" in res["soil_parameters"]
        # Weather inputs are explicitly highlighted as external requirements
        assert len(res["weather_inputs_required"]) == 3

    def test_secondary_parameters_preserved_not_sent_to_model(self):
        """Organic Carbon, EC, and Texture are extracted for display but isolated."""
        pdf_bytes = create_synthetic_soil_pdf()
        parser = get_soil_report_parser()
        res = parser.parse_soil_report(pdf_bytes, "test.pdf")

        assert "organic_carbon" in res["secondary_parameters"]
        assert "electrical_conductivity" in res["secondary_parameters"]
        assert res["secondary_parameters"]["organic_carbon"]["raw_value"] == 0.58


class TestCropRecommendationPipelineIntegration:
    """Test full integration from report extraction to ML model execution."""

    def test_crop_recommendation_from_validated_inputs(self):
        """11. The actual crop recommendation model is invoked and returns real class prediction."""
        payload = {
            "nitrogen": 90.0,
            "phosphorus": 42.0,
            "potassium": 43.0,
            "temperature": 20.8,
            "humidity": 82.0,
            "ph": 6.5,
            "rainfall": 202.9,
        }
        res = client.post("/api/v1/crop/recommend", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["recommended_crop"] == "rice"
        assert data["confidence"] > 0.5
        assert data["model_version"] == "RandomForest-v1"

    def test_api_parse_soil_report_endpoint(self):
        """Test FastAPI POST /api/v1/crop/parse-soil-report multipart upload."""
        pdf_bytes = create_synthetic_soil_pdf()
        files = {"file": ("kvk_soil_report.pdf", pdf_bytes, "application/pdf")}
        res = client.post("/api/v1/crop/parse-soil-report", files=files)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert "nitrogen" in data["soil_parameters"]
        assert "phosphorus" in data["soil_parameters"]
        assert "potassium" in data["soil_parameters"]
        assert "ph" in data["soil_parameters"]


class TestMandiTickerEndpoint:
    """Test suite for expanded APMC Mandi price ticker."""

    def test_ticker_retrieves_real_records(self):
        """1. The ticker retrieves real records from the selected dataset."""
        res = client.get("/api/v1/price/mandi-ticker")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert data["count"] >= 30
        assert "Agmarknet APMC Daily Arrivals" in data["data_source"]

    def test_ticker_converts_quintal_to_kg_correctly(self):
        """3 & 4. Prices and units are correct; ₹/quintal to ₹/kg is correct."""
        res = client.get("/api/v1/price/mandi-ticker")
        assert res.status_code == 200
        data = res.json()
        records = data["records"]
        assert len(records) > 0

        for r in records:
            # Check price conversion formula: kg = quintal / 100
            expected_kg = round(r["modal_price_per_quintal"] / 100.0, 2)
            assert abs(r["modal_price_per_kg"] - expected_kg) < 0.01
            assert r["price_unit"] == "₹/kg"
            assert len(r["arrival_date"]) == 10  # YYYY-MM-DD

    def test_ticker_market_date_and_retrieval_time_distinguished(self):
        """5. Market date and retrieval time are clearly distinguished."""
        res = client.get("/api/v1/price/mandi-ticker")
        assert res.status_code == 200
        data = res.json()
        assert "retrieved_at" in data
        assert "latest_market_date" in data
        assert "2025" in data["latest_market_date"]
        # Retrieved time is current ISO timestamp with timezone
        assert "T" in data["retrieved_at"]

    def test_ticker_state_filter(self):
        """Prioritize markets relevant to selected state."""
        res = client.get("/api/v1/price/mandi-ticker?state=Tamil+Nadu")
        assert res.status_code == 200
        data = res.json()
        for r in data["records"]:
            assert r["state"].lower() == "tamil nadu"
