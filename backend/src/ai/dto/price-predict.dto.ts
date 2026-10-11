import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Matches,
} from 'class-validator';

export class PricePredictDto {
  @ApiProperty({
    example: 'Tomato',
    description: 'Agricultural crop/commodity name',
  })
  @IsString({ message: 'crop must be a text string' })
  @IsNotEmpty({ message: 'crop is required' })
  crop: string;

  @ApiProperty({
    example: 'Anantapur',
    description: 'Target APMC Mandi or market name',
  })
  @IsString({ message: 'market must be a text string' })
  @IsNotEmpty({ message: 'market is required' })
  market: string;

  @ApiPropertyOptional({
    example: 'Andhra Pradesh',
    description: 'State or region name to disambiguate identical market names',
  })
  @IsOptional()
  @IsString({ message: 'state_or_region must be a text string' })
  state_or_region?: string;

  @ApiPropertyOptional({
    example: '2026-10-15',
    description: 'Target query date in ISO format (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString({ message: 'date must be a text string' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be a valid ISO format string (YYYY-MM-DD)',
  })
  date?: string;

  @ApiPropertyOptional({
    example: 'Kharif',
    description: 'Agricultural season (Kharif, Rabi, Zaid)',
  })
  @IsOptional()
  @IsString({ message: 'season must be a text string' })
  season?: string;

  @ApiPropertyOptional({
    example: 1500.0,
    description: 'Recent benchmark or historical price per quintal',
  })
  @IsOptional()
  @IsNumber({}, { message: 'historical_price must be a valid number' })
  @Min(0.01, { message: 'historical_price must be a positive number greater than zero' })
  historical_price?: number;
}
