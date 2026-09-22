import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import {
  CustomerPageResponse,
  CustomerResponse,
  CustomerWithVehiclesResponse,
} from './dto/customer.response';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @ApiOkResponse({ type: CustomerPageResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: ListCustomersQueryDto) {
    return this.customersService.list(user.businessId, query);
  }

  @ApiCreatedResponse({ type: CustomerResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user.businessId, user.sub, dto);
  }

  @ApiOkResponse({ type: CustomerWithVehiclesResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['CUSTOMER_NOT_FOUND'] })
  @Get(':id')
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.findOneWithVehicles(user.businessId, id);
  }

  @ApiOkResponse({ type: CustomerResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['CUSTOMER_NOT_FOUND'] })
  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(user.businessId, id, dto);
  }

  @ApiNoContentResponse()
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['CUSTOMER_NOT_FOUND'] })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.customersService.deactivate(user.businessId, id);
  }
}
