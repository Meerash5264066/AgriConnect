"""Soil laboratory test report parsing service.

Extracts soil nutrient parameters (N, P, K, pH), secondary parameters
(Organic Carbon, Electrical Conductivity, Texture), laboratory metadata,
and units from text-based PDFs, scanned PDFs, and soil report images.
"""

import io
import re
import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)

# Maximum file size: 10 MB
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

SUPPORTED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
}

SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}

MAGIC_NUMBERS = {
    "pdf": b"%PDF",
    "jpeg": b"\xFF\xD8\xFF",
    "png": b"\x89PNG\r\n\x1a\n",
}


class SoilReportError(Exception):
    """Base exception for soil report parsing failures."""
    pass


class InvalidFileTypeError(SoilReportError):
    """Raised when uploaded file is not a supported PDF or image."""
    pass


class FileSizeExceededError(SoilReportError):
    """Raised when uploaded file exceeds 10MB limit."""
    pass


class PasswordProtectedPDFError(SoilReportError):
    """Raised when PDF report is encrypted or password-protected."""
    pass


class CorruptReportFileError(SoilReportError):
    """Raised when uploaded file is malformed or unreadable."""
    pass


class SoilReportParserService:
    """Service providing extraction and unit normalization for soil laboratory test reports."""

    def __init__(self):
        self._ocr_reader = None

    def _get_ocr_reader(self):
        """Lazy-initialize singleton EasyOCR reader for English language."""
        if self._ocr_reader is None:
            try:
                import easyocr
                # Use CPU mode for compatibility and predictability
                self._ocr_reader = easyocr.Reader(["en"], gpu=False)
            except Exception as exc:
                logger.error("Failed to initialize EasyOCR reader: %s", exc)
                raise CorruptReportFileError(f"OCR subsystem failed to initialize: {exc}") from exc
        return self._ocr_reader

    def validate_file(self, file_bytes: bytes, filename: str, content_type: Optional[str] = None):
        """Validate file size, extension, MIME type, and file magic bytes."""
        if not file_bytes or len(file_bytes) == 0:
            raise CorruptReportFileError("The uploaded file is empty (0 bytes). Please upload a valid laboratory report.")

        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            size_mb = len(file_bytes) / (1024 * 1024)
            raise FileSizeExceededError(
                f"File size ({size_mb:.1f} MB) exceeds maximum allowed size of 10 MB. Please upload a smaller document."
            )

        lower_name = (filename or "").lower()
        matched_ext = None
        for ext in SUPPORTED_EXTENSIONS:
            if lower_name.endswith(ext):
                matched_ext = ext
                break

        if not matched_ext:
            raise InvalidFileTypeError(
                f"Unsupported file format '{filename}'. Supported formats are PDF, JPG, JPEG, and PNG."
            )

        # Validate magic signatures
        is_pdf = file_bytes.startswith(MAGIC_NUMBERS["pdf"])
        is_jpeg = file_bytes.startswith(MAGIC_NUMBERS["jpeg"])
        is_png = file_bytes.startswith(MAGIC_NUMBERS["png"])

        if matched_ext == ".pdf" and not is_pdf:
            raise CorruptReportFileError("The uploaded file has a .pdf extension but is not a valid PDF document.")
        elif matched_ext in {".jpg", ".jpeg"} and not is_jpeg:
            raise CorruptReportFileError("The uploaded file has a JPEG extension but is not a valid JPEG image.")
        elif matched_ext == ".png" and not is_png:
            raise CorruptReportFileError("The uploaded file has a .png extension but is not a valid PNG image.")

        if not (is_pdf or is_jpeg or is_png):
            raise InvalidFileTypeError("File content does not match any supported format (PDF, JPG, JPEG, PNG).")

    def extract_text_from_pdf(self, file_bytes: bytes) -> Tuple[str, List[List[str]], str]:
        """Extract text and tabular content from text-based or scanned PDF.
        
        Returns:
            (raw_text, table_rows, extraction_method)
        """
        import pdfplumber

        raw_text_parts = []
        table_rows = []

        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                if len(pdf.pages) == 0:
                    raise CorruptReportFileError("The PDF document contains no pages.")

                for page_idx, page in enumerate(pdf.pages):
                    try:
                        text = page.extract_text() or ""
                        if text.strip():
                            raw_text_parts.append(text)
                    except Exception as err:
                        logger.warning("Error extracting text on page %d: %s", page_idx, err)

                    try:
                        extracted_tables = page.extract_tables() or []
                        for table in extracted_tables:
                            for row in table:
                                if row:
                                    clean_row = [str(cell).strip() if cell is not None else "" for cell in row]
                                    if any(clean_row):
                                        table_rows.append(clean_row)
                    except Exception as err:
                        logger.warning("Error extracting tables on page %d: %s", page_idx, err)

        except Exception as exc:
            err_str = str(exc).lower()
            if "password" in err_str or "encrypted" in err_str:
                raise PasswordProtectedPDFError(
                    "This soil test PDF report is password-protected. Please upload an unlocked PDF or image."
                ) from exc
            logger.error("Failed to read PDF with pdfplumber: %s", exc)
            raise CorruptReportFileError(f"Unable to read PDF document: {exc}") from exc

        full_text = "\n".join(raw_text_parts).strip()

        # If text-based PDF yielded sufficient text (> 40 chars), return it
        if len(full_text) >= 40 or len(table_rows) >= 2:
            return full_text, table_rows, "pdf_text"

        # Otherwise, fall back to OCR for scanned PDF
        logger.info("PDF has minimal or no selectable text (%d chars). Falling back to OCR.", len(full_text))
        return self._ocr_pdf_pages(file_bytes)

    def _ocr_pdf_pages(self, file_bytes: bytes) -> Tuple[str, List[List[str]], str]:
        """Render scanned PDF pages to images and execute OCR."""
        import pypdfium2

        ocr_reader = self._get_ocr_reader()
        ocr_lines = []

        try:
            pdf = pypdfium2.PdfDocument(file_bytes)
            page_count = min(len(pdf), 3)  # Analyze up to first 3 pages of soil report

            for page_idx in range(page_count):
                page = pdf[page_idx]
                image = page.render(scale=2.0).to_pil()
                img_byte_arr = io.BytesIO()
                image.save(img_byte_arr, format="PNG")
                img_bytes = img_byte_arr.getvalue()

                results = ocr_reader.readtext(img_bytes)
                for bbox, text, prob in results:
                    if text and text.strip():
                        ocr_lines.append(text.strip())

        except Exception as exc:
            logger.error("OCR extraction failed on scanned PDF: %s", exc)
            raise CorruptReportFileError(f"Scanned PDF OCR failed: {exc}") from exc

        full_text = "\n".join(ocr_lines)
        return full_text, [], "ocr_scanned_pdf"

    def extract_text_from_image(self, file_bytes: bytes) -> Tuple[str, List[List[str]], str]:
        """Extract text from JPG or PNG image using OCR."""
        from PIL import Image

        try:
            image = Image.open(io.BytesIO(file_bytes))
            image.verify()  # Verify image integrity
            # Reopen for reading after verify()
            image = Image.open(io.BytesIO(file_bytes))
        except Exception as exc:
            logger.error("Corrupt image provided: %s", exc)
            raise CorruptReportFileError("The uploaded image is corrupted or cannot be decoded. Please upload a clear photo.") from exc

        ocr_reader = self._get_ocr_reader()
        try:
            results = ocr_reader.readtext(file_bytes)
            ocr_lines = [text.strip() for bbox, text, prob in results if text and text.strip()]
        except Exception as exc:
            logger.error("OCR extraction failed on image: %s", exc)
            raise CorruptReportFileError(f"Image OCR processing failed: {exc}") from exc

        full_text = "\n".join(ocr_lines)
        return full_text, [], "ocr_image"

    def _extract_laboratory_metadata(self, text: str) -> Tuple[Optional[str], Optional[str]]:
        """Identify laboratory name and test/sampling date if present."""
        lab_name = None
        report_date = None

        # Detect lab name
        lab_patterns = [
            r"([A-Z][A-Za-z0-9\s,\.-]+(?:Soil\s+(?:Testing|Analysis|Testing\s+Laboratory|Health\s+Card|Research\s+Institute)|KVK|Krishi\s+Vigyan\s+Kendra|Agri(?:culture)?\s+Laboratory|ICAR|Department\s+of\s+Agriculture)[A-Za-z0-9\s,\.-]*)",
            r"(?:Laboratory|Lab\s+Name|Tested\s+By|Centre)\s*[:\-]\s*([A-Za-z0-9\s,\.-]{4,60})",
        ]
        for pattern in lab_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                candidate = match.group(1).strip()
                if len(candidate) > 4 and len(candidate) < 100:
                    lab_name = re.sub(r"\s+", " ", candidate).strip(" ,.-:")
                    break

        if not lab_name and ("soil health card" in text.lower() or "shc" in text.lower()):
            lab_name = "Government Soil Health Card Scheme Laboratory"

        # Detect report date
        date_patterns = [
            r"(?:Date(?:\s+of\s+(?:Report|Testing|Analysis|Sample))?|Report\s+Date|Sampling\s+Date)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
            r"(?:Date|Dated)\s*[:\-]?\s*(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+\d{2,4})",
            r"(\b\d{4}-\d{2}-\d{2}\b)",
            r"(\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}\b)",
        ]
        for pattern in date_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                report_date = match.group(1).strip()
                break

        return lab_name, report_date

    def _find_nutrient_value_and_unit(
        self,
        text: str,
        table_rows: List[List[str]],
        aliases: List[str],
        default_unit: str = "kg/ha",
        is_ph: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Find nutrient parameter value and associated unit from text and table rows."""
        # 1. Search in structured table rows first
        for row in table_rows:
            row_str = " ".join(row).lower()
            for alias in aliases:
                match = False
                if is_ph and re.search(r"\bph\b|soil\s*ph|soilph|reaction\s*\(?ph\)?", row_str):
                    match = True
                elif not is_ph and re.search(r"(?:\b|\()" + re.escape(alias.lower()) + r"(?:\b|\))", row_str):
                    match = True

                if match:
                    extracted = self._extract_number_and_unit_from_row(row, alias, default_unit, is_ph=is_ph)
                    if extracted:
                        return extracted

        # 2. Search in free text lines
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        for idx, line in enumerate(lines):
            line_lower = line.lower()
            for alias in aliases:
                match = False
                if is_ph and re.search(r"\bph\b|soil\s*ph|soilph|reaction\s*\(?ph\)?", line_lower):
                    match = True
                elif not is_ph and re.search(r"(?:\b|\()" + re.escape(alias.lower()) + r"(?:\b|\))", line_lower):
                    match = True

                if match:
                    combined = line
                    if idx + 1 < len(lines):
                        combined += " " + lines[idx + 1]

                    extracted = self._extract_number_and_unit_from_text(combined, alias, default_unit, is_ph=is_ph)
                    if extracted:
                        return extracted


        return None


    def _extract_number_and_unit_from_row(
        self, row: List[str], alias: str, default_unit: str, is_ph: bool = False
    ) -> Optional[Dict[str, Any]]:
        """Extract number and unit from a table row containing the parameter name."""
        # Clean row cells
        numbers = []
        units_found = []

        unit_regex = re.compile(
            r"\b(kg\s*[\/\-]?\s*(?:ha|hectare|acre)|mg\s*[\/\-]?\s*kg|ppm|g\s*[\/\-]?\s*kg|%|dS\s*[\/\-]?\s*m|mS\s*[\/\-]?\s*cm|µS\s*[\/\-]?\s*cm)\b",
            re.IGNORECASE,
        )

        for cell in row:
            clean_cell = cell
            if is_ph:
                # Strip out dilution ratios like 1:2.5 or (1:2)
                clean_cell = re.sub(r"\(?1\s*:\s*2(?:\.5)?\)?", " ", clean_cell)

            u_match = unit_regex.search(clean_cell)
            if u_match:
                units_found.append(u_match.group(1).lower().replace(" ", ""))

            num_matches = re.findall(r"(\b\d+(?:\.\d+)?\b)", clean_cell)
            for n in num_matches:
                val = float(n)
                numbers.append(val)

        if not numbers:
            return None

        if is_ph:
            # Pick plausible pH number (3.0 to 11.0)
            ph_cands = [n for n in numbers if 3.0 <= n <= 11.0]
            if ph_cands:
                val = ph_cands[0]
            else:
                val = numbers[-1]
            return {"value": val, "unit": "pH scale", "confidence": 0.94}

        # Filter out obvious serial indices or year numbers (e.g. 2024, 2025)
        filtered_nums = [n for n in numbers if n < 1900 or n > 2100]
        if not filtered_nums:
            filtered_nums = numbers

        val = filtered_nums[-1] if len(filtered_nums) == 1 else filtered_nums[0]
        if len(filtered_nums) > 1:
            for cand in filtered_nums:
                if cand > 3.0:
                    val = cand
                    break

        unit = units_found[0] if units_found else default_unit
        unit = self._normalize_unit_string(unit)
        return {"value": val, "unit": unit, "confidence": 0.92}

    def _extract_number_and_unit_from_text(
        self, text_snippet: str, alias: str, default_unit: str, is_ph: bool = False
    ) -> Optional[Dict[str, Any]]:
        """Extract numeric value and unit from a regex match snippet."""
        clean_snippet = text_snippet

        if is_ph:
            # Strip dilution ratios like (1:2.5) or 1:2.5 so '1' isn't mistaken for pH
            clean_snippet = re.sub(r"\(?1\s*:\s*2(?:\.5)?\)?", " ", clean_snippet)

            # Look for pH pattern: (?:Soil\s*pH|SoilpH|pH) [: - = ] [number]
            ph_pattern = r"(?:Soil\s*pH|SoilpH|Reaction\s*\(?pH\)?|\bpH\b)\s*[:\-=\|]?\s*(\d+(?:\.\d+)?)"
            ph_match = re.search(ph_pattern, clean_snippet, re.IGNORECASE)
            if ph_match:
                candidate_val = float(ph_match.group(1))
                if 0.0 <= candidate_val <= 14.0:
                    return {"value": candidate_val, "unit": "pH scale", "confidence": 0.92}

            # Proximity fallback for pH
            all_nums = [float(x) for x in re.findall(r"(\b\d+(?:\.\d+)?\b)", clean_snippet)]
            plausible_ph = [n for n in all_nums if 3.0 <= n <= 11.0]
            if plausible_ph:
                return {"value": plausible_ph[0], "unit": "pH scale", "confidence": 0.85}

        # Pattern for standard nutrients: Alias [: - = is of ] [number] [optional unit]
        # Allow optional prefix/suffix chars around alias to handle OCR OCR merging like "Available Phcsphorus (Pi: 42"
        pattern = (
            r"(?:\b|\()"
            + re.escape(alias)
            + r"(?:\b|\))\s*(?:[:\-=\|]|is|of|value|content|ratio)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*([a-zA-Z%/\-]*)"
        )
        match = re.search(pattern, clean_snippet, re.IGNORECASE)
        if match:
            val_str = match.group(1)
            raw_unit = match.group(2).strip()
            unit = self._normalize_unit_string(raw_unit) if raw_unit else default_unit
            return {"value": float(val_str), "unit": unit, "confidence": 0.88}

        # Fallback: look for [number] [unit] in close proximity to alias
        prox_pattern = r"(\d+(?:\.\d+)?)\s*(kg\s*[\/\-]?\s*(?:ha|hectare|acre)|mg\s*[\/\-]?\s*kg|ppm|%|dS\s*[\/\-]?\s*m)?"
        matches = list(re.finditer(prox_pattern, clean_snippet, re.IGNORECASE))
        if matches:
            first = matches[0]
            val = float(first.group(1))
            unit = self._normalize_unit_string(first.group(2) or default_unit)
            return {"value": val, "unit": unit, "confidence": 0.78}

        return None


    def _normalize_unit_string(self, u: str) -> str:
        """Standardize raw unit strings into standard forms."""
        if not u:
            return "kg/ha"
        clean = u.lower().replace(" ", "").replace("-", "/").replace("hectare", "ha")
        if "kg/ha" in clean or clean == "kgha":
            return "kg/ha"
        if "kg/acre" in clean or clean == "kgacre":
            return "kg/acre"
        if "mg/kg" in clean or clean == "mgkg" or clean == "ppm":
            return "mg/kg"
        if "%" in clean or "percent" in clean:
            return "%"
        if "ds/m" in clean or "dsm" in clean or "mmhos/cm" in clean or "ms/cm" in clean:
            return "dS/m"
        return clean

    def _normalize_nutrient_to_kgha(
        self, raw_value: float, raw_unit: str, nutrient_name: str
    ) -> Tuple[float, str, str]:
        """Convert laboratory nutrient concentration to internal kg/ha format.
        
        Returns:
            (normalized_value_in_kg_ha, normalized_unit, conversion_rule_explanation)
        """
        raw_unit_clean = self._normalize_unit_string(raw_unit)

        if raw_unit_clean == "kg/ha":
            return (
                round(raw_value, 2),
                "kg/ha",
                "Direct laboratory reading in kg/ha (no unit conversion required).",
            )
        elif raw_unit_clean == "kg/acre":
            # 1 hectare = 2.47105 acres => kg/ha = kg/acre * 2.471
            converted = round(raw_value * 2.471, 2)
            return (
                converted,
                "kg/ha",
                f"Converted from kg/acre to kg/ha: {raw_value} × 2.471 = {converted} kg/ha (1 hectare ≈ 2.471 acres).",
            )
        elif raw_unit_clean in {"mg/kg", "ppm"}:
            # Standard furrow-slice furrow soil weight is ~2,000,000 kg per hectare (0-15cm depth)
            # 1 mg/kg (ppm) = 1 part in 1,000,000 => 2.24 or 2.0 kg/ha in 2M kg soil.
            # Standard Indian agronomical factor (ICAR / TNAU): kg/ha = mg/kg × 2.24
            converted = round(raw_value * 2.24, 2)
            return (
                converted,
                "kg/ha",
                f"Converted from {raw_unit_clean} to kg/ha: {raw_value} × 2.24 = {converted} kg/ha "
                "(Standard agronomy formula for 0-15cm furrow-slice soil volume).",
            )
        elif raw_unit_clean == "%":
            # 1% = 10,000 mg/kg => * 2.24 = 22,400 kg/ha
            converted = round(raw_value * 22400.0, 2)
            return (
                converted,
                "kg/ha",
                f"Converted from % to kg/ha: {raw_value}% × 22,400 = {converted} kg/ha.",
            )
        else:
            # Default fallback assumption if unit was unspecified
            return (
                round(raw_value, 2),
                "kg/ha",
                f"Preserved as {raw_value} (assumed standard kg/ha reporting unit).",
            )

    def parse_soil_report(
        self, file_bytes: bytes, filename: str, content_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """Execute the end-to-end soil report extraction and validation pipeline."""
        # 1. Validation
        self.validate_file(file_bytes, filename, content_type)

        lower_name = (filename or "").lower()
        is_pdf = lower_name.endswith(".pdf") or file_bytes.startswith(MAGIC_NUMBERS["pdf"])

        # 2. Extract text and table rows
        if is_pdf:
            full_text, table_rows, method = self.extract_text_from_pdf(file_bytes)
        else:
            full_text, table_rows, method = self.extract_text_from_image(file_bytes)

        if not full_text or len(full_text.strip()) < 10:
            raise CorruptReportFileError(
                "Unable to extract text from the uploaded document. "
                "Please ensure the image or PDF is clear, well-lit, and not blurry."
            )

        # 3. Extract Metadata
        lab_name, report_date = self._extract_laboratory_metadata(full_text)

        # 4. Extract Required Primary Nutrients
        # NITROGEN (N)
        nitrogen_aliases = [
            "Available Nitrogen",
            "Available N",
            "Nitrogen (N)",
            "Nitrogen",
            "N Ratio",
            "Total Nitrogen",
            "N-P-K (N)",
            "(N)",
            "N",
        ]
        nitrogen_raw = self._find_nutrient_value_and_unit(
            full_text, table_rows, nitrogen_aliases, default_unit="kg/ha"
        )

        # PHOSPHORUS (P)
        phosphorus_aliases = [
            "Available Phosphorus",
            "Available P",
            "Phosphorus (P)",
            "Phosphorus",
            "Phcsphorus",
            "Phosphorous",
            "P2O5",
            "P205",
            "Phosphate",
            "Olsen P",
            "(P)",
            "P",
        ]
        phosphorus_raw = self._find_nutrient_value_and_unit(
            full_text, table_rows, phosphorus_aliases, default_unit="kg/ha"
        )

        # POTASSIUM (K)
        potassium_aliases = [
            "Available Potassium",
            "Available K",
            "Potassium (K)",
            "Potassium",
            "Fotassium",
            "K2O",
            "K20",
            "Potash",
            "Exchangeable K",
            "(K)",
            "K",
        ]
        potassium_raw = self._find_nutrient_value_and_unit(
            full_text, table_rows, potassium_aliases, default_unit="kg/ha"
        )

        # SOIL pH
        ph_aliases = [
            "Soil pH",
            "SoilpH",
            "Reaction (pH)",
            "Reaction",
            "pH (1:2.5)",
            "pH (1:2)",
            "pH Value",
            "pH",
        ]
        ph_raw = self._find_nutrient_value_and_unit(
            full_text, table_rows, ph_aliases, default_unit="pH", is_ph=True
        )

        # 5. Extract Optional Secondary Parameters
        # Organic Carbon (OC)
        oc_aliases = [
            "Organic Carbon",
            "O.C.",
            "OC",
            "Total Organic Carbon",
            "Organic Matter",
        ]
        oc_raw = self._find_nutrient_value_and_unit(
            full_text, table_rows, oc_aliases, default_unit="%"
        )

        # Electrical Conductivity (EC)
        ec_aliases = [
            "Electrical Conductivity",
            "E.C.",
            "EC",
            "Conductivity",
            "Soluble Salts",
        ]
        ec_raw = self._find_nutrient_value_and_unit(
            full_text, table_rows, ec_aliases, default_unit="dS/m"
        )

        # Soil Texture / Type
        soil_texture = None
        texture_patterns = [
            r"\b(Sandy\s+Loam|Clay\s+Loam|Loamy\s+Sand|Silty\s+Clay|Sandy\s+Clay|Clay|Loam|Silt\s+Loam|Black\s+Soil|Red\s+Soil|Alluvial\s+Soil|Laterite\s+Soil)\b",
            r"(?:Soil\s+Texture|Soil\s+Type|Texture\s+Class)\s*[:\-]?\s*([A-Za-z\s]{4,25})",
        ]
        for t_pat in texture_patterns:
            t_match = re.search(t_pat, full_text, re.IGNORECASE)
            if t_match:
                soil_texture = t_match.group(1).strip().title()
                break

        # 6. Normalize and Validate
        soil_params = {}
        missing_required_fields = []

        # Process N
        if nitrogen_raw and nitrogen_raw["value"] is not None:
            norm_val, norm_unit, rule = self._normalize_nutrient_to_kgha(
                nitrogen_raw["value"], nitrogen_raw["unit"], "Nitrogen"
            )
            is_plausible = 0.0 <= norm_val <= 500.0
            soil_params["nitrogen"] = {
                "label": "Nitrogen (N)",
                "raw_value": nitrogen_raw["value"],
                "raw_unit": nitrogen_raw["unit"],
                "normalized_value": norm_val,
                "normalized_unit": norm_unit,
                "conversion_rule": rule,
                "confidence": nitrogen_raw["confidence"],
                "source": "Lab report (extracted)",
                "is_plausible": is_plausible,
                "status": "verified" if is_plausible else "review_needed",
                "notes": "Optimal N range for typical crops is 50-300 kg/ha." if is_plausible else "Value is outside standard 0-500 kg/ha range.",
            }
        else:
            missing_required_fields.append("nitrogen")

        # Process P
        if phosphorus_raw and phosphorus_raw["value"] is not None:
            norm_val, norm_unit, rule = self._normalize_nutrient_to_kgha(
                phosphorus_raw["value"], phosphorus_raw["unit"], "Phosphorus"
            )
            is_plausible = 0.0 <= norm_val <= 500.0
            soil_params["phosphorus"] = {
                "label": "Phosphorus (P)",
                "raw_value": phosphorus_raw["value"],
                "raw_unit": phosphorus_raw["unit"],
                "normalized_value": norm_val,
                "normalized_unit": norm_unit,
                "conversion_rule": rule,
                "confidence": phosphorus_raw["confidence"],
                "source": "Lab report (extracted)",
                "is_plausible": is_plausible,
                "status": "verified" if is_plausible else "review_needed",
                "notes": "Optimal P range for typical crops is 15-100 kg/ha." if is_plausible else "Value is outside standard 0-500 kg/ha range.",
            }
        else:
            missing_required_fields.append("phosphorus")

        # Process K
        if potassium_raw and potassium_raw["value"] is not None:
            norm_val, norm_unit, rule = self._normalize_nutrient_to_kgha(
                potassium_raw["value"], potassium_raw["unit"], "Potassium"
            )
            is_plausible = 0.0 <= norm_val <= 500.0
            soil_params["potassium"] = {
                "label": "Potassium (K)",
                "raw_value": potassium_raw["value"],
                "raw_unit": potassium_raw["unit"],
                "normalized_value": norm_val,
                "normalized_unit": norm_unit,
                "conversion_rule": rule,
                "confidence": potassium_raw["confidence"],
                "source": "Lab report (extracted)",
                "is_plausible": is_plausible,
                "status": "verified" if is_plausible else "review_needed",
                "notes": "Optimal K range for typical crops is 50-300 kg/ha." if is_plausible else "Value is outside standard 0-500 kg/ha range.",
            }
        else:
            missing_required_fields.append("potassium")

        # Process pH
        if ph_raw and ph_raw["value"] is not None:
            ph_val = round(ph_raw["value"], 2)
            # Ensure pH is within plausible 0-14 range
            is_plausible = 3.0 <= ph_val <= 11.0
            soil_params["ph"] = {
                "label": "Soil pH",
                "raw_value": ph_val,
                "raw_unit": "pH scale",
                "normalized_value": ph_val,
                "normalized_unit": "pH (0-14)",
                "conversion_rule": "Standard soil reaction scale (0-14).",
                "confidence": ph_raw["confidence"],
                "source": "Lab report (extracted)",
                "is_plausible": is_plausible,
                "status": "verified" if is_plausible else "review_needed",
                "notes": "Neutral soil range is 6.0 - 7.5." if 6.0 <= ph_val <= 7.5 else ("Acidic soil (< 6.0)" if ph_val < 6.0 else "Alkaline soil (> 7.5)"),
            }
        else:
            missing_required_fields.append("ph")

        # Secondary (non-model) parameters
        secondary_params = {}
        if oc_raw and oc_raw["value"] is not None:
            secondary_params["organic_carbon"] = {
                "label": "Organic Carbon (OC)",
                "raw_value": oc_raw["value"],
                "unit": "%",
                "notes": "Soil health indicator; not passed directly to primary crop model.",
            }
        if ec_raw and ec_raw["value"] is not None:
            secondary_params["electrical_conductivity"] = {
                "label": "Electrical Conductivity (EC)",
                "raw_value": ec_raw["value"],
                "unit": "dS/m",
                "notes": "Salinity indicator; not passed directly to primary crop model.",
            }
        if soil_texture:
            secondary_params["soil_texture"] = {
                "label": "Soil Texture / Type",
                "raw_value": soil_texture,
                "unit": "textural class",
                "notes": "Physical soil classification; not passed directly to primary crop model.",
            }

        # Status determination
        if len(missing_required_fields) == 0:
            status = "success"
            summary_message = "All required soil nutrient parameters (N, P, K, pH) were successfully extracted and verified."
        elif len(soil_params) > 0:
            status = "partial"
            missing_labels = [f.upper() if f != "ph" else "pH" for f in missing_required_fields]
            summary_message = (
                f"Extracted {len(soil_params)} soil parameter(s). "
                f"Missing required parameter(s): {', '.join(missing_labels)}. "
                "Please enter the missing values manually before generating crop recommendation."
            )
        else:
            status = "unreadable"
            summary_message = (
                "Could not automatically detect soil test numbers from the uploaded file. "
                "Please verify the document is a soil test report, or enter your soil values manually."
            )

        return {
            "status": status,
            "filename": filename,
            "extraction_method": method,
            "laboratory_name": lab_name or "Agricultural Soil Testing Laboratory",
            "report_date": report_date or datetime.now().strftime("%d-%b-%Y"),
            "soil_parameters": soil_params,
            "secondary_parameters": secondary_params,
            "missing_required_fields": missing_required_fields,
            "summary_message": summary_message,
            "weather_inputs_required": [
                {
                    "field": "temperature",
                    "label": "Ambient Temperature",
                    "unit": "°C",
                    "source_type": "weather_service_or_farmer",
                    "explanation": "Obtained from real-time local weather observations for your farm location.",
                },
                {
                    "field": "humidity",
                    "label": "Relative Humidity",
                    "unit": "%",
                    "source_type": "weather_service_or_farmer",
                    "explanation": "Obtained from real-time local atmospheric humidity sensors.",
                },
                {
                    "field": "rainfall",
                    "label": "Seasonal Precipitation / Rainfall",
                    "unit": "mm",
                    "source_type": "weather_service_or_farmer",
                    "explanation": "Obtained from local meteorological records or seasonal average.",
                },
            ],
            "raw_text_snippet": full_text[:400] + ("..." if len(full_text) > 400 else ""),
        }


# Singleton instance
_parser_service: Optional[SoilReportParserService] = None


def get_soil_report_parser() -> SoilReportParserService:
    """Retrieve singleton instance of SoilReportParserService."""
    global _parser_service
    if _parser_service is None:
        _parser_service = SoilReportParserService()
    return _parser_service
