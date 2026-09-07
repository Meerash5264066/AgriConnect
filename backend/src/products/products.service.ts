import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaultProducts();
  }

  // Auto-seed Tomato ₹35/kg, Onion ₹30/kg, Potato ₹28/kg per Step 17
  async seedDefaultProducts() {
    const defaultItems = [
      { name: 'Tomato', pricePerUnit: 35, category: 'Vegetables', unit: 'kg', stockQty: 450, description: 'Farm fresh red ripe tomatoes' },
      { name: 'Onion', pricePerUnit: 30, category: 'Vegetables', unit: 'kg', stockQty: 600, description: 'High quality pungent red onions' },
      { name: 'Potato', pricePerUnit: 28, category: 'Vegetables', unit: 'kg', stockQty: 800, description: 'Freshly harvested earthy farm potatoes' },
    ];

    for (const item of defaultItems) {
      const existing = await this.prisma.product.findFirst({
        where: { name: { equals: item.name, mode: 'insensitive' } },
      });
      if (!existing) {
        await this.prisma.product.create({
          data: {
            name: item.name,
            pricePerUnit: item.pricePerUnit,
            category: item.category,
            unit: item.unit,
            stockQty: item.stockQty,
            description: item.description,
            isActive: true,
          },
        });
      }
    }
  }

  async findAll(category?: string) {
    return this.prisma.product.findMany({
      where: {
        isActive: true,
        ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.product.findUnique({ where: { id } });
  }

  async create(dto: any) {
    return this.prisma.product.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        category: dto.category || 'Vegetables',
        pricePerUnit: parseFloat(dto.pricePerUnit || dto.price || 0),
        unit: dto.unit || 'kg',
        stockQty: dto.stockQty ? parseFloat(dto.stockQty) : 0,
        imageUrl: dto.imageUrl || null,
        isActive: true,
      },
    });
  }

  async update(id: string, dto: any) {
    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        pricePerUnit: dto.pricePerUnit ? parseFloat(dto.pricePerUnit) : undefined,
        unit: dto.unit,
        stockQty: dto.stockQty ? parseFloat(dto.stockQty) : undefined,
        imageUrl: dto.imageUrl,
        isActive: dto.isActive,
      },
    });
  }
}
