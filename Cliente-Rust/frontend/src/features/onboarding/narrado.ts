// features/onboarding/narrado.ts — piezas del globo que comparten los tours narrados (tour_inicio y tour_linux).
// El estilo vive en tourNarrado.css bajo la clase común `tour-narrado` del popover.
import './tourNarrado.css';

const ICONO_PAUSA = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';
const ICONO_PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.5-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z"/></svg>';

/** Título del globo: «Paso 2 de 5» + indicador de voz + el título. Son nodos nuevos en cada paso, así que su animación de entrada se repite. */
export function tituloNarrado(titulo: string, i: number, total: number): string {
  return `<span class="tn-meta"><span class="tn-voz" aria-hidden="true"><i></i><i></i><i></i></span>Paso ${i + 1} de ${total}</span>
    <span class="tn-titulo">${titulo}</span>`;
}

/** Texto (subtítulo de lo que dice la voz) + un segmento por paso: hechos tenues, el actual se llena. */
export function cuerpoNarrado(texto: string, i: number, total: number, antes = ''): string {
  const segs = Array.from({ length: total }, (_, j) =>
    `<span class="tn-seg${j < i ? ' is-hecho' : j === i ? ' is-actual' : ''}"></span>`).join('');
  return `${antes}<p class="tn-texto">${texto}</p>
    <div class="tn-pasos" role="img" aria-label="Paso ${i + 1} de ${total}">${segs}</div>`;
}

/** Marca el globo como pausado/sonando (el indicador de voz se congela o se anima). */
export function marcarPausa(pausado: boolean) {
  document.querySelector('.driver-popover.tour-narrado')?.classList.toggle('tn-pausado', pausado);
}

/** Botón Pausar/Continuar del footer. `alternar` cambia el estado del tour y devuelve si quedó pausado. */
export function botonPausaNarrado(pausado: boolean, alternar: () => boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tn-pausa';
  const pintar = (p: boolean) => {
    b.innerHTML = `${p ? ICONO_PLAY : ICONO_PAUSA}<span>${p ? 'Continuar' : 'Pausar'}</span>`;
    b.setAttribute('aria-pressed', String(p));
    marcarPausa(p);
  };
  pintar(pausado);
  b.addEventListener('click', () => pintar(alternar()));
  return b;
}
