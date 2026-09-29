import { randomInt } from 'node:crypto';

/**
 * Código de recuperación de contraseña (un solo uso). Sin I, O, 0 ni 1 para
 * que no se confundan al copiarlo a mano: 32 símbolos × 12 posiciones.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 12;

/** Genera un código nuevo con el formato `XXXX-XXXX-XXXX`. */
export function generateRecoveryCode(): string {
  let raw = '';
  for (let i = 0; i < LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return raw.match(/.{4}/g)!.join('-');
}

/** Normaliza lo que escribe el usuario: mayúsculas, sin espacios ni guiones. */
export function normalizeRecoveryCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
