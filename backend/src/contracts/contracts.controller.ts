import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post()
  createContract(@Request() req: any, @Body() dto: any) {
    return this.contractsService.createContract(req.user.sub, req.user.role, dto);
  }

  @Get()
  findAll() {
    return this.contractsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractsService.findOne(id);
  }

  @Patch(':id')
  updateContract(@Param('id') id: string, @Body() dto: any) {
    return this.contractsService.updateContract(id, dto);
  }

  // Step 14 — Farmer Actions
  @Post(':id/accept')
  acceptContract(@Request() req: any, @Param('id') id: string) {
    return this.contractsService.acceptContract(id, req.user.sub);
  }

  @Post(':id/reject')
  rejectContract(
    @Request() req: any,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.contractsService.rejectContract(id, req.user.sub, reason);
  }

  @Post(':id/negotiate')
  negotiateContract(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { proposedPrice?: number; proposedQuantity?: number; note?: string },
  ) {
    return this.contractsService.negotiateContract(id, req.user.sub, dto);
  }

  // Step 15 — Supply Tracking
  @Post(':id/supply')
  logSupply(@Param('id') id: string, @Body() dto: any) {
    return this.contractsService.logSupply(id, dto);
  }

  @Get(':id/supplies')
  getSupplies(@Param('id') id: string) {
    return this.contractsService.findOne(id).then((c) => c.supplies);
  }

  @Get(':id/supply-tracking')
  getSupplyTracking(@Param('id') id: string) {
    return this.contractsService.getSupplyTracking(id);
  }
}
