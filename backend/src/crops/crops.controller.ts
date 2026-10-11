import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CropsService } from './crops.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateCropDto } from './dto/create-crop.dto';
import { UpdateCropDto } from './dto/update-crop.dto';

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

  @UseGuards(JwtAuthGuard)
  @Get('farmer/me')
  getMyCrops(@Request() req: any) {
    return this.cropsService.getFarmerCrops(req.user.sub);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.cropsService.getOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: any, @Body() dto: CreateCropDto) {
    return this.cropsService.create(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCropDto,
  ) {
    return this.cropsService.update(req.user.sub, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  delete(@Request() req: any, @Param('id') id: string) {
    return this.cropsService.delete(req.user.sub, id);
  }
}
