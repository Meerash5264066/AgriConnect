import { Controller, Get, Query } from '@nestjs/common';
import { WeatherService } from './weather.service';

@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get('current')
  async getCurrent(
    @Query('region') region?: string,
    @Query('city') city?: string,
    @Query('live') live?: string
  ) {
    const target = (city || region || 'Coimbatore').trim();
    if (live === 'true') {
      return this.weatherService.getLiveWeatherByCity(target);
    }
    return this.weatherService.getWeather(target);
  }

  @Get('live')
  async getLive(
    @Query('city') city?: string,
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
    @Query('state') state?: string
  ) {
    if (lat && lon) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lon);
      if (!isNaN(latitude) && !isNaN(longitude)) {
        return this.weatherService.getLiveWeather(latitude, longitude, city || 'Local Area', state || '');
      }
    }
    return this.weatherService.getLiveWeatherByCity(city || 'Coimbatore');
  }

  @Get('search')
  async search(@Query('q') q?: string, @Query('city') city?: string) {
    const query = q || city || '';
    return this.weatherService.searchCities(query);
  }

  @Get('historical')
  async getHistorical(
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
    @Query('city') city?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('days') days?: string
  ) {
    let latitude = parseFloat(lat || '');
    let longitude = parseFloat(lon || '');

    if (isNaN(latitude) || isNaN(longitude)) {
      const cities = await this.weatherService.searchCities(city || 'Coimbatore');
      const target = cities[0];
      latitude = target ? target.latitude : 11.0055;
      longitude = target ? target.longitude : 76.9661;
    }

    const pastDays = days ? parseInt(days) : 5;
    return this.weatherService.getHistoricalWeather(latitude, longitude, startDate, endDate, pastDays);
  }

  @Get('alerts')
  getAlerts(@Query('region') region?: string) {
    return this.weatherService.getWeatherAlerts(region);
  }

  @Get('regions')
  getRegions() {
    return this.weatherService.getAvailableRegions();
  }
}
