import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  getBatches() {
    return this.inventoryService.getBatches();
  }

  @Get('summary')
  getSummary() {
    return this.inventoryService.getInventorySummary();
  }

  // Step 16: Farmer supplies crop to AgriConnect inventory
  @Post('receive')
  receiveSupply(@Body() dto: any) {
    return this.inventoryService.receiveSupply(dto);
  }

  @Put(':id')
  updateBatch(@Param('id') id: string, @Body() dto: any) {
    return this.inventoryService.updateBatch(id, dto);
  }
}
