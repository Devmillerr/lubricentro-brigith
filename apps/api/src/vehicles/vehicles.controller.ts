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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleLookupQueryDto } from './dto/vehicle-lookup-query.dto';
import { VehiclesService } from './vehicles.service';

@ApiTags('vehicles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  // Declarada antes de ":id" para que "lookup" no se interprete como un id.
  @Get('lookup')
  lookup(@CurrentUser() user: AccessTokenPayload, @Query() query: VehicleLookupQueryDto) {
    return this.vehiclesService.lookup(user.businessId, query.plate);
  }

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(user.businessId, user.sub, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.findOne(user.businessId, id);
  }

  @Get(':id/compatible-products')
  compatibleProducts(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vehiclesService.compatibleProducts(user.businessId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(user.businessId, id, dto);
  }
}
