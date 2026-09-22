import { buildWhatsAppLink, normalizePhoneForWhatsAppLink } from '../src/reminders/whatsapp-link';

describe('normalizePhoneForWhatsAppLink (placeholder provisional, BR-W5 pendiente de P-01)', () => {
  it('quita espacios, guiones y paréntesis', () => {
    expect(normalizePhoneForWhatsAppLink('(999) 888-777')).toBe('999888777');
  });

  it('no agrega código de país ni asume formato internacional', () => {
    expect(normalizePhoneForWhatsAppLink('999888777')).toBe('999888777');
    expect(normalizePhoneForWhatsAppLink('+51 999 888 777')).toBe('+51999888777');
  });
});

describe('buildWhatsAppLink', () => {
  it('sin mensaje: enlace sin parámetro text (BR-W4)', () => {
    expect(buildWhatsAppLink('999888777', '')).toBe('https://wa.me/999888777');
  });

  it('con mensaje: lo agrega codificado', () => {
    expect(buildWhatsAppLink('999888777', 'Hola Ana')).toBe(
      'https://wa.me/999888777?text=Hola%20Ana',
    );
  });
});
