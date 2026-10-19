// tours/tour_linux/tutorialPracticaLinux.ts — tour narrado que se ofrece la primera vez que un
// estudiante entra a UNA práctica de Linux puntual (por módulo, no una sola vez por usuario como el
// tour de bienvenida). Motor deliberadamente más simple que tutorialBienvenida.ts: todo lo que resalta
// ya está en pantalla (la práctica ya está conectada), así que no hace falta navegar entre páginas ni
// mostrar ventanas/escenas — solo esperar a que cada elemento exista y resaltarlo.
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../tourStyles.css';
import { PASOS_PRACTICA_LINUX, type PasoPracticaLinux } from './pasos';
import { botonPausaNarrado, cuerpoNarrado, marcarPausa, tituloNarrado } from '../narrado';

const PAUSA_ENTRE_PASOS_MS = 700;
const ESPERA_ELEMENTO_MS = 3000;

let drv: Driver | null = null;
let audio: HTMLAudioElement | null = null;
let indice = 0;
let pausado = false;
let siguienteTimer: ReturnType<typeof setTimeout> | null = null;
let alTerminar: (() => void) | null = null;

export const tourPracticaLinuxActivo = () => drv !== null;

// Mismo bloqueo que el tour de bienvenida: mientras dura el recorrido, nada de la app responde (ni la
// terminal ni el chat) salvo el globo del tour — ver tutorialBienvenida.ts para el razonamiento completo.
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
}

function pararAudio() {
  if (audio) { audio.onended = null; audio.pause(); audio = null; }
}

/** El primer selector que exista en pantalla, esperando un poco por si el panel recién se está montando. */
function esperarElemento(selectores: string[]): Promise<Element | null> {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const buscar = () => {
      for (const s of selectores) {
        const el = document.querySelector(s);
        const caja = el?.getBoundingClientRect();
        if (el && caja && caja.width > 0 && caja.height > 0) return resolve(el);
      }
      if (Date.now() - inicio >= ESPERA_ELEMENTO_MS) {
        for (const s of selectores) { const el = document.querySelector(s); if (el) return resolve(el); }
        return resolve(null);
      }
      setTimeout(buscar, 80);
    };
    buscar();
  });
}

function botonPausa(): HTMLButtonElement {
  return botonPausaNarrado(pausado, () => {
    pausado = !pausado;
    if (pausado) { limpiarTimer(); audio?.pause(); }
    else if (audio && !audio.ended) void audio.play().catch(() => {});
    else void ir(indice + 1);
    return pausado;
  });
}

function reproducir(i: number) {
  pararAudio();
  const a = new Audio(`/tutorial/practica-linux/${PASOS_PRACTICA_LINUX[i].audio}`);
  audio = a;
  a.onended = () => {
    marcarPausa(true);
    if (pausado || i !== indice || i === PASOS_PRACTICA_LINUX.length - 1) return;
    siguienteTimer = setTimeout(() => ir(i + 1), PAUSA_ENTRE_PASOS_MS);
  };
  // Sin salida de audio (o el sistema no deja reproducir): sigue con subtítulos y botones, en pausa.
  void a.play()
    .then(() => marcarPausa(false))
    .catch(() => { pausado = true; document.querySelector('.tn-pausa')?.replaceWith(botonPausa()); });
}

async function ir(i: number) {
  if (!drv) return;
  if (i < 0) return;
  if (i >= PASOS_PRACTICA_LINUX.length) { cerrarTourPracticaLinux(); return; }
  limpiarTimer();
  pararAudio();
  indice = i;
  const paso = PASOS_PRACTICA_LINUX[i];
  const el = await esperarElemento(paso.elementos);
  if (!drv || indice !== i) return;
  resaltar(paso, i, el);
  if (!pausado) reproducir(i);
}

function resaltar(paso: PasoPracticaLinux, i: number, el: Element | null) {
  if (!drv) return;
  const ultimo = i === PASOS_PRACTICA_LINUX.length - 1;
  drv.highlight({
    element: el ?? undefined,
    popover: {
      title: tituloNarrado(paso.titulo, i, PASOS_PRACTICA_LINUX.length),
      description: cuerpoNarrado(paso.texto, i, PASOS_PRACTICA_LINUX.length),
      side: el ? paso.lado : undefined,
      align: 'start',
      showButtons: ['previous', 'next', 'close'],
      disableButtons: i === 0 ? ['previous'] : [],
      prevBtnText: 'Anterior',
      nextBtnText: ultimo ? '¡Listo!' : 'Siguiente →',
      onNextClick: () => { void ir(i + 1); },
      onPrevClick: () => { void ir(i - 1); },
      onCloseClick: () => cerrarTourPracticaLinux(),
      onPopoverRender: (popover) => { popover.footerButtons.prepend(botonPausa()); },
    },
  });
}

/** Arranca el tour. Asume que la práctica ya está conectada y los paneles (chat, terminal) ya están en pantalla. */
export function iniciarTourPracticaLinux(onTerminar?: () => void) {
  cerrarTourPracticaLinux();
  alTerminar = onTerminar ?? null;
  pausado = false;
  document.body.classList.add('tpl-activo');
  bloquearApp(true);
  drv = driver({
    animate: true,
    smoothScroll: true,
    allowClose: false,
    allowKeyboardControl: false,
    disableActiveInteraction: true,
    overlayColor: '#0a0806',
    overlayOpacity: 0.72,
    stagePadding: 8,
    stageRadius: 12,
    popoverOffset: 18,
    popoverClass: 'tour-narrado tour-practica-linux',
  });
  void ir(0);
}

export function cerrarTourPracticaLinux() {
  limpiarTimer();
  pararAudio();
  document.body.classList.remove('tpl-activo');
  bloquearApp(false);
  if (drv) {
    const d = drv;
    drv = null;
    d.destroy();
    const fin = alTerminar;
    alTerminar = null;
    fin?.();
  }
}

// ── Visto / no visto (por usuario Y por módulo de práctica, en este equipo) ──
const clave = (usuario: string, moduleId: string) => `labo:tour-practica-linux:v1:${usuario}:${moduleId}`;

export function tourPracticaLinuxYaVisto(usuario: string, moduleId: string): boolean {
  try { return localStorage.getItem(clave(usuario, moduleId)) !== null; } catch { return true; }
}

export function marcarTourPracticaLinuxVisto(usuario: string, moduleId: string) {
  try { localStorage.setItem(clave(usuario, moduleId), new Date().toISOString()); } catch { /* sin almacenamiento: se volverá a ofrecer */ }
}
