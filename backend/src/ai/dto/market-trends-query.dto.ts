import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  Matches,
} from 'class-validator';

export class MarketTrendsQueryDto {
  @ApiProperty({
    example: 'Tomato',
    description: 'Agricultural commodity/crop name',
  })
  @IsString({ message: 'commodity must be a text string' })
  @IsNotEmpty({ message: 'commodity is required' })
  commodity: string;

  @ApiPropertyOptional({
    example: 'Maharashtra',
    description: 'Indian State name (e.g. Maharashtra, Tamil Nadu)',
  })
  @IsOptional()
  @IsString({ message: 'state must be a text string' })
  state?: string;

  @ApiPropertyOptional({
    example: 'Pune',
    description: 'District name',
  })
  @IsOptional()
  @IsString({ message: 'district must be a text string' })
  district?: string;

  @ApiPropertyOptional({
    example: 'Pune',
    description: 'Specific APMC Mandi or market center',
  })
  @IsOptional()
  @IsString({ message: 'market must be a text string' })
  market?: string;

  @ApiPropertyOptional({
    example: '2025-01-01',
    description: 'Start date filter in YYYY-MM-DD format',
  })
  @IsOptional()
  @IsString({ message: 'start_date must be a text string' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'start_date must be a valid ISO format string (YYYY-MM-DD)',
  })
  start_date?: string;

  @ApiPropertyOptional({
    example: '2025-12-31',
    description: 'End date filter in YYYY-MM-DD format',
  })
  @IsOptional()
  @IsString({ message: 'end_date must be a text string' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'end_date must be a valid ISO format string (YYYY-MM-DD)',
  })
  end_date?: string;

  @ApiPropertyOptional({
    example: 'daily',
    description: 'Time aggregation frequency: daily, weekly, or monthly',
    enum: ['daily', 'weekly', 'monthly'],
  })
  @IsOptional()
  @IsString({ message: 'aggregation must be a text string' })
  @IsIn(['daily', 'weekly', 'monthly'], {
    message: 'aggregation must be one of: daily, weekly, monthly',
  })
  aggregation?: string;
}
