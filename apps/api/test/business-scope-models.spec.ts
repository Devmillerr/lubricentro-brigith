import { Prisma } from '@prisma/client';
import { BUSINESS_SCOPED_MODELS } from '../src/prisma/business-scope';

/**
 * Aislamiento por negocio (R8, DEC-101): todo modelo con `businessId` debe
 * estar en `BUSINESS_SCOPED_MODELS`, o `forBusiness` no filtraría sus
 * consultas. Falla si se agrega un modelo de negocio sin registrarlo.
 */
describe('BUSINESS_SCOPED_MODELS', () => {
  it('incluye todos los modelos con businessId', () => {
    const withBusinessId = Prisma.dmmf.datamodel.models
      .filter((model) => model.fields.some((field) => field.name === 'businessId'))
      .map((model) => model.name)
      .sort();
    const missing = withBusinessId.filter((name) => !BUSINESS_SCOPED_MODELS.has(name));
    expect(missing).toEqual([]);
  });

  it('no registra modelos que no existen', () => {
    const names = new Set(Prisma.dmmf.datamodel.models.map((model) => model.name));
    expect([...BUSINESS_SCOPED_MODELS].filter((name) => !names.has(name))).toEqual([]);
  });
});
