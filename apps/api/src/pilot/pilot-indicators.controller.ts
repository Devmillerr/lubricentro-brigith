import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { PilotIndicatorsQueryDto } from './dto/pilot-indicators-query.dto';
import { PilotIndicatorsService } from './pilot-indicators.service';

@ApiTags('pilot-indicators')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pilot-indicators')
export class PilotIndicatorsController {
  constructor(private readonly pilotIndicatorsService: PilotIndicatorsService) {}

  @Get()
  get(@CurrentUser() user: AccessTokenPayload, @Query() query: PilotIndicatorsQueryDto) {
    return this.pilotIndicatorsService.get(user.businessId, query);
  }
}
