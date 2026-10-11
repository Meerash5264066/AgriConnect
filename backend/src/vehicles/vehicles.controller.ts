import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  getAll(@Query('category') category?: string) {
    return this.vehiclesService.getAllVehicles(category);
  }

  @Get('bookings/my')
  getMyBookings(@Query('farmerId') farmerId?: string) {
    return this.vehiclesService.getMyBookings(farmerId);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.vehiclesService.getVehicleById(id);
  }

  @Post('book')
  bookVehicle(@Body() dto: any) {
    return this.vehiclesService.bookVehicle(dto);
  }

  @Patch('bookings/:id/cancel')
  cancelBooking(@Param('id') id: string) {
    return this.vehiclesService.cancelBooking(id);
  }
}
