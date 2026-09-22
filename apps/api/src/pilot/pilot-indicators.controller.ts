import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { PilotIndicatorsQueryDto } from './dto/pilot-indicators-query.dto';
import { PilotIndicatorsService } from './pilot-indicators.service';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import { PilotIndicatorsResponse } from './dto/pilot-indicators.response';

@ApiTags('pilot-indicators')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('pilot-indicators')
export class PilotIndicatorsController {
  constructor(private readonly pilotIndicatorsService: PilotIndicatorsService) {}

  @ApiOkResponse({ type: PilotIndicatorsResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get()
  get(@CurrentUser() user: AccessTokenPayload, @Query() query: PilotIndicatorsQueryDto) {
    return this.pilotIndicatorsService.get(user.businessId, query);
  }
}
