# CLAUDE.md — Reglas para continuar el proyecto entre sesiones

Brigith OS es un proyecto de varias sesiones. Estas reglas mantienen la continuidad entre una sesión y la siguiente.

## Al iniciar una sesión

1. Lee **`STATUS.md`** primero. Ahí está el corte actual, qué está completo, qué falta, los bloqueos y el próximo paso.
2. Lee la documentación relevante para la tarea, en este orden de referencia (ver también `README.md`):
   - `research/BRIGITH-DISCOVERY.md` — fuente de verdad de lo que dijo Brigith.
   - `docs/01-VISION.md` — producto: problema, usuario, solución, alcance.
   - `docs/03-BUSINESS-RULES.md` — reglas de negocio y su estado ([CONFIRMADO], [DECISIÓN], [TÉCNICO], [HIPÓTESIS], [PENDIENTE]).
   - `docs/02-PRD.md`, `docs/04-ARCHITECTURE.md`, `docs/05-DATABASE.md`, `docs/06-API.md`, `docs/07-UI-UX.md` según el corte en el que se esté trabajando.
   - `docs/08-ROADMAP.md` — fases y cortes de implementación.
   - `docs/09-BACKLOG.md` — registro de decisiones (§2) y backlog por corte (§3); revisa siempre §1 (bloqueos) antes de empezar código nuevo.
3. No asumas que el estado de `STATUS.md` sigue vigente si el código dice otra cosa: verifica (typecheck, tests, `git log`) antes de continuar sobre una base que podría haber cambiado fuera de esta sesión.

## Al terminar una sesión

Actualiza **`STATUS.md`** para reflejar el estado real dejado por la sesión: corte actual, completado, pendiente, bloqueos, último commit y próximo paso concreto. Si no se hizo commit, dilo explícitamente en vez de omitirlo.

## Otras reglas del proyecto

- Respeta las etiquetas de `docs/03-BUSINESS-RULES.md`: no implementes una regla marcada [HIPÓTESIS] o [PENDIENTE] como si fuera definitiva.
- No empieces un corte que `docs/09-BACKLOG.md` §1 marque como bloqueado sin resolver primero el bloqueo (o sin confirmarlo con el usuario).
- No commitees a menos que el usuario lo pida explícitamente para esa tarea puntual.
- Alcance fuera del MVP (offline, WhatsApp API, facturación electrónica, IA, Kanban de lavado, SaaS multi-negocio) no se implementa salvo que el usuario lo pida de forma explícita — ver `docs/08-ROADMAP.md` "Más allá de la Fase 2".
