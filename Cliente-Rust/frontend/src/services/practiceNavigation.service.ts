/**
 * services/practiceNavigation.service.ts
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
