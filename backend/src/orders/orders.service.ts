import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async createOrder(userId: string, dto: any) {
    let customer = await this.prisma.customer.findUnique({ where: { userId } });
    if (!customer) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
      customer = await this.prisma.customer.create({
        data: { userId, name: user.username },
      });
    }

    let items = dto.items;
    // If no items passed explicitly in dto, pull from customer's cart
    if (!items || !items.length) {
      const cart = await this.prisma.cart.findUnique({
        where: { customerId: customer.id },
        include: { items: { include: { product: true } } },
      });
      if (!cart || !cart.items.length) {
        throw new BadRequestException('Cannot checkout with an empty cart');
      }
      items = cart.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      }));
    }

    let totalAmount = 0;
    const orderItemsData: any[] = [];

    for (const item of items) {
      const product = await this.prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new NotFoundException(`Product ${item.productId} not found`);

      const qty = parseFloat(String(item.quantity || 1));
      if (product.stockQty !== null && product.stockQty < qty) {
        throw new BadRequestException(`Insufficient stock for ${product.name}. Available: ${product.stockQty}`);
      }

      const unitPrice = product.pricePerUnit;
      const subtotal = qty * unitPrice;
      totalAmount += subtotal;

      orderItemsData.push({
        productId: item.productId,
        productName: product.name,
        quantity: qty,
        unitPrice,
        subtotal,
      });

      // Deduct product stock
      await this.prisma.product.update({
        where: { id: product.id },
        data: { stockQty: { decrement: qty } },
      });

      // Deduct from FIFO inventory batches for this crop
      const batches = await this.prisma.inventoryBatch.findMany({
        where: {
          OR: [
            { productId: product.id },
            { cropName: { equals: product.name, mode: 'insensitive' } },
          ],
          isActive: true,
          remainingKg: { gt: 0 },
        },
        orderBy: { createdAt: 'asc' },
      });

      let remainingToDeduct = qty;
      for (const batch of batches) {
        if (remainingToDeduct <= 0) break;
        const deductFromBatch = Math.min(batch.remainingKg, remainingToDeduct);
        await this.prisma.inventoryBatch.update({
          where: { id: batch.id },
          data: { remainingKg: { decrement: deductFromBatch } },
        });
        remainingToDeduct -= deductFromBatch;
      }
    }

    // Add delivery fee if subtotal < 500
    const deliveryFee = totalAmount > 500 ? 0 : 40;
    totalAmount += deliveryFee;

    const order = await this.prisma.order.create({
      data: {
        customerId: customer.id,
        totalAmount,
        status: 'PLACED',
        deliveryAddr: dto.deliveryAddress || dto.deliveryAddr || customer.address || 'Standard Home Delivery',
        notes: dto.notes || null,
        items: {
          create: orderItemsData.map((d) => ({
            productId: d.productId,
            quantity: d.quantity,
            unitPrice: d.unitPrice,
            subtotal: d.subtotal,
          })),
        },
      },
      include: {
        items: { include: { product: true } },
        payment: true,
      },
    });

    // Clear cart
    const cart = await this.prisma.cart.findUnique({ where: { customerId: customer.id } });
    if (cart) {
      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }

    // Trigger Notification: Order placed / confirmed
    await this.prisma.notification.create({
      data: {
        userId,
        title: 'Order Confirmed',
        body: `Your order #${order.id.slice(0, 8)} of ₹${totalAmount} has been placed successfully!`,
        type: 'ORDER',
      },
    });

    return order;
  }

  async getOrders(userId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { userId } });
    if (!customer) return [];
    return this.prisma.order.findMany({
      where: { customerId: customer.id },
      include: {
        items: { include: { product: true } },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrderById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { product: true } },
        payment: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  // Step 19: Order status progression: PLACED -> CONFIRMED -> PACKED -> OUT_FOR_DELIVERY -> DELIVERED
  async updateOrderStatus(orderId: string, status: string) {
    const validStatuses = [
      'PLACED',
      'CONFIRMED',
      'PACKED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED',
    ];
    const upperStatus = status.toUpperCase();
    if (!validStatuses.includes(upperStatus)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: upperStatus as any },
      include: { customer: true },
    });

    // Send notifications on key delivery transitions
    let notifTitle = '';
    let notifBody = '';

    if (upperStatus === 'PACKED') {
      notifTitle = 'Order Packed';
      notifBody = `Your order #${order.id.slice(0, 8)} is packed and ready for dispatch.`;
    } else if (upperStatus === 'OUT_FOR_DELIVERY') {
      notifTitle = 'Order Out for Delivery';
      notifBody = `Your order #${order.id.slice(0, 8)} is on the way to ${order.deliveryAddr || 'your address'}!`;
    } else if (upperStatus === 'DELIVERED') {
      notifTitle = 'Order Delivered';
      notifBody = `Your order #${order.id.slice(0, 8)} has been successfully delivered. Enjoy your fresh produce!`;
    }

    if (notifTitle && order.customer?.userId) {
      await this.prisma.notification.create({
        data: {
          userId: order.customer.userId,
          title: notifTitle,
          body: notifBody,
          type: 'ORDER',
        },
      });
    }

    return order;
  }

  async getAllOrders() {
    return this.prisma.order.findMany({
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: { include: { product: true } },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
