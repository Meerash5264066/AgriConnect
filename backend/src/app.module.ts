import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Core
import { PrismaModule } from './prisma/prisma.module';

// Feature modules
import { AuthModule } from './auth/auth.module';
import { FarmersModule } from './farmers/farmers.module';
import { BuyersModule } from './buyers/buyers.module';
import { ProcurementModule } from './procurement/procurement.module';
import { CropsModule } from './crops/crops.module';
import { ContractsModule } from './contracts/contracts.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { InventoryModule } from './inventory/inventory.module';
import { WeatherModule } from './weather/weather.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { AiModule } from './ai/ai.module';

// Misc
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    FarmersModule,
    BuyersModule,
    ProcurementModule,
    CropsModule,
    ContractsModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    NotificationsModule,
    InventoryModule,
    WeatherModule,
    VehiclesModule,
    AiModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}