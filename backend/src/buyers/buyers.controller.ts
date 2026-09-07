import {
  Controller, Get, Put, Post, Delete,
  Body, Param, UseGuards, Request,
} from '@nestjs/common';
import { BuyersService } from './buyers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('buyers')
export class BuyersController {
  constructor(private readonly buyersService: BuyersService) {}

  @Get('profile')
  getProfile(@Request() req: any) {
    return this.buyersService.getProfile(req.user.sub);
  }

  @Put('profile')
  updateProfile(@Request() req: any, @Body() dto: any) {
    return this.buyersService.updateProfile(req.user.sub, dto);
  }

  @Get('demands')
  getDemands(@Request() req: any) {
    return this.buyersService.getProcurementDemands(req.user.sub);
  }

  @Post('demands')
  createDemand(@Request() req: any, @Body() dto: any) {
    return this.buyersService.createProcurementDemand(req.user.sub, dto);
  }

  @Put('demands/:id')
  updateDemand(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.buyersService.updateProcurementDemand(req.user.sub, id, dto);
  }

  @Delete('demands/:id')
  deleteDemand(@Request() req: any, @Param('id') id: string) {
    return this.buyersService.deleteProcurementDemand(req.user.sub, id);
  }

  @Get('contracts')
  getContracts(@Request() req: any) {
    return this.buyersService.getContracts(req.user.sub);
  }

  @Post('contracts')
  createContract(@Request() req: any, @Body() dto: any) {
    return this.buyersService.createContract(req.user.sub, dto);
  }

  @Put('contracts/:id/status')
  updateContractStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.buyersService.updateContractStatus(id, status);
  }
}
