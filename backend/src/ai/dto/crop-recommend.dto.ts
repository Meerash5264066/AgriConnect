import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsNotEmpty, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class CropRecommendDto {
  @ApiProperty({
    example: 90.0,
    description: 'Ratio of Nitrogen content in soil (kg/ha)',
  })
  @Transform(({ obj }) => obj.nitrogen ?? obj.N)
  @IsNumber({}, { message: 'nitrogen must be a valid number' })
  @IsNotEmpty({ message: 'nitrogen is required' })
  @Min(0, { message: 'nitrogen cannot be negative' })
  @Max(500, { message: 'nitrogen cannot exceed 500 kg/ha' })
  nitrogen: number;

  @ApiProperty({
    example: 42.0,
    description: 'Ratio of Phosphorus content in soil (kg/ha)',
  })
  @Transform(({ obj }) => obj.phosphorus ?? obj.P)
  @IsNumber({}, { message: 'phosphorus must be a valid number' })
  @IsNotEmpty({ message: 'phosphorus is required' })
  @Min(0, { message: 'phosphorus cannot be negative' })
  @Max(500, { message: 'phosphorus cannot exceed 500 kg/ha' })
  phosphorus: number;

  @ApiProperty({
    example: 43.0,
    description: 'Ratio of Potassium content in soil (kg/ha)',
  })
  @Transform(({ obj }) => obj.potassium ?? obj.K)
  @IsNumber({}, { message: 'potassium must be a valid number' })
  @IsNotEmpty({ message: 'potassium is required' })
  @Min(0, { message: 'potassium cannot be negative' })
  @Max(500, { message: 'potassium cannot exceed 500 kg/ha' })
  potassium: number;

  @ApiProperty({
    example: 20.87,
    description: 'Ambient temperature in Celsius',
  })
  @IsNumber({}, { message: 'temperature must be a valid number' })
  @IsNotEmpty({ message: 'temperature is required' })
  @Min(-10, { message: 'temperature cannot be below -10°C' })
  @Max(60, { message: 'temperature cannot exceed 60°C' })
  temperature: number;

  @ApiProperty({
    example: 82.0,
    description: 'Relative humidity percentage (0-100)',
  })
  @IsNumber({}, { message: 'humidity must be a valid number' })
  @IsNotEmpty({ message: 'humidity is required' })
  @Min(0, { message: 'humidity cannot be negative' })
  @Max(100, { message: 'humidity cannot exceed 100%' })
  humidity: number;

  @ApiProperty({
    example: 6.5,
    description: 'Soil pH value (0.0 to 14.0)',
  })
  @IsNumber({}, { message: 'ph must be a valid number' })
  @IsNotEmpty({ message: 'ph is required' })
  @Min(0, { message: 'ph cannot be negative' })
  @Max(14, { message: 'ph cannot exceed 14.0' })
  ph: number;

  @ApiProperty({
    example: 202.93,
    description: 'Precipitation / rainfall in millimeters',
  })
  @IsNumber({}, { message: 'rainfall must be a valid number' })
  @IsNotEmpty({ message: 'rainfall is required' })
  @Min(0, { message: 'rainfall cannot be negative' })
  @Max(2000, { message: 'rainfall cannot exceed 2000 mm' })
  rainfall: number;
}
