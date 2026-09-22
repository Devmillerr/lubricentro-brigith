import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/** Solo estos dos: volver a pendiente, o descartar explícito (BR-R9). */
export class UpdateReminderStatusDto {
  @ApiProperty({ enum: ['PENDING', 'DISMISSED'] })
  @IsIn(['PENDING', 'DISMISSED'])
  status!: 'PENDING' | 'DISMISSED';
}
