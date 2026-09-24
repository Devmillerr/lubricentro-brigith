import { ApiProperty } from '@nestjs/swagger';
import {
  DueRule,
  ReminderContactChannel,
  ReminderStatus,
  type Reminder,
  type ReminderContact,
} from '@prisma/client';
import { PageOf } from '../../common/openapi/page.dto';
import type {
  ContactResult,
  ReminderDetail,
  ReminderListItem,
  ReminderReason,
  ReminderReopenBlock,
} from '../reminders.service';

export class ReminderResponse implements Reminder {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  vehicleId!: string;

  @ApiProperty()
  maintenanceTypeId!: string;

  @ApiProperty()
  sourceMaintenanceId!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueDate!: Date | null;

  @ApiProperty({ type: Number, nullable: true })
  dueKm!: number | null;

  @ApiProperty({ enum: DueRule, enumName: 'DueRule' })
  dueRule!: DueRule;

  @ApiProperty({ enum: ReminderStatus, enumName: 'ReminderStatus' })
  status!: ReminderStatus;

  @ApiProperty({ type: String, nullable: true })
  closedByMaintenanceId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  closeReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

const REMINDER_REASONS = [
  'DATE_REACHED',
  'KM_REACHED_BY_LAST_KNOWN',
  'NO_PHONE',
] as const satisfies readonly ReminderReason[];

/** Ítem de la lista "Avisar" (07-UI-UX.md §3.4); `due`/`reason` se calculan al consultar. */
export class ReminderListItemResponse implements ReminderListItem {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  vehicleId!: string;

  @ApiProperty()
  plate!: string;

  @ApiProperty({ type: String, nullable: true })
  customerName!: string | null;

  @ApiProperty()
  maintenanceTypeId!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueDate!: Date | null;

  @ApiProperty({ type: Number, nullable: true })
  dueKm!: number | null;

  @ApiProperty({ enum: DueRule, enumName: 'DueRule' })
  dueRule!: DueRule;

  @ApiProperty({ enum: ReminderStatus, enumName: 'ReminderStatus' })
  status!: ReminderStatus;

  @ApiProperty()
  hasPhone!: boolean;

  @ApiProperty({ description: 'Corresponde avisar ahora (BR-R3, BR-R4, BR-R6).' })
  due!: boolean;

  @ApiProperty({ enum: REMINDER_REASONS, enumName: 'ReminderReason', nullable: true })
  reason!: ReminderReason | null;
}

export class ReminderPageResponse extends PageOf(ReminderListItemResponse) {}

export class ReminderContactResponse implements ReminderContact {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  reminderId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: ReminderContactChannel, enumName: 'ReminderContactChannel' })
  channel!: ReminderContactChannel;

  @ApiProperty({ type: String, format: 'date-time' })
  openedAt!: Date;

  @ApiProperty({ description: 'Texto tal como se generó al abrir el enlace (BR-W3).' })
  messageSnapshot!: string;
}

const REOPEN_BLOCKS = [
  'DONE',
  'SOURCE_VOIDED',
  'OPEN_EXISTS',
] as const satisfies readonly ReminderReopenBlock[];

export class ReminderDetailResponse extends ReminderListItemResponse implements ReminderDetail {
  @ApiProperty({ description: 'Mensaje de WhatsApp con la plantilla actual del negocio.' })
  previewMessage!: string;

  @ApiProperty({ type: [ReminderContactResponse] })
  contacts!: ReminderContactResponse[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Motivo del cierre (cumplido, descartado, mantenimiento anulado…).',
  })
  closeReason!: string | null;

  @ApiProperty({
    enum: REOPEN_BLOCKS,
    enumName: 'ReminderReopenBlock',
    nullable: true,
    description: 'Por qué no se puede volver a pendiente; null si se puede o si ya está abierto.',
  })
  reopenBlockedBy!: ReminderReopenBlock | null;
}

/** `POST /reminders/:id/contacts`: enlace wa.me y recordatorio ya en CONTACTED. */
export class ContactResultResponse implements ContactResult {
  @ApiProperty()
  waLink!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: ReminderResponse })
  reminder!: ReminderResponse;
}
