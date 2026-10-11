-- R8 / M3 (DEC-97). Solo el valor nuevo del enum, en una migración aparte:
-- Postgres no deja usar un valor agregado dentro de la misma transacción.
-- Aditiva: no cambia ningún dato existente.
BEGIN;

ALTER TYPE "InventoryMovementType" ADD VALUE 'PURCHASE_VOID';

COMMIT;
