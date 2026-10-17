import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BuyersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const buyer = await this.prisma.buyer.findUnique({ where: { userId } });
    if (!buyer) throw new NotFoundException('Buyer profile not found');
    return buyer;
  }

  async updateProfile(userId: string, dto: any) {
    return this.prisma.buyer.update({
      where: { userId },
      data: {
        company: dto.company,
        gstin: dto.gstin,
        representative: dto.representative,
        phone: dto.phone,
        email: dto.email,
        category: dto.category,
        monthlyBudget: dto.monthlyBudget,
        warehouseAddress: dto.warehouseAddress,
        state: dto.state,
        pincode: dto.pincode,
      },
    });
  }

  async getProcurementDemands(userId: string) {
    const buyer = await this.prisma.buyer.findUnique({ where: { userId } });
    if (!buyer) throw new NotFoundException('Buyer not found');
    return this.prisma.procurementDemand.findMany({
      where: { buyerId: buyer.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createProcurementDemand(userId: string, dto: any) {
    const buyer = await this.prisma.buyer.findUnique({ where: { userId } });
    if (!buyer) throw new NotFoundException('Buyer not found');
    return this.prisma.procurementDemand.create({
      data: {
        buyerId: buyer.id,
        cropName: dto.cropName,
        quantityKg: parseFloat(dto.quantityKg || dto.quantity || 0),
        expectedPrice: dto.expectedPrice ? parseFloat(dto.expectedPrice) : null,
        quality: dto.quality || null,
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : null,
        duration: dto.duration || null,
        description: dto.description || null,
      },
    });
  }

  async updateProcurementDemand(userId: string, demandId: string, dto: any) {
    const buyer = await this.prisma.buyer.findUnique({ where: { userId } });
    if (!buyer) throw new NotFoundException('Buyer not found');
    return this.prisma.procurementDemand.update({
      where: { id: demandId },
      data: { ...dto, isActive: dto.isActive ?? undefined },
    });
  }

  async deleteProcurementDemand(userId: string, demandId: string) {
    const buyer = await this.prisma.buyer.findUnique({ where: { userId } });
    if (!buyer) throw new NotFoundException('Buyer not found');
    const demand = await this.prisma.procurementDemand.findUnique({ where: { id: demandId } });
    if (!demand) throw new NotFoundException('Procurement demand not found');
    if (demand.buyerId !== buyer.id) {
      throw new ForbiddenException('You do not have permission to cancel this demand');
    }
    return this.prisma.procurementDemand.update({
      where: { id: demandId },
      data: { isActive: false },
    });
  }

  async getContracts(userId: string) {
    const buyer = await this.prisma.buyer.findUnique({ where: { userId } });
    if (!buyer) throw new NotFoundException('Buyer not found');
    return this.prisma.contract.findMany({
      where: { buyerId: buyer.id },
      include: { farmer: true, supplies: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createContract(userId: string, dto: any) {
    const buyer = await this.prisma.buyer.findUnique({ where: { userId } });
    if (!buyer) throw new NotFoundException('Buyer not found');
    const qty = parseFloat(dto.quantityKg || 0);
    const price = dto.pricePerKg ? parseFloat(dto.pricePerKg) : 0;
    return this.prisma.contract.create({
      data: {
        buyerId: buyer.id,
        farmerId: dto.farmerId,
        cropName: dto.cropName,
        quantityKg: qty,
        pricePerKg: price || null,
        totalValue: qty * price || null,
        supplyFrequency: dto.supplyFrequency || dto.scheduleType || 'Weekly',
        weeklyQuantity: dto.weeklyQuantity ? parseFloat(dto.weeklyQuantity) : null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        status: 'PENDING',
        notes: dto.notes || null,
      },
    });
  }

  async updateContractStatus(contractId: string, status: string) {
    return this.prisma.contract.update({
      where: { id: contractId },
      data: { status: status as any },
    });
  }
}
