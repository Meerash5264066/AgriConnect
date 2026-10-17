import { Injectable, NotFoundException } from '@nestjs/common';

export interface WeatherCondition {
  location: string;
  region: string;
  temperature: number;
  condition: string;
  icon: string;
  feelsLike: number;
  tempMax: number;
  tempMin: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  precipitationProbability: number;
  uvIndex: number;
  barometerHpa: number;
  airQualityIndex: number;
  soilMoisturePct: number;
  soilTemperatureC: number;
  evapotranspirationMm: number;
  sprayIndex: {
    score: number;
    status: 'Optimal' | 'Caution' | 'Unfavorable';
    recommendedWindow: string;
    advisory: string;
    isSafeToSpray: boolean;
    reasoning: string;
  };
  irrigationAdvisory: string;
  harvestSuitability: {
    score: number;
    verdict: string;
  };
  forecast7Day: Array<{
    date: string;
    dayName: string;
    condition: string;
    icon: string;
    tempMax: number;
    tempMin: number;
    rainProb: number;
    windSpeed: number;
    advisory: string;
  }>;
  pastWeatherRecords?: Array<{
    date: string;
    dayName: string;
    condition: string;
    icon: string;
    tempMax: number;
    tempMin: number;
    rainfallMm: number;
    humidity: number;
    windSpeed: number;
    source: string;
  }>;
  pressure?: number;
  rainfallMm?: number;
  sunrise?: string;
  sunset?: string;
  cloudCover?: number;
  country?: string;
  state?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  lastUpdated?: string;
  isLive?: boolean;
  cached?: boolean;
  next24Hours?: Array<{
    time: string;
    temp: number;
    rainProb: number;
    windSpeed: number;
    condition: string;
    icon: string;
  }>;
}

export interface CitySearchResult {
  id: number | string;
  name: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface WeatherAlert {
  id: string;
  severity: 'WARNING' | 'ADVISORY' | 'INFO';
  title: string;
  description: string;
  issuedBy: string;
  region: string;
  validUntil: string;
  farmerAction: string;
}

@Injectable()
export class WeatherService {
  private readonly regionsData: Record<string, WeatherCondition> = {
    Coimbatore: {
      location: 'Coimbatore Agromet Hub',
      region: 'Coimbatore District, Tamil Nadu',
      temperature: 30,
      condition: 'Partly Cloudy',
      icon: 'fa-cloud-sun',
      feelsLike: 32,
      tempMax: 33,
      tempMin: 22,
      humidity: 62,
      windSpeed: 8,
      windDirection: 'ENE',
      precipitationProbability: 15,
      uvIndex: 7,
      barometerHpa: 1012,
      airQualityIndex: 45,
      soilMoisturePct: 24,
      soilTemperatureC: 22.5,
      evapotranspirationMm: 4.8,
      sprayIndex: {
        score: 94,
        status: 'Optimal',
        recommendedWindow: '06:30 AM - 10:30 AM',
        advisory: 'Calm morning winds (< 10 km/h) and dry weather for the next 36 hours. Best window for spraying liquid fertilizer and crop protection.',
        isSafeToSpray: true,
        reasoning: 'Why this time is recommended: Morning temperature is below 30°C which prevents chemical evaporation, and gentle 8 km/h wind ensures even droplet coverage without chemical drift.',
      },
      irrigationAdvisory: 'Soil water is at 24% (adequate level). Roots have sufficient moisture. Skip heavy flooding today as light showers may occur in 48 hours.',
      harvestSuitability: {
        score: 92,
        verdict: 'Excellent harvest weather. Warm afternoon sun is ideal for field harvesting and open-air crop drying.',
      },
      forecast7Day: [
        { date: 'Today', dayName: 'Wednesday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 33, tempMin: 22, rainProb: 15, windSpeed: 8, advisory: 'Best time for spraying and weeding' },
        { date: 'Tomorrow', dayName: 'Thursday', condition: 'Scattered Showers', icon: 'fa-cloud-sun-rain', tempMax: 31, tempMin: 23, rainProb: 65, windSpeed: 14, advisory: 'Clear field drainage channels' },
        { date: 'Day 3', dayName: 'Friday', condition: 'Light Rain', icon: 'fa-cloud-rain', tempMax: 29, tempMin: 22, rainProb: 75, windSpeed: 16, advisory: 'Do not spray; rain will wash chemicals' },
        { date: 'Day 4', dayName: 'Saturday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 32, tempMin: 21, rainProb: 20, windSpeed: 10, advisory: 'Resume field operations' },
        { date: 'Day 5', dayName: 'Sunday', condition: 'Sunny & Clear', icon: 'fa-sun', tempMax: 34, tempMin: 21, rainProb: 10, windSpeed: 7, advisory: 'Ideal for tractor ploughing' },
        { date: 'Day 6', dayName: 'Monday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 34, tempMin: 22, rainProb: 5, windSpeed: 6, advisory: 'High sun drying efficiency' },
        { date: 'Day 7', dayName: 'Tuesday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 33, tempMin: 22, rainProb: 25, windSpeed: 9, advisory: 'Monitor nursery seedlings' },
      ],
      pastWeatherRecords: [
        { date: 'Yesterday', dayName: 'Tuesday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 32, tempMin: 22, rainfallMm: 0.0, humidity: 64, windSpeed: 7, source: 'Recorded by Coimbatore Agromet Station' },
        { date: '2 Days Ago', dayName: 'Monday', condition: 'Sunny & Dry', icon: 'fa-sun', tempMax: 33, tempMin: 21, rainfallMm: 0.0, humidity: 58, windSpeed: 8, source: 'Recorded by Coimbatore Agromet Station' },
        { date: '3 Days Ago', dayName: 'Sunday', condition: 'Passing Clouds', icon: 'fa-cloud-sun', tempMax: 33, tempMin: 22, rainfallMm: 1.2, humidity: 68, windSpeed: 10, source: 'Recorded by Coimbatore Agromet Station' },
        { date: '4 Days Ago', dayName: 'Saturday', condition: 'Light Shower', icon: 'fa-cloud-sun-rain', tempMax: 31, tempMin: 23, rainfallMm: 8.5, humidity: 78, windSpeed: 12, source: 'Recorded by Coimbatore Agromet Station' },
        { date: '5 Days Ago', dayName: 'Friday', condition: 'Overcast', icon: 'fa-cloud', tempMax: 30, tempMin: 23, rainfallMm: 4.0, humidity: 82, windSpeed: 11, source: 'Recorded by Coimbatore Agromet Station' },
      ],
    },
    Palakkad: {
      location: 'Palakkad Agromet Station',
      region: 'Palakkad District, Kerala',
      temperature: 29,
      condition: 'Passing Showers',
      icon: 'fa-cloud-showers-heavy',
      feelsLike: 33,
      tempMax: 30,
      tempMin: 23,
      humidity: 84,
      windSpeed: 13,
      windDirection: 'SW',
      precipitationProbability: 60,
      uvIndex: 4,
      barometerHpa: 1009,
      airQualityIndex: 28,
      soilMoisturePct: 38,
      soilTemperatureC: 24.0,
      evapotranspirationMm: 3.2,
      sprayIndex: {
        score: 35,
        status: 'Unfavorable',
        recommendedWindow: 'Postpone — Spraying Unsafe Today',
        advisory: 'DO NOT SPRAY TODAY. High chance of rain (60%) and high humidity (84%) will wash away chemicals into field runoff.',
        isSafeToSpray: false,
        reasoning: 'Why spraying is unsafe: Rain washes off pesticide droplets within 2 hours of spraying. Strong humidity also prevents rapid drying. Wait for Friday when drier skies are forecast.',
      },
      irrigationAdvisory: 'Soil water is at 38% (high/surplus level). Turn off all pumps and irrigation. Ensure water channels are clear to prevent waterlogging in paddy fields.',
      harvestSuitability: {
        score: 40,
        verdict: 'Unfavorable for harvesting. High moisture and showers will wet grains. Postpone combine harvesting until dry days.',
      },
      forecast7Day: [
        { date: 'Today', dayName: 'Wednesday', condition: 'Passing Showers', icon: 'fa-cloud-showers-heavy', tempMax: 30, tempMin: 23, rainProb: 60, windSpeed: 13, advisory: 'Keep drainage channels clear' },
        { date: 'Tomorrow', dayName: 'Thursday', condition: 'Rain & Thunder', icon: 'fa-cloud-bolt', tempMax: 28, tempMin: 23, rainProb: 80, windSpeed: 18, advisory: 'Protect open grain stock' },
        { date: 'Day 3', dayName: 'Friday', condition: 'Scattered Rain', icon: 'fa-cloud-rain', tempMax: 29, tempMin: 22, rainProb: 45, windSpeed: 12, advisory: 'Check paddy bunds' },
        { date: 'Day 4', dayName: 'Saturday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 31, tempMin: 22, rainProb: 25, windSpeed: 9, advisory: 'Safe for field weeding' },
        { date: 'Day 5', dayName: 'Sunday', condition: 'Sunny Intervals', icon: 'fa-cloud-sun', tempMax: 32, tempMin: 22, rainProb: 15, windSpeed: 8, advisory: 'Safe for organic spraying' },
        { date: 'Day 6', dayName: 'Monday', condition: 'Sunny & Clear', icon: 'fa-sun', tempMax: 33, tempMin: 23, rainProb: 10, windSpeed: 7, advisory: 'Good harvesting window' },
        { date: 'Day 7', dayName: 'Tuesday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 32, tempMin: 23, rainProb: 20, windSpeed: 8, advisory: 'Regular field monitoring' },
      ],
      pastWeatherRecords: [
        { date: 'Yesterday', dayName: 'Tuesday', condition: 'Moderate Rain', icon: 'fa-cloud-showers-heavy', tempMax: 29, tempMin: 23, rainfallMm: 18.2, humidity: 88, windSpeed: 14, source: 'Recorded by Palakkad District Station' },
        { date: '2 Days Ago', dayName: 'Monday', condition: 'Heavy Showers', icon: 'fa-cloud-showers-heavy', tempMax: 28, tempMin: 22, rainfallMm: 32.0, humidity: 92, windSpeed: 16, source: 'Recorded by Palakkad District Station' },
        { date: '3 Days Ago', dayName: 'Sunday', condition: 'Passing Showers', icon: 'fa-cloud-rain', tempMax: 29, tempMin: 23, rainfallMm: 12.4, humidity: 86, windSpeed: 12, source: 'Recorded by Palakkad District Station' },
        { date: '4 Days Ago', dayName: 'Saturday', condition: 'Overcast', icon: 'fa-cloud', tempMax: 30, tempMin: 23, rainfallMm: 4.1, humidity: 82, windSpeed: 11, source: 'Recorded by Palakkad District Station' },
        { date: '5 Days Ago', dayName: 'Friday', condition: 'Cloudy with Drizzle', icon: 'fa-cloud-sun-rain', tempMax: 31, tempMin: 24, rainfallMm: 2.8, humidity: 80, windSpeed: 10, source: 'Recorded by Palakkad District Station' },
      ],
    },
    'Bengaluru Rural': {
      location: 'Bengaluru Rural Agromet Center',
      region: 'Bengaluru Rural District, Karnataka',
      temperature: 27,
      condition: 'Breezy & Overcast',
      icon: 'fa-cloud',
      feelsLike: 27,
      tempMax: 29,
      tempMin: 19,
      humidity: 74,
      windSpeed: 15,
      windDirection: 'WSW',
      precipitationProbability: 35,
      uvIndex: 5,
      barometerHpa: 1014,
      airQualityIndex: 38,
      soilMoisturePct: 28,
      soilTemperatureC: 21.0,
      evapotranspirationMm: 3.8,
      sprayIndex: {
        score: 65,
        status: 'Caution',
        recommendedWindow: '07:00 AM - 08:30 AM Only',
        advisory: 'Spray with caution. Wind gusts can reach 18 km/h. Spray early morning using low-pressure nozzles to reduce spray drift.',
        isSafeToSpray: false,
        reasoning: 'Why caution is needed: Stronger wind (15 km/h) blows spray droplets off target leaves onto neighboring plots. If spraying cannot wait, finish before 8:30 AM when winds pick up.',
      },
      irrigationAdvisory: 'Soil water is at 28% (good level). Natural rainfall has kept root beds moist. Turn off drip irrigation to conserve energy and avoid fungal root disease.',
      harvestSuitability: {
        score: 75,
        verdict: 'Moderate harvest conditions. Keep tarpaulins ready to protect harvested vegetables from sudden cloudbursts.',
      },
      forecast7Day: [
        { date: 'Today', dayName: 'Wednesday', condition: 'Overcast & Breezy', icon: 'fa-cloud', tempMax: 29, tempMin: 19, rainProb: 35, windSpeed: 15, advisory: 'Maintain farm drains' },
        { date: 'Tomorrow', dayName: 'Thursday', condition: 'Thunderstorm', icon: 'fa-cloud-bolt', tempMax: 27, tempMin: 19, rainProb: 75, windSpeed: 20, advisory: 'Protect open harvest crops' },
        { date: 'Day 3', dayName: 'Friday', condition: 'Rain Showers', icon: 'fa-cloud-showers-heavy', tempMax: 26, tempMin: 18, rainProb: 80, windSpeed: 18, advisory: 'Pause tractor land work' },
        { date: 'Day 4', dayName: 'Saturday', condition: 'Passing Showers', icon: 'fa-cloud-sun-rain', tempMax: 28, tempMin: 19, rainProb: 45, windSpeed: 14, advisory: 'Inspect for leaf fungus' },
        { date: 'Day 5', dayName: 'Sunday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 29, tempMin: 19, rainProb: 25, windSpeed: 11, advisory: 'Weeding and staking tomatoes' },
        { date: 'Day 6', dayName: 'Monday', condition: 'Sunny Intervals', icon: 'fa-cloud-sun', tempMax: 30, tempMin: 20, rainProb: 15, windSpeed: 9, advisory: 'Vegetables ready for picking' },
        { date: 'Day 7', dayName: 'Tuesday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 30, tempMin: 20, rainProb: 20, windSpeed: 10, advisory: 'Regular orchard check' },
      ],
      pastWeatherRecords: [
        { date: 'Yesterday', dayName: 'Tuesday', condition: 'Cloudy', icon: 'fa-cloud', tempMax: 28, tempMin: 19, rainfallMm: 2.4, humidity: 76, windSpeed: 14, source: 'Recorded by Bengaluru Rural Agromet Center' },
        { date: '2 Days Ago', dayName: 'Monday', condition: 'Passing Showers', icon: 'fa-cloud-sun-rain', tempMax: 27, tempMin: 19, rainfallMm: 8.6, humidity: 82, windSpeed: 16, source: 'Recorded by Bengaluru Rural Agromet Center' },
        { date: '3 Days Ago', dayName: 'Sunday', condition: 'Light Rain', icon: 'fa-cloud-rain', tempMax: 27, tempMin: 18, rainfallMm: 11.2, humidity: 85, windSpeed: 15, source: 'Recorded by Bengaluru Rural Agromet Center' },
        { date: '4 Days Ago', dayName: 'Saturday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 29, tempMin: 19, rainfallMm: 0.0, humidity: 70, windSpeed: 12, source: 'Recorded by Bengaluru Rural Agromet Center' },
        { date: '5 Days Ago', dayName: 'Friday', condition: 'Sunny Intervals', icon: 'fa-cloud-sun', tempMax: 30, tempMin: 20, rainfallMm: 0.0, humidity: 68, windSpeed: 11, source: 'Recorded by Bengaluru Rural Agromet Center' },
      ],
    },
    Guntur: {
      location: 'Guntur Agromet Research Center',
      region: 'Guntur District, Andhra Pradesh',
      temperature: 34,
      condition: 'Sunny & Hot',
      icon: 'fa-sun',
      feelsLike: 37,
      tempMax: 36,
      tempMin: 25,
      humidity: 52,
      windSpeed: 9,
      windDirection: 'SE',
      precipitationProbability: 10,
      uvIndex: 8,
      barometerHpa: 1010,
      airQualityIndex: 56,
      soilMoisturePct: 18,
      soilTemperatureC: 27.5,
      evapotranspirationMm: 5.8,
      sprayIndex: {
        score: 86,
        status: 'Optimal',
        recommendedWindow: '06:00 AM - 09:00 AM',
        advisory: 'Safe to spray in the early morning. Finish before 9:00 AM before high temperatures cause chemical droplets to evaporate.',
        isSafeToSpray: true,
        reasoning: 'Why this time is recommended: Calm wind (9 km/h) and no rain expected. Morning spray avoids scorching leaves during the peak 34°C afternoon sun.',
      },
      irrigationAdvisory: 'Soil water is at 18% (low level). Fast water loss (5.8 mm/day) from sun heat. Run drip irrigation for 75 to 90 minutes during early morning or evening.',
      harvestSuitability: {
        score: 95,
        verdict: 'Prime harvest weather for chilli, cotton, and pulses. Dry air guarantees fast produce drying and zero mould risk.',
      },
      forecast7Day: [
        { date: 'Today', dayName: 'Wednesday', condition: 'Sunny & Dry', icon: 'fa-sun', tempMax: 36, tempMin: 25, rainProb: 10, windSpeed: 9, advisory: 'Apply morning drip irrigation' },
        { date: 'Tomorrow', dayName: 'Thursday', condition: 'Sunny & Warm', icon: 'fa-sun', tempMax: 36, tempMin: 25, rainProb: 10, windSpeed: 10, advisory: 'Shade chilli nurseries' },
        { date: 'Day 3', dayName: 'Friday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 35, tempMin: 24, rainProb: 5, windSpeed: 9, advisory: 'Ideal for cotton picking' },
        { date: 'Day 4', dayName: 'Saturday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 34, tempMin: 24, rainProb: 15, windSpeed: 11, advisory: 'Foliar micro-nutrient spray' },
        { date: 'Day 5', dayName: 'Sunday', condition: 'Sunny', icon: 'fa-sun', tempMax: 35, tempMin: 24, rainProb: 10, windSpeed: 8, advisory: 'Grain drying in field yard' },
        { date: 'Day 6', dayName: 'Monday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 36, tempMin: 25, rainProb: 5, windSpeed: 9, advisory: 'General tractor tillage' },
        { date: 'Day 7', dayName: 'Tuesday', condition: 'Sunny', icon: 'fa-sun', tempMax: 35, tempMin: 25, rainProb: 10, windSpeed: 10, advisory: 'Pest monitoring in chilli' },
      ],
      pastWeatherRecords: [
        { date: 'Yesterday', dayName: 'Tuesday', condition: 'Hot & Sunny', icon: 'fa-sun', tempMax: 36, tempMin: 25, rainfallMm: 0.0, humidity: 50, windSpeed: 8, source: 'Recorded by Guntur Agromet Research Center' },
        { date: '2 Days Ago', dayName: 'Monday', condition: 'Sunny & Clear', icon: 'fa-sun', tempMax: 35, tempMin: 24, rainfallMm: 0.0, humidity: 52, windSpeed: 9, source: 'Recorded by Guntur Agromet Research Center' },
        { date: '3 Days Ago', dayName: 'Sunday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 35, tempMin: 24, rainfallMm: 0.0, humidity: 54, windSpeed: 10, source: 'Recorded by Guntur Agromet Research Center' },
        { date: '4 Days Ago', dayName: 'Saturday', condition: 'Passing Clouds', icon: 'fa-cloud-sun', tempMax: 34, tempMin: 23, rainfallMm: 0.0, humidity: 58, windSpeed: 11, source: 'Recorded by Guntur Agromet Research Center' },
        { date: '5 Days Ago', dayName: 'Friday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 34, tempMin: 24, rainfallMm: 0.0, humidity: 60, windSpeed: 9, source: 'Recorded by Guntur Agromet Research Center' },
      ],
    },
    Warangal: {
      location: 'Warangal Regional Agromet Hub',
      region: 'Warangal District, Telangana',
      temperature: 32,
      condition: 'Sunny & Clear',
      icon: 'fa-sun',
      feelsLike: 34,
      tempMax: 34,
      tempMin: 23,
      humidity: 48,
      windSpeed: 10,
      windDirection: 'ENE',
      precipitationProbability: 5,
      uvIndex: 7,
      barometerHpa: 1011,
      airQualityIndex: 42,
      soilMoisturePct: 22,
      soilTemperatureC: 25.0,
      evapotranspirationMm: 5.2,
      sprayIndex: {
        score: 91,
        status: 'Optimal',
        recommendedWindow: '06:30 AM - 10:00 AM',
        advisory: 'Safe and optimal spraying conditions. Low wind and clear skies provide complete chemical absorption on cotton and maize crops.',
        isSafeToSpray: true,
        reasoning: 'Why this time is recommended: Gentle 10 km/h wind speed prevents spray drift, and dry weather guarantees no wash-off for at least 48 hours.',
      },
      irrigationAdvisory: 'Soil water is at 22% (borderline adequate). Give light furrow irrigation to maize and cotton crops to support healthy flowering.',
      harvestSuitability: {
        score: 94,
        verdict: 'Excellent harvest conditions. Low humidity and clear sunshine protect harvested cotton and pulses from dampness.',
      },
      forecast7Day: [
        { date: 'Today', dayName: 'Wednesday', condition: 'Sunny & Clear', icon: 'fa-sun', tempMax: 34, tempMin: 23, rainProb: 5, windSpeed: 10, advisory: 'Optimal for cotton crop spray' },
        { date: 'Tomorrow', dayName: 'Thursday', condition: 'Sunny & Warm', icon: 'fa-sun', tempMax: 35, tempMin: 24, rainProb: 5, windSpeed: 10, advisory: 'Light evening irrigation' },
        { date: 'Day 3', dayName: 'Friday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 34, tempMin: 23, rainProb: 5, windSpeed: 9, advisory: 'Cotton boll picking safe' },
        { date: 'Day 4', dayName: 'Saturday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 33, tempMin: 22, rainProb: 15, windSpeed: 11, advisory: 'Maize field weeding' },
        { date: 'Day 5', dayName: 'Sunday', condition: 'Sunny', icon: 'fa-sun', tempMax: 34, tempMin: 23, rainProb: 10, windSpeed: 8, advisory: 'Dry produce under sun' },
        { date: 'Day 6', dayName: 'Monday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 35, tempMin: 23, rainProb: 5, windSpeed: 8, advisory: 'Inspect for pink bollworm' },
        { date: 'Day 7', dayName: 'Tuesday', condition: 'Sunny', icon: 'fa-sun', tempMax: 34, tempMin: 23, rainProb: 10, windSpeed: 9, advisory: 'Tractor inter-cultivation' },
      ],
      pastWeatherRecords: [
        { date: 'Yesterday', dayName: 'Tuesday', condition: 'Sunny', icon: 'fa-sun', tempMax: 34, tempMin: 23, rainfallMm: 0.0, humidity: 46, windSpeed: 9, source: 'Recorded by Warangal Agromet Hub' },
        { date: '2 Days Ago', dayName: 'Monday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 34, tempMin: 22, rainfallMm: 0.0, humidity: 50, windSpeed: 10, source: 'Recorded by Warangal Agromet Hub' },
        { date: '3 Days Ago', dayName: 'Sunday', condition: 'Sunny', icon: 'fa-sun', tempMax: 33, tempMin: 22, rainfallMm: 0.0, humidity: 52, windSpeed: 8, source: 'Recorded by Warangal Agromet Hub' },
        { date: '4 Days Ago', dayName: 'Saturday', condition: 'Passing Clouds', icon: 'fa-cloud-sun', tempMax: 33, tempMin: 22, rainfallMm: 0.0, humidity: 55, windSpeed: 11, source: 'Recorded by Warangal Agromet Hub' },
        { date: '5 Days Ago', dayName: 'Friday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 32, tempMin: 23, rainfallMm: 0.0, humidity: 58, windSpeed: 10, source: 'Recorded by Warangal Agromet Hub' },
      ],
    },
    Pune: {
      location: 'Pune Agromet Observatory',
      region: 'Pune District, Maharashtra',
      temperature: 28,
      condition: 'Partly Cloudy',
      icon: 'fa-cloud-sun',
      feelsLike: 29,
      tempMax: 31,
      tempMin: 20,
      humidity: 65,
      windSpeed: 11,
      windDirection: 'WNW',
      precipitationProbability: 20,
      uvIndex: 6,
      barometerHpa: 1013,
      airQualityIndex: 48,
      soilMoisturePct: 26,
      soilTemperatureC: 22.0,
      evapotranspirationMm: 4.2,
      sprayIndex: {
        score: 88,
        status: 'Optimal',
        recommendedWindow: '07:00 AM - 10:30 AM',
        advisory: 'Safe to spray. Mild wind (11 km/h) and moderate humidity provide good pesticide and nutrient foliar absorption.',
        isSafeToSpray: true,
        reasoning: 'Why this time is recommended: Stable wind speed below 12 km/h and rain probability under 20%. Temperatures remain moderate through the morning.',
      },
      irrigationAdvisory: 'Soil water is at 26% (adequate level). Normal moisture retained in sugarcane, onion, and vegetable beds. Irrigate moderately according to scheduled rotation.',
      harvestSuitability: {
        score: 88,
        verdict: 'Good harvest window. Moderate humidity allows smooth harvesting of onions, tomatoes, and vegetables.',
      },
      forecast7Day: [
        { date: 'Today', dayName: 'Wednesday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 31, tempMin: 20, rainProb: 20, windSpeed: 11, advisory: 'Optimal foliar nutrition spray' },
        { date: 'Tomorrow', dayName: 'Thursday', condition: 'Scattered Clouds', icon: 'fa-cloud-sun', tempMax: 30, tempMin: 20, rainProb: 30, windSpeed: 12, advisory: 'Monitor onion thrips' },
        { date: 'Day 3', dayName: 'Friday', condition: 'Passing Shower', icon: 'fa-cloud-sun-rain', tempMax: 29, tempMin: 19, rainProb: 40, windSpeed: 13, advisory: 'Check field drainage' },
        { date: 'Day 4', dayName: 'Saturday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 30, tempMin: 19, rainProb: 20, windSpeed: 10, advisory: 'Safe for tractor ploughing' },
        { date: 'Day 5', dayName: 'Sunday', condition: 'Sunny & Clear', icon: 'fa-sun', tempMax: 32, tempMin: 20, rainProb: 10, windSpeed: 8, advisory: 'Vegetable picking day' },
        { date: 'Day 6', dayName: 'Monday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 32, tempMin: 20, rainProb: 5, windSpeed: 9, advisory: 'Ideal for sugarcane weeding' },
        { date: 'Day 7', dayName: 'Tuesday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 31, tempMin: 21, rainProb: 15, windSpeed: 10, advisory: 'Regular orchard inspection' },
      ],
      pastWeatherRecords: [
        { date: 'Yesterday', dayName: 'Tuesday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 30, tempMin: 20, rainfallMm: 0.0, humidity: 66, windSpeed: 10, source: 'Recorded by Pune Agromet Observatory' },
        { date: '2 Days Ago', dayName: 'Monday', condition: 'Sunny Intervals', icon: 'fa-cloud-sun', tempMax: 31, tempMin: 19, rainfallMm: 0.0, humidity: 62, windSpeed: 11, source: 'Recorded by Pune Agromet Observatory' },
        { date: '3 Days Ago', dayName: 'Sunday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 31, tempMin: 19, rainfallMm: 0.0, humidity: 60, windSpeed: 9, source: 'Recorded by Pune Agromet Observatory' },
        { date: '4 Days Ago', dayName: 'Saturday', condition: 'Light Drizzle', icon: 'fa-cloud-sun-rain', tempMax: 29, tempMin: 20, rainfallMm: 2.1, humidity: 72, windSpeed: 12, source: 'Recorded by Pune Agromet Observatory' },
        { date: '5 Days Ago', dayName: 'Friday', condition: 'Overcast', icon: 'fa-cloud', tempMax: 29, tempMin: 20, rainfallMm: 4.5, humidity: 75, windSpeed: 13, source: 'Recorded by Pune Agromet Observatory' },
      ],
    },
    Ludhiana: {
      location: 'Ludhiana Agromet Station',
      region: 'Ludhiana District, Punjab',
      temperature: 31,
      condition: 'Clear Sky & Dry',
      icon: 'fa-sun',
      feelsLike: 31,
      tempMax: 33,
      tempMin: 18,
      humidity: 42,
      windSpeed: 7,
      windDirection: 'NW',
      precipitationProbability: 0,
      uvIndex: 7,
      barometerHpa: 1015,
      airQualityIndex: 65,
      soilMoisturePct: 20,
      soilTemperatureC: 21.5,
      evapotranspirationMm: 4.5,
      sprayIndex: {
        score: 96,
        status: 'Optimal',
        recommendedWindow: '07:00 AM - 11:00 AM',
        advisory: 'Best possible spraying conditions. Very calm winds (7 km/h), completely dry air, and zero rain forecast for the entire week.',
        isSafeToSpray: true,
        reasoning: 'Why this time is recommended: Dry continental air with gentle 7 km/h breeze ensures pesticides and bio-fungicides dry quickly on wheat and paddy leaves without running off.',
      },
      irrigationAdvisory: 'Soil water is at 20% (moderate level). Continental dry air will steadily pull water from crops (4.5 mm/day). Schedule canal or tube-well irrigation over the next 2 days.',
      harvestSuitability: {
        score: 98,
        verdict: 'Perfect harvest conditions. Dry weather and zero rainfall make it ideal for running combine harvesters for paddy and wheat.',
      },
      forecast7Day: [
        { date: 'Today', dayName: 'Wednesday', condition: 'Clear Sky & Dry', icon: 'fa-sun', tempMax: 33, tempMin: 18, rainProb: 0, windSpeed: 7, advisory: 'Prime spraying & harvest day' },
        { date: 'Tomorrow', dayName: 'Thursday', condition: 'Sunny & Clear', icon: 'fa-sun', tempMax: 33, tempMin: 18, rainProb: 0, windSpeed: 8, advisory: 'Schedule tube-well irrigation' },
        { date: 'Day 3', dayName: 'Friday', condition: 'Sunny & Dry', icon: 'fa-sun', tempMax: 32, tempMin: 17, rainProb: 0, windSpeed: 7, advisory: 'Combine harvester friendly' },
        { date: 'Day 4', dayName: 'Saturday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 32, tempMin: 17, rainProb: 5, windSpeed: 8, advisory: 'Safe for zinc/urea spray' },
        { date: 'Day 5', dayName: 'Sunday', condition: 'Sunny', icon: 'fa-sun', tempMax: 33, tempMin: 18, rainProb: 0, windSpeed: 6, advisory: 'Fast field crop drying' },
        { date: 'Day 6', dayName: 'Monday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 33, tempMin: 18, rainProb: 0, windSpeed: 7, advisory: 'Wheat seed bed preparation' },
        { date: 'Day 7', dayName: 'Tuesday', condition: 'Sunny', icon: 'fa-sun', tempMax: 32, tempMin: 18, rainProb: 0, windSpeed: 8, advisory: 'Regular farm maintenance' },
      ],
      pastWeatherRecords: [
        { date: 'Yesterday', dayName: 'Tuesday', condition: 'Sunny & Clear', icon: 'fa-sun', tempMax: 33, tempMin: 18, rainfallMm: 0.0, humidity: 40, windSpeed: 7, source: 'Recorded by PAU Ludhiana Agromet Station' },
        { date: '2 Days Ago', dayName: 'Monday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 32, tempMin: 17, rainfallMm: 0.0, humidity: 44, windSpeed: 8, source: 'Recorded by PAU Ludhiana Agromet Station' },
        { date: '3 Days Ago', dayName: 'Sunday', condition: 'Sunny', icon: 'fa-sun', tempMax: 32, tempMin: 17, rainfallMm: 0.0, humidity: 42, windSpeed: 6, source: 'Recorded by PAU Ludhiana Agromet Station' },
        { date: '4 Days Ago', dayName: 'Saturday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 31, tempMin: 16, rainfallMm: 0.0, humidity: 45, windSpeed: 7, source: 'Recorded by PAU Ludhiana Agromet Station' },
        { date: '5 Days Ago', dayName: 'Friday', condition: 'Sunny & Dry', icon: 'fa-sun', tempMax: 31, tempMin: 16, rainfallMm: 0.0, humidity: 46, windSpeed: 8, source: 'Recorded by PAU Ludhiana Agromet Station' },
      ],
    },
    Salem: {
      location: 'Salem Agri Weather Station',
      region: 'Salem District, Tamil Nadu',
      temperature: 32,
      condition: 'Sunny & Dry',
      icon: 'fa-sun',
      feelsLike: 35,
      tempMax: 35,
      tempMin: 24,
      humidity: 54,
      windSpeed: 11,
      windDirection: 'E',
      precipitationProbability: 5,
      uvIndex: 8,
      barometerHpa: 1010,
      airQualityIndex: 52,
      soilMoisturePct: 18,
      soilTemperatureC: 25.0,
      evapotranspirationMm: 5.6,
      sprayIndex: {
        score: 88,
        status: 'Optimal',
        recommendedWindow: '06:00 AM - 09:30 AM',
        advisory: 'Spray early in the morning before heat rises above 32°C to prevent spray evaporation.',
        isSafeToSpray: true,
        reasoning: 'Why this time is recommended: Morning wind is moderate (11 km/h) and skies are completely dry. Finishing before 9:30 AM protects plants from spray burn during hot sun.',
      },
      irrigationAdvisory: 'Soil water is low (18%). Run drip irrigation for 90 minutes during early morning hours.',
      harvestSuitability: {
        score: 96,
        verdict: 'Prime harvest weather. Zero rain probability for 4 days.',
      },
      forecast7Day: [
        { date: 'Today', dayName: 'Wednesday', condition: 'Sunny', icon: 'fa-sun', tempMax: 35, tempMin: 24, rainProb: 5, windSpeed: 11, advisory: 'Apply morning drip irrigation' },
        { date: 'Tomorrow', dayName: 'Thursday', condition: 'Sunny', icon: 'fa-sun', tempMax: 36, tempMin: 25, rainProb: 10, windSpeed: 12, advisory: 'Shade young saplings' },
        { date: 'Day 3', dayName: 'Friday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 34, tempMin: 24, rainProb: 25, windSpeed: 10, advisory: 'Tractor land prep optimal' },
        { date: 'Day 4', dayName: 'Saturday', condition: 'Passing Shower', icon: 'fa-cloud-sun-rain', tempMax: 32, tempMin: 23, rainProb: 45, windSpeed: 13, advisory: 'Check soil moisture' },
        { date: 'Day 5', dayName: 'Sunday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 34, tempMin: 23, rainProb: 10, windSpeed: 8, advisory: 'Ideal harvesting conditions' },
        { date: 'Day 6', dayName: 'Monday', condition: 'Sunny', icon: 'fa-sun', tempMax: 35, tempMin: 24, rainProb: 5, windSpeed: 9, advisory: 'Pest monitoring recommended' },
        { date: 'Day 7', dayName: 'Tuesday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 34, tempMin: 24, rainProb: 15, windSpeed: 11, advisory: 'Foliar nutrition spray' },
      ],
      pastWeatherRecords: [
        { date: 'Yesterday', dayName: 'Tuesday', condition: 'Sunny', icon: 'fa-sun', tempMax: 35, tempMin: 24, rainfallMm: 0.0, humidity: 52, windSpeed: 10, source: 'Recorded by Salem Agri Weather Station' },
        { date: '2 Days Ago', dayName: 'Monday', condition: 'Sunny', icon: 'fa-sun', tempMax: 34, tempMin: 23, rainfallMm: 0.0, humidity: 55, windSpeed: 11, source: 'Recorded by Salem Agri Weather Station' },
        { date: '3 Days Ago', dayName: 'Sunday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 34, tempMin: 23, rainfallMm: 0.0, humidity: 56, windSpeed: 9, source: 'Recorded by Salem Agri Weather Station' },
        { date: '4 Days Ago', dayName: 'Saturday', condition: 'Passing Clouds', icon: 'fa-cloud-sun', tempMax: 33, tempMin: 23, rainfallMm: 0.0, humidity: 60, windSpeed: 12, source: 'Recorded by Salem Agri Weather Station' },
        { date: '5 Days Ago', dayName: 'Friday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 33, tempMin: 24, rainfallMm: 1.5, humidity: 62, windSpeed: 10, source: 'Recorded by Salem Agri Weather Station' },
      ],
    },
  };

  private readonly alertsList: WeatherAlert[] = [
    {
      id: 'WA-001',
      severity: 'WARNING',
      title: 'Thunderstorm & Gusty Winds Advisory',
      description: 'IMD Agromet warning: Moderate thunderstorms with wind gusts up to 35 km/h expected in southern western ghats regions (Kerala & Western TN).',
      issuedBy: 'India Meteorological Department (Agromet Advisory Services)',
      region: 'Kerala & Western Tamil Nadu',
      validUntil: 'Tomorrow, 08:00 PM',
      farmerAction: 'Clear standing water in field drains, stake tall banana and tomato plants, and postpone all drone spraying.',
    },
    {
      id: 'WA-002',
      severity: 'ADVISORY',
      title: 'High Moisture & Fungal Blight Risk',
      description: 'Relative humidity consistently exceeding 80% creates high risk for Early Blight in Tomato and Downy Mildew in vegetable crops.',
      issuedBy: 'State Agricultural University Extension Cell',
      region: 'Kerala, South Karnataka & Western Ghats',
      validUntil: 'Valid for next 5 days',
      farmerAction: 'Inspect crop leaves for yellow or black spots. Spray bio-fungicide once skies clear during the recommended morning window.',
    },
    {
      id: 'WA-003',
      severity: 'INFO',
      title: 'Optimal Harvesting & Sowing Window',
      description: 'North interior zones (Punjab, Telangana, Andhra Plains) forecast dry sunny weather with gentle winds. Ideal for combine harvesters and field preparation.',
      issuedBy: 'National Agrometeorological Service',
      region: 'Punjab, Telangana & Andhra Pradesh Plains',
      validUntil: 'Valid for next 7 days',
      farmerAction: 'Run combine harvesters and dry harvested grains under open sunlight without fear of sudden rain.',
    },
  ];

  private readonly predefinedIndianCities: CitySearchResult[] = [
    { id: 1, name: 'Coimbatore', state: 'Tamil Nadu', country: 'India', latitude: 11.0055, longitude: 76.9661 },
    { id: 2, name: 'Chennai', state: 'Tamil Nadu', country: 'India', latitude: 13.0827, longitude: 80.2707 },
    { id: 3, name: 'Madurai', state: 'Tamil Nadu', country: 'India', latitude: 9.9252, longitude: 78.1198 },
    { id: 4, name: 'Salem', state: 'Tamil Nadu', country: 'India', latitude: 11.6643, longitude: 78.1460 },
    { id: 5, name: 'Tiruchirappalli', state: 'Tamil Nadu', country: 'India', latitude: 10.7905, longitude: 78.7047 },
    { id: 6, name: 'Thanjavur', state: 'Tamil Nadu', country: 'India', latitude: 10.7870, longitude: 79.1378 },
    { id: 7, name: 'Erode', state: 'Tamil Nadu', country: 'India', latitude: 11.3410, longitude: 77.7172 },
    { id: 8, name: 'Palakkad', state: 'Kerala', country: 'India', latitude: 10.7867, longitude: 76.6548 },
    { id: 9, name: 'Kochi', state: 'Kerala', country: 'India', latitude: 9.9312, longitude: 76.2673 },
    { id: 10, name: 'Bengaluru', state: 'Karnataka', country: 'India', latitude: 12.9716, longitude: 77.5946 },
    { id: 11, name: 'Mysuru', state: 'Karnataka', country: 'India', latitude: 12.2958, longitude: 76.6394 },
    { id: 12, name: 'Guntur', state: 'Andhra Pradesh', country: 'India', latitude: 16.3067, longitude: 80.4365 },
    { id: 13, name: 'Vijayawada', state: 'Andhra Pradesh', country: 'India', latitude: 16.5062, longitude: 80.6480 },
    { id: 14, name: 'Warangal', state: 'Telangana', country: 'India', latitude: 17.9689, longitude: 79.5941 },
    { id: 15, name: 'Hyderabad', state: 'Telangana', country: 'India', latitude: 17.3850, longitude: 78.4867 },
    { id: 16, name: 'Pune', state: 'Maharashtra', country: 'India', latitude: 18.5204, longitude: 73.8567 },
    { id: 17, name: 'Nashik', state: 'Maharashtra', country: 'India', latitude: 19.9975, longitude: 73.7898 },
    { id: 18, name: 'Nagpur', state: 'Maharashtra', country: 'India', latitude: 21.1458, longitude: 79.0882 },
    { id: 19, name: 'Ludhiana', state: 'Punjab', country: 'India', latitude: 30.9010, longitude: 75.8573 },
    { id: 20, name: 'Amritsar', state: 'Punjab', country: 'India', latitude: 31.6340, longitude: 74.8723 },
    { id: 21, name: 'Delhi', state: 'Delhi', country: 'India', latitude: 28.6139, longitude: 77.2090 },
    { id: 22, name: 'Lucknow', state: 'Uttar Pradesh', country: 'India', latitude: 26.8467, longitude: 80.9462 },
    { id: 23, name: 'Jaipur', state: 'Rajasthan', country: 'India', latitude: 26.9124, longitude: 75.7873 },
    { id: 24, name: 'Bhopal', state: 'Madhya Pradesh', country: 'India', latitude: 23.2599, longitude: 77.4126 },
  ];

  private readonly liveWeatherCache = new Map<string, { data: WeatherCondition; timestamp: number }>();
  private readonly searchCache = new Map<string, { data: CitySearchResult[]; timestamp: number }>();

  getWeather(region = 'Coimbatore'): WeatherCondition {
    const q = (region || 'Coimbatore').trim().toLowerCase();

    // Map keywords or states to primary regional hubs
    if (q.includes('kerala') || q.includes('palakkad')) return this.regionsData['Palakkad'];
    if (q.includes('punjab') || q.includes('ludhiana')) return this.regionsData['Ludhiana'];
    if (q.includes('telangana') || q.includes('warangal')) return this.regionsData['Warangal'];
    if (q.includes('andhra') || q.includes('guntur')) return this.regionsData['Guntur'];
    if (q.includes('maharashtra') || q.includes('pune')) return this.regionsData['Pune'];
    if (q.includes('karnataka') || q.includes('bengaluru')) return this.regionsData['Bengaluru Rural'];
    if (q.includes('salem')) return this.regionsData['Salem'];
    if (q.includes('tamil') || q.includes('coimbatore')) return this.regionsData['Coimbatore'];

    const key = Object.keys(this.regionsData).find(
      (k) => k.toLowerCase() === q
    ) || 'Coimbatore';
    return this.regionsData[key];
  }

  getWeatherAlerts(region?: string): WeatherAlert[] {
    if (!region) return this.alertsList;
    const q = region.toLowerCase();
    return this.alertsList.filter(
      (a) => a.region.toLowerCase().includes(q) || a.severity === 'WARNING'
    );
  }

  getAvailableRegions(): string[] {
    return [
      'Coimbatore',
      'Palakkad',
      'Bengaluru Rural',
      'Guntur',
      'Warangal',
      'Pune',
      'Ludhiana',
    ];
  }

  async searchCities(query: string): Promise<CitySearchResult[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) return this.predefinedIndianCities.slice(0, 8);

    const cacheKey = trimmed.toLowerCase();
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
      return cached.data;
    }

    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=10&language=en&format=json`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results) && data.results.length > 0) {
          // Prioritize Indian cities
          const indianFirst = data.results.sort((a: any, b: any) => {
            if (a.country_code === 'IN' && b.country_code !== 'IN') return -1;
            if (a.country_code !== 'IN' && b.country_code === 'IN') return 1;
            return 0;
          });

          const mapped: CitySearchResult[] = indianFirst.map((r: any) => ({
            id: r.id,
            name: r.name,
            state: r.admin1 || r.country || '',
            country: r.country || 'India',
            latitude: r.latitude,
            longitude: r.longitude,
            timezone: r.timezone,
          }));

          this.searchCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
          return mapped;
        }
      }
    } catch (err) {
      // Fallback to local offline catalog
    }

    const matchedLocal = this.predefinedIndianCities.filter(
      (c) =>
        c.name.toLowerCase().includes(cacheKey) ||
        c.state.toLowerCase().includes(cacheKey)
    );

    return matchedLocal.length > 0 ? matchedLocal : [];
  }

  async getLiveWeather(
    latitude: number,
    longitude: number,
    cityName = 'Coimbatore',
    stateName = 'Tamil Nadu'
  ): Promise<WeatherCondition> {
    const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const cached = this.liveWeatherCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      return { ...cached.data, cached: true };
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=7`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const raw = await res.json();
        const cur = raw.current || {};
        const daily = raw.daily || {};
        const hourly = raw.hourly || {};

        const temp = Math.round(cur.temperature_2m || 30);
        const feels = Math.round(cur.apparent_temperature || temp);
        const humidity = Math.round(cur.relative_humidity_2m || 60);
        const windSpeed = Math.round(cur.wind_speed_10m || 8);
        const windDirDeg = cur.wind_direction_10m || 90;
        const windDirection = this.degreesToCompass(windDirDeg);
        const rainProb = Math.round(daily.precipitation_probability_max?.[0] || 15);
        const tempMax = Math.round(daily.temperature_2m_max?.[0] || temp + 3);
        const tempMin = Math.round(daily.temperature_2m_min?.[0] || temp - 6);
        const pressure = Math.round(cur.surface_pressure || 1010);
        const uv = Math.round(daily.uv_index_max?.[0] || 6);
        const rainfallMm = Number((cur.precipitation || cur.rain || 0).toFixed(1));

        const decoded = this.decodeWmoWeather(cur.weather_code || 1);
        const advice = this.computeFarmingAdvice(temp, windSpeed, rainProb, humidity);

        // 7-day forecast
        const forecast7Day = (daily.time || []).map((dateStr: string, idx: number) => {
          const d = new Date(dateStr);
          const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
          const code = daily.weather_code?.[idx] || 1;
          const wInfo = this.decodeWmoWeather(code);
          const dRain = Math.round(daily.precipitation_probability_max?.[idx] || 0);
          const dHigh = Math.round(daily.temperature_2m_max?.[idx] || 32);
          const dLow = Math.round(daily.temperature_2m_min?.[idx] || 22);
          const dWind = Math.round(daily.wind_speed_10m_max?.[idx] || 10);

          let tag = 'Safe to Spray';
          if (dRain > 60) tag = 'Heavy Rain • Clear Drains';
          else if (dRain > 35) tag = 'Rain Likely • Avoid Spray';
          else if (dWind > 15) tag = 'High Wind • Drift Risk';
          else if (dHigh > 35) tag = 'Hot Sun • Morning Drip';
          else if (dRain < 15) tag = 'Dry • Good Harvest Day';

          return {
            date: dateStr,
            dayName: idx === 0 ? 'Today' : (idx === 1 ? 'Tomorrow' : dayName),
            condition: wInfo.condition,
            icon: wInfo.icon,
            tempMax: dHigh,
            tempMin: dLow,
            rainProb: dRain,
            windSpeed: dWind,
            advisory: tag,
          };
        });

        // Next 24 hours hourly
        const next24Hours: Array<{
          time: string;
          temp: number;
          rainProb: number;
          windSpeed: number;
          condition: string;
          icon: string;
        }> = [];
        if (Array.isArray(hourly.time)) {
          const nowIso = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
          let startIdx = hourly.time.findIndex((t: string) => t.startsWith(nowIso));
          if (startIdx < 0) startIdx = 0;

          for (let i = startIdx; i < Math.min(startIdx + 24, hourly.time.length); i++) {
            const hTimeStr = hourly.time[i];
            const hDate = new Date(hTimeStr);
            const formattedHour = hDate.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
            const hCode = hourly.weather_code?.[i] || 1;
            const hInfo = this.decodeWmoWeather(hCode);

            next24Hours.push({
              time: formattedHour,
              temp: Math.round(hourly.temperature_2m?.[i] || temp),
              rainProb: Math.round(hourly.precipitation_probability?.[i] || 0),
              windSpeed: Math.round(hourly.wind_speed_10m?.[i] || windSpeed),
              condition: hInfo.condition,
              icon: hInfo.icon,
            });
          }
        }

        const nowFormatted = new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });

        // 5-day past records (derived from previous daily data if available)
        const pastWeatherRecords = await this.getHistoricalWeather(latitude, longitude, undefined, undefined, 5);

        const conditionResult: WeatherCondition = {
          location: `${cityName} Agromet Observation`,
          region: `${cityName}${stateName ? ', ' + stateName : ''}`,
          temperature: temp,
          condition: decoded.condition,
          icon: decoded.icon,
          feelsLike: feels,
          tempMax,
          tempMin,
          humidity,
          windSpeed,
          windDirection,
          precipitationProbability: rainProb,
          uvIndex: uv,
          barometerHpa: pressure,
          airQualityIndex: 42,
          soilMoisturePct: Math.max(18, Math.min(32, 28 - Math.round(temp * 0.1) + Math.round(humidity * 0.1))),
          soilTemperatureC: Math.max(20, temp - 2),
          evapotranspirationMm: Number((temp * 0.12 + windSpeed * 0.05).toFixed(1)),
          sprayIndex: advice.sprayIndex,
          irrigationAdvisory: advice.irrigationAdvisory,
          harvestSuitability: {
            score: rainProb < 20 && windSpeed < 15 ? 95 : 60,
            verdict: rainProb < 20 ? 'Optimal dry conditions for field harvest.' : 'Caution: Rain showers may affect harvested crop.',
          },
          forecast7Day,
          pastWeatherRecords,
          next24Hours,
          pressure,
          rainfallMm,
          sunrise: daily.sunrise?.[0] ? new Date(daily.sunrise[0]).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '06:05 AM',
          sunset: daily.sunset?.[0] ? new Date(daily.sunset[0]).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '06:15 PM',
          country: 'India',
          state: stateName,
          city: cityName,
          latitude,
          longitude,
          lastUpdated: `Today at ${nowFormatted}`,
          isLive: true,
          cached: false,
        };

        this.liveWeatherCache.set(cacheKey, { data: conditionResult, timestamp: Date.now() });
        return conditionResult;
      }
    } catch (err) {
      // Fallback
    }

    const fallback = this.getWeather(cityName);
    return {
      ...fallback,
      isLive: false,
      lastUpdated: 'Live provider unreachable — showing agromet regional baseline',
    };
  }

  async getLiveWeatherByCity(cityName: string): Promise<WeatherCondition> {
    const cleanName = (cityName || 'Coimbatore').trim();
    const cities = await this.searchCities(cleanName);
    const target = cities[0];
    if (!target) {
      throw new NotFoundException(`Could not find coordinates for city "${cleanName}". Please check the spelling or try another Indian city name.`);
    }
    return this.getLiveWeather(target.latitude, target.longitude, target.name, target.state);
  }

  async getHistoricalWeather(
    latitude: number,
    longitude: number,
    startDate?: string,
    endDate?: string,
    pastDays = 5
  ): Promise<any[]> {
    try {
      let url = '';
      if (startDate && endDate) {
        url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto`;
      } else {
        url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto&past_days=${pastDays}&forecast_days=1`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const raw = await res.json();
        const daily = raw.daily || {};
        const times: string[] = daily.time || [];
        const records: any[] = [];

        for (let i = 0; i < times.length; i++) {
          const dateStr = times[i];
          const d = new Date(dateStr);
          const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
          const code = daily.weather_code?.[i] || 1;
          const wInfo = this.decodeWmoWeather(code);

          records.push({
            date: dateStr,
            dayName,
            condition: wInfo.condition,
            icon: wInfo.icon,
            tempMax: Math.round(daily.temperature_2m_max?.[i] || 32),
            tempMin: Math.round(daily.temperature_2m_min?.[i] || 22),
            rainfallMm: Number((daily.precipitation_sum?.[i] || 0).toFixed(1)),
            humidity: 60,
            windSpeed: Math.round(daily.wind_speed_10m_max?.[i] || 10),
            source: 'Open-Meteo Historical Archive / Agromet Sensor Reanalysis',
          });
        }

        // Exclude today if it returned past_days + 1
        if (!startDate && records.length > pastDays) {
          return records.slice(0, pastDays);
        }
        return records;
      }
    } catch (e) {
      // Return regional fallback
    }

    return this.regionsData['Coimbatore'].pastWeatherRecords || [];
  }

  private decodeWmoWeather(code: number): { condition: string; icon: string } {
    switch (code) {
      case 0: return { condition: 'Clear Sky', icon: 'fa-sun' };
      case 1: return { condition: 'Mainly Clear', icon: 'fa-cloud-sun' };
      case 2: return { condition: 'Partly Cloudy', icon: 'fa-cloud-sun' };
      case 3: return { condition: 'Overcast', icon: 'fa-cloud' };
      case 45:
      case 48: return { condition: 'Foggy', icon: 'fa-smog' };
      case 51:
      case 53:
      case 55: return { condition: 'Light Drizzle', icon: 'fa-cloud-rain' };
      case 61:
      case 63: return { condition: 'Moderate Rain', icon: 'fa-cloud-showers-heavy' };
      case 65: return { condition: 'Heavy Rain', icon: 'fa-cloud-showers-heavy' };
      case 80:
      case 81: return { condition: 'Rain Showers', icon: 'fa-cloud-sun-rain' };
      case 82: return { condition: 'Violent Showers', icon: 'fa-cloud-showers-heavy' };
      case 95:
      case 96:
      case 99: return { condition: 'Thunderstorm', icon: 'fa-cloud-bolt' };
      default: return { condition: 'Passing Clouds', icon: 'fa-cloud-sun' };
    }
  }

  private degreesToCompass(deg: number): string {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round(deg / 22.5) % 16;
    return directions[idx];
  }

  private computeFarmingAdvice(temp: number, windSpeed: number, rainProb: number, humidity: number) {
    let sprayScore = 90;
    let isSafeToSpray = true;
    let status: 'Optimal' | 'Caution' | 'Unfavorable' = 'Optimal';
    const reasons: string[] = [];

    if (windSpeed > 15) {
      sprayScore -= 45;
      isSafeToSpray = false;
      status = 'Unfavorable';
      reasons.push(`High wind speed (${windSpeed} km/h) will blow spray droplets away, causing chemical drift and wastage.`);
    } else if (windSpeed > 12) {
      sprayScore -= 20;
      status = 'Caution';
      reasons.push(`Wind speed is moderate (${windSpeed} km/h). Use drift-reduction nozzles and spray close to crop canopy.`);
    } else {
      reasons.push(`Gentle winds (${windSpeed} km/h) are safe for even droplet deposition.`);
    }

    if (rainProb > 40) {
      sprayScore -= 45;
      isSafeToSpray = false;
      status = 'Unfavorable';
      reasons.push(`High rain probability (${rainProb}%) will wash pesticide droplets off leaves into field runoff.`);
    } else if (rainProb > 20) {
      sprayScore -= 15;
      if ((status as string) !== 'Unfavorable') status = 'Caution';
      reasons.push(`Chance of rain is ${rainProb}%. Allow at least 2 to 3 hours of dry weather for systemic absorption.`);
    } else {
      reasons.push(`Dry skies (${rainProb}% rain chance) ensure protective spray dries thoroughly on foliage.`);
    }

    if (temp > 30) {
      sprayScore -= 15;
      if (status === 'Optimal') status = 'Caution';
      reasons.push(`Temperature is warm (${temp}°C). Avoid spraying in peak noon heat to prevent droplet evaporation.`);
    } else {
      reasons.push(`Temperature (${temp}°C) is cool enough to prevent chemical volatilization.`);
    }

    sprayScore = Math.max(10, Math.min(100, sprayScore));

    const recommendedWindow = isSafeToSpray
      ? '06:30 AM - 10:30 AM'
      : 'Postpone — Spraying Unsafe Today';

    const advisory = isSafeToSpray
      ? `Calm winds (${windSpeed} km/h) and low rain risk (${rainProb}%). Favorable for bio-fungicides & liquid nutrients. Always follow chemical label guidelines.`
      : `Postpone spraying today due to ${windSpeed > 15 ? 'strong winds' : ''}${windSpeed > 15 && rainProb > 40 ? ' and ' : ''}${rainProb > 40 ? 'expected rain' : ''}. Check chemical product label directions.`;

    const reasoning = `Why this time is recommended: ${reasons.join(' ')}`;

    let irrigationAdvisory = '';
    if (rainProb > 50) {
      irrigationAdvisory = `High chance of rain (${rainProb}%). Hold off irrigation today to conserve water and prevent root waterlogging.`;
    } else if (temp > 33 && humidity < 50) {
      irrigationAdvisory = `Hot and dry conditions (${temp}°C, ${humidity}% humidity). Provide early morning drip irrigation to prevent crop heat stress.`;
    } else if (humidity > 80) {
      irrigationAdvisory = `High atmospheric humidity (${humidity}%). Soil evaporation is low; avoid overhead sprinkler watering to reduce fungal disease spread.`;
    } else {
      irrigationAdvisory = `Normal soil evaporation rate. Maintain standard scheduled irrigation according to crop growth stage.`;
    }

    return {
      sprayIndex: {
        score: sprayScore,
        status,
        recommendedWindow,
        advisory,
        isSafeToSpray,
        reasoning,
      },
      irrigationAdvisory,
    };
  }
}
