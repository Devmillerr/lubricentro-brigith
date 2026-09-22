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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { CreateVehicleModelDto } from './dto/create-vehicle-model.dto';
import { UpdateVehicleModelDto } from './dto/update-vehicle-model.dto';
import { VehicleModelsService } from './vehicle-models.service';

@ApiTags('vehicle-models')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vehicle-models')
export class VehicleModelsController {
  constructor(private readonly vehicleModelsService: VehicleModelsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.vehicleModelsService.list(user.businessId);
  }

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateVehicleModelDto) {
    return this.vehicleModelsService.create(user.businessId, user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleModelDto,
  ) {
    return this.vehicleModelsService.update(user.businessId, id, dto);
  }
}
