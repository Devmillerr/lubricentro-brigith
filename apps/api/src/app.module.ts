import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { BusinessModule } from './business/business.module';
import { validateEnv } from './config/env.validation';
import { CustomersModule } from './customers/customers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { InventoryModule } from './inventory/inventory.module';
import { MaintenancesModule } from './maintenances/maintenances.module';
import { PilotModule } from './pilot/pilot.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { RemindersModule } from './reminders/reminders.module';
import { SalesModule } from './sales/sales.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { WashesModule } from './washes/washes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 20 }],
    }),
    PrismaModule,
    HealthModule,
    IdempotencyModule,
    AuthModule,
    BusinessModule,
    CustomersModule,
    VehiclesModule,
    ProductsModule,
    InventoryModule,
    MaintenancesModule,
    SalesModule,
    WashesModule,
    RemindersModule,
    PilotModule,
    DashboardModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
