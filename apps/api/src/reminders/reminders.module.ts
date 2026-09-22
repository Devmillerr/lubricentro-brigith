import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MaintenancesModule } from '../maintenances/maintenances.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  imports: [AuthModule, MaintenancesModule],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
