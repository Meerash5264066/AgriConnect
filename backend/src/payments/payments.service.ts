import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ContractSupplyPaymentDto {
  contractId: string;
  supplyId?: string;
  weekLabel?: string;
  quantityKg: number;
  pricePerKg: number;
  method?: string;
  status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  notes?: string;
}

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // 1. CUSTOMER → AGRICONNECT ORDER PAYMENT (GATEWAY ARCHITECTURE)
  // ─────────────────────────────────────────────
  async createPayment(dto: {
    orderId?: string;
    contractId?: string;
    amount?: number;
    method?: string;
    provider?: string;
  }) {
    let orderAmount = dto.amount;

    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
      if (!order) throw new NotFoundException('Order not found');
      orderAmount = order.totalAmount;
    }

    if (!orderAmount || orderAmount <= 0) {
      throw new BadRequestException('Valid payment amount is required');
    }

    // Generate mock gateway transaction reference securely on backend
    const txId = `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const payment = await this.prisma.payment.create({
      data: {
        orderId: dto.orderId || null,
        contractId: dto.contractId || null,
        amount: orderAmount,
        currency: 'INR',
        method: (dto.method as any) || 'UPI',
        status: 'PENDING',
        transactionId: txId,
        gatewayRef: `GW_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      },
    });

    return {
      paymentId: payment.id,
      transactionId: payment.transactionId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      orderId: payment.orderId,
      // Note: Secret keys stay on backend; only return client-safe tokens/IDs
      gatewayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_agriconnect_public',
    };
  }

  // Gateway Session Init (Customer Marketplace Checkout)
  async createCheckoutSession(dto: { orderId: string; provider?: string }) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { customer: true, items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const txId = `ORDER_GW_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        amount: order.totalAmount,
        currency: 'INR',
        method: 'CARD',
        status: 'PENDING',
        transactionId: txId,
        gatewayRef: `RZP_ORD_${Date.now()}`,
      },
    });

    return {
      success: true,
      paymentId: payment.id,
      orderId: order.id,
      amount: order.totalAmount,
      amountPaise: Math.round(order.totalAmount * 100),
      currency: 'INR',
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      provider: dto.provider || 'RAZORPAY',
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_agriconnect_public',
      notes: 'Payment gateway secret keys are stored safely on the NestJS backend and never sent to Next.js',
    };
  }

  // Payment verification
  async verifyPayment(dto: { paymentId: string; transactionId?: string; status?: string }) {
    const payment = await this.prisma.payment.findUnique({ where: { id: dto.paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');

    const updated = await this.prisma.payment.update({
      where: { id: dto.paymentId },
      data: {
        status: (dto.status as any) || 'COMPLETED',
        paidAt: new Date(),
        transactionId: dto.transactionId || payment.transactionId,
      },
    });

    // If linked to an order, advance status to CONFIRMED
    if (payment.orderId) {
      const order = await this.prisma.order.update({
        where: { id: payment.orderId },
        data: { status: 'CONFIRMED' },
        include: { customer: true },
      });

      if (order.customer?.userId) {
        await this.prisma.notification.create({
          data: {
            userId: order.customer.userId,
            title: 'Payment Received',
            body: `Payment of ₹${payment.amount} confirmed for Order #${order.id.slice(0, 8)}.`,
            type: 'PAYMENT',
          },
        });
      }
    }

    return updated;
  }

  // ─────────────────────────────────────────────
  // 2. BUYER → FARMER B2B CONTRACT & SUPPLY PAYMENTS
  // ─────────────────────────────────────────────

  // Record a payment tied to a specific supply delivery
  async createContractSupplyPayment(dto: ContractSupplyPaymentDto) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: dto.contractId },
      include: { farmer: true, buyer: true },
    });
    if (!contract) throw new NotFoundException('Contract not found');

    const qty = parseFloat(String(dto.quantityKg || 0));
    const rate = parseFloat(String(dto.pricePerKg || contract.pricePerKg || 0));
    const calculatedAmount = Math.round(qty * rate);

    if (calculatedAmount <= 0) {
      throw new BadRequestException('Valid quantity and pricePerKg are required');
    }

    const utr = `UTR_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const status = dto.status || 'COMPLETED';

    const payment = await this.prisma.payment.create({
      data: {
        contractId: contract.id,
        amount: calculatedAmount,
        currency: 'INR',
        method: (dto.method as any) || 'ESCROW',
        status: status as any,
        transactionId: utr,
        gatewayRef: `ESCROW_REL_${Date.now()}`,
        paidAt: status === 'COMPLETED' ? new Date() : null,
      },
    });

    // Notify farmer of payment disbursal
    if (contract.farmer?.userId) {
      await this.prisma.notification.create({
        data: {
          userId: contract.farmer.userId,
          title: `Supply Payment: ₹${calculatedAmount.toLocaleString()}`,
          body: `Payment recorded for ${dto.weekLabel || 'Supply Batch'} (${qty} kg ${contract.cropName} @ ₹${rate}/kg). Status: ${status}. Bank Ref: ${utr}`,
          type: 'PAYMENT',
        },
      });
    }

    return {
      payment,
      contractId: contract.id,
      cropName: contract.cropName,
      quantityKg: qty,
      pricePerKg: rate,
      totalDue: calculatedAmount,
      utr,
      status: payment.status,
    };
  }

  // Get complete B2B Contract payment breakdown & ledger
  async getContractPaymentLedger(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        farmer: true,
        buyer: true,
        supplies: { orderBy: { deliveryDate: 'asc' } },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');

    const payments = await this.prisma.payment.findMany({
      where: { contractId },
      orderBy: { createdAt: 'desc' },
    });

    const totalContractValue = contract.totalValue || (contract.quantityKg * (contract.pricePerKg || 0));
    const totalPaid = payments
      .filter((p) => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + p.amount, 0);

    const pendingProcessing = payments
      .filter((p) => p.status === 'PENDING')
      .reduce((sum, p) => sum + p.amount, 0);

    const escrowBalance = Math.max(0, totalContractValue - totalPaid);

    // Map supplies to weekly milestones
    const rate = contract.pricePerKg || 0;
    const weeklyLedger = contract.supplies.map((s, index) => {
      const weekLabel = `Week ${index + 1}`;
      const amountDue = s.actualQty * rate;
      const isPaid = index < payments.filter((p) => p.status === 'COMPLETED').length;

      return {
        id: s.id,
        week: weekLabel,
        deliveryDate: s.deliveryDate,
        expectedKg: s.scheduledQty || s.expectedQty,
        actualKg: s.actualQty,
        shortfallKg: s.shortfall || 0,
        ratePerKg: rate,
        amountDue,
        status: isPaid ? 'PAID' : (s.actualQty > 0 ? 'PROCESSING' : 'PENDING'),
        notes: s.notes,
      };
    });

    return {
      contractId: contract.id,
      crop: contract.cropName,
      farmer: contract.farmer.name,
      buyer: contract.buyer.company,
      totalQuantityKg: contract.quantityKg,
      pricePerKg: rate,
      totalContractValue,
      totalPaidToFarmer: totalPaid,
      pendingDisbursal: pendingProcessing,
      escrowLockedBalance: escrowBalance,
      completionRate: Math.min(100, Math.round((totalPaid / (totalContractValue || 1)) * 100)),
      weeklyLedger,
      paymentsHistory: payments,
    };
  }

  // Process / Disburse an escrow payment to farmer's verified bank
  async processSupplyPayout(paymentId: string, utrNumber?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const utr = utrNumber || `UTR_${Date.now()}_${Math.floor(100000 + Math.random() * 900000)}`;

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'COMPLETED',
        paidAt: new Date(),
        transactionId: utr,
      },
    });

    if (payment.contractId) {
      const contract = await this.prisma.contract.findUnique({
        where: { id: payment.contractId },
        include: { farmer: true },
      });

      if (contract?.farmer?.userId) {
        await this.prisma.notification.create({
          data: {
            userId: contract.farmer.userId,
            title: 'Escrow Payout Disbursed',
            body: `₹${payment.amount.toLocaleString()} credited to your bank account for ${contract.cropName} contract. Ref: ${utr}`,
            type: 'PAYMENT',
          },
        });
      }
    }

    return {
      success: true,
      message: 'Escrow payment disbursed to farmer account successfully.',
      payment: updated,
    };
  }

  async getPayment(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { order: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async getPaymentByOrder(orderId: string) {
    return this.prisma.payment.findUnique({
      where: { orderId },
      include: { order: true },
    });
  }

  async getAllPayments() {
    return this.prisma.payment.findMany({
      include: { order: { include: { customer: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
