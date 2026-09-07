import {
  Controller, Get, Put, Post, Delete,
  Body, Param, UseGuards, Request,
} from '@nestjs/common';
import { FarmersService } from './farmers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('farmers')
export class FarmersController {
  constructor(private readonly farmersService: FarmersService) {}

  // ── Profile
  @Get('profile')
  getProfile(@Request() req: any) {
    return this.farmersService.getProfile(req.user.sub);
  }

  @Put('profile')
  updateProfile(@Request() req: any, @Body() dto: any) {
    return this.farmersService.updateProfile(req.user.sub, dto);
  }

  // ── Farms
  @Get('farms')
  getFarms(@Request() req: any) {
    return this.farmersService.getFarms(req.user.sub);
  }

  @Post('farms')
  createFarm(@Request() req: any, @Body() dto: any) {
    return this.farmersService.createFarm(req.user.sub, dto);
  }

  @Put('farms/:id')
  updateFarm(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.farmersService.updateFarm(req.user.sub, id, dto);
  }

  // ── Crops
  @Get('crops')
  getCrops(@Request() req: any) {
    return this.farmersService.getCrops(req.user.sub);
  }

  @Post('crops')
  createCrop(@Request() req: any, @Body() dto: any) {
    return this.farmersService.createCrop(req.user.sub, dto);
  }

  @Put('crops/:id')
  updateCrop(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.farmersService.updateCrop(req.user.sub, id, dto);
  }

  @Delete('crops/:id')
  deleteCrop(@Request() req: any, @Param('id') id: string) {
    return this.farmersService.deleteCrop(req.user.sub, id);
  }

  // ── Contracts
  @Get('contracts')
  getContracts(@Request() req: any) {
    return this.farmersService.getContracts(req.user.sub);
  }

  // ── Disease Scans
  @Get('disease-scans')
  getDiseaseScans(@Request() req: any) {
    return this.farmersService.getDiseaseScans(req.user.sub);
  }

  @Post('disease-scans')
  createDiseaseScan(@Request() req: any, @Body() dto: any) {
    return this.farmersService.createDiseaseScan(req.user.sub, dto);
  }

  // ── AI Recommendations
  @Get('ai-recommendations')
  getAIRecommendations(@Request() req: any) {
    return this.farmersService.getAIRecommendations(req.user.sub);
  }

  @Post('ai-recommendations')
  createAIRecommendation(@Request() req: any, @Body() dto: any) {
    return this.farmersService.createAIRecommendation(req.user.sub, dto);
  }
}
