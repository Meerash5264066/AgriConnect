import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // Step 16 — Receive crop supply into warehouse batch
  async receiveSupply(dto: {
    farmerId?: string;
    cropId?: string;
    cropName: string;
    quantityKg: number;
    pricePerKg?: number;
    warehouseLoc?: string;
    expiryDate?: string;
  }) {
    // Generate sequential batch code: Batch 001, Batch 002...
    const count = await this.prisma.inventoryBatch.count();
    const batchCode = `Batch ${String(count + 1).padStart(3, '0')}`;
    const qty = parseFloat(String(dto.quantityKg));

    // Ensure corresponding customer product exists and has updated stock
    let product = await this.prisma.product.findFirst({
      where: { name: { equals: dto.cropName, mode: 'insensitive' } },
    });

    if (!product) {
      // Default retail price markup of ~15-20% or default fallback
      const retailPrice = dto.pricePerKg ? Math.round(dto.pricePerKg * 1.15) : 35;
      product = await this.prisma.product.create({
        data: {
          name: dto.cropName,
          category: 'Vegetables',
          pricePerUnit: retailPrice,
          unit: 'kg',
          stockQty: qty,
          isActive: true,
        },
      });
    } else {
      await this.prisma.product.update({
        where: { id: product.id },
        data: { stockQty: { increment: qty } },
      });
    }

    // Create batch entry
    const batch = await this.prisma.inventoryBatch.create({
      data: {
        batchCode,
        farmerId: dto.farmerId || null,
        cropId: dto.cropId || null,
        cropName: dto.cropName,
        productId: product.id,
        quantityKg: qty,
        remainingKg: qty,
        pricePerKg: dto.pricePerKg ? parseFloat(String(dto.pricePerKg)) : null,
        warehouseLoc: dto.warehouseLoc || 'Main Central Warehouse',
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        isActive: true,
      },
      include: {
        farmer: { select: { id: true, name: true, location: true } },
        product: { select: { id: true, name: true, stockQty: true } },
      },
    });

    return {
      message: `Successfully received ${qty} kg of ${dto.cropName} into ${batchCode}`,
      batch,
    };
  }

  // Internal warehouse view (with batch details and farmer source)
  async getBatches() {
    return this.prisma.inventoryBatch.findMany({
      where: { isActive: true },
      include: {
        farmer: { select: { id: true, name: true, location: true } },
        product: { select: { id: true, name: true, stockQty: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Step 16 — Aggregated Inventory Summary (e.g. Total Tomato: 450 kg)
  async getInventorySummary() {
    const batches = await this.prisma.inventoryBatch.findMany({
      where: { isActive: true, remainingKg: { gt: 0 } },
    });

    const summaryMap: Record<string, { cropName: string; totalBatches: number; totalRemainingKg: number; warehouseLocations: Set<string> }> = {};

    for (const b of batches) {
      const name = b.cropName || 'Uncategorized';
      if (!summaryMap[name]) {
        summaryMap[name] = {
          cropName: name,
          totalBatches: 0,
          totalRemainingKg: 0,
          warehouseLocations: new Set(),
        };
      }
      summaryMap[name].totalBatches += 1;
      summaryMap[name].totalRemainingKg += b.remainingKg;
      if (b.warehouseLoc) summaryMap[name].warehouseLocations.add(b.warehouseLoc);
    }

    return Object.values(summaryMap).map((s) => ({
      cropName: s.cropName,
      totalBatches: s.totalBatches,
      totalRemainingKg: s.totalRemainingKg,
      warehouseLocations: Array.from(s.warehouseLocations),
    }));
  }

  async updateBatch(id: string, dto: any) {
    return this.prisma.inventoryBatch.update({
      where: { id },
      data: {
        remainingKg: dto.remainingKg ? parseFloat(dto.remainingKg) : undefined,
        warehouseLoc: dto.warehouseLoc,
        isActive: dto.isActive,
      },
    });
  }

  // Helper method used by Orders to deduct stock across FIFO batches
  async deductInventory(cropName: string, quantityToDeduct: number) {
    const batches = await this.prisma.inventoryBatch.findMany({
      where: {
        cropName: { equals: cropName, mode: 'insensitive' },
        isActive: true,
        remainingKg: { gt: 0 },
      },
      orderBy: { createdAt: 'asc' }, // FIFO
    });

    let remainingToDeduct = quantityToDeduct;
    for (const b of batches) {
      if (remainingToDeduct <= 0) break;
      const deductFromThis = Math.min(b.remainingKg, remainingToDeduct);
      await this.prisma.inventoryBatch.update({
        where: { id: b.id },
        data: { remainingKg: { decrement: deductFromThis } },
      });
      remainingToDeduct -= deductFromThis;
    }
  }
}
