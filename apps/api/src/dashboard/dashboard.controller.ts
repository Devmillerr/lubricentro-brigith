import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DashboardResponse } from './dto/dashboard.response';

/** Dashboard de Inicio (R7, 06-API.md §2 "Dashboard"). Solo lectura. */
@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @ApiOkResponse({ type: DashboardResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get()
  get(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardResponse> {
    return this.dashboardService.get(user.businessId, query);
  }
}
