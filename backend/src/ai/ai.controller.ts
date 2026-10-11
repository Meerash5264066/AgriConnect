import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AiService } from './ai.service';
import { CropRecommendDto } from './dto/crop-recommend.dto';
import { PricePredictDto } from './dto/price-predict.dto';
import { DemandPredictDto } from './dto/demand-predict.dto';
import { MarketTrendsQueryDto } from './dto/market-trends-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}


  @Post('crop-recommend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recommend optimal crop based on soil and climate inputs',
    description:
      'Forwards validated soil nutrients (N, P, K), pH, and climate parameters to the AI microservice.',
  })
  @ApiResponse({
    status: 200,
    description: 'Crop recommendation successfully generated.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed on soil or climate parameters.',
  })
  @ApiResponse({
    status: 501,
    description: 'Crop recommendation model is not trained or available.',
  })
  @ApiResponse({
    status: 502,
    description: 'AI microservice is unreachable.',
  })
  @ApiResponse({
    status: 504,
    description: 'AI microservice request timed out.',
  })
  recommendCrop(@Body() dto: CropRecommendDto) {
    return this.aiService.recommendCrop(dto);
  }

  @Post('price-predict')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Look up agricultural commodity price baseline',
    description:
      'Queries latest observed modal price baseline from historical APMC arrivals. Discloses data freshness and observation dates.',
  })
  @ApiResponse({
    status: 200,
    description: 'Latest observed price baseline successfully returned.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid commodity or date parameters.',
  })
  @ApiResponse({
    status: 404,
    description: 'No historical price records found for commodity at market.',
  })
  @ApiResponse({
    status: 409,
    description:
      'Ambiguous market match requiring state_or_region or district specification.',
  })
  @ApiResponse({
    status: 502,
    description: 'AI microservice is unreachable.',
  })
  @ApiResponse({
    status: 504,
    description: 'AI microservice request timed out.',
  })
  predictPrice(@Body() dto: PricePredictDto) {
    return this.aiService.predictPrice(dto);
  }

  @Post('demand-predict')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Predict regional agricultural produce demand volume',
    description:
      'Forwards commodity, regional location, season/month, and historical volume indicators to the AI microservice forecasting pipeline.',
  })
  @ApiResponse({
    status: 200,
    description: 'Demand forecast prediction successfully generated.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or unsupported categorical inputs.',
  })
  @ApiResponse({
    status: 501,
    description: 'Demand prediction model is not trained or available.',
  })
  @ApiResponse({
    status: 502,
    description: 'AI microservice is unreachable.',
  })
  @ApiResponse({
    status: 504,
    description: 'AI microservice request timed out.',
  })
  predictDemand(@Body() dto: DemandPredictDto) {
    return this.aiService.predictDemand(dto);
  }

  @Get('market-trends/options')
  @ApiOperation({
    summary: 'Retrieve dynamic commodity, state, and market filter options',
    description:
      'Returns available commodities, states, districts, markets, and date range for dynamic UI selectors.',
  })
  @ApiResponse({
    status: 200,
    description: 'Filter options successfully returned.',
  })
  @ApiResponse({
    status: 502,
    description: 'AI microservice is unreachable.',
  })
  getMarketTrendOptions(
    @Query('commodity') commodity?: string,
    @Query('state') state?: string,
    @Query('district') district?: string,
  ) {
    return this.aiService.getMarketTrendOptions(commodity, state, district);
  }

  @Get('market-trends')
  @ApiOperation({
    summary: 'Analyze agricultural commodity market trends',
    description:
      'Retrieves historical APMC arrival modal price time series, aggregations, price statistics, statistical trend classification, and peer market comparisons.',
  })
  @ApiResponse({
    status: 200,
    description: 'Market trend analysis successfully generated.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid commodity, date syntax, or unsupported aggregation.',
  })
  @ApiResponse({
    status: 502,
    description: 'AI microservice is unreachable.',
  })
  @ApiResponse({
    status: 504,
    description: 'AI microservice request timed out.',
  })
  getMarketTrends(@Query() query: MarketTrendsQueryDto) {
    return this.aiService.getMarketTrends(query);
  }
}

