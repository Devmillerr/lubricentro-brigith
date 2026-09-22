import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ReminderContactChannel,
  ReminderStatus,
  type Reminder,
  type ReminderContact,
} from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import { paginate, type Page } from '../common/pagination';
import { MaintenancesService } from '../maintenances/maintenances.service';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { ListRemindersQueryDto } from './dto/list-reminders-query.dto';
import type { UpdateReminderStatusDto } from './dto/update-reminder-status.dto';
import { checkReminderDue } from './reminder-due';
import { buildWhatsAppLink } from './whatsapp-link';
import { renderWhatsAppTemplate } from './whatsapp-template';

export type ReminderReason = 'DATE_REACHED' | 'KM_REACHED_BY_LAST_KNOWN' | 'NO_PHONE';

export interface ReminderListItem {
  id: string;
  vehicleId: string;
  plate: string;
  customerName: string | null;
  maintenanceTypeId: string;
  dueDate: Date | null;
  dueKm: number | null;
  dueRule: Reminder['dueRule'];
  status: ReminderStatus;
  hasPhone: boolean;
  due: boolean;
  reason: ReminderReason | null;
}

export interface ReminderDetail extends ReminderListItem {
  previewMessage: string;
  contacts: ReminderContact[];
}

export interface ContactResult {
  waLink: string;
  message: string;
  reminder: Reminder;
}

/**
 * "Corresponde avisar ahora" se calcula en cada consulta, nunca se guarda
 * (05-DATABASE.md §3, reminder-due.ts). El ciclo (crear, cerrar) nace en
 * MaintenancesService (BR-R1, BR-R2, BR-M12); acá viven descartar,
 * revertir, contactar y consultar (BR-R9, BR-W2, BR-W6).
 */
@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maintenancesService: MaintenancesService,
  ) {}

  async list(businessId: string, query: ListRemindersQueryDto): Promise<Page<ReminderListItem>> {
    const scoped = forBusiness(this.prisma, businessId);
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const dueFilter = query.due ?? 'now';

    const where: Record<string, unknown> = {};
    if (query.status) {
      where.status = query.status;
    } else if (dueFilter !== 'all') {
      where.status = { in: [ReminderStatus.PENDING, ReminderStatus.CONTACTED] };
    }

    const reminders = await scoped.reminder.findMany({ where });
    let items = await Promise.all(
      reminders.map((reminder) => this.toListItem(businessId, scoped, business, reminder)),
    );

    if (dueFilter === 'now') {
      items = items.filter((item) => item.due);
    } else if (dueFilter === 'upcoming') {
      items = items.filter((item) => !item.due);
    }

    // Ordenada por urgencia (07-UI-UX.md §3.4): lo más específico que dan
    // las reglas es la fecha; sin fecha (solo KM), queda al final.
    items = items.sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    const limit = query.limit ?? 20;
    if (query.cursor) {
      const index = items.findIndex((item) => item.id === query.cursor);
      items = index === -1 ? [] : items.slice(index + 1);
    }
    return paginate(items.slice(0, limit + 1), limit);
  }

  async findOne(businessId: string, id: string): Promise<ReminderDetail> {
    const scoped = forBusiness(this.prisma, businessId);
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const reminder = await scoped.reminder.findFirst({ where: { id } });
    if (!reminder) {
      throw this.notFound();
    }

    const item = await this.toListItem(businessId, scoped, business, reminder);
    const contacts = await scoped.reminderContact.findMany({
      where: { reminderId: id },
      orderBy: { openedAt: 'desc' },
    });
    const vehicle = await scoped.vehicle.findFirst({ where: { id: reminder.vehicleId } });
    const customer = vehicle?.customerId
      ? await scoped.customer.findFirst({ where: { id: vehicle.customerId } })
      : null;

    const previewMessage = renderWhatsAppTemplate(business.whatsappTemplate, {
      cliente: customer?.name,
      placa: vehicle?.plate ?? '',
      proximaFecha: reminder.dueDate?.toISOString().slice(0, 10),
      proximoKm: reminder.dueKm,
    });

    return { ...item, previewMessage, contacts };
  }

  /**
   * Registra que se abrió el aviso y devuelve el enlace wa.me (BR-W6,
   * BR-R10). Pasa el recordatorio a CONTACTED. 422 si no hay teléfono.
   * Normalización del teléfono: ver GAP en whatsapp-link.ts (BR-W5
   * pendiente de P-01) — esto NO es el formato internacional final.
   */
  async contact(businessId: string, userId: string, id: string): Promise<ContactResult> {
    const scoped = forBusiness(this.prisma, businessId);
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const reminder = await scoped.reminder.findFirst({ where: { id } });
    if (!reminder) {
      throw this.notFound();
    }
    if (reminder.status === ReminderStatus.DONE || reminder.status === ReminderStatus.DISMISSED) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: 'REMINDER_ALREADY_CLOSED',
        title: 'El recordatorio ya está cerrado',
      });
    }

    const vehicle = await scoped.vehicle.findFirst({ where: { id: reminder.vehicleId } });
    const customer = vehicle?.customerId
      ? await scoped.customer.findFirst({ where: { id: vehicle.customerId } })
      : null;
    const phone = customer?.phone;
    if (!phone) {
      throw new ProblemException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'NO_PHONE',
        title: 'El cliente no tiene teléfono registrado',
      });
    }

    const message = renderWhatsAppTemplate(business.whatsappTemplate, {
      cliente: customer?.name,
      placa: vehicle?.plate ?? '',
      proximaFecha: reminder.dueDate?.toISOString().slice(0, 10),
      proximoKm: reminder.dueKm,
    });
    const waLink = buildWhatsAppLink(phone, message);

    await scoped.reminderContact.create({
      data: {
        reminderId: id,
        userId,
        channel: ReminderContactChannel.WHATSAPP_LINK,
        openedAt: new Date(),
        messageSnapshot: message,
      },
    });

    const updated = await scoped.reminder.update({
      where: { id },
      data: { status: ReminderStatus.CONTACTED },
    });

    return { waLink, message, reminder: updated };
  }

  /** Volver a PENDING ("deshacer", 07-UI-UX.md §3.4) o DISMISSED explícito (BR-R9). */
  async updateStatus(
    businessId: string,
    id: string,
    dto: UpdateReminderStatusDto,
  ): Promise<Reminder> {
    const scoped = forBusiness(this.prisma, businessId);
    const existing = await scoped.reminder.findFirst({ where: { id } });
    if (!existing) {
      throw this.notFound();
    }

    if (dto.status === 'DISMISSED') {
      return scoped.reminder.update({
        where: { id },
        data: {
          status: ReminderStatus.DISMISSED,
          closedAt: new Date(),
          closeReason: 'descartado',
        },
      });
    }

    return scoped.reminder.update({
      where: { id },
      data: {
        status: ReminderStatus.PENDING,
        closedByMaintenanceId: null,
        closedAt: null,
        closeReason: null,
      },
    });
  }

  private async toListItem(
    businessId: string,
    scoped: ReturnType<typeof forBusiness>,
    business: { reminderLeadDays: number | null },
    reminder: Reminder,
  ): Promise<ReminderListItem> {
    const vehicle = await scoped.vehicle.findFirst({ where: { id: reminder.vehicleId } });
    const customer = vehicle?.customerId
      ? await scoped.customer.findFirst({ where: { id: vehicle.customerId } })
      : null;
    const lastKnownKm = await this.maintenancesService.getLastKnownKm(
      businessId,
      reminder.vehicleId,
    );
    const hasPhone = !!customer?.phone;

    const { due, dateReached, kmReached } = checkReminderDue({
      dueRule: reminder.dueRule,
      dueDate: reminder.dueDate,
      dueKm: reminder.dueKm,
      lastKnownKm,
      today: new Date(),
      reminderLeadDays: business.reminderLeadDays,
    });

    // Motivo mostrado (07-UI-UX.md §3.4): "sin teléfono" no oculta un
    // recordatorio que ya es due por otra razón, solo se antepone porque es
    // lo más accionable para el dueño (BR-R8).
    let reason: ReminderReason | null = null;
    if (due) {
      if (!hasPhone) reason = 'NO_PHONE';
      else if (dateReached) reason = 'DATE_REACHED';
      else if (kmReached) reason = 'KM_REACHED_BY_LAST_KNOWN';
    }

    return {
      id: reminder.id,
      vehicleId: reminder.vehicleId,
      plate: vehicle?.plate ?? '',
      customerName: customer?.name ?? null,
      maintenanceTypeId: reminder.maintenanceTypeId,
      dueDate: reminder.dueDate,
      dueKm: reminder.dueKm,
      dueRule: reminder.dueRule,
      status: reminder.status,
      hasPhone,
      due,
      reason,
    };
  }

  private notFound(): ProblemException {
    return new ProblemException({
      status: HttpStatus.NOT_FOUND,
      code: 'REMINDER_NOT_FOUND',
      title: 'Recordatorio no encontrado',
    });
  }
}
