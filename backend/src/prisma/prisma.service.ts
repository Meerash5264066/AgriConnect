import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    let retries = 3;
    while (retries > 0) {
      try {
        await this.$connect();
        this.logger.log('Database connected successfully via Prisma');
        return;
      } catch (err: any) {
        retries--;
        this.logger.warn(`Database connection attempt failed (${retries} retries left): ${err.message}`);
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

