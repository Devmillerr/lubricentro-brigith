import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { BusinessService } from './business.service';
import { UpdateBusinessSettingsDto } from './dto/update-business-settings.dto';

@ApiTags('business')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('business')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get()
  get(@CurrentUser() user: AccessTokenPayload) {
    return this.businessService.get(user.businessId);
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateBusinessSettingsDto) {
    return this.businessService.updateSettings(user.businessId, dto);
  }
}
