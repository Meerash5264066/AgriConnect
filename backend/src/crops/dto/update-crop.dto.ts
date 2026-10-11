import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  IsDateString,
  IsIn,
} from 'class-validator';

export class UpdateCropDto {
  @ApiPropertyOptional({ example: 'Tomato', description: 'Crop name / commodity' })
  @IsOptional()
  @IsString({ message: 'cropName must be a text string' })
  cropName?: string;

  @ApiPropertyOptional({ example: 'Hybrid Himsona', description: 'Crop variety' })
  @IsOptional()
  @IsString({ message: 'variety must be a text string' })
  variety?: string;

  @ApiPropertyOptional({ example: 3500, description: 'Available quantity in kg' })
  @IsOptional()
  @IsNumber({}, { message: 'quantityKg must be a valid number' })
  @Min(0, { message: 'quantityKg must be non-negative' })
  quantityKg?: number;

  @ApiPropertyOptional({ example: 38.0, description: 'Price per kg in INR' })
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

  @ApiPropertyOptional({ example: '2026-10-30', description: 'Harvest / readiness date' })
  @IsOptional()
  @IsDateString({}, { message: 'harvestDate must be a valid date string (YYYY-MM-DD)' })
  harvestDate?: string;

  @ApiPropertyOptional({ example: 'Updated description', description: 'Description / notes' })
  @IsOptional()
  @IsString({ message: 'description must be a text string' })
  description?: string;

  @ApiPropertyOptional({ example: 'READY', enum: ['GROWING', 'READY', 'HARVESTED', 'SOLD'] })
  @IsOptional()
  @IsIn(['GROWING', 'READY', 'HARVESTED', 'SOLD'], { message: 'status must be GROWING, READY, HARVESTED, or SOLD' })
  status?: string;
}
