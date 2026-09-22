import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { CompatibilitiesService } from './compatibilities.service';
import { CreateCompatibilityDto } from './dto/create-compatibility.dto';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import { ProductCompatibilityResponse } from './dto/product.response';

@ApiTags('compatibilities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('compatibilities')
export class CompatibilitiesController {
  constructor(private readonly compatibilitiesService: CompatibilitiesService) {}

  @ApiCreatedResponse({ type: ProductCompatibilityResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, 'INVALID_REFERENCE'],
    409: ['COMPATIBILITY_ALREADY_EXISTS'],
  })
  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateCompatibilityDto) {
    return this.compatibilitiesService.create(user.businessId, user.sub, dto);
  }

  @ApiNoContentResponse()
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['COMPATIBILITY_NOT_FOUND'] })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.compatibilitiesService.remove(user.businessId, id);
  }
}
