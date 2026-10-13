import type { KeyboardEvent } from 'react';

/** <input> que son botones: Intro conserva su comportamiento (activarlos). */
const BUTTON_TYPES = new Set(['button', 'reset', 'submit', 'file', 'image']);

/** En el teléfono (dedo), quitar el foco cierra el teclado; con teclado físico se conserva. */
function closeTouchKeyboard(input: HTMLInputElement) {
  if (window.matchMedia('(pointer: coarse)').matches) input.blur();
}

/**
 * `onKeyDown` de un buscador dentro de un formulario: Intro solo busca (la
 * búsqueda ya corre al escribir) y cierra el teclado del teléfono. Nunca envía
 * el formulario de la operación que lo contiene.
 */
export function searchOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
  event.preventDefault();
  closeTouchKeyboard(event.currentTarget);
}

/**
 * `onKeyDown` del <form> de una operación que cobra o mueve stock (Vender,
 * Recibir, Mantenimiento): Intro en un campo (cantidad, precio, km…) no envía
 * el formulario; solo cierra el teclado del teléfono. Para guardar hay que
 * tocar el botón. Las áreas de texto (salto de línea) y los botones
 * conservan Intro.
 */
export function blockEnterSubmit(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== 'Enter' || event.defaultPrevented || event.nativeEvent.isComposing) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || BUTTON_TYPES.has(target.type)) return;
  event.preventDefault();
  closeTouchKeyboard(target);
}
