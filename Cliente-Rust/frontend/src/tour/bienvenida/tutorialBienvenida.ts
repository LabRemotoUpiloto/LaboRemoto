// tour/bienvenida/tutorialBienvenida.ts — tutorial narrado: por cada paso abre la página, resalta el elemento real con
// driver.js y reproduce su audio; al terminar el audio pasa solo al siguiente. Se puede pausar, retroceder, avanzar o cerrar.
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../tourStyles.css';
import './bienvenida.css';
import { PASOS_BIENVENIDA, type EscenaTutorial, type PasoBienvenida } from './pasos';

const PAUSA_ENTRE_PASOS_MS = 700;
// Las categorías de Prácticas vienen de la Pi y pueden tardar: se espera un poco antes de caer al botón del menú.
const ESPERA_ELEMENTO_MS = 4000;

let drv: Driver | null = null;
let audio: HTMLAudioElement | null = null;
let indice = 0;
let pausado = false;
let siguienteTimer: ReturnType<typeof setTimeout> | null = null;
let luegoTimer: ReturnType<typeof setTimeout> | null = null;

// Ventana real que se muestra en el paso actual (la pinta <EscenaTutorial/>, en BienvenidaTutorial.tsx).
let escena: EscenaTutorial | null = null;
const oyentesEscena = new Set<() => void>();
function setEscena(e: EscenaTutorial | null) {
  if (escena === e) return;
  escena = e;
  oyentesEscena.forEach((f) => f());
}
export const escenaTutorial = {
  leer: () => escena,
  suscribir: (f: () => void) => { oyentesEscena.add(f); return () => { oyentesEscena.delete(f); }; },
};
let abrirPagina: (pagina: string) => void = () => {};
let alTerminar: (() => void) | null = null;

export const tutorialBienvenidaActivo = () => drv !== null;

// Mientras dura el recorrido, nada de la app responde (aunque esté resaltado): solo el globo del tutorial. driver.js ya lo
// hace con CSS (disableActiveInteraction), pero esto lo garantiza aunque otro estilo cambie los pointer-events.
const EVENTOS_BLOQUEADOS = ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu', 'keydown', 'keyup'] as const;

function bloquear(e: Event) {
  const destino = e.target instanceof Element ? e.target : null;
  if (destino?.closest('.driver-popover')) return;
  e.stopPropagation();
  e.preventDefault();
}

function bloquearApp(activo: boolean) {
  for (const tipo of EVENTOS_BLOQUEADOS) {
    if (activo) window.addEventListener(tipo, bloquear, true);
    else window.removeEventListener(tipo, bloquear, true);
  }
}

function limpiarTimer() {
  if (siguienteTimer) { clearTimeout(siguienteTimer); siguienteTimer = null; }
  if (luegoTimer) { clearTimeout(luegoTimer); luegoTimer = null; }
}

function pararAudio() {
  if (audio) { audio.onended = null; audio.pause(); audio = null; }
}

/** El primer selector que exista en pantalla, esperando un poco a que la página recién abierta lo pinte. */
function esperarElemento(selectores: string[]): Promise<Element | null> {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const buscar = () => {
      for (const s of selectores) {
        const el = document.querySelector(s);
        const caja = el?.getBoundingClientRect();
        if (el && caja && caja.width > 0 && caja.height > 0) return resolve(el);
      }
      // El primero es el preferido: mientras haya tiempo se espera por él; al final vale cualquiera de la lista.
      if (Date.now() - inicio >= ESPERA_ELEMENTO_MS) {
        for (const s of selectores) { const el = document.querySelector(s); if (el) return resolve(el); }
        return resolve(null);
      }
      setTimeout(buscar, 80);
    };
    buscar();
  });
}

function descripcion(paso: PasoBienvenida, i: number): string {
  return `${paso.ilustracion ? `<div class="tb-ilustracion">${paso.ilustracion}</div>` : ''}
    <p class="tb-subtitulo">${paso.texto}</p>
    <div class="tb-progreso" aria-label="Paso ${i + 1} de ${PASOS_BIENVENIDA.length}">
      ${PASOS_BIENVENIDA.map((_, j) => `<span class="${j < i ? 'hecho' : j === i ? 'actual' : ''}"></span>`).join('')}
    </div>`;
}

function botonPausa(): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tb-pausa';
  const pintar = () => { b.textContent = pausado ? '▶ Continuar' : '⏸ Pausar'; b.setAttribute('aria-pressed', String(pausado)); };
  pintar();
  b.addEventListener('click', () => {
    pausado = !pausado;
    if (pausado) { limpiarTimer(); audio?.pause(); }
    else if (audio && !audio.ended) void audio.play().catch(() => {});
    else ir(indice + 1);
    pintar();
  });
  return b;
}

function reproducir(i: number) {
  pararAudio();
  const a = new Audio(`/tutorial/bienvenida/${PASOS_BIENVENIDA[i].audio}`);
  audio = a;
  a.onended = () => {
    if (pausado || i !== indice || i === PASOS_BIENVENIDA.length - 1) return;
    siguienteTimer = setTimeout(() => ir(i + 1), PAUSA_ENTRE_PASOS_MS);
  };
  // Si el sistema no deja reproducir (sin salida de audio, por ejemplo), el tutorial sigue con los subtítulos y los botones.
  void a.play().catch(() => { pausado = true; document.querySelector('.tb-pausa')?.replaceWith(botonPausa()); });
}

async function ir(i: number) {
  if (!drv) return;
  if (i < 0) return;
  if (i >= PASOS_BIENVENIDA.length) { cerrarTutorialBienvenida(); return; }
  limpiarTimer();
  pararAudio();
  indice = i;
  const paso = PASOS_BIENVENIDA[i];
  if (paso.pagina) abrirPagina(paso.pagina);
  paso.antes?.();
  setEscena(paso.escena ?? null);
  const el = paso.elementos ? await esperarElemento(paso.elementos) : null;
  if (!drv || indice !== i) return; // se cerró o se movió mientras esperaba
  resaltar(paso, i, el, paso.lado);
  if (!pausado) reproducir(i);
  const luego = paso.luego;
  if (luego) {
    luegoTimer = setTimeout(async () => {
      if (!drv || indice !== i) return;
      luego.antes?.();
      const el2 = await esperarElemento(luego.elementos);
      if (drv && indice === i && el2) resaltar(paso, i, el2, luego.lado);
    }, luego.aLosMs);
  }
}

function resaltar(paso: PasoBienvenida, i: number, el: Element | null, lado: PasoBienvenida['lado']) {
  if (!drv) return;
  const ultimo = i === PASOS_BIENVENIDA.length - 1;
  drv.highlight({
    element: el ?? undefined,
    popover: {
      title: paso.titulo,
      description: descripcion(paso, i),
      side: el ? lado : undefined,
      align: 'start',
      showButtons: ['previous', 'next', 'close'],
      disableButtons: i === 0 ? ['previous'] : [],
      prevBtnText: '← Anterior',
      nextBtnText: ultimo ? '¡Listo! ✓' : 'Siguiente →',
      onNextClick: () => { void ir(i + 1); },
      onPrevClick: () => { void ir(i - 1); },
      onCloseClick: () => cerrarTutorialBienvenida(),
      onPopoverRender: (popover) => { popover.footerButtons.prepend(botonPausa()); },
    },
  });
}

/** Arranca el tutorial. `abrir` abre una página de la app (el mismo `handleOpenPanel` que usa el menú). */
export function iniciarTutorialBienvenida(abrir: (pagina: string) => void, onTerminar?: () => void) {
  cerrarTutorialBienvenida();
  abrirPagina = abrir;
  alTerminar = onTerminar ?? null;
  pausado = false;
  document.body.classList.add('tb-activo');
  bloquearApp(true);
  drv = driver({
    animate: true,
    smoothScroll: true,
    allowClose: false,
    allowKeyboardControl: false,
    // Lo resaltado se ve pero no se puede usar hasta terminar el recorrido (ni clics ni teclado sobre la app).
    disableActiveInteraction: true,
    // La capa oscura la dibuja driver.js con un recorte sobre el elemento: así el elemento se ve tal cual, aunque esté
    // dentro del menú. (El tour viejo pinta la capa con CSS; esa regla no se aplica con la clase tb-activo.)
    overlayColor: '#0a0806',
    overlayOpacity: 0.72,
    stagePadding: 8,
    stageRadius: 12,
    popoverOffset: 18,
    popoverClass: 'tutorial-bienvenida',
  });
  void ir(0);
}

export function cerrarTutorialBienvenida() {
  limpiarTimer();
  pararAudio();
  document.body.classList.remove('tb-activo');
  bloquearApp(false);
  setEscena(null);
  if (drv) {
    const d = drv;
    drv = null;
    d.destroy();
    const fin = alTerminar;
    alTerminar = null;
    fin?.();
  }
}

// ── Visto / no visto (por usuario, en este equipo) ──
const clave = (usuario: string) => `labo:tutorial-bienvenida:v1:${usuario}`;

export function tutorialYaVisto(usuario: string): boolean {
  try { return localStorage.getItem(clave(usuario)) !== null; } catch { return true; }
}

export function marcarTutorialVisto(usuario: string) {
  try { localStorage.setItem(clave(usuario), new Date().toISOString()); } catch { /* sin almacenamiento: se volverá a ofrecer */ }
}
