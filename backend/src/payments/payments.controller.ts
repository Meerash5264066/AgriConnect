import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create')
  create(@Body() dto: any) {
    return this.paymentsService.createPayment(dto);
  }

  @Post('verify')
  verify(@Body() dto: any) {
    return this.paymentsService.verifyPayment(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.getPayment(id);
  }

  @Get('order/:orderId')
  byOrder(@Param('orderId') orderId: string) {
    return this.paymentsService.getPaymentByOrder(orderId);
  }

  @Get()
  all() {
    return this.paymentsService.getAllPayments();
  }
}
