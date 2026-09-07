import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService) {}

  async createContract(userId: string, userRole: string, dto: any) {
    let buyerId = dto.buyerId;
    let farmerId = dto.farmerId;

    if (userRole === 'BUYER' && !buyerId) {
      const buyer = await this.prisma.buyer.findUnique({ where: { userId } });
      if (buyer) buyerId = buyer.id;
    }
    if (userRole === 'FARMER' && !farmerId) {
      const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
      if (farmer) farmerId = farmer.id;
    }

    if (!buyerId || !farmerId) {
      throw new BadRequestException('Both buyerId and farmerId are required');
    }

    const qty = parseFloat(dto.quantityKg || 0);
    const price = dto.pricePerKg ? parseFloat(dto.pricePerKg) : 0;
    const total = qty * price;

    const contract = await this.prisma.contract.create({
      data: {
        farmerId,
        buyerId,
        cropName: dto.cropName,
        quantityKg: qty,
        pricePerKg: price,
        totalValue: total,
        quality: dto.quality || 'Grade A',
        supplyFrequency: dto.supplyFrequency || 'Weekly',
        weeklyQuantity: dto.weeklyQuantity ? parseFloat(dto.weeklyQuantity) : (qty / 4),
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        paymentTerms: dto.paymentTerms || 'Escrow on Delivery',
        deliveryTerms: dto.deliveryTerms || 'FOB Farm Gate',
        status: (dto.status as any) || 'PENDING',
        notes: dto.notes || null,
      },
      include: { farmer: true, buyer: true },
    });

    // Automatically send notification to farmer
    const farmerUser = await this.prisma.farmer.findUnique({ where: { id: farmerId } });
    if (farmerUser) {
      await this.prisma.notification.create({
        data: {
          userId: farmerUser.userId,
          title: 'New Contract Received',
          body: `You received a contract offer for ${qty} kg ${dto.cropName} at ₹${price}/kg.`,
          type: 'CONTRACT',
        },
      });
    }

    return contract;
  }

  async findAll() {
    return this.prisma.contract.findMany({
      include: {
        farmer: { select: { id: true, name: true, location: true, phone: true } },
        buyer: { select: { id: true, company: true, representative: true, warehouseAddress: true } },
        supplies: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        farmer: true,
        buyer: true,
        supplies: { orderBy: { deliveryDate: 'asc' } },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  async updateContract(id: string, dto: any) {
    return this.prisma.contract.update({
      where: { id },
      data: {
        cropName: dto.cropName,
        quantityKg: dto.quantityKg ? parseFloat(dto.quantityKg) : undefined,
        pricePerKg: dto.pricePerKg ? parseFloat(dto.pricePerKg) : undefined,
        totalValue: dto.quantityKg && dto.pricePerKg ? parseFloat(dto.quantityKg) * parseFloat(dto.pricePerKg) : undefined,
        quality: dto.quality,
        supplyFrequency: dto.supplyFrequency,
        weeklyQuantity: dto.weeklyQuantity ? parseFloat(dto.weeklyQuantity) : undefined,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        paymentTerms: dto.paymentTerms,
        deliveryTerms: dto.deliveryTerms,
        status: dto.status,
        notes: dto.notes,
        negotiationNote: dto.negotiationNote,
      },
    });
  }

  // Step 14 — Farmer Accept
  async acceptContract(id: string, farmerUserId: string) {
    const contract = await this.findOne(id);
    const updated = await this.prisma.contract.update({
      where: { id },
      data: { status: 'ACCEPTED' },
    });

    // Notify Buyer
    const buyer = await this.prisma.buyer.findUnique({ where: { id: contract.buyerId } });
    if (buyer) {
      await this.prisma.notification.create({
        data: {
          userId: buyer.userId,
          title: 'Contract Accepted',
          body: `Farmer accepted the contract for ${contract.quantityKg} kg ${contract.cropName}.`,
          type: 'CONTRACT',
        },
      });
    }

    return updated;
  }

  // Step 14 — Farmer Reject
  async rejectContract(id: string, farmerUserId: string, reason?: string) {
    const contract = await this.findOne(id);
    const updated = await this.prisma.contract.update({
      where: { id },
      data: { status: 'REJECTED', notes: reason ? `Rejected: ${reason}` : contract.notes },
    });

    const buyer = await this.prisma.buyer.findUnique({ where: { id: contract.buyerId } });
    if (buyer) {
      await this.prisma.notification.create({
        data: {
          userId: buyer.userId,
          title: 'Contract Rejected',
          body: `Farmer declined contract for ${contract.quantityKg} kg ${contract.cropName}. Reason: ${reason || 'None provided'}`,
          type: 'CONTRACT',
        },
      });
    }

    return updated;
  }

  // Step 14 — Farmer Request Changes (Negotiate)
  async negotiateContract(id: string, farmerUserId: string, dto: { proposedPrice?: number; proposedQuantity?: number; note?: string }) {
    const contract = await this.findOne(id);
    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        status: 'NEGOTIATION',
        negotiationNote: dto.note || `Proposed Price: ₹${dto.proposedPrice || contract.pricePerKg}, Proposed Quantity: ${dto.proposedQuantity || contract.quantityKg} kg`,
      },
    });

    const buyer = await this.prisma.buyer.findUnique({ where: { id: contract.buyerId } });
    if (buyer) {
      await this.prisma.notification.create({
        data: {
          userId: buyer.userId,
          title: 'Contract Negotiation Requested',
          body: `Farmer requested changes on ${contract.cropName} contract. Notes: ${updated.negotiationNote}`,
          type: 'CONTRACT',
        },
      });
    }

    return updated;
  }

  // Step 15 — Supply Tracking: Log a delivery
  async logSupply(contractId: string, dto: any) {
    const contract = await this.findOne(contractId);
    const scheduled = parseFloat(dto.scheduledQty || dto.expectedQty || 0);
    const actual = parseFloat(dto.actualQty || 0);
    const shortfall = Math.max(0, scheduled - actual);

    // Calculate total delivered including this new entry
    const existingSupplies = await this.prisma.contractSupply.findMany({ where: { contractId } });
    const priorDelivered = existingSupplies.reduce((acc, s) => acc + s.actualQty, 0);
    const newTotalDelivered = priorDelivered + actual;
    const remainingQty = Math.max(0, contract.quantityKg - newTotalDelivered);

    const supply = await this.prisma.contractSupply.create({
      data: {
        contractId,
        cropId: dto.cropId || null,
        scheduledQty: scheduled,
        expectedQty: scheduled,
        actualQty: actual,
        shortfall,
        remainingQty,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : new Date(),
        notes: dto.notes || (shortfall > 0 ? `Shortfall of ${shortfall} kg` : 'Delivered on schedule'),
        status: shortfall > 0 ? 'Shortfall' : 'Delivered',
      },
    });

    // Update contract status
    let nextStatus = contract.status;
    if (newTotalDelivered >= contract.quantityKg) {
      nextStatus = 'COMPLETED';
    } else if (contract.status === 'ACCEPTED' || contract.status === 'PENDING') {
      nextStatus = 'ACTIVE';
    }

    if (nextStatus !== contract.status) {
      await this.prisma.contract.update({ where: { id: contractId }, data: { status: nextStatus } });
    }

    return {
      supply,
      tracking: {
        contractTotalKg: contract.quantityKg,
        totalDeliveredKg: newTotalDelivered,
        remainingKg: remainingQty,
        status: nextStatus,
      },
    };
  }

  // Step 15 — Supply Summary & Tracking Breakdown
  async getSupplyTracking(contractId: string) {
    const contract = await this.findOne(contractId);
    const supplies = await this.prisma.contractSupply.findMany({
      where: { contractId },
      orderBy: { deliveryDate: 'asc' },
    });

    const totalDelivered = supplies.reduce((sum, s) => sum + s.actualQty, 0);
    const totalScheduled = supplies.reduce((sum, s) => sum + s.scheduledQty, 0);
    const totalShortfall = supplies.reduce((sum, s) => sum + (s.shortfall || 0), 0);
    const remaining = Math.max(0, contract.quantityKg - totalDelivered);
    const completionRatePct = Math.min(100, Math.round((totalDelivered / (contract.quantityKg || 1)) * 100));

    return {
      contractId: contract.id,
      cropName: contract.cropName,
      farmer: contract.farmer.name,
      buyer: contract.buyer.company,
      contractQuantityKg: contract.quantityKg,
      totalDeliveredKg: totalDelivered,
      totalScheduledKg: totalScheduled,
      totalShortfallKg: totalShortfall,
      remainingKg: remaining,
      completionRatePct,
      status: contract.status,
      supplies,
    };
  }
}
