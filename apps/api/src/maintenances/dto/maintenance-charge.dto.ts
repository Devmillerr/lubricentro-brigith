import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsPositive } from 'class-validator';

/**
 * Cobro de un mantenimiento (R6, DEC-72): un solo monto total (BR-V3) y un
 * método de pago. Se usa en el bloque `charge` de `POST /maintenances` y en
 * `POST /maintenances/:id/charge`. Sin `occurredAt`: la fecha del cobro es la
 * hora del servidor (DEC-75). Los mensajes van en español porque la web los
 * muestra junto al campo.
 */
export class MaintenanceChargeDto {
  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsEnum(PaymentMethod, { message: 'El método de pago debe ser CASH o YAPE.' })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ description: 'Monto total cobrado. Mayor que 0, hasta 2 decimales.' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El monto debe ser un número con hasta 2 decimales.' },
  )
  @IsPositive({ message: 'El monto debe ser mayor que 0.' })
  totalAmount!: number;
}
