import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  getOrders(@Request() req: any) {
    return this.ordersService.getOrders(req.user.sub);
  }

  @Get('admin/all')
  getAllOrders(@Request() req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Admin role required to view all orders');
    }
    return this.ordersService.getAllOrders();
  }

  @Get(':id')
  getOrderById(@Request() req: any, @Param('id') id: string) {
    return this.ordersService.getOrderById(id, req.user?.sub, req.user?.role);
  }

  @Post()
  createOrder(@Request() req: any, @Body() dto: any) {
    return this.ordersService.createOrder(req.user.sub, dto);
  }

  @Patch(':id/status')
  patchStatus(@Request() req: any, @Param('id') id: string, @Body('status') status: string) {
    return this.ordersService.updateOrderStatus(id, status, req.user?.sub, req.user?.role);
  }

  @Put(':id/status')
  putStatus(@Request() req: any, @Param('id') id: string, @Body('status') status: string) {
    return this.ordersService.updateOrderStatus(id, status, req.user?.sub, req.user?.role);
  }
}
