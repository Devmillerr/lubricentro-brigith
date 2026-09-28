import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleLookupQueryDto } from './dto/vehicle-lookup-query.dto';
import { VehiclesService } from './vehicles.service';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import { VehicleResponse } from './dto/vehicle.response';
import {
  VehicleLookupResponse,
  VehicleWithRelationsResponse,
} from './dto/vehicle-details.response';
import { ProductResponse } from '../products/dto/product.response';
import {
  MaintenanceDetailResponse,
  toMaintenanceDetailResponse,
  type MaintenanceDetailBody,
} from '../maintenances/dto/maintenance.response';

@ApiTags('vehicles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  // Declarada antes de ":id" para que "lookup" no se interprete como un id.
  @ApiOkResponse({ type: [VehicleLookupResponse] })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get('lookup')
  lookup(@CurrentUser() user: AccessTokenPayload, @Query() query: VehicleLookupQueryDto) {
    return this.vehiclesService.lookup(user.businessId, query.plate);
  }

  @ApiCreatedResponse({ type: VehicleResponse })
  @ApiErrors({ 400: [...VALIDATION_ERRORS, 'INVALID_REFERENCE'], 409: ['PLATE_ALREADY_EXISTS'] })
  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(user.businessId, user.sub, dto);
  }

  @ApiOkResponse({ type: VehicleWithRelationsResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['VEHICLE_NOT_FOUND'] })
  @Get(':id')
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.findOne(user.businessId, id);
  }

  @ApiOkResponse({ type: [ProductResponse] })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['VEHICLE_NOT_FOUND'] })
  @Get(':id/compatible-products')
  compatibleProducts(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vehiclesService.compatibleProducts(user.businessId, id);
  }

  @ApiOkResponse({ type: [MaintenanceDetailResponse] })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['VEHICLE_NOT_FOUND'] })
  @Get(':id/maintenances')
  async listMaintenances(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MaintenanceDetailBody[]> {
    const rows = await this.vehiclesService.listMaintenances(user.businessId, id);
    return rows.map(toMaintenanceDetailResponse);
  }

  @ApiOkResponse({ type: VehicleResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, 'INVALID_REFERENCE'],
    404: ['VEHICLE_NOT_FOUND'],
    409: ['PLATE_ALREADY_EXISTS'],
  })
  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(user.businessId, id, dto);
  }
}
