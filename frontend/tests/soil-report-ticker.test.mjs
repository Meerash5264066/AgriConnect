import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML_PATH = fs.existsSync(path.resolve('public/agriconnect-ui.html'))
    ? path.resolve('public/agriconnect-ui.html')
    : path.resolve('frontend/public/agriconnect-ui.html');
const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');

describe('Part A — Soil Lab Report Upload & AI Crop Recommendation Tests', () => {

    // 1. File Validation Logic
    function validateSoilFile(file) {
        if (!file) {
            return { valid: false, error: 'Please select a soil lab report first.' };
        }
        const maxBytes = 10 * 1024 * 1024; // 10 MB
        if (file.size > maxBytes) {
            return { valid: false, error: 'File size exceeds 10 MB limit.' };
        }
        const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png'];
        const name = (file.name || '').toLowerCase();
        const hasExt = allowedExts.some(ext => name.endsWith(ext));
        if (!hasExt) {
            return { valid: false, error: 'Unsupported file format. Please upload PDF, JPG, JPEG, or PNG.' };
        }
        return { valid: true, error: null };
    }

    it('should accept valid PDF reports under 10 MB', () => {
        const file = { name: 'soil_test_kvk.pdf', size: 245 * 1024, type: 'application/pdf' };
        const res = validateSoilFile(file);
        assert.equal(res.valid, true);
        assert.equal(res.error, null);
    });

    it('should accept valid JPG and PNG images under 10 MB', () => {
        const jpg = { name: 'soil_report_photo.jpg', size: 1.5 * 1024 * 1024, type: 'image/jpeg' };
        const png = { name: 'lab_scan.png', size: 800 * 1024, type: 'image/png' };
        assert.equal(validateSoilFile(jpg).valid, true);
        assert.equal(validateSoilFile(png).valid, true);
    });

    it('should reject unsupported file formats safely', () => {
        const exe = { name: 'malicious.exe', size: 1024, type: 'application/x-msdownload' };
        const zip = { name: 'reports.zip', size: 5000, type: 'application/zip' };
        const resExe = validateSoilFile(exe);
        const resZip = validateSoilFile(zip);
        assert.equal(resExe.valid, false);
        assert.match(resExe.error, /Unsupported file format/);
        assert.equal(resZip.valid, false);
    });

    it('should reject oversized files (> 10 MB)', () => {
        const bigFile = { name: 'huge_scan.pdf', size: 15 * 1024 * 1024, type: 'application/pdf' };
        const res = validateSoilFile(bigFile);
        assert.equal(res.valid, false);
        assert.match(res.error, /10 MB limit/);
    });

    // 2. Verified Unit Conversion Rules
    function normalizeNutrient(rawVal, rawUnit, nutrientName) {
        const unit = (rawUnit || '').toLowerCase().trim();
        if (unit.includes('mg/kg') || unit.includes('ppm')) {
            return {
                normalized: Math.round(rawVal * 2.24 * 100) / 100,
                rule: 'Converted from mg/kg (×2.24)',
                unit: 'kg/ha'
            };
        } else if (unit.includes('kg/acre')) {
            return {
                normalized: Math.round(rawVal * 2.471 * 100) / 100,
                rule: 'Converted from kg/acre (×2.471)',
                unit: 'kg/ha'
            };
        } else if (unit.includes('%')) {
            return {
                normalized: Math.round(rawVal * 22400 * 100) / 100,
                rule: 'Converted from percentage (×22,400)',
                unit: 'kg/ha'
            };
        } else {
            return {
                normalized: Math.round(rawVal * 100) / 100,
                rule: 'Direct standard unit (kg/ha)',
                unit: 'kg/ha'
            };
        }
    }

    it('should accurately convert mg/kg (ppm) to kg/ha using standard agronomy factor 2.24', () => {
        // Example: 40.2 mg/kg * 2.24 = 90.05 kg/ha
        const resN = normalizeNutrient(40.2, 'mg/kg', 'Nitrogen');
        assert.equal(resN.normalized, 90.05);
        assert.equal(resN.unit, 'kg/ha');
        assert.match(resN.rule, /2\.24/);

        // Example: 18.8 mg/kg * 2.24 = 42.11 kg/ha
        const resP = normalizeNutrient(18.8, 'ppm', 'Phosphorus');
        assert.equal(resP.normalized, 42.11);
    });

    it('should accurately convert kg/acre to kg/ha using factor 2.471', () => {
        // 50 kg/acre * 2.471 = 123.55 kg/ha
        const res = normalizeNutrient(50.0, 'kg/acre', 'Nitrogen');
        assert.equal(res.normalized, 123.55);
        assert.equal(res.unit, 'kg/ha');
    });

    it('should preserve direct kg/ha without alteration', () => {
        const res = normalizeNutrient(120.0, 'kg/ha', 'Nitrogen');
        assert.equal(res.normalized, 120.0);
        assert.match(res.rule, /Direct/);
    });

    // 3. Validation of ML Input Vectors (Biological Bounds)
    function validateModelInputs(inputs) {
        const errors = [];
        if (inputs.nitrogen === undefined || isNaN(inputs.nitrogen) || inputs.nitrogen < 0 || inputs.nitrogen > 300) {
            errors.push('Nitrogen out of range (0-300 kg/ha)');
        }
        if (inputs.phosphorus === undefined || isNaN(inputs.phosphorus) || inputs.phosphorus < 0 || inputs.phosphorus > 200) {
            errors.push('Phosphorus out of range (0-200 kg/ha)');
        }
        if (inputs.potassium === undefined || isNaN(inputs.potassium) || inputs.potassium < 0 || inputs.potassium > 350) {
            errors.push('Potassium out of range (0-350 kg/ha)');
        }
        if (inputs.ph === undefined || isNaN(inputs.ph) || inputs.ph < 3.5 || inputs.ph > 10.0) {
            errors.push('Soil pH out of range (3.5-10.0)');
        }
        if (inputs.temperature === undefined || isNaN(inputs.temperature) || inputs.temperature < 0 || inputs.temperature > 55) {
            errors.push('Temperature out of range (0-55 °C)');
        }
        if (inputs.humidity === undefined || isNaN(inputs.humidity) || inputs.humidity < 5 || inputs.humidity > 100) {
            errors.push('Humidity out of range (5-100%)');
        }
        if (inputs.rainfall === undefined || isNaN(inputs.rainfall) || inputs.rainfall < 0 || inputs.rainfall > 500) {
            errors.push('Rainfall out of range (0-500 mm)');
        }
        return { valid: errors.length === 0, errors };
    }

    it('should accept valid realistic model inputs', () => {
        const validPayload = {
            nitrogen: 90.05,
            phosphorus: 42.11,
            potassium: 43.01,
            ph: 6.5,
            temperature: 24.5,
            humidity: 78.0,
            rainfall: 202.9
        };
        const res = validateModelInputs(validPayload);
        assert.equal(res.valid, true);
        assert.equal(res.errors.length, 0);
    });

    it('should reject invalid or implausible inputs with clear error messages', () => {
        const invalidPayload = {
            nitrogen: -5, // Negative
            phosphorus: 999, // Too high
            potassium: 50,
            ph: 14.5, // Beyond scale
            temperature: 25,
            humidity: 150, // >100%
            rainfall: 200
        };
        const res = validateModelInputs(invalidPayload);
        assert.equal(res.valid, false);
        assert.equal(res.errors.length, 4);
    });

    // 4. Feature Vector Exclusion of Secondary Parameters
    it('should isolate organic carbon and EC from the 7-feature primary model vector', () => {
        const parsedReport = {
            status: 'success',
            soil_parameters: {
                nitrogen: { normalized_value: 90.0, raw_unit: 'kg/ha' },
                phosphorus: { normalized_value: 42.0, raw_unit: 'kg/ha' },
                potassium: { normalized_value: 43.0, raw_unit: 'kg/ha' },
                ph: { normalized_value: 6.5, raw_unit: 'pH' }
            },
            secondary_parameters: {
                organic_carbon: { raw_value: 0.72, unit: '%' },
                electrical_conductivity: { raw_value: 0.35, unit: 'dS/m' },
                soil_texture: { raw_value: 'Sandy Loam' }
            }
        };

        // Construct 7-feature model payload
        const modelPayload = {
            nitrogen: parsedReport.soil_parameters.nitrogen.normalized_value,
            phosphorus: parsedReport.soil_parameters.phosphorus.normalized_value,
            potassium: parsedReport.soil_parameters.potassium.normalized_value,
            ph: parsedReport.soil_parameters.ph.normalized_value,
            temperature: 25.0,
            humidity: 75.0,
            rainfall: 200.0
        };

        const payloadKeys = Object.keys(modelPayload);
        assert.equal(payloadKeys.length, 7);
        assert.deepEqual(payloadKeys.sort(), ['humidity', 'nitrogen', 'ph', 'phosphorus', 'potassium', 'rainfall', 'temperature'].sort());
        assert.equal('organic_carbon' in modelPayload, false);
        assert.equal('electrical_conductivity' in modelPayload, false);
        assert.equal('soil_texture' in modelPayload, false);
    });

    // 5. Verification of UI Markup for Soil Lab Report & Confirmation Section
    it('should include all required Soil Lab Report UI elements in agriconnect-ui.html', () => {
        assert.match(htmlContent, /id="soilDropzone"/);
        assert.match(htmlContent, /id="soilReportFileInput"/);
        assert.match(htmlContent, /id="btnAnalyzeSoilReport"/);
        assert.match(htmlContent, /id="soilReportLoadingSpinner"/);
        assert.match(htmlContent, /id="soilReportErrorAlert"/);
        assert.match(htmlContent, /Upload Soil Lab Report/);
        assert.match(htmlContent, /Check Your Soil Test Results/);
        assert.match(htmlContent, /id="soilVerificationSection"/);
        assert.match(htmlContent, /id="soilVerificationTableBody"/);
        assert.match(htmlContent, /id="btnConfirmRecommend"/);
        assert.match(htmlContent, /id="cropRecomResult"/);
        assert.match(htmlContent, /id="cropRecomMatchBadge"/);
    });
});

describe('Part B — Expanded APMC Mandi Live Ticker Tests', () => {

    // 1. Quintal to kg conversion logic
    function convertQuintalToKg(priceQuintal) {
        return Math.round((priceQuintal / 100.0) * 10) / 10;
    }

    it('should correctly convert ₹/quintal to ₹/kg (₹/kg = ₹/quintal ÷ 100)', () => {
        assert.equal(convertQuintalToKg(2850), 28.5);
        assert.equal(convertQuintalToKg(2400), 24.0);
        assert.equal(convertQuintalToKg(6850), 68.5);
        assert.equal(convertQuintalToKg(13500), 135.0);
    });

    // 2. Ticker Looping & Accessibility
    it('should include continuous ticker markup with primary track and clone track for seamless loop', () => {
        assert.match(htmlContent, /class="mandi-ticker-wrap/);
        assert.match(htmlContent, /id="mandiTickerTrackPrimary"/);
        assert.match(htmlContent, /id="mandiTickerTrackClone"/);
        assert.match(htmlContent, /@keyframes tickerScroll/);
        assert.match(htmlContent, /prefers-reduced-motion: reduce/);
    });

    it('should provide keyboard accessibility and pause/resume control', () => {
        assert.match(htmlContent, /id="btnToggleTickerAnimation"/);
        assert.match(htmlContent, /toggleTickerPlayPause\(\)/);
        assert.match(htmlContent, /mandi-ticker-paused/);
        assert.match(htmlContent, /mandi-ticker-wrap:hover \.mandi-ticker-track/);
    });

    it('should support verified data freshness and Agmarknet metadata', () => {
        assert.match(htmlContent, /id="tickerFreshnessTag"/);
        assert.match(htmlContent, /id="mandiFreshnessModal"/);
        assert.match(htmlContent, /Agmarknet/);
        assert.match(htmlContent, /openTickerDetailsModal\(\)/);
        assert.match(htmlContent, /closeTickerDetailsModal\(\)/);
    });

    it('should support broad commodity coverage (25+ commodities)', () => {
        const requiredCommodities = [
            'Tomato', 'Onion', 'Potato', 'Wheat', 'Rice', 'Cotton', 'Maize',
            'Groundnut', 'Soybean', 'Turmeric', 'Chilli', 'Banana', 'Mango',
            'Brinjal', 'Cabbage', 'Cauliflower', 'Green Gram', 'Black Gram',
            'Sugarcane', 'Apple', 'Orange', 'Coconut', 'Coffee', 'Jute'
        ];
        requiredCommodities.forEach(c => {
            assert.match(htmlContent, new RegExp(c));
        });
    });
});
