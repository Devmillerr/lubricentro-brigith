import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RemindersModule } from '../reminders/reminders.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AuthModule, InventoryModule, RemindersModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
