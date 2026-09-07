import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  private async getOrCreateCart(userId: string) {
    let customer = await this.prisma.customer.findUnique({ where: { userId } });
    if (!customer) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
      customer = await this.prisma.customer.create({
        data: {
          userId,
          name: user.username,
        },
      });
    }

    let cart = await this.prisma.cart.findUnique({
      where: { customerId: customer.id },
      include: {
        items: {
          include: { product: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { customerId: customer.id },
        include: {
          items: {
            include: { product: true },
          },
        },
      });
    }

    return cart;
  }

  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    const subtotal = cart.items.reduce(
      (sum, item) => sum + item.quantity * (item.priceSnap || item.product.pricePerUnit),
      0,
    );
    const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    return {
      cartId: cart.id,
      items: cart.items,
      subtotal,
      deliveryFee: subtotal > 500 ? 0 : 40,
      grandTotal: subtotal + (subtotal > 500 ? 0 : 40),
      totalItems,
    };
  }

  async addItem(userId: string, dto: { productId: string; quantity?: number }) {
    const cart = await this.getOrCreateCart(userId);
    const qty = parseFloat(String(dto.quantity || 1));

    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');

    const existingItem = await this.prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId: dto.productId },
    });

    if (existingItem) {
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: { increment: qty } },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          quantity: qty,
          priceSnap: product.pricePerUnit,
        },
      });
    }

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, quantity: number) {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });
    if (!item) throw new NotFoundException('Cart item not found');

    if (quantity <= 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
    } else {
      await this.prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity },
      });
    }

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cartId: cart.id },
    });
    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(userId);
  }
}
