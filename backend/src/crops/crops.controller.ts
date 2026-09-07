import { Controller, Get, Param, Query } from '@nestjs/common';
import { CropsService } from './crops.service';

@Controller('crops')
export class CropsController {
  constructor(private readonly cropsService: CropsService) {}

  @Get()
  getAll(
    @Query('cropName') cropName?: string,
    @Query('quality') quality?: string,
    @Query('location') location?: string,
  ) {
    return this.cropsService.getAll({ cropName, quality, location });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.cropsService.getOne(id);
  }
}
