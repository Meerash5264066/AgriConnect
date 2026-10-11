import { Test, TestingModule } from '@nestjs/testing';
import { ContractsService } from './contracts.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';

describe('ContractsService', () => {
  let service: ContractsService;
  let prisma: any;

  const mockFarmer = {
    id: 'farmer-1',
    userId: 'user-farmer-1',
    name: 'Madhan Kumar',
    location: 'Coimbatore, Tamil Nadu',
    phone: '9876543210',
  };

  const mockBuyer = {
    id: 'buyer-1',
    userId: 'user-buyer-1',
    company: 'BigBasket Agro Sourcing',
    representative: 'Rajesh Sharma',
  };

  const mockCrop = {
    id: 'crop-1',
    farmerId: 'farmer-1',
    cropName: 'Tomato',
    quantityKg: 5000,
    pricePerKg: 30,
    quality: 'Grade A',
    status: 'READY',
  };

  const mockContract = {
    id: 'contract-1',
    farmerId: 'farmer-1',
    buyerId: 'buyer-1',
    cropName: 'Tomato',
    quantityKg: 4000,
    pricePerKg: 30,
    totalValue: 120000,
    quality: 'Grade A',
    supplyFrequency: 'Weekly',
    weeklyQuantity: 1000,
    status: 'PENDING',
    farmer: mockFarmer,
    buyer: mockBuyer,
    supplies: [],
  };

  beforeEach(async () => {
    prisma = {
      farmer: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'farmer-1' || where.userId === 'user-farmer-1') return Promise.resolve(mockFarmer);
          return Promise.resolve(null);
        }),
      },
      buyer: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'buyer-1' || where.userId === 'user-buyer-1') return Promise.resolve(mockBuyer);
          return Promise.resolve(null);
        }),
      },
      crop: {
        findMany: jest.fn().mockResolvedValue([mockCrop]),
        update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ ...mockCrop, ...data })),
      },
      contract: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'contract-new', ...data, farmer: mockFarmer, buyer: mockBuyer })),
        findMany: jest.fn().mockResolvedValue([mockContract]),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'contract-1') return Promise.resolve(mockContract);
          return Promise.resolve(null);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ ...mockContract, ...data })),
      },
      contractSupply: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'supply-1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createContract', () => {
    it('creates contract when farmer has sufficient stock', async () => {
      const dto = {
        farmerId: 'farmer-1',
        buyerId: 'buyer-1',
        cropName: 'Tomato',
        quantityKg: 4000,
        pricePerKg: 30,
      };

      const result = await service.createContract('user-buyer-1', 'BUYER', dto);
      expect(result.cropName).toBe('Tomato');
      expect(result.quantityKg).toBe(4000);
      expect(prisma.contract.create).toHaveBeenCalled();
    });

    it('prevents overbooking: throws BadRequestException when requested exceeds farmer stock', async () => {
      const dto = {
        farmerId: 'farmer-1',
        buyerId: 'buyer-1',
        cropName: 'Tomato',
        quantityKg: 8000, // available is only 5000 kg
        pricePerKg: 30,
      };

      await expect(service.createContract('user-buyer-1', 'BUYER', dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('acceptContract', () => {
    it('accepts contract and deducts stock from farmer crop', async () => {
      const result = await service.acceptContract('contract-1', 'user-farmer-1');
      expect(result.status).toBe('ACTIVE');
      expect(prisma.crop.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ quantityKg: 1000 }), // 5000 - 4000
        }),
      );
    });

    it('rejects acceptContract with ForbiddenException when user is not a contract participant', async () => {
      await expect(
        service.acceptContract('contract-1', 'unauthorized-user-999'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents overbooking: throws BadRequestException when available stock has decreased below contract quantity', async () => {
      prisma.crop.findMany.mockResolvedValueOnce([{ ...mockCrop, quantityKg: 2000 }]);
      await expect(
        service.acceptContract('contract-1', 'user-farmer-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('logSupply and getSupplyTracking', () => {
    it('logs a delivery and computes remaining quantity and completion rate', async () => {
      const logResult = await service.logSupply('contract-1', {
        scheduledQty: 1000,
        actualQty: 1000,
      });

      expect(logResult.supply.actualQty).toBe(1000);
      expect(logResult.tracking.totalDeliveredKg).toBe(1000);
      expect(logResult.tracking.remainingKg).toBe(3000);

      // Now mock supply returned in getSupplyTracking
      prisma.contractSupply.findMany.mockResolvedValue([
        { actualQty: 1000, scheduledQty: 1000, shortfall: 0, deliveryDate: new Date() },
      ]);

      const tracking = await service.getSupplyTracking('contract-1');
      expect(tracking.totalDeliveredKg).toBe(1000);
      expect(tracking.remainingKg).toBe(3000);
      expect(tracking.completionRatePct).toBe(25);
    });

    it('rejects logSupply with ForbiddenException when user is not a contract participant', async () => {
      await expect(
        service.logSupply('contract-1', { scheduledQty: 1000, actualQty: 1000 }, 'unauthorized-user-999'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects rejectContract with ForbiddenException when user is not a contract participant', async () => {
      await expect(
        service.rejectContract('contract-1', 'unauthorized-user-999', 'Reason'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
