import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  // Step 20: Secure backend payment creation
  async createPayment(dto: {
    orderId?: string;
    contractId?: string;
    amount?: number;
    method?: string;
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
    };
  }

  // Step 20: Payment verification
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
