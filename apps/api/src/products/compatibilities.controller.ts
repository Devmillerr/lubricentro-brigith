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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { CompatibilitiesService } from './compatibilities.service';
import { CreateCompatibilityDto } from './dto/create-compatibility.dto';

@ApiTags('compatibilities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('compatibilities')
export class CompatibilitiesController {
  constructor(private readonly compatibilitiesService: CompatibilitiesService) {}

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateCompatibilityDto) {
    return this.compatibilitiesService.create(user.businessId, user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.compatibilitiesService.remove(user.businessId, id);
  }
}
