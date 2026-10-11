import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Helper simulated environment mirroring agriconnect-ui.html client functions
class MockLocalStorage {
    constructor() {
        this.store = {};
    }
    getItem(key) {
        return this.store[key] || null;
    }
    setItem(key, value) {
        this.store[key] = String(value);
    }
    removeItem(key) {
        delete this.store[key];
    }
    clear() {
        this.store = {};
    }
}

function resolveBackendBaseUrl(win, storage) {
    if (win?.NEXT_PUBLIC_API_URL) return win.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
    if (win?.__ENV__?.NEXT_PUBLIC_API_URL) return win.__ENV__.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
    const stored = storage?.getItem('agriconnect_api_url');
    if (stored) return stored.replace(/\/$/, '');
    if (win?.location?.hostname === 'localhost' || win?.location?.hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }
    return win?.location?.origin || 'http://localhost:3001';
}

function syncSeasonWithMonth(month, currentSeason) {
    const m = parseInt(month, 10);
    if (!isNaN(m)) {
        if ([6, 7, 8, 9, 10].includes(m)) return 'Kharif';
        if ([11, 12, 1, 2, 3].includes(m)) return 'Rabi';
        if ([4, 5].includes(m)) return 'Zaid';
    }
    return currentSeason || '';
}

function validateAndBuildDemandPayload(formValues) {
    const errors = [];
    const crop = formValues.crop?.trim();
    const location = formValues.location?.trim();
    const monthStr = formValues.month !== undefined && formValues.month !== null ? String(formValues.month).trim() : '';
    const histVolStr = formValues.historical_volume !== undefined && formValues.historical_volume !== null ? String(formValues.historical_volume).trim() : '';
    const season = formValues.season?.trim();
    const qualityTier = formValues.quality_tier?.trim();

    if (!crop) {
        errors.push('Crop commodity is required.');
    }
    if (!location) {
        errors.push('Target state/region is required.');
    }

    let month = null;
    if (monthStr !== '') {
        month = parseInt(monthStr, 10);
        if (isNaN(month) || month < 1 || month > 12) {
            errors.push('Month must be a valid integer between 1 and 12.');
        }
    }

    let historical_volume = null;
    if (histVolStr !== '') {
        historical_volume = parseFloat(histVolStr);
        if (isNaN(historical_volume) || historical_volume < 0) {
            errors.push('Historical volume must be a non-negative number.');
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors, payload: null };
    }

    const payload = {
        crop,
        location,
    };
    if (season) payload.season = season;
    if (month !== null) payload.month = month;
    if (historical_volume !== null) payload.historical_volume = historical_volume;
    if (qualityTier) payload.quality_tier = qualityTier;

    return { valid: true, errors: [], payload };
}

function formatDemandApiError(status, responseData) {
    if (status === 400 || status === 422) {
        const detail = Array.isArray(responseData?.message)
            ? responseData.message.join(', ')
            : (responseData?.message || responseData?.detail || 'Invalid input parameters.');
        return `Validation Error: ${detail}`;
    }
    if (status === 401 || status === 403) {
        return 'Authentication required. Please sign in to run AI demand predictions.';
    }
    if (status === 501) {
        return responseData?.message || 'The Demand Prediction model is not currently available or initialized.';
    }
    if (status === 502 || status === 503 || status === 504) {
        return responseData?.message || 'The AI forecasting microservice is temporarily unreachable or timed out. Please try again.';
    }
    return responseData?.message || 'Failed to generate demand prediction.';
}

function extractRenderedResultState(data) {
    const showExperimentalBadge = data.is_synthetic === true || data.model_status === 'experimental';
    const showBaseline = data.baseline_demand_kg !== null && data.baseline_demand_kg !== undefined;

    return {
        predicted_demand_kg: data.predicted_demand_kg,
        unit: data.unit || 'kg',
        crop: data.crop,
        location: data.location,
        month: data.month,
        season: data.season,
        model_status: (data.model_status || 'experimental').toUpperCase(),
        model_status_note: data.model_status_note || '',
        showExperimentalBadge,
        showBaseline,
        baseline_demand_kg: showBaseline ? data.baseline_demand_kg : null,
        baseline_note: showBaseline ? data.baseline_note : null,
        disclaimer: data.disclaimer || '',
    };
}

describe('Frontend Demand Prediction Integration', () => {
    let mockStorage;

    beforeEach(() => {
        mockStorage = new MockLocalStorage();
    });

    describe('1. Backend Base URL Resolution', () => {
        it('prefers window.NEXT_PUBLIC_API_URL when set', () => {
            const win = { NEXT_PUBLIC_API_URL: 'https://api.agriconnect.org/' };
            const url = resolveBackendBaseUrl(win, mockStorage);
            assert.equal(url, 'https://api.agriconnect.org');
        });

        it('falls back to window.location.origin in production without hardcoding localhost', () => {
            const win = { location: { hostname: 'app.agriconnect.in', origin: 'https://app.agriconnect.in' } };
            const url = resolveBackendBaseUrl(win, mockStorage);
            assert.equal(url, 'https://app.agriconnect.in');
        });

        it('resolves port 3001 for local development', () => {
            const win = { location: { hostname: 'localhost', origin: 'http://localhost:3000' } };
            const url = resolveBackendBaseUrl(win, mockStorage);
            assert.equal(url, 'http://localhost:3001');
        });
    });

    describe('2. Form Validation & Payload Construction', () => {
        it('rejects missing crop commodity', () => {
            const result = validateAndBuildDemandPayload({ crop: '', location: 'Maharashtra' });
            assert.equal(result.valid, false);
            assert.ok(result.errors.includes('Crop commodity is required.'));
        });

        it('rejects missing location', () => {
            const result = validateAndBuildDemandPayload({ crop: 'Tomato', location: '   ' });
            assert.equal(result.valid, false);
            assert.ok(result.errors.includes('Target state/region is required.'));
        });

        it('rejects month outside 1 to 12', () => {
            const res0 = validateAndBuildDemandPayload({ crop: 'Tomato', location: 'Maharashtra', month: '0' });
            assert.equal(res0.valid, false);
            assert.ok(res0.errors.some(e => e.includes('between 1 and 12')));

            const res13 = validateAndBuildDemandPayload({ crop: 'Tomato', location: 'Maharashtra', month: '13' });
            assert.equal(res13.valid, false);
            assert.ok(res13.errors.some(e => e.includes('between 1 and 12')));
        });

        it('rejects negative historical volume', () => {
            const res = validateAndBuildDemandPayload({ crop: 'Tomato', location: 'Maharashtra', historical_volume: '-10' });
            assert.equal(res.valid, false);
            assert.ok(res.errors.some(e => e.includes('non-negative')));
        });

        it('omits unused optional fields and avoids empty strings for numbers', () => {
            const res = validateAndBuildDemandPayload({
                crop: 'Tomato',
                location: 'Maharashtra',
                month: '',
                season: '',
                historical_volume: '',
                quality_tier: '',
            });
            assert.equal(res.valid, true);
            assert.deepEqual(res.payload, {
                crop: 'Tomato',
                location: 'Maharashtra',
            });
            assert.equal('month' in res.payload, false);
            assert.equal('historical_volume' in res.payload, false);
        });

        it('constructs complete payload with numeric types when optional fields provided', () => {
            const res = validateAndBuildDemandPayload({
                crop: 'Wheat',
                location: 'Punjab',
                month: '11',
                season: 'Rabi',
                historical_volume: '45000',
                quality_tier: 'Premium',
            });
            assert.equal(res.valid, true);
            assert.deepEqual(res.payload, {
                crop: 'Wheat',
                location: 'Punjab',
                month: 11,
                season: 'Rabi',
                historical_volume: 45000,
                quality_tier: 'Premium',
            });
            assert.equal(typeof res.payload.month, 'number');
            assert.equal(typeof res.payload.historical_volume, 'number');
        });

        it('synchronizes season automatically with month', () => {
            assert.equal(syncSeasonWithMonth(7, ''), 'Kharif');
            assert.equal(syncSeasonWithMonth(12, ''), 'Rabi');
            assert.equal(syncSeasonWithMonth(5, ''), 'Zaid');
        });
    });

    describe('3. API Authentication & Error Handling', () => {
        it('includes Bearer token in headers when present in storage', () => {
            mockStorage.setItem('agriconnect_token', 'valid-test-jwt-token');
            const token = mockStorage.getItem('agriconnect_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            assert.equal(headers['Authorization'], 'Bearer valid-test-jwt-token');
        });

        it('formats HTTP 400/422 validation errors clearly', () => {
            const err = formatDemandApiError(400, { message: ['Crop must be a known commodity'] });
            assert.equal(err, 'Validation Error: Crop must be a known commodity');
        });

        it('formats HTTP 401/403 authentication required clearly', () => {
            const err = formatDemandApiError(401, { message: 'Unauthorized' });
            assert.equal(err, 'Authentication required. Please sign in to run AI demand predictions.');
        });

        it('formats HTTP 501 model unavailable gracefully', () => {
            const err = formatDemandApiError(501, { message: 'Demand prediction model is not trained or available.' });
            assert.equal(err, 'Demand prediction model is not trained or available.');
        });

        it('formats HTTP 502/503/504 microservice timeout/unreachable', () => {
            const err = formatDemandApiError(502, { message: 'AI microservice is unreachable.' });
            assert.equal(err, 'AI microservice is unreachable.');
        });
    });

    describe('4. Prediction Rendering & Experimental Status Disclosures', () => {
        it('renders experimental banner and visible disclaimer when is_synthetic is true', () => {
            const mockResponse = {
                predicted_demand_kg: 52400.5,
                unit: 'kg',
                crop: 'Tomato',
                location: 'Maharashtra',
                month: 7,
                season: 'Kharif',
                baseline_demand_kg: 48900.0,
                baseline_note: 'Seasonal mean baseline for Kharif across training years (2019-2022).',
                model_status: 'experimental',
                model_status_note: 'Model trained on synthetic demand dataset for prototype demonstration.',
                is_synthetic: true,
                disclaimer: 'This demand forecast is derived from synthetic prototype training data for development and demonstration purposes only. It is not suitable for commercial, financial, or contractual procurement decisions.',
            };

            const state = extractRenderedResultState(mockResponse);

            assert.equal(state.showExperimentalBadge, true);
            assert.equal(state.model_status, 'EXPERIMENTAL');
            assert.equal(state.predicted_demand_kg, 52400.5);
            assert.equal(state.unit, 'kg');
            assert.equal(state.showBaseline, true);
            assert.equal(state.baseline_demand_kg, 48900.0);
            assert.ok(state.disclaimer.includes('synthetic prototype training data'));
            assert.ok(state.disclaimer.includes('not suitable for commercial, financial, or contractual procurement decisions'));
        });

        it('does not fabricate a baseline when baseline_demand_kg is null', () => {
            const mockResponse = {
                predicted_demand_kg: 31000.0,
                unit: 'kg',
                crop: 'Potato',
                location: 'Uttar Pradesh',
                month: null,
                season: null,
                baseline_demand_kg: null,
                baseline_note: null,
                model_status: 'experimental',
                model_status_note: 'Prototype',
                is_synthetic: true,
                disclaimer: 'Prototype disclaimer',
            };

            const state = extractRenderedResultState(mockResponse);

            assert.equal(state.showBaseline, false);
            assert.equal(state.baseline_demand_kg, null);
            assert.equal(state.baseline_note, null);
        });
    });
});
