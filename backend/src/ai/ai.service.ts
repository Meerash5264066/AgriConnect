import {
  Injectable,
  Logger,
  BadGatewayException,
  GatewayTimeoutException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  NotImplementedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CropRecommendDto } from './dto/crop-recommend.dto';
import { PricePredictDto } from './dto/price-predict.dto';
import { DemandPredictDto } from './dto/demand-predict.dto';
import { MarketTrendsQueryDto } from './dto/market-trends-query.dto';

export interface CropRecommendationResult {
  recommended_crop: string;
  confidence: number;
  input_features: Record<string, any>;
  model_version: string;
}

export interface PricePredictionResult {
  crop: string;
  market: string;
  state: string;
  district: string;
  modal_price: number;
  currency: string;
  unit: string;
  arrival_date: string;
  requested_date?: string | null;
  is_historical_baseline: boolean;
  data_freshness_note: string;
  source: string;
  disclaimer: string;
}

export interface DemandPredictionResult {
  crop: string;
  location: string;
  month: number;
  season: string;
  predicted_demand_kg: number;
  baseline_demand_kg: number | null;
  baseline_note?: string | null;
  unit: string;
  model_version: string;
  model_name: string;
  model_status: string;
  model_status_note: string;
  is_synthetic: boolean;
  input_features: Record<string, any>;
  disclaimer: string;
}

export interface MarketTrendPoint {
  date: string;
  modal_price: number;
  min_price?: number | null;
  max_price?: number | null;
  observation_count: number;
}

export interface MarketComparisonItem {
  market: string;
  state: string;
  district: string;
  latest_price: number;
  average_price: number;
  last_date: string;
  observation_count: number;
}

export interface MarketTrendsResult {
  commodity: string;
  state?: string | null;
  district?: string | null;
  market: string;
  start_date?: string | null;
  end_date?: string | null;
  aggregation: string;
  unit: string;
  currency: string;
  data_points: MarketTrendPoint[];
  latest_price?: number | null;
  latest_date?: string | null;
  previous_price?: number | null;
  previous_date?: string | null;
  absolute_change?: number | null;
  percentage_change?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  average_price?: number | null;
  observation_count: number;
  trend_classification: string;
  trend_rule_description: string;
  insights: string[];
  market_comparisons: MarketComparisonItem[];
  data_source: string;
  disclaimer: string;
}

export interface MarketFilterOptionsResult {
  commodities: string[];
  states: string[];
  districts: string[];
  markets: string[];
  date_range: { min_date: string; max_date: string };
  default_selection: {
    commodity: string;
    state: string;
    district: string;
    market: string;
  };
}


@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiServiceUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.aiServiceUrl = this.configService
      .get<string>('AI_SERVICE_URL', 'http://127.0.0.1:8000')
      .trim()
      .replace(/\/+$/, '');

    const timeoutConfig = this.configService.get<string | number>(
      'AI_SERVICE_TIMEOUT_MS',
      5000,
    );
    this.timeoutMs = Number(timeoutConfig) || 5000;
  }

  private resolveUrl(path: string): string {
    const base = this.aiServiceUrl;
    const prefix = base.endsWith('/api/v1') ? '' : '/api/v1';
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${prefix}${cleanPath}`;
  }

  /**
   * Invoke crop recommendation endpoint on FastAPI AI service.
   */
  async recommendCrop(dto: CropRecommendDto): Promise<CropRecommendationResult> {
    const url = this.resolveUrl('/crop/recommend');
    const payload = {
      nitrogen: dto.nitrogen,
      phosphorus: dto.phosphorus,
      potassium: dto.potassium,
      temperature: dto.temperature,
      humidity: dto.humidity,
      ph: dto.ph,
      rainfall: dto.rainfall,
    };

    return this.postToAiService<CropRecommendationResult>(url, payload);
  }

  /**
   * Invoke price baseline prediction endpoint on FastAPI AI service.
   */
  async predictPrice(dto: PricePredictDto): Promise<PricePredictionResult> {
    const url = this.resolveUrl('/price/predict');
    const payload = {
      crop: dto.crop,
      market: dto.market,
      state_or_region: dto.state_or_region,
      date: dto.date,
      season: dto.season,
      historical_price: dto.historical_price,
    };

    return this.postToAiService<PricePredictionResult>(url, payload);
  }

  /**
   * Invoke produce demand forecasting endpoint on FastAPI AI service.
   */
  async predictDemand(dto: DemandPredictDto): Promise<DemandPredictionResult> {
    const url = this.resolveUrl('/demand/predict');
    const payload = {
      crop: dto.crop,
      location: dto.location,
      season: dto.season,
      month: dto.month,
      historical_volume: dto.historical_volume,
      quality_tier: dto.quality_tier,
    };

    return this.postToAiService<DemandPredictionResult>(url, payload);
  }

  /**
   * Invoke agricultural market trend analysis endpoint on FastAPI AI service.
   */
  async getMarketTrends(dto: MarketTrendsQueryDto): Promise<MarketTrendsResult> {
    const params = new URLSearchParams();
    if (dto.commodity) params.append('commodity', dto.commodity);
    if (dto.state) params.append('state', dto.state);
    if (dto.district) params.append('district', dto.district);
    if (dto.market) params.append('market', dto.market);
    if (dto.start_date) params.append('start_date', dto.start_date);
    if (dto.end_date) params.append('end_date', dto.end_date);
    if (dto.aggregation) params.append('aggregation', dto.aggregation);

    const qs = params.toString();
    const url = this.resolveUrl(qs ? `/market-trends?${qs}` : '/market-trends');
    return this.getFromAiService<MarketTrendsResult>(url);
  }

  /**
   * Retrieve dynamic filter options for market trends from FastAPI AI service.
   */
  async getMarketTrendOptions(
    commodity?: string,
    state?: string,
    district?: string,
  ): Promise<MarketFilterOptionsResult> {
    const params = new URLSearchParams();
    if (commodity) params.append('commodity', commodity);
    if (state) params.append('state', state);
    if (district) params.append('district', district);

    const qs = params.toString();
    const url = this.resolveUrl(qs ? `/market-trends/options?${qs}` : '/market-trends/options');
    return this.getFromAiService<MarketFilterOptionsResult>(url);
  }

  /**
   * Common HTTP client wrapper using native fetch with AbortSignal timeout and error mapping.
   */
  private async postToAiService<T>(url: string, payload: any): Promise<T> {
    return this.requestAiService<T>(url, 'POST', payload);
  }

  /**
   * Common HTTP GET client wrapper with AbortSignal timeout and error mapping.
   */
  private async getFromAiService<T>(url: string): Promise<T> {
    return this.requestAiService<T>(url, 'GET');
  }

  private async requestAiService<T>(
    url: string,
    method: 'GET' | 'POST',
    payload?: any,
  ): Promise<T> {
    let response: Response;

    try {
      this.logger.debug(`Calling AI service [${method}] at ${url}`);
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (method === 'POST') {
        headers['Content-Type'] = 'application/json';
      }

      response = await fetch(url, {
        method,
        headers,
        body: method === 'POST' ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        this.logger.error(`AI service request to ${url} timed out after ${this.timeoutMs}ms`);
        throw new GatewayTimeoutException(
          'AI microservice request timed out. Please try again later.',
        );
      }

      this.logger.error(`AI service request to ${url} failed to connect: ${err?.message || err}`);
      throw new BadGatewayException(
        'AI microservice is currently unreachable. Please ensure the AI service is running.',
      );
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    // Parse upstream error safely
    let errorBody: any = null;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = { message: response.statusText };
    }

    const detail = errorBody?.detail ?? errorBody;
    const errorMessage =
      typeof detail === 'string'
        ? detail
        : detail?.message || errorBody?.message || 'Upstream AI service error';

    this.logger.warn(`AI service responded with status ${response.status}: ${JSON.stringify(detail)}`);

    switch (response.status) {
      case HttpStatus.BAD_REQUEST:
      case HttpStatus.UNPROCESSABLE_ENTITY: // 422
        throw new BadRequestException(
          typeof detail === 'object' ? detail : errorMessage,
        );

      case HttpStatus.NOT_FOUND: // 404
        throw new NotFoundException(
          typeof detail === 'object' ? detail : errorMessage,
        );

      case HttpStatus.CONFLICT: // 409
        // Preserve useful structured details so clients can resolve market ambiguities
        throw new ConflictException(
          typeof detail === 'object' ? detail : errorMessage,
        );

      case HttpStatus.NOT_IMPLEMENTED: // 501
        throw new NotImplementedException(
          typeof detail === 'object' ? detail : errorMessage,
        );

      case HttpStatus.SERVICE_UNAVAILABLE: // 503
      case HttpStatus.BAD_GATEWAY: // 502
        throw new BadGatewayException(
          'AI microservice is currently unavailable.',
        );

      default:
        throw new HttpException(
          typeof detail === 'object' ? detail : errorMessage,
          response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
    }
  }
}

