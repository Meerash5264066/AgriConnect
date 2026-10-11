/**
 * Unit tests for AiService.
 *
 * Strategy: mock global `fetch` so no live network calls are made.
 * Each test controls the mocked response status and body and asserts
 * that AiService maps it to the correct NestJS HTTP exception.
 */

import {
  BadGatewayException,
  GatewayTimeoutException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  NotImplementedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';

// ---------------------------------------------------------------------------
// Helper: build a Response-like object that satisfies the fetch contract.
// ---------------------------------------------------------------------------
function mockResponse(
  status: number,
  body: unknown,
  ok?: boolean,
): Response {
  const json = async () => body;
  return {
    status,
    statusText: String(status),
    ok: ok ?? (status >= 200 && status < 300),
    json,
    headers: new Headers(),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Minimal valid DTO values
// ---------------------------------------------------------------------------
const CROP_DTO = {
  nitrogen: 90,
  phosphorus: 42,
  potassium: 43,
  temperature: 20.87,
  humidity: 82,
  ph: 6.5,
  rainfall: 202.93,
};

const PRICE_DTO = {
  crop: 'Tomato',
  market: 'Anantapur',
  state_or_region: 'Andhra Pradesh',
};

const DEMAND_DTO = {
  crop: 'Tomato',
  location: 'Maharashtra',
  season: 'Kharif',
  month: 8,
  historical_volume: 52000,
  quality_tier: 'Grade A',
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('AiService', () => {
  let service: AiService;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              AI_SERVICE_URL: 'http://127.0.0.1:8000',
              AI_SERVICE_TIMEOUT_MS: '3000',
            }),
          ],
        }),
      ],
      providers: [AiService],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // --- Successful responses ---

  describe('recommendCrop', () => {
    it('returns the upstream result on HTTP 200', async () => {
      const upstreamResult = {
        recommended_crop: 'rice',
        confidence: 0.97,
        input_features: { nitrogen: 90 },
        model_version: '1.0.0',
      };
      fetchMock.mockResolvedValueOnce(mockResponse(200, upstreamResult));
      const result = await service.recommendCrop(CROP_DTO as any);
      expect(result.recommended_crop).toBe('rice');
      expect(result.confidence).toBe(0.97);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toContain('/api/v1/crop/recommend');
      expect(calledInit.method).toBe('POST');
    });

    it('forwards nitrogen/phosphorus/potassium payload keys correctly', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { recommended_crop: 'wheat', confidence: 0.8, input_features: {}, model_version: '1.0' }),
      );
      await service.recommendCrop(CROP_DTO as any);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body).toMatchObject({
        nitrogen: 90,
        phosphorus: 42,
        potassium: 43,
        temperature: 20.87,
        humidity: 82,
        ph: 6.5,
        rainfall: 202.93,
      });
    });
  });

  describe('predictPrice', () => {
    it('returns the upstream result on HTTP 200', async () => {
      const upstreamResult = {
        crop: 'Tomato',
        market: 'Anantapur',
        state: 'Andhra Pradesh',
        district: 'Anantapur',
        modal_price: 1700,
        currency: 'INR',
        unit: 'per quintal (unverified)',
        arrival_date: '2025-09-20',
        requested_date: null,
        is_historical_baseline: true,
        data_freshness_note: 'Latest observed historical price.',
        source: 'APMC',
        disclaimer: 'Historical baseline only.',
      };
      fetchMock.mockResolvedValueOnce(mockResponse(200, upstreamResult));
      const result = await service.predictPrice(PRICE_DTO as any);
      expect(result.modal_price).toBe(1700);
      expect(result.is_historical_baseline).toBe(true);
    });
  });

  describe('predictDemand', () => {
    it('returns the upstream result on HTTP 200 with experimental status and synthetic disclosures', async () => {
      const upstreamResult = {
        crop: 'Tomato',
        location: 'Maharashtra',
        month: 8,
        season: 'Kharif',
        predicted_demand_kg: 49132.84,
        baseline_demand_kg: null,
        baseline_note:
          'Per-(crop, location, month) seasonal lookup table not present in metadata artifact; aggregate baseline metrics recorded in training metadata only',
        unit: 'kg',
        model_version: '1.0.0-synthetic',
        model_name: 'AgriConnect Demand Forecaster (RandomForest)',
        model_status: 'experimental',
        model_status_note:
          'Model is marked experimental because it did not outperform the naive seasonal-mean baseline on validation metrics.',
        is_synthetic: true,
        input_features: {
          crop_name: 'Tomato',
          location: 'Maharashtra',
          month: 8,
          season: 'Kharif',
          quality_tier: 'Grade A',
          historical_volume_kg: 52000,
          expected_price_inr_per_kg: null,
        },
        disclaimer:
          'This demand prediction is generated by an experimental model trained exclusively on synthetic data. It did not outperform the naive seasonal-mean baseline during validation and must not be used for actual procurement contracts, commercial commitments, or financial planning.',
      };

      fetchMock.mockResolvedValueOnce(mockResponse(200, upstreamResult));
      const result = await service.predictDemand(DEMAND_DTO as any);

      expect(result.crop).toBe('Tomato');
      expect(result.location).toBe('Maharashtra');
      expect(result.predicted_demand_kg).toBe(49132.84);
      expect(result.baseline_demand_kg).toBeNull();
      expect(result.unit).toBe('kg');
      expect(result.model_status).toBe('experimental');
      expect(result.is_synthetic).toBe(true);
      expect(result.disclaimer).toContain('synthetic');
      expect(result.disclaimer).toContain('procurement');
    });

    it('forwards all demand payload keys correctly to upstream AI service', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, {
          crop: 'Tomato',
          location: 'Maharashtra',
          predicted_demand_kg: 50000,
          baseline_demand_kg: null,
          model_status: 'experimental',
          is_synthetic: true,
          disclaimer: 'synthetic',
        }),
      );

      await service.predictDemand(DEMAND_DTO as any);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0];
      const parsedBody = JSON.parse(call[1].body);

      expect(parsedBody).toEqual({
        crop: 'Tomato',
        location: 'Maharashtra',
        season: 'Kharif',
        month: 8,
        historical_volume: 52000,
        quality_tier: 'Grade A',
      });
    });

    it('constructs the correct URL for demand prediction', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, {
          crop: 'Tomato',
          location: 'Maharashtra',
          predicted_demand_kg: 50000,
          baseline_demand_kg: null,
          model_status: 'experimental',
          is_synthetic: true,
          disclaimer: 'synthetic',
        }),
      );

      await service.predictDemand(DEMAND_DTO as any);
      const calledUrl: string = fetchMock.mock.calls[0][0];
      expect(calledUrl).toBe('http://127.0.0.1:8000/api/v1/demand/predict');
    });

    it('throws BadRequestException on upstream HTTP 422 with structured validation details', async () => {
      const errorDetail = {
        error_code: 'UNSUPPORTED_CROP',
        message: "Crop 'Dragonfruit' is not supported by the demand forecasting model.",
        supported_crops: ['Tomato', 'Onion', 'Potato'],
      };
      fetchMock.mockResolvedValueOnce(
        mockResponse(422, { detail: errorDetail }, false),
      );

      await expect(service.predictDemand(DEMAND_DTO as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotImplementedException on upstream HTTP 501 when model is unavailable', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(
          501,
          {
            detail: {
              error_code: 'MODEL_NOT_TRAINED',
              message: 'Demand prediction model is not available.',
            },
          },
          false,
        ),
      );

      await expect(service.predictDemand(DEMAND_DTO as any)).rejects.toThrow(
        NotImplementedException,
      );
    });

    it('throws BadGatewayException when demand prediction upstream is unreachable', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(service.predictDemand(DEMAND_DTO as any)).rejects.toThrow(
        BadGatewayException,
      );
    });

    it('throws GatewayTimeoutException when demand prediction upstream times out', async () => {
      const timeoutErr = new Error('request timed out');
      timeoutErr.name = 'TimeoutError';
      fetchMock.mockRejectedValueOnce(timeoutErr);

      await expect(service.predictDemand(DEMAND_DTO as any)).rejects.toThrow(
        GatewayTimeoutException,
      );
    });
  });

  // --- Network / connection errors -> 502 ---

  it('throws BadGatewayException when fetch throws a generic connection error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(service.recommendCrop(CROP_DTO as any)).rejects.toBeInstanceOf(BadGatewayException);
  });

  // --- Timeout -> 504 ---

  it('throws GatewayTimeoutException when fetch throws a TimeoutError', async () => {
    const timeoutErr = new Error('The operation was aborted due to timeout');
    timeoutErr.name = 'TimeoutError';
    fetchMock.mockRejectedValueOnce(timeoutErr);
    await expect(service.recommendCrop(CROP_DTO as any)).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  it('throws GatewayTimeoutException when fetch throws an AbortError', async () => {
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abortErr);
    await expect(service.predictPrice(PRICE_DTO as any)).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  // --- 400 / 422 -> 400 ---

  it('throws BadRequestException on upstream HTTP 400', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(400, { detail: 'nitrogen must be >= 0' }, false));
    await expect(service.recommendCrop(CROP_DTO as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException on upstream HTTP 422', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(422, { detail: [{ loc: ['body', 'crop'], msg: 'field required' }] }, false),
    );
    await expect(service.predictPrice(PRICE_DTO as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  // --- 404 -> 404 ---

  it('throws NotFoundException on upstream HTTP 404', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(404, { detail: { error_code: 'PRICE_RECORD_NOT_FOUND', message: 'No price data.' } }, false),
    );
    await expect(service.predictPrice(PRICE_DTO as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  // --- 409 -> 409 with structured detail preserved ---

  it('throws ConflictException with structured detail on upstream HTTP 409', async () => {
    const detail = {
      error_code: 'AMBIGUOUS_MARKET_MATCH',
      message: 'Multiple states match this market.',
      candidate_states: ['Madhya Pradesh', 'Telangana'],
    };
    fetchMock.mockResolvedValueOnce(mockResponse(409, { detail }, false));

    let caught: ConflictException | undefined;
    try {
      await service.predictPrice(PRICE_DTO as any);
    } catch (e) {
      caught = e as ConflictException;
    }

    expect(caught).toBeInstanceOf(ConflictException);
    const response = caught!.getResponse() as any;
    expect(response).toMatchObject({
      error_code: 'AMBIGUOUS_MARKET_MATCH',
      candidate_states: expect.arrayContaining(['Madhya Pradesh', 'Telangana']),
    });
  });

  // --- 501 -> 501 ---

  it('throws NotImplementedException on upstream HTTP 501', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(501, { detail: { error_code: 'MODEL_NOT_TRAINED', message: 'Phase 14.' } }, false),
    );
    await expect(service.recommendCrop(CROP_DTO as any)).rejects.toBeInstanceOf(NotImplementedException);
  });

  // --- 502 / 503 -> 502 ---

  it('throws BadGatewayException on upstream HTTP 502', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(502, { detail: 'upstream error' }, false));
    await expect(service.recommendCrop(CROP_DTO as any)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('throws BadGatewayException on upstream HTTP 503', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(503, { detail: 'service unavailable' }, false));
    await expect(service.predictPrice(PRICE_DTO as any)).rejects.toBeInstanceOf(BadGatewayException);
  });

  // --- Malformed upstream body ---

  it('handles non-JSON upstream error body without crashing', async () => {
    const badJsonResponse = {
      status: 500,
      statusText: 'Internal Server Error',
      ok: false,
      json: async () => { throw new SyntaxError('Unexpected token'); },
      headers: new Headers(),
    } as unknown as Response;
    fetchMock.mockResolvedValueOnce(badJsonResponse);
    await expect(service.recommendCrop(CROP_DTO as any)).rejects.toThrow();
  });

  // --- URL construction ---

  it('constructs the correct URL for crop recommendations', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, { recommended_crop: 'maize', confidence: 0.9, input_features: {}, model_version: '1.0' }),
    );
    await service.recommendCrop(CROP_DTO as any);
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toBe('http://127.0.0.1:8000/api/v1/crop/recommend');
  });

  it('constructs the correct URL for price prediction', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        crop: 'Tomato', market: 'Anantapur', state: 'AP', district: 'AP',
        modal_price: 1700, currency: 'INR', unit: 'unverified',
        arrival_date: '2025-09-20', is_historical_baseline: true,
        data_freshness_note: '', source: '', disclaimer: '',
      }),
    );
    await service.predictPrice(PRICE_DTO as any);
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toBe('http://127.0.0.1:8000/api/v1/price/predict');
  });

  // --- Headers ---

  it('sends JSON Content-Type and Accept headers', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, { recommended_crop: 'cotton', confidence: 0.75, input_features: {}, model_version: '1.0' }),
    );
    await service.recommendCrop(CROP_DTO as any);
    const init: RequestInit = fetchMock.mock.calls[0][1];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((init.headers as Record<string, string>)['Accept']).toBe('application/json');
  });

  // --- Market Trends Tests ---

  describe('getMarketTrends', () => {
    const TRENDS_QUERY = {
      commodity: 'Tomato',
      state: 'Maharashtra',
      market: 'Pune',
      aggregation: 'weekly',
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    };

    it('returns the upstream result on HTTP 200', async () => {
      const mockResult = {
        commodity: 'Tomato',
        state: 'Maharashtra',
        market: 'Pune',
        aggregation: 'weekly',
        unit: 'INR per quintal',
        currency: 'INR',
        data_points: [
          { date: '2025-01-01', modal_price: 1500, min_price: 1200, max_price: 1800, observation_count: 5 },
          { date: '2025-01-08', modal_price: 1600, min_price: 1300, max_price: 1900, observation_count: 5 },
        ],
        latest_price: 1600,
        previous_price: 1500,
        percentage_change: 6.67,
        trend_classification: 'Rising',
        insights: ['Wholesale prices increased by 6.7%'],
        market_comparisons: [],
      };

      fetchMock.mockResolvedValueOnce(mockResponse(200, mockResult));
      const res = await service.getMarketTrends(TRENDS_QUERY as any);
      expect(res).toEqual(mockResult);
      expect(res.trend_classification).toBe('Rising');
      expect(res.latest_price).toBe(1600);
    });

    it('constructs the correct URL with query parameters', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, { data_points: [] }));
      await service.getMarketTrends(TRENDS_QUERY as any);
      const calledUrl: string = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/market-trends?');
      expect(calledUrl).toContain('commodity=Tomato');
      expect(calledUrl).toContain('state=Maharashtra');
      expect(calledUrl).toContain('market=Pune');
      expect(calledUrl).toContain('aggregation=weekly');
    });

    it('throws BadRequestException on upstream HTTP 400', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(400, { detail: { message: 'Unsupported aggregation yearly', error_code: 'INVALID_FILTER' } }, false),
      );
      await expect(service.getMarketTrends({ commodity: 'Tomato', aggregation: 'yearly' } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadGatewayException when upstream is unreachable', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(service.getMarketTrends(TRENDS_QUERY as any)).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('throws GatewayTimeoutException when upstream request times out', async () => {
      const timeoutErr = new Error('The operation was aborted');
      timeoutErr.name = 'TimeoutError';
      fetchMock.mockRejectedValueOnce(timeoutErr);
      await expect(service.getMarketTrends(TRENDS_QUERY as any)).rejects.toBeInstanceOf(GatewayTimeoutException);
    });
  });

  describe('getMarketTrendOptions', () => {
    it('returns filter options on HTTP 200 and passes query params', async () => {
      const mockOptions = {
        commodities: ['Tomato', 'Onion', 'Potato'],
        states: ['Maharashtra', 'Tamil Nadu'],
        districts: ['Pune', 'Nashik'],
        markets: ['Pune', 'Khed'],
        date_range: { min_date: '2025-01-01', max_date: '2025-12-30' },
        default_selection: { commodity: 'Tomato', state: 'Maharashtra', district: 'Pune', market: 'Pune' },
      };

      fetchMock.mockResolvedValueOnce(mockResponse(200, mockOptions));
      const res = await service.getMarketTrendOptions('Tomato', 'Maharashtra');
      expect(res).toEqual(mockOptions);

      const calledUrl: string = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/market-trends/options?');
      expect(calledUrl).toContain('commodity=Tomato');
      expect(calledUrl).toContain('state=Maharashtra');
    });
  });
});

