import { Test, TestingModule } from '@nestjs/testing';
import { CropsService } from './crops.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

describe('CropsService', () => {
  let service: CropsService;
  let prisma: any;

  const mockFarmer = {
    id: 'farmer-1',
    userId: 'user-farmer-1',
    name: 'Madhan Kumar',
    location: 'Coimbatore, Tamil Nadu',
    phone: '9876543210',
  };

  const mockCrop = {
    id: 'crop-1',
    farmerId: 'farmer-1',
    cropName: 'Tomato',
    quantityKg: 2000,
    pricePerKg: 30,
    quality: 'Grade A',
    status: 'READY',
    location: 'Coimbatore, Tamil Nadu',
    createdAt: new Date(),
    updatedAt: new Date(),
    farmer: mockFarmer,
  };

  beforeEach(async () => {
    prisma = {
      crop: {
        findMany: jest.fn().mockResolvedValue([mockCrop]),
        findUnique: jest.fn().mockResolvedValue(mockCrop),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'crop-new', ...data, farmer: mockFarmer })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...mockCrop, ...data })),
        delete: jest.fn().mockResolvedValue(mockCrop),
      },
      farmer: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.userId === 'user-farmer-1') return Promise.resolve(mockFarmer);
          return Promise.resolve(null);
        }),
      },
      contractSupply: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CropsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CropsService>(CropsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAll', () => {
    it('returns filtered crops', async () => {
      const crops = await service.getAll({ cropName: 'Tomato' });
      expect(crops).toHaveLength(1);
      expect(crops[0].cropName).toBe('Tomato');
      expect(prisma.crop.findMany).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates crop listing for authenticated farmer', async () => {
      const dto = {
        cropName: 'Tomato',
        quantityKg: 1500,
        pricePerKg: 32,
        quality: 'Grade A',
        location: 'Coimbatore',
      };
      const result = await service.create('user-farmer-1', dto as any);
      expect(result.cropName).toBe('Tomato');
      expect(result.quantityKg).toBe(1500);
      expect(prisma.crop.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when farmer profile does not exist', async () => {
      await expect(service.create('unknown-user', { cropName: 'Wheat', quantityKg: 500 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when quantity is invalid or <= 0', async () => {
      await expect(
        service.create('user-farmer-1', { cropName: 'Wheat', quantityKg: 0 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getFarmerCrops', () => {
    it('fetches crops belonging to the farmer', async () => {
      const crops = await service.getFarmerCrops('user-farmer-1');
      expect(crops).toHaveLength(1);
      expect(prisma.crop.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { farmerId: 'farmer-1' } }),
      );
    });
  });

  describe('update', () => {
    it('updates crop when owned by the farmer', async () => {
      const updated = await service.update('user-farmer-1', 'crop-1', { quantityKg: 1800, pricePerKg: 35 });
      expect(updated.quantityKg).toBe(1800);
      expect(updated.pricePerKg).toBe(35);
    });

    it('throws ForbiddenException if another farmer attempts to update', async () => {
      prisma.farmer.findUnique.mockResolvedValue({ id: 'farmer-other', userId: 'user-other' });
      await expect(
        service.update('user-other', 'crop-1', { quantityKg: 1800 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('deletes crop when not tied to active supplies', async () => {
      const result = await service.delete('user-farmer-1', 'crop-1');
      expect(result.id).toBe('crop-1');
      expect(prisma.crop.delete).toHaveBeenCalledWith({ where: { id: 'crop-1' } });
    });

    it('throws BadRequestException when crop is referenced in active contract supplies', async () => {
      prisma.contractSupply.count.mockResolvedValue(2);
      await expect(service.delete('user-farmer-1', 'crop-1')).rejects.toThrow(BadRequestException);
    });
  });
});
