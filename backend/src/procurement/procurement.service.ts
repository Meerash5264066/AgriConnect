import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProcurementService {
  constructor(private prisma: PrismaService) {}

  async createDemand(buyerUserId: string, dto: any) {
    const buyer = await this.prisma.buyer.findUnique({ where: { userId: buyerUserId } });
    if (!buyer) throw new NotFoundException('Buyer profile not found for authenticated user');

    const qty = parseFloat(String(dto.quantityKg || dto.quantity || 0));
    if (isNaN(qty) || qty <= 0) {
      throw new BadRequestException('quantityKg must be a positive number');
    }

    const price = dto.expectedPrice ? parseFloat(String(dto.expectedPrice)) : null;

    return this.prisma.procurementDemand.create({
      data: {
        buyerId: buyer.id,
        cropName: (dto.cropName || dto.crop).trim(),
        quantityKg: qty,
        expectedPrice: price,
        quality: dto.quality ? dto.quality.trim() : 'Grade A',
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : null,
        duration: dto.duration ? dto.duration.trim() : 'One-time',
        description: dto.description ? dto.description.trim() : null,
        isActive: true,
      },
      include: {
        buyer: {
          select: { id: true, company: true, representative: true, warehouseAddress: true, state: true },
        },
      },
    });
  }

  async getAllDemands() {
    return this.prisma.procurementDemand.findMany({
      where: { isActive: true },
      include: {
        buyer: {
          select: { id: true, company: true, representative: true, warehouseAddress: true, state: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBuyerDemands(buyerUserId: string) {
    const buyer = await this.prisma.buyer.findUnique({ where: { userId: buyerUserId } });
    if (!buyer) throw new NotFoundException('Buyer profile not found');

    return this.prisma.procurementDemand.findMany({
      where: { buyerId: buyer.id, isActive: true },
      include: {
        buyer: {
          select: { id: true, company: true, representative: true, warehouseAddress: true, state: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDemandById(id: string) {
    const demand = await this.prisma.procurementDemand.findUnique({
      where: { id },
      include: {
        buyer: {
          select: { id: true, company: true, representative: true, warehouseAddress: true, state: true },
        },
      },
    });
    if (!demand) throw new NotFoundException(`Procurement demand #${id} not found`);
    return demand;
  }

  async updateDemand(buyerUserId: string, id: string, dto: any) {
    const buyer = await this.prisma.buyer.findUnique({ where: { userId: buyerUserId } });
    if (!buyer) throw new NotFoundException('Buyer profile not found');

    const demand = await this.prisma.procurementDemand.findUnique({ where: { id } });
    if (!demand) throw new NotFoundException(`Procurement demand #${id} not found`);
    if (demand.buyerId !== buyer.id) {
      throw new ForbiddenException('You do not have permission to update this demand');
    }

    const qty = dto.quantityKg !== undefined ? parseFloat(String(dto.quantityKg)) : undefined;
    const price = dto.expectedPrice !== undefined ? parseFloat(String(dto.expectedPrice)) : undefined;

    return this.prisma.procurementDemand.update({
      where: { id },
      data: {
        cropName: dto.cropName ? dto.cropName.trim() : undefined,
        quantityKg: qty,
        expectedPrice: price,
        quality: dto.quality ? dto.quality.trim() : undefined,
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : undefined,
        duration: dto.duration ? dto.duration.trim() : undefined,
        description: dto.description !== undefined ? (dto.description ? dto.description.trim() : null) : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
      include: {
        buyer: {
          select: { id: true, company: true, representative: true, warehouseAddress: true, state: true },
        },
      },
    });
  }

  async deleteDemand(buyerUserId: string, id: string) {
    const buyer = await this.prisma.buyer.findUnique({ where: { userId: buyerUserId } });
    if (!buyer) throw new NotFoundException('Buyer profile not found');

    const demand = await this.prisma.procurementDemand.findUnique({ where: { id } });
    if (!demand) throw new NotFoundException(`Procurement demand #${id} not found`);
    if (demand.buyerId !== buyer.id) {
      throw new ForbiddenException('You do not have permission to cancel this demand');
    }

    if (!demand.isActive) {
      throw new BadRequestException('This purchase requirement has already been cancelled');
    }

    // Business rule: Verify if an incompatible active contract is ongoing
    if (this.prisma.contract && typeof this.prisma.contract.findFirst === 'function') {
      const activeContract = await this.prisma.contract.findFirst({
        where: {
          buyerId: buyer.id,
          cropName: { equals: demand.cropName, mode: 'insensitive' },
          status: { in: ['ACTIVE', 'ACCEPTED'] },
        },
        include: { supplies: true },
      });
      if (activeContract) {
        const supplies = activeContract.supplies || [];
        const totalSupplied = supplies.reduce((sum: number, s: any) => sum + (s.actualQty || 0), 0);
        const remaining = Math.max(0, (activeContract.quantityKg || 0) - totalSupplied);
        if (remaining > 0) {
          throw new BadRequestException(
            `Cannot cancel requirement: Active contract #${activeContract.id.substring(0, 8)} is currently ongoing for ${demand.cropName} (${remaining.toLocaleString()} kg remaining to supply). Fulfill or close the active contract first.`
          );
        }
      }
    }

    return this.prisma.procurementDemand.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Step 12 & Phase 17 — Multi-Farmer Matching for a demand
  async matchFarmersForDemand(demandId: string) {
    const demand = await this.getDemandById(demandId);
    return this.findMatchingFarmers(
      demand.cropName,
      demand.quantityKg,
      demand.quality || undefined,
      demand.expectedPrice || undefined,
      demand.buyer?.state || undefined,
    );
  }

  async findMatchingFarmers(
    cropName: string,
    requestedQtyKg: number,
    quality?: string,
    maxPrice?: number,
    location?: string,
  ) {
    if (!cropName || !cropName.trim()) {
      throw new BadRequestException('cropName is required for matching');
    }
    const targetQty = parseFloat(String(requestedQtyKg || 0));
    if (isNaN(targetQty) || targetQty <= 0) {
      throw new BadRequestException('requestedQuantityKg must be a positive number');
    }

    // Find all ready crops matching the crop name
    const crops = await this.prisma.crop.findMany({
      where: {
        cropName: { equals: cropName.trim(), mode: 'insensitive' },
        status: 'READY',
        quantityKg: { gt: 0 },
        ...(quality && quality !== 'All' ? { quality: { equals: quality.trim(), mode: 'insensitive' } } : {}),
        ...(maxPrice ? { pricePerKg: { lte: parseFloat(String(maxPrice)) } } : {}),
      },
      include: {
        farmer: {
          select: {
            id: true,
            name: true,
            phone: true,
            location: true,
            state: true,
            farmSize: true,
            soilType: true,
          },
        },
      },
      orderBy: { quantityKg: 'desc' },
    });

    // Optional sort by location match if specified
    const sortedCrops = [...crops];
    if (location && location.trim()) {
      const loc = location.trim().toLowerCase();
      sortedCrops.sort((a, b) => {
        const aLoc = (a.location || a.farmer.location || '').toLowerCase();
        const bLoc = (b.location || b.farmer.location || '').toLowerCase();
        const aMatch = aLoc.includes(loc) ? 1 : 0;
        const bMatch = bLoc.includes(loc) ? 1 : 0;
        return bMatch - aMatch; // exact/partial location matches first
      });
    }

    let accumulatedQty = 0;
    let accumulatedValue = 0;
    const selectedMatches: any[] = [];

    for (const crop of sortedCrops) {
      if (accumulatedQty >= targetQty) break;
      const needed = targetQty - accumulatedQty;
      const allocated = Math.min(crop.quantityKg, needed);
      accumulatedQty += allocated;

      const price = crop.pricePerKg || 0;
      accumulatedValue += allocated * price;

      selectedMatches.push({
        cropId: crop.id,
        farmerId: crop.farmer.id,
        farmerName: crop.farmer.name,
        farmerPhone: crop.farmer.phone,
        farmerLocation: crop.location || crop.farmer.location || 'Coimbatore, Tamil Nadu',
        cropName: crop.cropName,
        quality: crop.quality || 'Grade A',
        availableKg: crop.quantityKg,
        matchedKg: allocated,
        pricePerKg: crop.pricePerKg,
        subtotal: allocated * price,
      });
    }

    const isFullyMatched = accumulatedQty >= targetQty;
    const shortfall = Math.max(0, targetQty - accumulatedQty);
    const weightedAvgPrice = accumulatedQty > 0 ? (accumulatedValue / accumulatedQty) : 0;

    return {
      requestedCrop: cropName,
      requestedQuantityKg: targetQty,
      totalMatchedKg: accumulatedQty,
      isFullyMatched,
      isMultiFarmerPool: selectedMatches.length > 1,
      shortfallKg: shortfall,
      matchedFarmersCount: selectedMatches.length,
      averagePricePerKg: Math.round(weightedAvgPrice * 100) / 100,
      totalEstimatedCost: Math.round(accumulatedValue * 100) / 100,
      matches: selectedMatches,
    };
  }
}
