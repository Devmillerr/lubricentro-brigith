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
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import {
  CreateSupplierDto,
  ListSuppliersQueryDto,
  SupplierResponse,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { SuppliersService } from './suppliers.service';

/** Proveedores (R8, DEC-95, 06-API.md §2 "Compras, proveedores y cuentas por pagar"). */
@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  /** Lista completa por nombre (pocos registros: sin paginar). */
  @ApiOkResponse({ type: [SupplierResponse] })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: ListSuppliersQueryDto) {
    return this.suppliers.list(user.businessId, query.includeInactive ?? false);
  }

  @ApiCreatedResponse({ type: SupplierResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 409: ['SUPPLIER_TAX_ID_TAKEN'] })
  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateSupplierDto) {
    return this.suppliers.create(user.businessId, user.sub, dto);
  }

  @ApiOkResponse({ type: SupplierResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['SUPPLIER_NOT_FOUND'] })
  @Get(':id')
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.findOne(user.businessId, id);
  }

  @ApiOkResponse({ type: SupplierResponse })
  @ApiErrors({
    400: VALIDATION_ERRORS,
    404: ['SUPPLIER_NOT_FOUND'],
    409: ['SUPPLIER_TAX_ID_TAKEN'],
  })
  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliers.update(user.businessId, id, dto);
  }
}
