import { Controller, Get, Query } from '@nestjs/common';
import { WeatherService } from './weather.service';

@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get('current')
  getCurrent(@Query('region') region?: string) {
    return this.weatherService.getWeather(region || 'Coimbatore');
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
