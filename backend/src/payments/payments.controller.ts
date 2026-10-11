import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // 1. Customer -> AgriConnect online payment
  @Post('create')
  create(@Body() dto: any) {
    return this.paymentsService.createPayment(dto);
  }

  @Post('checkout-session')
  createCheckoutSession(@Body() dto: { orderId: string; provider?: string }) {
    return this.paymentsService.createCheckoutSession(dto);
  }

  @Post('verify')
  verify(@Body() dto: any) {
    return this.paymentsService.verifyPayment(dto);
  }

  // 2. Buyer -> Farmer B2B Contract / Supply payment
  @Post('contract-supply')
  createContractSupplyPayment(@Body() dto: any) {
    return this.paymentsService.createContractSupplyPayment(dto);
  }

  @Get('contract/:contractId/ledger')
  getContractLedger(@Param('contractId') contractId: string) {
    return this.paymentsService.getContractPaymentLedger(contractId);
  }

  @Patch(':id/process-payout')
  processPayout(@Param('id') id: string, @Body() dto: { utrNumber?: string }) {
    return this.paymentsService.processSupplyPayout(id, dto?.utrNumber);
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
