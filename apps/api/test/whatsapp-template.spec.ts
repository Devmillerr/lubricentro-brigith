import { renderWhatsAppTemplate } from '../src/reminders/whatsapp-template';

describe('renderWhatsAppTemplate', () => {
  it('vacía o nula: cadena vacía, sin inventar ningún mensaje (BR-W4)', () => {
    expect(renderWhatsAppTemplate(null, { placa: 'ABC-123' })).toBe('');
    expect(renderWhatsAppTemplate(undefined, { placa: 'ABC-123' })).toBe('');
    expect(renderWhatsAppTemplate('', { placa: 'ABC-123' })).toBe('');
  });

  it('sustituye las variables documentadas (BR-W3)', () => {
    const result = renderWhatsAppTemplate(
      'Hola {cliente}, tu {placa} necesita mantenimiento antes de {proxima_fecha} o {proximo_km} km.',
      { cliente: 'Ana', placa: 'ABC-123', proximaFecha: '2026-07-01', proximoKm: 20000 },
    );
    expect(result).toBe(
      'Hola Ana, tu ABC-123 necesita mantenimiento antes de 2026-07-01 o 20000 km.',
    );
  });

  it('variables ausentes se sustituyen por cadena vacía, no se inventan', () => {
    const result = renderWhatsAppTemplate('Hola {cliente}, placa {placa}', { placa: 'ABC-123' });
    expect(result).toBe('Hola , placa ABC-123');
  });
});
