import { Type } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Clase de respuesta para `Page<T>` (common/pagination.ts) con un nombre de
 * esquema propio por tipo (`<Item>Page`), para que el cliente generado tenga
 * `items` tipado.
 */
export function PageOf<T>(itemType: Type<T>) {
  class PageDto {
    @ApiProperty({ type: [itemType] })
    items!: T[];

    @ApiProperty({
      type: String,
      nullable: true,
      description: 'Pasar como `cursor` para la página siguiente; null si no hay más.',
    })
    nextCursor!: string | null;
  }
  Object.defineProperty(PageDto, 'name', {
    value: `${itemType.name.replace(/Response$/, '')}Page`,
  });
  return PageDto;
}
