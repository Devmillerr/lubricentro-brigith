import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { CreateMaintenanceTypeDto } from './dto/create-maintenance-type.dto';
import { MaintenanceTypesService } from './maintenance-types.service';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import { MaintenanceTypeResponse } from './dto/maintenance.response';

@ApiTags('maintenance-types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('maintenance-types')
export class MaintenanceTypesController {
  constructor(private readonly maintenanceTypesService: MaintenanceTypesService) {}

  @ApiOkResponse({ type: [MaintenanceTypeResponse] })
  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.maintenanceTypesService.list(user.businessId);
  }

  @ApiCreatedResponse({ type: MaintenanceTypeResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 409: ['MAINTENANCE_TYPE_ALREADY_EXISTS'] })
  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateMaintenanceTypeDto) {
    return this.maintenanceTypesService.create(user.businessId, dto);
  }
}
