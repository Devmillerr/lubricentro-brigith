import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PilotIndicatorsController } from './pilot-indicators.controller';
import { PilotIndicatorsService } from './pilot-indicators.service';

@Module({
  imports: [AuthModule],
  controllers: [PilotIndicatorsController],
  providers: [PilotIndicatorsService],
  exports: [PilotIndicatorsService],
})
export class PilotModule {}
