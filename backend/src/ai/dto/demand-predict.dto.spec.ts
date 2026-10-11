import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DemandPredictDto } from './demand-predict.dto';

describe('DemandPredictDto', () => {
  it('validates a complete valid demand forecast payload', async () => {
    const payload = {
      crop: 'Tomato',
      location: 'Maharashtra',
      season: 'Kharif',
      month: 8,
      historical_volume: 52000,
      quality_tier: 'Grade A',
    };
    const dto = plainToInstance(DemandPredictDto, payload);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('validates a minimal payload with only required crop and location', async () => {
    const payload = {
      crop: 'Wheat',
      location: 'Madhya Pradesh',
    };
    const dto = plainToInstance(DemandPredictDto, payload);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('fails validation when crop is missing or empty', async () => {
    const payload = {
      crop: '',
      location: 'Maharashtra',
    };
    const dto = plainToInstance(DemandPredictDto, payload);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const cropError = errors.find((e) => e.property === 'crop');
    expect(cropError).toBeDefined();
  });

  it('fails validation when location is missing or empty', async () => {
    const payload = {
      crop: 'Rice',
      location: '',
    };
    const dto = plainToInstance(DemandPredictDto, payload);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const locationError = errors.find((e) => e.property === 'location');
    expect(locationError).toBeDefined();
  });

  it('fails validation when month is less than 1 or greater than 12', async () => {
    const invalidMonthLow = plainToInstance(DemandPredictDto, {
      crop: 'Tomato',
      location: 'Tamil Nadu',
      month: 0,
    });
    const errorsLow = await validate(invalidMonthLow);
    expect(errorsLow.find((e) => e.property === 'month')).toBeDefined();

    const invalidMonthHigh = plainToInstance(DemandPredictDto, {
      crop: 'Tomato',
      location: 'Tamil Nadu',
      month: 13,
    });
    const errorsHigh = await validate(invalidMonthHigh);
    expect(errorsHigh.find((e) => e.property === 'month')).toBeDefined();
  });

  it('fails validation when historical_volume is negative', async () => {
    const payload = {
      crop: 'Potato',
      location: 'Maharashtra',
      historical_volume: -500,
    };
    const dto = plainToInstance(DemandPredictDto, payload);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const volumeError = errors.find((e) => e.property === 'historical_volume');
    expect(volumeError).toBeDefined();
  });
});
