import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProcurementService {
  constructor(private prisma: PrismaService) {}

  async createDemand(buyerUserId: string, dto: any) {
    const buyer = await this.prisma.buyer.findUnique({ where: { userId: buyerUserId } });
    if (!buyer) throw new NotFoundException('Buyer profile not found');

    return this.prisma.procurementDemand.create({
      data: {
        buyerId: buyer.id,
        cropName: dto.cropName,
        quantityKg: parseFloat(dto.quantityKg || dto.quantity || 0),
        expectedPrice: dto.expectedPrice ? parseFloat(dto.expectedPrice) : null,
        quality: dto.quality || 'Grade A',
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : null,
        duration: dto.duration || 'One-time',
        description: dto.description || null,
        isActive: true,
      },
      include: { buyer: true },
    });
  }

  async getAllDemands() {
    return this.prisma.procurementDemand.findMany({
      where: { isActive: true },
      include: { buyer: { select: { id: true, company: true, representative: true, warehouseAddress: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDemandById(id: string) {
    const demand = await this.prisma.procurementDemand.findUnique({
      where: { id },
      include: { buyer: true },
    });
    if (!demand) throw new NotFoundException('Procurement demand not found');
    return demand;
  }

  async updateDemand(buyerUserId: string, id: string, dto: any) {
    const buyer = await this.prisma.buyer.findUnique({ where: { userId: buyerUserId } });
    if (!buyer) throw new NotFoundException('Buyer profile not found');

    const demand = await this.prisma.procurementDemand.findUnique({ where: { id } });
    if (!demand) throw new NotFoundException('Procurement demand not found');

    return this.prisma.procurementDemand.update({
      where: { id },
      data: {
        cropName: dto.cropName,
        quantityKg: dto.quantityKg ? parseFloat(dto.quantityKg) : undefined,
        expectedPrice: dto.expectedPrice ? parseFloat(dto.expectedPrice) : undefined,
        quality: dto.quality,
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : undefined,
        duration: dto.duration,
        description: dto.description,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
    });
  }

  // Step 12 — Farmer Matching for a demand
  async matchFarmersForDemand(demandId: string) {
    const demand = await this.getDemandById(demandId);
    return this.findMatchingFarmers(demand.cropName, demand.quantityKg, demand.quality || undefined);
  }

  async findMatchingFarmers(cropName: string, requestedQtyKg: number, quality?: string) {
    // Find all ready crops matching the crop name
    const crops = await this.prisma.crop.findMany({
      where: {
        cropName: { equals: cropName, mode: 'insensitive' },
        status: 'READY',
        quantityKg: { gt: 0 },
        ...(quality ? { quality } : {}),
      },
      include: {
        farmer: {
          select: {
            id: true,
            name: true,
            phone: true,
            location: true,
            farmSize: true,
            soilType: true,
          },
        },
      },
      orderBy: { quantityKg: 'desc' },
    });

    let accumulatedQty = 0;
    const selectedMatches: any[] = [];

    for (const crop of crops) {
      if (accumulatedQty >= requestedQtyKg) break;
      const needed = requestedQtyKg - accumulatedQty;
      const allocated = Math.min(crop.quantityKg, needed);
      accumulatedQty += allocated;

      selectedMatches.push({
        cropId: crop.id,
        farmerId: crop.farmer.id,
        farmerName: crop.farmer.name,
        farmerLocation: crop.farmer.location,
        cropName: crop.cropName,
        quality: crop.quality,
        availableKg: crop.quantityKg,
        matchedKg: allocated,
        pricePerKg: crop.pricePerKg,
      });
    }

    const isFullyMatched = accumulatedQty >= requestedQtyKg;
    const shortfall = Math.max(0, requestedQtyKg - accumulatedQty);

    return {
      requestedCrop: cropName,
      requestedQuantityKg: requestedQtyKg,
      totalMatchedKg: accumulatedQty,
      isFullyMatched,
      shortfallKg: shortfall,
      matchedFarmersCount: selectedMatches.length,
      matches: selectedMatches,
    };
  }
}
