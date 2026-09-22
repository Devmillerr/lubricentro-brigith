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
import { ListRemindersQueryDto } from './dto/list-reminders-query.dto';
import { UpdateReminderStatusDto } from './dto/update-reminder-status.dto';
import { RemindersService } from './reminders.service';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import {
  ContactResultResponse,
  ReminderDetailResponse,
  ReminderPageResponse,
  ReminderResponse,
} from './dto/reminder.response';

@ApiTags('reminders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @ApiOkResponse({ type: ReminderPageResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: ListRemindersQueryDto) {
    return this.remindersService.list(user.businessId, query);
  }

  @ApiOkResponse({ type: ReminderDetailResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['REMINDER_NOT_FOUND'] })
  @Get(':id')
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.remindersService.findOne(user.businessId, id);
  }

  @ApiCreatedResponse({ type: ContactResultResponse })
  @ApiErrors({
    400: VALIDATION_ERRORS,
    404: ['REMINDER_NOT_FOUND'],
    409: ['REMINDER_ALREADY_CLOSED'],
    422: ['NO_PHONE'],
  })
  @Post(':id/contacts')
  contact(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.remindersService.contact(user.businessId, user.sub, id);
  }

  @ApiOkResponse({ type: ReminderResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['REMINDER_NOT_FOUND'] })
  @Patch(':id')
  updateStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReminderStatusDto,
  ) {
    return this.remindersService.updateStatus(user.businessId, id, dto);
  }
}
