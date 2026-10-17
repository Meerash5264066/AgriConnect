import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FarmersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
      include: { farms: true, crops: true },
    });
    if (!farmer) throw new NotFoundException('Farmer profile not found');
    return farmer;
  }

  async updateProfile(userId: string, dto: any) {
    return this.prisma.farmer.update({
      where: { userId },
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        aadhaar: dto.aadhaar,
        address: dto.address,
        location: dto.location,
        state: dto.state,
        pincode: dto.pincode,
        farmSize: dto.farmSize !== undefined ? dto.farmSize : undefined,
        soilType: dto.soilType !== undefined ? dto.soilType : undefined,
        primaryCrops: dto.primaryCrops !== undefined ? dto.primaryCrops : undefined,
        irrigationType: dto.irrigationType !== undefined ? dto.irrigationType : undefined,
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        ifsc: dto.ifsc,
        upiId: dto.upiId,
      },
    });
  }

  // ─── FARMS ────────────────────────────────────────────────────────────
  async getFarms(userId: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return this.prisma.farm.findMany({ where: { farmerId: farmer.id } });
  }

  async createFarm(userId: string, dto: any) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return this.prisma.farm.create({
      data: {
        farmerId: farmer.id,
        name: dto.name,
        totalAcres: dto.totalAcres ? parseFloat(dto.totalAcres) : null,
        surveyNumber: dto.surveyNumber,
        village: dto.village,
        taluk: dto.taluk,
        district: dto.district,
        state: dto.state,
        pincode: dto.pincode,
        soilType: dto.soilType,
        soilPhLevel: dto.soilPhLevel ? parseFloat(dto.soilPhLevel) : null,
        nitrogenLevel: dto.nitrogenLevel ? parseFloat(dto.nitrogenLevel) : null,
        phosphorusLevel: dto.phosphorusLevel ? parseFloat(dto.phosphorusLevel) : null,
        potassiumLevel: dto.potassiumLevel ? parseFloat(dto.potassiumLevel) : null,
        irrigationType: dto.irrigationType,
        waterSource: dto.waterSource,
        annualRainfall: dto.annualRainfall ? parseFloat(dto.annualRainfall) : null,
      },
    });
  }

  async updateFarm(userId: string, farmId: string, dto: any) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return this.prisma.farm.update({
      where: { id: farmId },
      data: { ...dto },
    });
  }

  // ─── CROPS ────────────────────────────────────────────────────────────
  async getCrops(userId: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return this.prisma.crop.findMany({
      where: { farmerId: farmer.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCrop(userId: string, dto: any) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return this.prisma.crop.create({
      data: {
        farmerId: farmer.id,
        farmId: dto.farmId || null,
        cropName: dto.cropName,
        variety: dto.variety || null,
        quantityKg: parseFloat(dto.quantityKg || dto.quantity || 0),
        pricePerKg: dto.pricePerKg ? parseFloat(dto.pricePerKg) : null,
        quality: dto.quality || 'Grade A',
        status: dto.status || 'READY',
        harvestDate: dto.harvestDate ? new Date(dto.harvestDate) : null,
        description: dto.description || null,
        location: dto.location || farmer.location || null,
        imageUrl: dto.imageUrl || null,
      },
    });
  }

  async updateCrop(userId: string, cropId: string, dto: any) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return this.prisma.crop.update({
      where: { id: cropId },
      data: {
        cropName: dto.cropName,
        variety: dto.variety,
        quantityKg: dto.quantityKg ? parseFloat(dto.quantityKg) : undefined,
        pricePerKg: dto.pricePerKg ? parseFloat(dto.pricePerKg) : undefined,
        quality: dto.quality,
        status: dto.status,
        harvestDate: dto.harvestDate ? new Date(dto.harvestDate) : undefined,
        description: dto.description,
        location: dto.location,
      },
    });
  }

  async deleteCrop(userId: string, cropId: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return this.prisma.crop.delete({ where: { id: cropId } });
  }

  // ─── CONTRACTS ────────────────────────────────────────────────────────
  async getContracts(userId: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return this.prisma.contract.findMany({
      where: { farmerId: farmer.id },
      include: { buyer: true, supplies: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── DISEASE SCANS ────────────────────────────────────────────────────
  async getDiseaseScans(userId: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return this.prisma.diseaseScan.findMany({
      where: { farmerId: farmer.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDiseaseScan(userId: string, dto: any) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return this.prisma.diseaseScan.create({
      data: {
        farmerId: farmer.id,
        cropType: dto.cropType,
        symptom: dto.symptom,
        imageUrl: dto.imageUrl,
        diseaseName: dto.diseaseName,
        confidence: dto.confidence ? parseFloat(dto.confidence) : null,
        chemicalFix: dto.chemicalFix,
        organicFix: dto.organicFix,
        rawResult: dto.rawResult,
      },
    });
  }

  // ─── AI RECOMMENDATIONS ───────────────────────────────────────────────
  async getAIRecommendations(userId: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return this.prisma.aIRecommendation.findMany({
      where: { farmerId: farmer.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAIRecommendation(userId: string, dto: any) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return this.prisma.aIRecommendation.create({
      data: {
        farmerId: farmer.id,
        soilType: dto.soilType,
        nitrogen: dto.nitrogen ? parseFloat(dto.nitrogen) : null,
        phosphorus: dto.phosphorus ? parseFloat(dto.phosphorus) : null,
        potassium: dto.potassium ? parseFloat(dto.potassium) : null,
        ph: dto.ph ? parseFloat(dto.ph) : null,
        rainfall: dto.rainfall ? parseFloat(dto.rainfall) : null,
        temperature: dto.temperature ? parseFloat(dto.temperature) : null,
        humidity: dto.humidity ? parseFloat(dto.humidity) : null,
        season: dto.season,
        topCrop: dto.topCrop,
        secondCrop: dto.secondCrop,
        thirdCrop: dto.thirdCrop,
        explanation: dto.explanation,
        rawResult: dto.rawResult,
      },
    });
  }
}
