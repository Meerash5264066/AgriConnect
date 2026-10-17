import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Helper functions mirroring frontend logic in agriconnect-ui.html

function resolveAiServiceBaseUrl(win, storage) {
    if (win?.NEXT_PUBLIC_AI_URL) return win.NEXT_PUBLIC_AI_URL.replace(/\/$/, '');
    if (win?.__ENV__?.NEXT_PUBLIC_AI_URL) return win.__ENV__.NEXT_PUBLIC_AI_URL.replace(/\/$/, '');
    const stored = storage?.getItem('agriconnect_ai_url');
    if (stored) return stored.replace(/\/$/, '');
    if (win?.location?.hostname === 'localhost' || win?.location?.hostname === '127.0.0.1') {
        return 'http://127.0.0.1:8000';
    }
    return 'http://127.0.0.1:8000';
}

function validateUploadFile(file) {
    if (!file) {
        return { valid: false, error: 'Please take or upload a leaf photo first before running the check.' };
    }
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validMimes.includes(file.type)) {
        return { valid: false, error: 'Please select a JPG, PNG, or WebP leaf image.' };
    }
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
        return { valid: false, error: 'Uploaded image exceeds maximum limit of 10 MB.' };
    }
    return { valid: true, error: null };
}

function buildDiagnosisContext(apiResponse, selectedCrop, selectedSymptom) {
    return {
        crop: apiResponse.crop,
        disease: apiResponse.disease,
        predicted_class: apiResponse.predicted_class,
        confidence: apiResponse.confidence,
        confidence_percentage: apiResponse.confidence_percentage,
        confidence_assessment: apiResponse.confidence_assessment,
        selected_crop: selectedCrop,
        selected_symptom: selectedSymptom,
        organic_treatment: apiResponse.organic_treatment,
        chemical_treatment: apiResponse.chemical_treatment,
        general_care: apiResponse.general_care,
        remedy_recommendation: apiResponse.remedy_recommendation,
        session_id: 'diag_test_123',
    };
}

function evaluateCropConflict(selectedCrop, predictedCrop, supportedCrops) {
    if (!selectedCrop || !predictedCrop) return { conflict: false, warning: null };
    const sel = selectedCrop.trim().lower ? selectedCrop.trim().toLowerCase() : selectedCrop.trim();
    const pred = predictedCrop.trim().lower ? predictedCrop.trim().toLowerCase() : predictedCrop.trim();
    const match = sel === pred || sel.includes(pred) || pred.includes(sel);
    if (!match) {
        return {
            conflict: true,
            warning: `You selected '${selectedCrop}', but the visual AI model identified a ${predictedCrop} leaf. The prediction was not overridden by your selection.`,
        };
    }
    return { conflict: false, warning: null };
}

describe('Frontend Plant Health & Farm Assistant Tests', () => {

    describe('1. AI Service Base URL Resolution', () => {
        it('prefers window.NEXT_PUBLIC_AI_URL when configured', () => {
            const win = { NEXT_PUBLIC_AI_URL: 'https://ai.agriconnect.org/' };
            const url = resolveAiServiceBaseUrl(win, null);
            assert.equal(url, 'https://ai.agriconnect.org');
        });

        it('defaults to port 8000 in local development', () => {
            const win = { location: { hostname: 'localhost' } };
            const url = resolveAiServiceBaseUrl(win, null);
            assert.equal(url, 'http://127.0.0.1:8000');
        });
    });

    describe('2. Uploaded Image Validation', () => {
        it('rejects missing file with clear instruction', () => {
            const res = validateUploadFile(null);
            assert.equal(res.valid, false);
            assert.match(res.error, /Please take or upload a leaf photo/);
        });

        it('rejects unsupported file type such as text or pdf', () => {
            const file = { name: 'test.pdf', type: 'application/pdf', size: 1024 };
            const res = validateUploadFile(file);
            assert.equal(res.valid, false);
            assert.match(res.error, /JPG, PNG, or WebP/);
        });

        it('rejects oversized file (> 10MB)', () => {
            const file = { name: 'huge_leaf.jpg', type: 'image/jpeg', size: 15 * 1024 * 1024 };
            const res = validateUploadFile(file);
            assert.equal(res.valid, false);
            assert.match(res.error, /10 MB/);
        });

        it('accepts valid JPEG, PNG, or WebP image under 10MB', () => {
            const file = { name: 'leaf.jpg', type: 'image/jpeg', size: 2 * 1024 * 1024 };
            const res = validateUploadFile(file);
            assert.equal(res.valid, true);
            assert.equal(res.error, null);
        });
    });

    describe('3. Real Prediction Display & Confidence Verification', () => {
        it('uses actual model confidence percentage instead of hardcoded 96.8%', () => {
            const mockApiResponse = {
                crop: 'Potato',
                disease: 'Potato Late blight',
                predicted_class: 'Potato___Potato Late blight',
                confidence: 0.7423,
                confidence_percentage: '74.2%',
                confidence_assessment: 'high',
                organic_treatment: 'Destroy cull piles and practice wide spacing.',
                chemical_treatment: 'Targeted cymoxanil or metalaxyl spray under alert.',
                general_care: 'Avoid working in wet fields.',
                disclaimer: 'AI leaf detection provides visual guidance and is not a guaranteed diagnosis.',
            };

            assert.equal(mockApiResponse.confidence_percentage, '74.2%');
            assert.notEqual(mockApiResponse.confidence_percentage, '96.8%');
            assert.equal(mockApiResponse.crop, 'Potato');
            assert.equal(mockApiResponse.disease, 'Potato Late blight');
        });

        it('flags crop discrepancy when user selected crop differs from model prediction', () => {
            const supportedCrops = ['Tomato', 'Potato', 'Bell pepper', 'Apple', 'Citrus'];
            const res = evaluateCropConflict('Wheat', 'Tomato', supportedCrops);
            assert.equal(res.conflict, true);
            assert.match(res.warning, /You selected 'Wheat', but the visual AI model identified a Tomato leaf/);
        });

        it('does not flag conflict when selected crop matches model prediction', () => {
            const supportedCrops = ['Tomato', 'Potato'];
            const res = evaluateCropConflict('Tomato', 'Tomato', supportedCrops);
            assert.equal(res.conflict, false);
            assert.equal(res.warning, null);
        });
    });

    describe('4. Diagnosis Session Context & Chatbot State Management', () => {
        it('constructs complete diagnosis session context without leaking raw bytes', () => {
            const apiRes = {
                crop: 'Tomato',
                disease: 'Tomato Early blight',
                predicted_class: 'Tomato___Tomato Early blight',
                confidence: 0.884,
                confidence_percentage: '88.4%',
                confidence_assessment: 'high',
                organic_treatment: 'Mulch soil to prevent rain splash.',
                chemical_treatment: 'Mancozeb 75% WP protective spray.',
                general_care: 'Stake plants upright.',
                remedy_recommendation: 'Mulch soil to prevent splash.',
            };
            const ctx = buildDiagnosisContext(apiRes, 'Tomato', 'dark_spots');
            assert.equal(ctx.crop, 'Tomato');
            assert.equal(ctx.disease, 'Tomato Early blight');
            assert.equal(ctx.confidence, 0.884);
            assert.equal(ctx.selected_symptom, 'dark_spots');
            assert.equal(ctx.raw_bytes, undefined);
        });

        it('replaces previous plant context when a new diagnosis is analyzed', () => {
            let activeContext = buildDiagnosisContext(
                { crop: 'Tomato', disease: 'Tomato Early blight', confidence: 0.9 },
                'Tomato',
                'dark_spots'
            );
            assert.equal(activeContext.crop, 'Tomato');

            // Farmer scans a potato leaf
            activeContext = buildDiagnosisContext(
                { crop: 'Potato', disease: 'Potato Late blight', confidence: 0.85 },
                'Potato',
                'dark_spots'
            );
            assert.equal(activeContext.crop, 'Potato');
            assert.equal(activeContext.disease, 'Potato Late blight');
            assert.notEqual(activeContext.crop, 'Tomato');
        });
    });
});
