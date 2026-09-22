import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReminderStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export type ReminderDueFilter = 'now' | 'upcoming' | 'all';

export class ListRemindersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['now', 'upcoming', 'all'], default: 'now' })
  @IsOptional()
  @IsIn(['now', 'upcoming', 'all'])
  due?: ReminderDueFilter;

  @ApiPropertyOptional({ enum: ReminderStatus })
  @IsOptional()
  @IsEnum(ReminderStatus)
  status?: ReminderStatus;
}
