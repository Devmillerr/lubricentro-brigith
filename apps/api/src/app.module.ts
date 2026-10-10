import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BusinessModule } from './business/business.module';
import { validateEnv } from './config/env.validation';
import { CustomersModule } from './customers/customers.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PayablesModule } from './payables/payables.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { InventoryModule } from './inventory/inventory.module';
import { MaintenancesModule } from './maintenances/maintenances.module';
import { PilotModule } from './pilot/pilot.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
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
    RateLimitModule,
    PrismaModule,
    HealthModule,
    IdempotencyModule,
    AuthModule,
    BusinessModule,
    CustomersModule,
    SuppliersModule,
    PayablesModule,
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
})
export class AppModule {}
