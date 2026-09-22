import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { CreateMaintenanceTypeDto } from './dto/create-maintenance-type.dto';
import { MaintenanceTypesService } from './maintenance-types.service';

@ApiTags('maintenance-types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('maintenance-types')
export class MaintenanceTypesController {
  constructor(private readonly maintenanceTypesService: MaintenanceTypesService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.maintenanceTypesService.list(user.businessId);
  }

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateMaintenanceTypeDto) {
    return this.maintenanceTypesService.create(user.businessId, dto);
  }
}
