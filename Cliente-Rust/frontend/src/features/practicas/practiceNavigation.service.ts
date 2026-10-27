/**
 * features/practicas/practiceNavigation.service.ts
 *
 * Puente mínimo (sin prop-drilling por HomeContainer/PracticesPage) entre
 * "una práctica terminó" y "la vista de Prácticas debe abrir tal categoría
 * apenas se monte". Ver frontend/docs/practice-completion.md -- toda
 * práctica nueva (no solo Linux) que quiera aterrizar al estudiante
 * directo en su categoría al completar debe llamar a `requestPracticesFocus`
 * con el mismo id de categoría que ya usa PracticesPage (ej. "linux").
 */

let pendingCategoryId: string | null = null;

export function requestPracticesFocus(categoryId: string) {
  pendingCategoryId = categoryId;
}

/**
 * Se consume UNA sola vez -- lee y limpia. Así, si el estudiante navega
 * afuera de Prácticas y vuelve sin haber completado nada nuevo, el segundo
 * montaje de PracticesPage no fuerza otra vez la misma categoría.
 */
export function consumePendingPracticesFocus(): string | null {
  const id = pendingCategoryId;
  pendingCategoryId = null;
  return id;
}

// ── Abrir una práctica concreta (p. ej. desde un enlace laboremoto://practica/<id> de Moodle) ──
// Mismo patrón: un pedido pendiente que la vista de Prácticas consume al montarse, y oyentes por si ya está montada.

let pendingPracticeId: string | null = null;
const practiceOpenListeners = new Set<() => void>();

export function requestPracticeOpen(practiceId: string) {
  pendingPracticeId = practiceId;
  practiceOpenListeners.forEach((f) => f());
}

/** Se consume una sola vez (lee y limpia). */
export function consumePendingPracticeOpen(): string | null {
  const id = pendingPracticeId;
  pendingPracticeId = null;
  return id;
}

/** Avisa cuando llega un pedido nuevo mientras la vista de Prácticas ya está abierta. */
export function onPracticeOpenRequest(cb: () => void): () => void {
  practiceOpenListeners.add(cb);
  return () => { practiceOpenListeners.delete(cb); };
}

// ── Vista de Prácticas pedida desde fuera (tutorial de bienvenida) ──
// `null` = la lista de temas; un id = ese tema abierto. Funciona con la página ya montada (oyentes) o al montarse (pendiente).
let vistaPendiente: { categoria: string | null } | null = null;
const vistaOyentes = new Set<() => void>();

export function pedirVistaPracticas(categoria: string | null) {
  vistaPendiente = { categoria };
  vistaOyentes.forEach((f) => f());
}

export function consumirVistaPracticas(): { categoria: string | null } | null {
  const v = vistaPendiente;
  vistaPendiente = null;
  return v;
}

export function alPedirVistaPracticas(cb: () => void): () => void {
  vistaOyentes.add(cb);
  return () => { vistaOyentes.delete(cb); };
}
