import { Injectable } from '@nestjs/common';
import type { Business } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateBusinessSettingsDto } from './dto/update-business-settings.dto';

/**
 * `Business` es el propio tenant, no un modelo de negocio "dentro" de un
 * negocio: se busca por su `id` directo, igual que en `auth.service.ts` y
 * `maintenances.service.ts` (no pasa por `forBusiness`, que es para modelos
 * que SÍ tienen `businessId`). El `businessId` siempre sale del token
 * (BR-G3): el controller nunca deja que el cliente elija a qué negocio
 * escribe.
 */
@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  async get(businessId: string): Promise<Business> {
    return this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  }

  /** Solo los 6 campos abiertos documentados (RF-20, 06-API.md). */
  async updateSettings(businessId: string, dto: UpdateBusinessSettingsDto): Promise<Business> {
    return this.prisma.business.update({
      where: { id: businessId },
      data: {
        whatsappTemplate: 'whatsappTemplate' in dto ? dto.whatsappTemplate : undefined,
        reminderLeadDays: 'reminderLeadDays' in dto ? dto.reminderLeadDays : undefined,
        defaultDueRuleWhenBoth:
          'defaultDueRuleWhenBoth' in dto ? dto.defaultDueRuleWhenBoth : undefined,
        insufficientStockPolicy:
          'insufficientStockPolicy' in dto ? dto.insufficientStockPolicy : undefined,
        defaultCountryCode: 'defaultCountryCode' in dto ? dto.defaultCountryCode : undefined,
        currency: 'currency' in dto ? dto.currency : undefined,
      },
    });
  }
}
