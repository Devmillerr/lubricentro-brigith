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
import { ListRemindersQueryDto } from './dto/list-reminders-query.dto';
import { UpdateReminderStatusDto } from './dto/update-reminder-status.dto';
import { RemindersService } from './reminders.service';

@ApiTags('reminders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: ListRemindersQueryDto) {
    return this.remindersService.list(user.businessId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.remindersService.findOne(user.businessId, id);
  }

  @Post(':id/contacts')
  contact(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.remindersService.contact(user.businessId, user.sub, id);
  }

  @Patch(':id')
  updateStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReminderStatusDto,
  ) {
    return this.remindersService.updateStatus(user.businessId, id, dto);
  }
}
