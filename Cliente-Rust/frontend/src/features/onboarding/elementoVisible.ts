// features/onboarding/elementoVisible.ts — elegir el elemento que el tour resalta.
//
// Cada pestaña de sesión queda montada aunque no se vea (oculta con display:none o visibility:hidden), así que un
// selector como [data-tour="practica-progreso"] puede tener varias coincidencias y la primera ser la de una pestaña
// oculta. Con `querySelector` el tour se quedaba con esa: medía 0×0 y la ventana del tour aparecía en la esquina de
// arriba a la izquierda sin resaltar nada. Aquí solo vale un elemento que de verdad se ve.

/** El elemento se ve: tiene tamaño y ni él ni sus ancestros están ocultos. */
export function seVe(el: Element): boolean {
  const caja = el.getBoundingClientRect();
  if (caja.width <= 0 || caja.height <= 0) return false;
  const conCheck = el as Element & { checkVisibility?: (o?: { visibilityProperty?: boolean }) => boolean };
  if (typeof conCheck.checkVisibility === 'function') return conCheck.checkVisibility({ visibilityProperty: true });
  for (let n: Element | null = el; n; n = n.parentElement) {
    const estilo = getComputedStyle(n);
    if (estilo.display === 'none' || estilo.visibility === 'hidden') return false;
  }
  return true;
}

/** El primer elemento visible de la lista de selectores (en ese orden de preferencia), o null. */
export function primerVisible(selectores: string[], raiz: ParentNode = document): Element | null {
  for (const s of selectores) {
    for (const el of Array.from(raiz.querySelectorAll(s))) if (seVe(el)) return el;
  }
  return null;
}

/**
 * Espera hasta `esperaMs` a que aparezca un elemento visible (la pantalla puede estar montándose). Si no aparece,
 * devuelve null: el tour muestra su ventana centrada, en vez de anclarla a un elemento oculto en una esquina.
 */
export function esperarElementoVisible(selectores: string[], esperaMs: number): Promise<Element | null> {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const buscar = () => {
      const el = primerVisible(selectores);
      if (el) return resolve(el);
      if (Date.now() - inicio >= esperaMs) return resolve(null);
      setTimeout(buscar, 80);
    };
    buscar();
  });
}
