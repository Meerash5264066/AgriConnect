import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCropDto } from './dto/create-crop.dto';
import { UpdateCropDto } from './dto/update-crop.dto';

@Injectable()
export class CropsService {
  constructor(private prisma: PrismaService) {}

  // All crops (public marketplace view)
  async getAll(filters?: { cropName?: string; quality?: string; location?: string }) {
    return this.prisma.crop.findMany({
      where: {
        status: 'READY',
        ...(filters?.cropName
          ? { cropName: { contains: filters.cropName, mode: 'insensitive' as any } }
          : {}),
        ...(filters?.quality ? { quality: filters.quality } : {}),
        ...(filters?.location
          ? { location: { contains: filters.location, mode: 'insensitive' as any } }
          : {}),
      },
      include: {
        farmer: {
          select: { id: true, name: true, location: true, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(id: string) {
    const crop = await this.prisma.crop.findUnique({
      where: { id },
      include: { farmer: true, farm: true },
    });
    if (!crop) {
      throw new NotFoundException(`Crop #${id} not found`);
    }
    return crop;
  }

  async getFarmerCrops(userId: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) {
      throw new NotFoundException('Farmer profile not found for authenticated user');
    }

    return this.prisma.crop.findMany({
      where: { farmerId: farmer.id },
      include: {
        farmer: {
          select: { id: true, name: true, location: true, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateCropDto) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) {
      throw new NotFoundException('Farmer profile not found for authenticated user');
    }

    const qty = parseFloat(String(dto.quantityKg));
    if (isNaN(qty) || qty <= 0) {
      throw new BadRequestException('quantityKg must be a positive number');
    }

    const price = dto.pricePerKg !== undefined && dto.pricePerKg !== null
      ? parseFloat(String(dto.pricePerKg))
      : null;

    return this.prisma.crop.create({
      data: {
        farmerId: farmer.id,
        cropName: dto.cropName.trim(),
        variety: dto.variety ? dto.variety.trim() : null,
        quantityKg: qty,
        pricePerKg: price,
        quality: dto.quality ? dto.quality.trim() : 'Grade A',
        status: (dto.status as any) || 'READY',
        harvestDate: dto.harvestDate ? new Date(dto.harvestDate) : null,
        location: dto.location ? dto.location.trim() : farmer.location || null,
        description: dto.description ? dto.description.trim() : null,
      },
      include: {
        farmer: {
          select: { id: true, name: true, location: true, phone: true },
        },
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateCropDto) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) {
      throw new NotFoundException('Farmer profile not found');
    }

    const crop = await this.prisma.crop.findUnique({ where: { id } });
    if (!crop) {
      throw new NotFoundException(`Crop #${id} not found`);
    }
    if (crop.farmerId !== farmer.id) {
      throw new ForbiddenException('You do not have permission to modify this crop');
    }

    const qty = dto.quantityKg !== undefined ? parseFloat(String(dto.quantityKg)) : undefined;
    const price = dto.pricePerKg !== undefined ? parseFloat(String(dto.pricePerKg)) : undefined;

    return this.prisma.crop.update({
      where: { id },
      data: {
        cropName: dto.cropName ? dto.cropName.trim() : undefined,
        variety: dto.variety !== undefined ? (dto.variety ? dto.variety.trim() : null) : undefined,
        quantityKg: qty,
        pricePerKg: price,
        quality: dto.quality ? dto.quality.trim() : undefined,
        status: (dto.status as any) || undefined,
        harvestDate: dto.harvestDate ? new Date(dto.harvestDate) : undefined,
        location: dto.location !== undefined ? (dto.location ? dto.location.trim() : null) : undefined,
        description: dto.description !== undefined ? (dto.description ? dto.description.trim() : null) : undefined,
      },
      include: {
        farmer: {
          select: { id: true, name: true, location: true, phone: true },
        },
      },
    });
  }

  async delete(userId: string, id: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
    if (!farmer) {
      throw new NotFoundException('Farmer profile not found');
    }

    const crop = await this.prisma.crop.findUnique({ where: { id } });
    if (!crop) {
      throw new NotFoundException(`Crop #${id} not found`);
    }
    if (crop.farmerId !== farmer.id) {
      throw new ForbiddenException('You do not have permission to delete this crop');
    }

    // Check if crop is tied to active contracts
    const activeSupplies = await this.prisma.contractSupply.count({
      where: { cropId: id },
    });
    if (activeSupplies > 0) {
      throw new BadRequestException('Cannot delete crop that is referenced in existing contract deliveries');
    }

    return this.prisma.crop.delete({ where: { id } });
  }
}
