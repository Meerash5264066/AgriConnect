import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class DemandPredictDto {
  @ApiProperty({
    example: 'Tomato',
    description: 'Agricultural crop or commodity name',
  })
  @IsString({ message: 'crop must be a text string' })
  @IsNotEmpty({ message: 'crop is required' })
  crop: string;

  @ApiProperty({
    example: 'Maharashtra',
    description: 'Target market state or regional trading hub',
  })
  @IsString({ message: 'location must be a text string' })
  @IsNotEmpty({ message: 'location is required' })
  location: string;

  @ApiPropertyOptional({
    example: 'Kharif',
    description: 'Agricultural season (Kharif, Rabi, Zaid)',
  })
  @IsOptional()
  @IsString({ message: 'season must be a text string' })
  season?: string;

  @ApiPropertyOptional({
    example: 8,
    description: 'Target calendar month (1 to 12)',
  })
  @IsOptional()
  @IsInt({ message: 'month must be an integer between 1 and 12' })
  @Min(1, { message: 'month cannot be less than 1' })
  @Max(12, { message: 'month cannot exceed 12' })
  month?: number;

  @ApiPropertyOptional({
    example: 52000.0,
    description: 'Historical procurement volume in kilograms',
  })
  @IsOptional()
  @IsNumber({}, { message: 'historical_volume must be a valid number' })
  @Min(0, { message: 'historical_volume cannot be negative' })
  historical_volume?: number;

  @ApiPropertyOptional({
    example: 'Grade A',
    description: "Produce quality tier classification ('Grade A' or 'Grade B')",
  })
  @IsOptional()
  @IsString({ message: 'quality_tier must be a text string' })
  quality_tier?: string;
}
