import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { CreateVehicleModelDto } from './dto/create-vehicle-model.dto';
import { UpdateVehicleModelDto } from './dto/update-vehicle-model.dto';
import { VehicleModelsService } from './vehicle-models.service';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import { VehicleModelResponse } from './dto/vehicle-model.response';

@ApiTags('vehicle-models')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('vehicle-models')
export class VehicleModelsController {
  constructor(private readonly vehicleModelsService: VehicleModelsService) {}

  @ApiOkResponse({ type: [VehicleModelResponse] })
  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.vehicleModelsService.list(user.businessId);
  }

  @ApiCreatedResponse({ type: VehicleModelResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateVehicleModelDto) {
    return this.vehicleModelsService.create(user.businessId, user.sub, dto);
  }

  @ApiOkResponse({ type: VehicleModelResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['VEHICLE_MODEL_NOT_FOUND'] })
  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleModelDto,
  ) {
    return this.vehicleModelsService.update(user.businessId, id, dto);
  }
}
