import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CropsService {
  constructor(private prisma: PrismaService) {}

  // All crops (public marketplace view)
  async getAll(filters?: { cropName?: string; quality?: string; location?: string }) {
    return this.prisma.crop.findMany({
      where: {
        status: 'READY',
        ...(filters?.cropName ? { cropName: { contains: filters.cropName, mode: 'insensitive' as any } } : {}),
        ...(filters?.quality ? { quality: filters.quality } : {}),
        ...(filters?.location ? { location: { contains: filters.location, mode: 'insensitive' as any } } : {}),
      },
      include: { farmer: { select: { name: true, location: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(id: string) {
    return this.prisma.crop.findUnique({
      where: { id },
      include: { farmer: true, farm: true },
    });
  }
}
