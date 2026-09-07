import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async onModuleInit() {
    await this.seedDemoAccounts();
  }

  // Auto-seed demo accounts so UI demo login buttons always work
  async seedDemoAccounts() {
    const demoAccounts = [
      {
        username: 'madhan',
        password: '123456',
        role: 'FARMER',
        email: 'madhan@agriconnect.in',
        farmerData: {
          name: 'Madhan Kumar',
          phone: '+91 98765 43210',
          location: 'Coimbatore, Tamil Nadu',
          state: 'Tamil Nadu',
          pincode: '641001',
          aadhaar: '1234 5678 9012',
          farmSize: '4.5 Acres',
          soilType: 'Red Loamy Soil',
          primaryCrops: 'Tomato, Onion, Maize',
          irrigationType: 'Borewell + Drip Irrigation',
          bankName: 'State Bank of India',
          accountNumber: '12345678901234',
          ifsc: 'SBIN0001234',
          upiId: 'madhan@sbi',
        },
      },
      {
        username: 'buyer',
        password: '123456',
        role: 'BUYER',
        email: 'procurement@bigbasket.com',
        buyerData: {
          company: 'BigBasket Agro Sourcing',
          gstin: '33AAAAA0000A1Z5',
          representative: 'Rajesh Sharma',
          phone: '+91 98112 23344',
          category: 'Wholesale Exporter',
          monthlyBudget: 'Rs.15,00,000 / month',
          warehouseAddress: 'APMC Industrial Yard 4, Nagpur',
          state: 'Maharashtra',
          pincode: '440001',
        },
      },
      {
        username: 'shafiz',
        password: '123456',
        role: 'BUYER',
        email: 'shafiz@agrohub.com',
        buyerData: {
          company: 'Shafiz Agro Industries',
          gstin: '33AAACS1234F1Z5',
          representative: 'Shafiz Ahmed',
          phone: '+91 98450 12345',
          category: 'Food Processing & Export',
          monthlyBudget: 'Rs.25,00,000 / month',
          warehouseAddress: 'APMC Logistics Park, Coimbatore',
          state: 'Tamil Nadu',
          pincode: '641004',
        },
      },
      {
        username: 'customer',
        password: '123456',
        role: 'CUSTOMER',
        email: 'ananya@agriconnect.in',
        customerData: {
          name: 'Ananya Iyer',
          phone: '+91 91234 56789',
          address: 'Flat 402, Green Meadows, Indiranagar',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560038',
        },
      },
    ];

    for (const acc of demoAccounts) {
      const existing = await this.prisma.user.findFirst({
        where: {
          OR: [{ username: acc.username }, { email: acc.email }],
        },
      });

      if (!existing) {
        const hashedPassword = await argon2.hash(acc.password);
        await this.prisma.user.create({
          data: {
            username: acc.username,
            email: acc.email,
            password: hashedPassword,
            role: acc.role as any,
            ...(acc.farmerData ? { farmer: { create: acc.farmerData } } : {}),
            ...(acc.buyerData ? { buyer: { create: acc.buyerData } } : {}),
            ...(acc.customerData ? { customer: { create: acc.customerData } } : {}),
          },
        });
      } else {
        // Update profile data so seed data changes are reflected in existing records
        if (acc.buyerData && existing.id) {
          await this.prisma.buyer.updateMany({
            where: { userId: existing.id },
            data: acc.buyerData as any,
          });
        }
        if (acc.farmerData && existing.id) {
          await this.prisma.farmer.updateMany({
            where: { userId: existing.id },
            data: acc.farmerData as any,
          });
        }
      }
    }
  }

  async register(dto: any) {
    if (!dto) throw new BadRequestException('Request payload is required');

    const username = dto.username ? String(dto.username).trim().toLowerCase() : '';
    const rawPassword = dto.password ? String(dto.password).trim() : '';
    const rawRole = dto.role ? String(dto.role).trim().toUpperCase() : '';
    const rawEmail = dto.email ? String(dto.email).trim().toLowerCase() : null;

    if (!username) throw new BadRequestException('Username is required');
    if (!rawPassword) throw new BadRequestException('Password is required');
    if (rawPassword.length < 4) throw new BadRequestException('Password must be at least 4 characters');
    if (!rawRole) throw new BadRequestException('Role is required');

    const validRoles = ['FARMER', 'BUYER', 'CUSTOMER', 'ADMIN'];
    if (!validRoles.includes(rawRole)) {
      throw new BadRequestException(`Invalid role: '${rawRole}'. Must be one of: ${validRoles.join(', ')}`);
    }

    // Check for existing username or email
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username },
          ...(rawEmail ? [{ email: rawEmail }] : []),
        ],
      },
    });

    if (existing) {
      if (existing.username === username) {
        throw new BadRequestException(`Username '${username}' is already taken. Please choose another.`);
      }
      throw new BadRequestException(`Email '${rawEmail}' is already registered. Please login instead.`);
    }

    const hashedPassword = await argon2.hash(rawPassword);

    const fd = dto.farmerData || {};
    const bd = dto.buyerData || {};
    const cd = dto.customerData || {};

    // Atomic creation of user and domain profile
    const user = await this.prisma.user.create({
      data: {
        username,
        email: rawEmail,
        password: hashedPassword,
        role: rawRole as any,
        ...(rawRole === 'FARMER'
          ? {
              farmer: {
                create: {
                  name: fd.name?.trim() || username,
                  phone: fd.phone?.trim() || null,
                  email: fd.email?.trim() || rawEmail,
                  location: fd.location?.trim() || null,
                  address: fd.address?.trim() || null,
                  state: fd.state?.trim() || null,
                  pincode: fd.pincode?.trim() || null,
                  aadhaar: fd.aadhaar?.trim() || null,
                  farmSize: fd.farmSize?.trim() || null,
                  soilType: fd.soilType?.trim() || null,
                  primaryCrops: fd.primaryCrops?.trim() || fd.crops?.trim() || null,
                  irrigationType: fd.waterSource?.trim() || fd.irrigationType?.trim() || null,
                  bankName: fd.bankName?.trim() || fd.bank?.trim() || null,
                  accountNumber:
                    fd.accountNumber?.trim() ||
                    (fd.upi && !fd.upi.includes('@') ? fd.upi.trim() : null) ||
                    null,
                  ifsc: fd.ifsc?.trim() || null,
                  upiId:
                    fd.upiId?.trim() ||
                    (fd.upi && fd.upi.includes('@') ? fd.upi.trim() : null) ||
                    null,
                },
              },
            }
          : {}),
        ...(rawRole === 'BUYER'
          ? {
              buyer: {
                create: {
                  company: bd.company?.trim() || `${username} Corp`,
                  gstin: bd.gst?.trim() || bd.gstin?.trim() || null,
                  representative: bd.rep?.trim() || bd.representative?.trim() || username,
                  phone: bd.phone?.trim() || null,
                  email: bd.email?.trim() || rawEmail,
                  category: bd.category?.trim() || null,
                  monthlyBudget: bd.budget?.trim() || bd.monthlyBudget?.trim() || null,
                  warehouseAddress: bd.warehouse?.trim() || bd.warehouseAddress?.trim() || null,
                  state: bd.state?.trim() || null,
                  pincode: bd.pincode?.trim() || null,
                },
              },
            }
          : {}),
        ...(rawRole === 'CUSTOMER'
          ? {
              customer: {
                create: {
                  name: cd.name?.trim() || username,
                  phone: cd.phone?.trim() || null,
                  email: cd.email?.trim() || rawEmail,
                  address: cd.address?.trim() || null,
                  city: cd.city?.trim() || null,
                  state: cd.state?.trim() || null,
                  pincode: cd.pincode?.trim() || null,
                },
              },
            }
          : {}),
      },
      include: {
        farmer: true,
        buyer: true,
        customer: true,
      },
    });

    const token = this.jwt.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    return {
      ...this.formatUserResponse(user),
      access_token: token,
    };
  }

  async login(dto: any) {
    if (!dto) throw new BadRequestException('Request payload is required');

    const identifier = (dto.username || dto.email || dto.identifier || '').trim().toLowerCase();
    const rawPassword = dto.password ? String(dto.password).trim() : '';

    if (!identifier || !rawPassword) {
      throw new BadRequestException('Username/email and password are required');
    }

    // Find user by username OR email
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier },
        ],
      },
      include: {
        farmer: true,
        buyer: true,
        customer: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid username/email or password');
    }

    let isValid = false;
    try {
      isValid = await argon2.verify(user.password, rawPassword);
    } catch {
      isValid = false;
    }

    // Fallback for plain-text passwords (e.g. manually seeded) + auto-upgrade
    if (!isValid && user.password === rawPassword) {
      isValid = true;
      try {
        const upgradedHash = await argon2.hash(rawPassword);
        await this.prisma.user.update({
          where: { id: user.id },
          data: { password: upgradedHash },
        });
      } catch (err) {
        console.warn('Failed to upgrade password hash:', err);
      }
    }

    if (!isValid) {
      throw new UnauthorizedException('Invalid username/email or password');
    }

    const token = this.jwt.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    return {
      ...this.formatUserResponse(user),
      access_token: token,
    };
  }

  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        farmer: true,
        buyer: true,
        customer: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return this.formatUserResponse(user);
  }

  private formatUserResponse(user: any) {
    const { password, ...rest } = user;
    return rest;
  }
}
