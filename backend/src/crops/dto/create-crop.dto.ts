import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsDateString,
  IsIn,
} from 'class-validator';

export class CreateCropDto {
  @ApiProperty({ example: 'Tomato', description: 'Crop name / commodity' })
  @IsString({ message: 'cropName must be a text string' })
  @IsNotEmpty({ message: 'cropName is required' })
  cropName: string;

  @ApiPropertyOptional({ example: 'Hybrid Himsona', description: 'Crop variety' })
  @IsOptional()
  @IsString({ message: 'variety must be a text string' })
  variety?: string;

  @ApiProperty({ example: 4000, description: 'Available quantity in kg' })
  @IsNumber({}, { message: 'quantityKg must be a valid number' })
  @Min(1, { message: 'quantityKg must be at least 1 kg' })
  quantityKg: number;

  @ApiPropertyOptional({ example: 35.5, description: 'Price per kg in INR' })
  @IsOptional()
  @IsNumber({}, { message: 'pricePerKg must be a valid number' })
  @Min(0.01, { message: 'pricePerKg must be positive' })
  pricePerKg?: number;

  @ApiPropertyOptional({ example: 'Grade A', description: 'Quality tier' })
  @IsOptional()
  @IsString({ message: 'quality must be a text string' })
  quality?: string;

  @ApiPropertyOptional({ example: 'Coimbatore, Tamil Nadu', description: 'Crop location' })
  @IsOptional()
  @IsString({ message: 'location must be a text string' })
  location?: string;

  @ApiPropertyOptional({ example: '2026-10-25', description: 'Harvest / readiness date' })
  @IsOptional()
  @IsDateString({}, { message: 'harvestDate must be a valid date string (YYYY-MM-DD)' })
  harvestDate?: string;

  @ApiPropertyOptional({ example: 'Drip irrigated organic tomatoes', description: 'Description / notes' })
  @IsOptional()
  @IsString({ message: 'description must be a text string' })
  description?: string;

  @ApiPropertyOptional({ example: 'READY', enum: ['GROWING', 'READY', 'HARVESTED', 'SOLD'] })
  @IsOptional()
  @IsIn(['GROWING', 'READY', 'HARVESTED', 'SOLD'], { message: 'status must be GROWING, READY, HARVESTED, or SOLD' })
  status?: string;
}
