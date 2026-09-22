import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { BusinessService } from './business.service';
import { UpdateBusinessSettingsDto } from './dto/update-business-settings.dto';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import { BusinessResponse } from './dto/business.response';

@ApiTags('business')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('business')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @ApiOkResponse({ type: BusinessResponse })
  @Get()
  get(@CurrentUser() user: AccessTokenPayload) {
    return this.businessService.get(user.businessId);
  }

  @ApiOkResponse({ type: BusinessResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Patch('settings')
  updateSettings(@CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateBusinessSettingsDto) {
    return this.businessService.updateSettings(user.businessId, dto);
  }
}
