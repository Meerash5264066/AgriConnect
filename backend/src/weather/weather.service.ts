import { Injectable } from '@nestjs/common';

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
      region: 'Tamil Nadu (Zone 1)',
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
        advisory: 'Wind velocity < 10 km/h and dry skies forecast for next 36 hours. Ideal for nano-urea & fungicide foliar spray.',
      },
      irrigationAdvisory: 'Soil moisture is currently at 24% (optimal vegetative band). Skip heavy irrigation today; light showers expected in 48 hours.',
      harvestSuitability: {
        score: 92,
        verdict: 'Excellent harvest window. Low humidity in afternoon facilitates field threshing and crop drying.',
      },
      forecast7Day: [
        { date: 'Today', dayName: 'Wednesday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 33, tempMin: 22, rainProb: 15, windSpeed: 8, advisory: 'Optimal spraying & weeding' },
        { date: 'Tomorrow', dayName: 'Thursday', condition: 'Scattered Showers', icon: 'fa-cloud-sun-rain', tempMax: 31, tempMin: 23, rainProb: 65, windSpeed: 14, advisory: 'Clear field drainage channels' },
        { date: '27 Sept', dayName: 'Friday', condition: 'Light Rain', icon: 'fa-cloud-rain', tempMax: 29, tempMin: 22, rainProb: 75, windSpeed: 16, advisory: 'Postpone chemical spray' },
        { date: '28 Sept', dayName: 'Saturday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 32, tempMin: 21, rainProb: 20, windSpeed: 10, advisory: 'Resume field operations' },
        { date: '29 Sept', dayName: 'Sunday', condition: 'Sunny & Clear', icon: 'fa-sun', tempMax: 34, tempMin: 21, rainProb: 10, windSpeed: 7, advisory: 'Ideal for tractor ploughing' },
        { date: '30 Sept', dayName: 'Monday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 34, tempMin: 22, rainProb: 5, windSpeed: 6, advisory: 'High solar drying efficiency' },
        { date: '01 Oct', dayName: 'Tuesday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 33, tempMin: 22, rainProb: 25, windSpeed: 9, advisory: 'Monitor nursery seedlings' },
      ],
    },
    Salem: {
      location: 'Salem Agri Weather Station',
      region: 'Tamil Nadu (Central)',
      temperature: 32,
      condition: 'Sunny',
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
        advisory: 'Spray early before temperature rises above 32°C to prevent droplet volatilization.',
      },
      irrigationAdvisory: 'Soil moisture low (18%). Run drip irrigation for 90 minutes in morning hours.',
      harvestSuitability: {
        score: 96,
        verdict: 'Prime harvest weather. Zero rain probability for 4 days.',
      },
      forecast7Day: [
        { date: 'Today', dayName: 'Wednesday', condition: 'Sunny', icon: 'fa-sun', tempMax: 35, tempMin: 24, rainProb: 5, windSpeed: 11, advisory: 'Apply morning drip irrigation' },
        { date: 'Tomorrow', dayName: 'Thursday', condition: 'Sunny', icon: 'fa-sun', tempMax: 36, tempMin: 25, rainProb: 10, windSpeed: 12, advisory: 'Shade young saplings' },
        { date: '27 Sept', dayName: 'Friday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 34, tempMin: 24, rainProb: 25, windSpeed: 10, advisory: 'Tractor land prep optimal' },
        { date: '28 Sept', dayName: 'Saturday', condition: 'Passing Shower', icon: 'fa-cloud-sun-rain', tempMax: 32, tempMin: 23, rainProb: 45, windSpeed: 13, advisory: 'Check soil moisture' },
        { date: '29 Sept', dayName: 'Sunday', condition: 'Clear Sky', icon: 'fa-sun', tempMax: 34, tempMin: 23, rainProb: 10, windSpeed: 8, advisory: 'Ideal harvesting conditions' },
        { date: '30 Sept', dayName: 'Monday', condition: 'Sunny', icon: 'fa-sun', tempMax: 35, tempMin: 24, rainProb: 5, windSpeed: 9, advisory: 'Pest monitoring recommended' },
        { date: '01 Oct', dayName: 'Tuesday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 34, tempMin: 24, rainProb: 15, windSpeed: 11, advisory: 'Foliar nutrition spray' },
      ],
    },
    Bengaluru: {
      location: 'Bengaluru Rural Agromet Center',
      region: 'Karnataka (South Interior)',
      temperature: 27,
      condition: 'Breezy & Overcast',
      icon: 'fa-cloud',
      feelsLike: 27,
      tempMax: 29,
      tempMin: 19,
      humidity: 74,
      windSpeed: 15,
      windDirection: 'WSW',
      precipitationProbability: 40,
      uvIndex: 5,
      barometerHpa: 1014,
      airQualityIndex: 38,
      soilMoisturePct: 28,
      soilTemperatureC: 21.0,
      evapotranspirationMm: 3.8,
      sprayIndex: {
        score: 65,
        status: 'Caution',
        recommendedWindow: '07:00 AM - 08:30 AM',
        advisory: 'Wind gusts reaching 18 km/h. Use drift-reduction nozzles if spraying fungicides.',
      },
      irrigationAdvisory: 'Adequate natural moisture. Drip systems can remain turned off.',
      harvestSuitability: {
        score: 75,
        verdict: 'Moderate. Ensure covered transport for harvested produce.',
      },
      forecast7Day: [
        { date: 'Today', dayName: 'Wednesday', condition: 'Overcast', icon: 'fa-cloud', tempMax: 29, tempMin: 19, rainProb: 40, windSpeed: 15, advisory: 'Maintain drainage paths' },
        { date: 'Tomorrow', dayName: 'Thursday', condition: 'Thunderstorm', icon: 'fa-cloud-bolt', tempMax: 27, tempMin: 19, rainProb: 80, windSpeed: 22, advisory: 'Protect open grain stock' },
        { date: '27 Sept', dayName: 'Friday', condition: 'Rain', icon: 'fa-cloud-showers-heavy', tempMax: 26, tempMin: 18, rainProb: 85, windSpeed: 18, advisory: 'No field tractor work' },
        { date: '28 Sept', dayName: 'Saturday', condition: 'Passing Showers', icon: 'fa-cloud-sun-rain', tempMax: 28, tempMin: 19, rainProb: 50, windSpeed: 14, advisory: 'Inspect for root rot' },
        { date: '29 Sept', dayName: 'Sunday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 29, tempMin: 19, rainProb: 30, windSpeed: 12, advisory: 'Weeding & staking' },
        { date: '30 Sept', dayName: 'Monday', condition: 'Sunny Intervals', icon: 'fa-cloud-sun', tempMax: 30, tempMin: 20, rainProb: 20, windSpeed: 10, advisory: 'Vegetable harvest ready' },
        { date: '01 Oct', dayName: 'Tuesday', condition: 'Partly Cloudy', icon: 'fa-cloud-sun', tempMax: 30, tempMin: 20, rainProb: 25, windSpeed: 11, advisory: 'General crop inspection' },
      ],
    },
  };

  private readonly alertsList: WeatherAlert[] = [
    {
      id: 'WA-001',
      severity: 'WARNING',
      title: 'Thunderstorm & Gusty Winds Yellow Alert',
      description: 'IMD Agromet warning for Coimbatore & adjacent western ghats: Moderate to heavy thunderstorm with lightning & wind gusts up to 35 km/h expected Thursday afternoon.',
      issuedBy: 'India Meteorological Department (Agromet Advisory Services)',
      region: 'Coimbatore District, TN',
      validUntil: 'Tomorrow, 08:00 PM',
      farmerAction: 'Clear standing field drainage furrows, stake tall tomato/banana plants, and postpone drone spraying operations.',
    },
    {
      id: 'WA-002',
      severity: 'ADVISORY',
      title: 'High Humidity Fungal Blight Risk',
      description: 'Morning relative humidity consistently exceeding 85% paired with night condensation creates high risk for Early Blight in Tomato and Downy Mildew in Cucurbits.',
      issuedBy: 'Tamil Nadu Agricultural University (TNAU) Extension Cell',
      region: 'Tamil Nadu & South Karnataka',
      validUntil: 'Valid for next 5 days',
      farmerAction: 'Spray prophylactic bio-fungicide (Trichoderma viride or Copper Oxychloride @ 2.5g/L) during morning window.',
    },
    {
      id: 'WA-003',
      severity: 'INFO',
      title: 'Optimal Wheat & Paddy Harvesting Window',
      description: 'North interior zones (Karnal, Punjab, MP) forecast dry continental air with sunshine duration of 9.2 hrs/day. Ideal for combine harvester operations.',
      issuedBy: 'National Agrometeorological Service',
      region: 'Northern & Central Plains',
      validUntil: 'Valid through 02 Oct 2026',
      farmerAction: 'Schedule wheat/paddy combine harvesters immediately to avoid post-harvest moisture retention.',
    },
  ];

  getWeather(region = 'Coimbatore'): WeatherCondition {
    const key = Object.keys(this.regionsData).find(
      (k) => k.toLowerCase() === region.toLowerCase()
    ) || 'Coimbatore';
    return this.regionsData[key];
  }

  getWeatherAlerts(region?: string): WeatherAlert[] {
    if (!region) return this.alertsList;
    return this.alertsList.filter(
      (a) => !region || a.region.toLowerCase().includes(region.toLowerCase()) || a.severity === 'WARNING'
    );
  }

  getAvailableRegions(): string[] {
    return Object.keys(this.regionsData);
  }
}
