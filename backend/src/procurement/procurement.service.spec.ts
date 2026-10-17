import { Test, TestingModule } from '@nestjs/testing';
import { ProcurementService } from './procurement.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

describe('ProcurementService', () => {
  let service: ProcurementService;
  let prisma: any;

  const mockBuyer = {
    id: 'buyer-1',
    userId: 'user-buyer-1',
    company: 'FreshMart Exports',
    representative: 'Aditya Sharma',
    state: 'Maharashtra',
  };

  const mockDemand = {
    id: 'demand-1',
    buyerId: 'buyer-1',
    cropName: 'Tomato',
    quantityKg: 5000,
    expectedPrice: 32,
    quality: 'Grade A',
    isActive: true,
    createdAt: new Date(),
    buyer: mockBuyer,
  };

  const mockFarmer1Crop = {
    id: 'crop-1',
    farmerId: 'farmer-1',
    cropName: 'Tomato',
    quantityKg: 3000,
    pricePerKg: 30,
    quality: 'Grade A',
    status: 'READY',
    location: 'Coimbatore, Tamil Nadu',
    farmer: { id: 'farmer-1', name: 'Farmer A', location: 'Coimbatore', phone: '9876543210' },
  };

  const mockFarmer2Crop = {
    id: 'crop-2',
    farmerId: 'farmer-2',
    cropName: 'Tomato',
    quantityKg: 2500,
    pricePerKg: 31,
    quality: 'Grade A',
    status: 'READY',
    location: 'Salem, Tamil Nadu',
    farmer: { id: 'farmer-2', name: 'Farmer B', location: 'Salem', phone: '9876543211' },
  };

  beforeEach(async () => {
    prisma = {
      buyer: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.userId === 'user-buyer-1' || where.id === 'buyer-1') return Promise.resolve(mockBuyer);
          return Promise.resolve(null);
        }),
      },
      procurementDemand: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'demand-new', ...data, buyer: mockBuyer })),
        findMany: jest.fn().mockResolvedValue([mockDemand]),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'demand-1') return Promise.resolve(mockDemand);
          return Promise.resolve(null);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ ...mockDemand, ...data })),
      },
      crop: {
        findMany: jest.fn().mockResolvedValue([mockFarmer1Crop, mockFarmer2Crop]),
      },
      contract: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ProcurementService>(ProcurementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createDemand', () => {
    it('creates procurement demand for authenticated buyer', async () => {
      const dto = {
        cropName: 'Tomato',
        quantityKg: 5000,
        expectedPrice: 32,
        quality: 'Grade A',
      };
      const result = await service.createDemand('user-buyer-1', dto);
      expect(result.cropName).toBe('Tomato');
      expect(result.quantityKg).toBe(5000);
      expect(prisma.procurementDemand.create).toHaveBeenCalled();
    });

    it('throws NotFoundException if buyer not found', async () => {
      await expect(service.createDemand('unknown-user', { cropName: 'Tomato', quantityKg: 1000 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException for invalid quantity', async () => {
      await expect(service.createDemand('user-buyer-1', { cropName: 'Tomato', quantityKg: -5 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findMatchingFarmers (Multi-Farmer Pooling)', () => {
    it('combines quantities from multiple farmers without exceeding available stock', async () => {
      // Need 5000 kg: Farmer 1 has 3000 kg, Farmer 2 has 2500 kg
      // Should allocate 3000 kg from Farmer 1 + 2000 kg from Farmer 2 = 5000 kg total
      const result = await service.findMatchingFarmers('Tomato', 5000, 'Grade A');

      expect(result.requestedQuantityKg).toBe(5000);
      expect(result.totalMatchedKg).toBe(5000);
      expect(result.isFullyMatched).toBe(true);
      expect(result.isMultiFarmerPool).toBe(true);
      expect(result.matchedFarmersCount).toBe(2);
      expect(result.matches[0].matchedKg).toBe(3000); // capped at available
      expect(result.matches[1].matchedKg).toBe(2000); // remainder
      expect(result.shortfallKg).toBe(0);
    });

    it('handles shortfall when total available is less than requested', async () => {
      // Need 7000 kg: only 5500 kg available across both farmers
      const result = await service.findMatchingFarmers('Tomato', 7000);
      expect(result.totalMatchedKg).toBe(5500);
      expect(result.isFullyMatched).toBe(false);
      expect(result.shortfallKg).toBe(1500);
    });
  });

  describe('deleteDemand', () => {
    it('cancels procurement demand by marking isActive false', async () => {
      const result = await service.deleteDemand('user-buyer-1', 'demand-1');
      expect(result.isActive).toBe(false);
      expect(prisma.procurementDemand.update).toHaveBeenCalledWith({
        where: { id: 'demand-1' },
        data: { isActive: false },
      });
    });

    it('throws ForbiddenException if buyer does not own the demand', async () => {
      prisma.buyer.findUnique.mockResolvedValueOnce({ id: 'buyer-intruder' });
      await expect(service.deleteDemand('user-buyer-intruder', 'demand-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException if requirement is already cancelled', async () => {
      prisma.procurementDemand.findUnique.mockResolvedValueOnce({
        ...mockDemand,
        isActive: false,
      });
      await expect(service.deleteDemand('user-buyer-1', 'demand-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if there is an active ongoing contract with remaining deliveries', async () => {
      prisma.contract.findFirst.mockResolvedValueOnce({
        id: 'contract-active-1',
        quantityKg: 5000,
        status: 'ACTIVE',
        supplies: [{ actualQty: 1000 }],
      });
      await expect(service.deleteDemand('user-buyer-1', 'demand-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
