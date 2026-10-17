import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ProcurementService } from './procurement.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('procurement-demands')
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Get()
  getAllDemands() {
    return this.procurementService.getAllDemands();
  }

  @UseGuards(JwtAuthGuard)
  @Get('buyer/me')
  getMyDemands(@Request() req: any) {
    return this.procurementService.getBuyerDemands(req.user.sub);
  }

  @Get('match')
  matchDirect(
    @Query('cropName') cropName: string,
    @Query('quantityKg') quantityKg: string,
    @Query('quality') quality?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('location') location?: string,
  ) {
    return this.procurementService.findMatchingFarmers(
      cropName || 'Tomato',
      parseFloat(quantityKg || '5000'),
      quality,
      maxPrice ? parseFloat(maxPrice) : undefined,
      location,
    );
  }

  @Get(':id')
  getDemandById(@Param('id') id: string) {
    return this.procurementService.getDemandById(id);
  }

  @Get(':id/match')
  matchForDemand(@Param('id') id: string) {
    return this.procurementService.matchFarmersForDemand(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  createDemand(@Request() req: any, @Body() dto: any) {
    return this.procurementService.createDemand(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  updateDemand(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.procurementService.updateDemand(req.user.sub, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  deleteDemand(@Request() req: any, @Param('id') id: string) {
    return this.procurementService.deleteDemand(req.user.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/cancel')
  cancelDemandPatch(@Request() req: any, @Param('id') id: string) {
    return this.procurementService.deleteDemand(req.user.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  cancelDemandPost(@Request() req: any, @Param('id') id: string) {
    return this.procurementService.deleteDemand(req.user.sub, id);
  }
}
