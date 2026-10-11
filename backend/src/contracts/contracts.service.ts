import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
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

    if (!farmerId && dto.farmerName) {
      const f = await this.prisma.farmer.findFirst({
        where: { name: { contains: dto.farmerName.trim(), mode: 'insensitive' } },
      });
      if (f) farmerId = f.id;
    }
    if (!buyerId && dto.buyerName) {
      const b = await this.prisma.buyer.findFirst({
        where: { company: { contains: dto.buyerName.trim(), mode: 'insensitive' } },
      });
      if (b) buyerId = b.id;
    }

    if (!buyerId || !farmerId) {
      throw new BadRequestException('Both buyerId and farmerId are required');
    }

    const qty = parseFloat(String(dto.quantityKg || 0));
    if (isNaN(qty) || qty <= 0) {
      throw new BadRequestException('quantityKg must be a positive number');
    }

    const price = dto.pricePerKg ? parseFloat(String(dto.pricePerKg)) : 0;
    const total = qty * price;

    // Overbooking prevention: check farmer available ready stock for this crop
    const farmerCrops = await this.prisma.crop.findMany({
      where: {
        farmerId,
        cropName: { equals: dto.cropName, mode: 'insensitive' },
        status: 'READY',
        quantityKg: { gt: 0 },
      },
    });

    const totalAvailable = farmerCrops.reduce((acc, c) => acc + c.quantityKg, 0);
    if (farmerCrops.length > 0 && totalAvailable < qty) {
      throw new BadRequestException(
        `Requested quantity (${qty} kg) exceeds farmer available stock (${totalAvailable} kg) for ${dto.cropName}. Overbooking prevented.`,
      );
    }

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
        weeklyQuantity: dto.weeklyQuantity ? parseFloat(String(dto.weeklyQuantity)) : (qty / 4),
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        paymentTerms: dto.paymentTerms || 'Escrow on Delivery',
        deliveryTerms: dto.deliveryTerms || 'FOB Farm Gate',
        status: (dto.status as any) || 'PENDING',
        notes: dto.notes || null,
      },
      include: {
        farmer: { select: { id: true, name: true, location: true, phone: true } },
        buyer: { select: { id: true, company: true, representative: true, warehouseAddress: true } },
        supplies: true,
      },
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
        supplies: { orderBy: { deliveryDate: 'asc' } },
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
    if (!contract) throw new NotFoundException(`Contract #${id} not found`);
    return contract;
  }

  async updateContract(id: string, dto: any) {
    return this.prisma.contract.update({
      where: { id },
      data: {
        cropName: dto.cropName,
        quantityKg: dto.quantityKg ? parseFloat(String(dto.quantityKg)) : undefined,
        pricePerKg: dto.pricePerKg ? parseFloat(String(dto.pricePerKg)) : undefined,
        totalValue: dto.quantityKg && dto.pricePerKg ? parseFloat(String(dto.quantityKg)) * parseFloat(String(dto.pricePerKg)) : undefined,
        quality: dto.quality,
        supplyFrequency: dto.supplyFrequency,
        weeklyQuantity: dto.weeklyQuantity ? parseFloat(String(dto.weeklyQuantity)) : undefined,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        paymentTerms: dto.paymentTerms,
        deliveryTerms: dto.deliveryTerms,
        status: dto.status,
        notes: dto.notes,
        negotiationNote: dto.negotiationNote,
      },
      include: {
        farmer: true,
        buyer: true,
        supplies: true,
      },
    });
  }

  private async verifyContractParticipant(contractId: string, userId?: string) {
    const contract = await this.findOne(contractId);
    if (!userId) return contract;

    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (farmer && farmer.id === contract.farmerId) {
      return contract;
    }

    const buyer = await this.prisma.buyer.findUnique({ where: { userId } });
    if (buyer && buyer.id === contract.buyerId) {
      return contract;
    }

    throw new ForbiddenException('You do not have permission to access or modify this contract');
  }

  // Farmer / Buyer Accept Contract & Deduct Stock Atomically
  async acceptContract(id: string, userId?: string) {
    const contract = await this.verifyContractParticipant(id, userId);
    if (contract.status === 'ACCEPTED' || contract.status === 'ACTIVE') {
      return contract;
    }

    const txRunner = typeof this.prisma.$transaction === 'function'
      ? (cb: (tx: any) => Promise<any>) => this.prisma.$transaction(cb)
      : (cb: (tx: any) => Promise<any>) => cb(this.prisma);

    return txRunner(async (tx: any) => {
      // Overbooking prevention & stock deduction inside transaction
      const crops = await tx.crop.findMany({
        where: {
          farmerId: contract.farmerId,
          cropName: { equals: contract.cropName, mode: 'insensitive' },
          status: 'READY',
          quantityKg: { gt: 0 },
        },
        orderBy: { quantityKg: 'desc' },
      });

      const totalAvailable = crops.reduce((sum: number, c: any) => sum + (c.quantityKg || 0), 0);
      if (crops.length > 0 && totalAvailable < contract.quantityKg) {
        throw new BadRequestException(
          `Requested quantity (${contract.quantityKg} kg) exceeds farmer available stock (${totalAvailable} kg) for ${contract.cropName}. Overbooking prevented.`,
        );
      }

      let remainingToDeduct = contract.quantityKg;
      for (const crop of crops) {
        if (remainingToDeduct <= 0) break;
        const deduct = Math.min(crop.quantityKg, remainingToDeduct);
        const newQty = crop.quantityKg - deduct;
        await tx.crop.update({
          where: { id: crop.id },
          data: {
            quantityKg: newQty,
            status: newQty === 0 ? 'SOLD' : 'READY',
          },
        });
        remainingToDeduct -= deduct;
      }

      const updated = await tx.contract.update({
        where: { id },
        data: { status: 'ACTIVE' },
        include: {
          farmer: true,
          buyer: true,
          supplies: true,
        },
      });

      // Notify Buyer
      const buyer = await tx.buyer.findUnique({ where: { id: contract.buyerId } });
      if (buyer) {
        await tx.notification.create({
          data: {
            userId: buyer.userId,
            title: 'Contract Accepted & Active',
            body: `Contract #${contract.id.slice(0, 8)} for ${contract.quantityKg} kg ${contract.cropName} is now ACTIVE.`,
            type: 'CONTRACT',
          },
        });
      }

      return updated;
    });
  }

  // Farmer / Buyer Reject Contract
  async rejectContract(id: string, userId?: string, reason?: string) {
    const contract = await this.verifyContractParticipant(id, userId);
    const updated = await this.prisma.contract.update({
      where: { id },
      data: { status: 'REJECTED', notes: reason ? `Rejected: ${reason}` : contract.notes },
      include: { farmer: true, buyer: true, supplies: true },
    });

    const buyer = await this.prisma.buyer.findUnique({ where: { id: contract.buyerId } });
    if (buyer) {
      await this.prisma.notification.create({
        data: {
          userId: buyer.userId,
          title: 'Contract Declined',
          body: `Contract for ${contract.quantityKg} kg ${contract.cropName} was declined. Reason: ${reason || 'None provided'}`,
          type: 'CONTRACT',
        },
      });
    }

    return updated;
  }

  // Farmer Request Changes (Negotiate)
  async negotiateContract(id: string, userId: string, dto: { proposedPrice?: number; proposedQuantity?: number; note?: string }) {
    const contract = await this.verifyContractParticipant(id, userId);
    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        status: 'NEGOTIATION',
        negotiationNote: dto.note || `Proposed Price: ₹${dto.proposedPrice || contract.pricePerKg}, Proposed Quantity: ${dto.proposedQuantity || contract.quantityKg} kg`,
      },
      include: { farmer: true, buyer: true, supplies: true },
    });

    const buyer = await this.prisma.buyer.findUnique({ where: { id: contract.buyerId } });
    if (buyer) {
      await this.prisma.notification.create({
        data: {
          userId: buyer.userId,
          title: 'Contract Negotiation Requested',
          body: `Changes requested on ${contract.cropName} contract. Notes: ${updated.negotiationNote}`,
          type: 'CONTRACT',
        },
      });
    }

    return updated;
  }

  // Supply Tracking: Log a delivery
  async logSupply(contractId: string, dto: any, userId?: string) {
    const contract = await this.verifyContractParticipant(contractId, userId);
    const scheduled = parseFloat(String(dto.scheduledQty || dto.expectedQty || dto.expectedQuantityKg || dto.expected || 0));
    const rawActual = dto.actualQty !== undefined ? dto.actualQty : (dto.suppliedQuantityKg !== undefined ? dto.suppliedQuantityKg : (dto.actualQuantityKg !== undefined ? dto.actualQuantityKg : (dto.actual !== undefined ? dto.actual : 0)));
    const actual = parseFloat(String(rawActual));
    if (isNaN(actual) || actual < 0) {
      throw new BadRequestException('actualQty must be a non-negative number');
    }
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
        status: dto.status || (shortfall > 0 ? 'Shortfall' : 'Delivered'),
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
        totalSuppliedKg: newTotalDelivered,
        remainingKg: remainingQty,
        status: nextStatus,
        isFulfilled: remainingQty === 0,
      },
    };
  }

  // Supply Summary & Tracking Breakdown
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
      totalSuppliedKg: totalDelivered,
      totalScheduledKg: totalScheduled,
      totalShortfallKg: totalShortfall,
      remainingKg: remaining,
      completionRatePct,
      fulfillmentPercentage: completionRatePct,
      isFulfilled: remaining === 0,
      status: contract.status,
      supplies,
    };
  }
}
