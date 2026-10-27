// features/practicas/tour/tutorialPracticaLinux.ts — tour narrado que se muestra cada vez que un estudiante
// entra a una práctica de Linux (ver TourPracticaLinux.tsx) o de circuitos (features/circuitos/tour/), cada una con
// sus pasos y su carpeta de audios. Motor deliberadamente más simple que tutorialBienvenida.ts: todo lo que resalta
// ya está en pantalla (la práctica ya está conectada), así que no hace falta navegar entre páginas ni
// mostrar ventanas/escenas — solo esperar a que cada elemento exista y resaltarlo.
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '@/features/onboarding/tourStyles.css';
import { PASOS_PRACTICA_LINUX, type PasoTourPractica } from './pasos';
import { botonPausaNarrado, cuerpoNarrado, marcarPausa, tituloNarrado } from '@/features/onboarding/narrado';
import { esperarElementoVisible } from '@/features/onboarding/elementoVisible';

const PAUSA_ENTRE_PASOS_MS = 700;
const ESPERA_ELEMENTO_MS = 3000;
// Si el audio no suena (equipo sin parlantes, Linux sin códec de mp3) o nunca avisa que terminó, el tour
// sigue igual con los subtítulos: espera lo que se tarda en leer el texto. Antes quedaba en pausa esperando
// «Siguiente →», y quien no lo sabía veía las tarjetas quietas, como colgado.
const MS_POR_PALABRA = 420;
const LECTURA_MINIMA_MS = 3500;
const MARGEN_FIN_AUDIO_MS = 2000;

/** Lo que cambia de un tour a otro: sus pasos y la carpeta de public/tutorial/ con los audios (y clips). */
export interface TourPractica {
  pasos: PasoTourPractica[];
  carpeta: string;
}

let tour: TourPractica = { pasos: PASOS_PRACTICA_LINUX, carpeta: 'practica-linux' };
let drv: Driver | null = null;
let audio: HTMLAudioElement | null = null;
let indice = 0;
let pausado = false;
let siguienteTimer: ReturnType<typeof setTimeout> | null = null;
let alTerminar: (() => void) | null = null;

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

const esperarElemento = (selectores: string[]) => esperarElementoVisible(selectores, ESPERA_ELEMENTO_MS);

function botonPausa(): HTMLButtonElement {
  return botonPausaNarrado(pausado, () => {
    pausado = !pausado;
    if (pausado) { limpiarTimer(); audio?.pause(); }
    else if (audio && !audio.ended) {
      void audio.play().catch(() => {});
      const resta = (audio.duration - audio.currentTime) * 1000;
      programarSiguiente(indice, (Number.isFinite(resta) ? resta : tiempoDeLectura(tour.pasos[indice].texto)) + MARGEN_FIN_AUDIO_MS);
    }
    else void ir(indice + 1);
    return pausado;
  });
}

/** Pasa al paso siguiente dentro de `ms`, solo si seguimos en el paso `desde` y nadie pausó. */
function programarSiguiente(desde: number, ms: number) {
  limpiarTimer();
  if (desde === tour.pasos.length - 1) return; // el último se cierra con «¡Listo!»
  siguienteTimer = setTimeout(() => {
    if (pausado || desde !== indice) return;
    void ir(desde + 1);
  }, ms);
}

const tiempoDeLectura = (texto: string) => Math.max(LECTURA_MINIMA_MS, texto.split(/\s+/).length * MS_POR_PALABRA);

function reproducir(i: number) {
  pararAudio();
  const paso = tour.pasos[i];
  const a = new Audio(`/tutorial/${tour.carpeta}/${paso.audio}`);
  audio = a;
  a.onended = () => {
    marcarPausa(true);
    programarSiguiente(i, PAUSA_ENTRE_PASOS_MS);
  };
  void a.play()
    .then(() => {
      marcarPausa(false);
      // Red de seguridad: si `ended` nunca llega, avanza igual cuando el audio ya debió terminar.
      const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : tiempoDeLectura(paso.texto);
      programarSiguiente(i, dur + MARGEN_FIN_AUDIO_MS);
    })
    .catch(() => {
      // Sin audio: sigue con los subtítulos, al ritmo de lectura.
      audio = null;
      programarSiguiente(i, tiempoDeLectura(paso.texto));
    });
}

async function ir(i: number) {
  if (!drv) return;
  if (i < 0) return;
  if (i >= tour.pasos.length) { cerrarTourPracticaLinux(); return; }
  limpiarTimer();
  pararAudio();
  indice = i;
  const paso = tour.pasos[i];
  const el = await esperarElemento(paso.elementos);
  if (!drv || indice !== i) return;
  resaltar(paso, i, el);
  if (!pausado) reproducir(i);
}

function resaltar(paso: PasoTourPractica, i: number, el: Element | null) {
  if (!drv) return;
  const total = tour.pasos.length;
  const ultimo = i === total - 1;
  // con movimiento reducido el clip no arranca solo: queda con sus controles para verlo a voluntad
  const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const clip = paso.clip
    ? `<video class="tn-clip" src="/tutorial/${tour.carpeta}/${paso.clip}" muted loop playsinline ${quieto ? 'controls' : 'autoplay aria-hidden="true"'}></video>`
    : '';
  drv.highlight({
    element: el ?? undefined,
    popover: {
      title: tituloNarrado(paso.titulo, i, total),
      description: cuerpoNarrado(paso.texto, i, total, clip),
      side: el ? paso.lado : undefined,
      align: 'start',
      // Sin «X»: el tour de la práctica no se puede cerrar, termina con «¡Listo!» en el último paso.
      showButtons: ['previous', 'next'],
      disableButtons: i === 0 ? ['previous'] : [],
      prevBtnText: 'Anterior',
      nextBtnText: ultimo ? '¡Listo!' : 'Siguiente →',
      onNextClick: () => { void ir(i + 1); },
      onPrevClick: () => { void ir(i - 1); },
      onPopoverRender: (popover) => { popover.footerButtons.prepend(botonPausa()); },
    },
  });
}

/** Arranca el tour de Linux. Asume que la práctica ya está conectada y los paneles (chat, terminal) ya están en pantalla. */
export function iniciarTourPracticaLinux(onTerminar?: () => void) {
  iniciarTourPractica({ pasos: PASOS_PRACTICA_LINUX, carpeta: 'practica-linux' }, onTerminar);
}

/** Arranca un tour de práctica con sus pasos; lo que resalta ya debe estar en pantalla. */
export function iniciarTourPractica(config: TourPractica, onTerminar?: () => void) {
  cerrarTourPracticaLinux();
  tour = config;
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

function cerrarTourPracticaLinux() {
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
