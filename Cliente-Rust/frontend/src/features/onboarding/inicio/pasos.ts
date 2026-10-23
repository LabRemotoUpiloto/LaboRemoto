// tour/bienvenida/pasos.ts — pasos del tutorial narrado de bienvenida (estudiantes). Cada paso suena con su audio
// (public/tutorial/bienvenida/NN.mp3, voces de ElevenLabs, guion en Cliente-Rust/tools/video-bienvenida/frases_elevenlabs.txt)
// y resalta un elemento real de la app. El texto es el subtítulo: debe decir lo mismo que el audio.
import { pedirVistaPracticas } from '@/features/practicas/practiceNavigation.service';

/** Ventana real de la app que el tutorial muestra en un paso (solo para verla: no hace nada). */
export type EscenaTutorial = 'contrasena';

export interface PasoBienvenida {
  /** Archivo de audio en public/tutorial/bienvenida/. */
  audio: string;
  titulo: string;
  /** Subtítulo: lo mismo que dice la voz. */
  texto: string;
  /** Página que se abre antes de resaltar (ids de HomeContainer: landing, practices…). */
  pagina?: string;
  /** Elementos a resaltar, en orden de preferencia: se usa el primero que exista. Sin ninguno, el globo va al centro. */
  elementos?: string[];
  lado?: 'top' | 'right' | 'bottom' | 'left';
  /** Imagen o ilustración para los pasos sin elemento en pantalla (HTML propio, sin datos del usuario). */
  ilustracion?: string;
  /** Prepara la pantalla antes de resaltar (p. ej. volver a la lista de temas). */
  antes?: () => void;
  /** Ventana real que se muestra durante el paso. */
  escena?: EscenaTutorial;
  /** A mitad de la frase, cambia lo resaltado (p. ej. «elige un tema… y luego una práctica»). */
  luego?: { aLosMs: number; antes?: () => void; elementos: string[]; lado?: PasoBienvenida['lado'] };
}

// Clases de Tailwind directas en el HTML: tailwind.config.js escanea src/**/*.ts, así que esto se compila igual
// que si fueran className de JSX. Las animaciones tb-entrar/tb-insignia/tb-chat-zoom están registradas ahí mismo
// (theme.extend.keyframes/animation). Los colores usan las variables CSS del tema (se resuelven en runtime, no
// son estáticos de Tailwind) vía la sintaxis de valor arbitrario `bg-[var(--x)]`.
const BURBUJA = 'px-[9px] py-1.5 rounded-lg bg-[var(--background-secondary)] text-[var(--text-primary)] text-xs leading-[1.35]';
const BURBUJA_TU = `${BURBUJA} self-end bg-[var(--accent-primary)] text-white`;

const img = (src: string, alt: string) =>
  `<img class="w-[132px] h-[132px] object-contain rounded-full bg-white border-2 border-[var(--accent-primary)] animate-[tbEntrar_0.45s_ease-out_both]" src="${src}" alt="${alt}" />`;

// Genérico a propósito: no todas las prácticas tienen terminal (hay de robótica, circuitos, cámaras…), pero
// TODAS comparten este chat-guía. Nada de comandos ni jerga técnica aquí — el público son estudiantes nuevos.
// Fiel al chat real (header con avatar + nombre, burbujas, caja de pregunta abajo) para que el estudiante
// reconozca el panel cuando lo vea de verdad. El zoom (tb-chat-zoom) cae ~3.5s adentro del audio, cuando la
// narración dice «se lo preguntas ahí mismo» — ajustar ese delay si se regrabó el audio con otro ritmo.
const chatTutor = `
  <div class="grid grid-cols-[0.55fr_1.45fr] gap-2 w-full animate-[tbEntrar_0.45s_ease-out_both]" aria-hidden="true">
    <div class="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg bg-[var(--background-tertiary)] text-[var(--text-secondary)] text-[11px] text-center">
      <span class="text-[22px]">🧪</span>
      <span>Tu práctica</span>
    </div>
    <div class="flex flex-col gap-1.5 p-2 rounded-lg border border-transparent bg-[var(--background-tertiary)] animate-[tbChatZoom_1.3s_ease-out_3.5s_both]">
      <div class="flex items-center gap-2 pb-1.5 border-b border-[var(--border-subtle)]">
        <span class="w-[26px] h-[26px] shrink-0 flex items-center justify-center rounded-full bg-[var(--background-secondary)] text-[15px]">🐝</span>
        <div>
          <strong class="block text-xs text-[var(--text-primary)]">Asistente</strong>
          <small class="text-[10px] text-[var(--text-tertiary)]">Te explica y responde tus dudas</small>
        </div>
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="${BURBUJA}">Vamos con el primer paso: sigue las instrucciones de la pantalla.</span>
        <span class="${BURBUJA_TU}">¿Y esto para qué sirve?</span>
        <span class="${BURBUJA}">¡Buena pregunta! Te explico…</span>
      </div>
      <div class="mt-0.5 px-2.5 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--background-secondary)] text-[11px] text-[var(--text-tertiary)]">
        Pregunta lo que quieras…
      </div>
    </div>
  </div>`;

// Demo de "escribir y enviar": tecleo letra por letra (tbTypewriter, ver bienvenida.css) de la MISMA
// pregunta que después aparece como burbuja enviada, para que se note que es "la pregunta viajando" al
// chat. Tiempos (relativos al inicio del paso): 0.3s-2.3s teclea, ~2.0s el ícono de enviar reacciona,
// 2.0s aparece la burbuja del estudiante, 2.5s la respuesta — recalibrar con la duración real del audio.
const chatDemo = `
  <div class="grid grid-cols-[0.55fr_1.45fr] gap-2 w-full animate-[tbEntrar_0.45s_ease-out_both]" aria-hidden="true">
    <div class="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg bg-[var(--background-tertiary)] text-[var(--text-secondary)] text-[11px] text-center">
      <span class="text-[22px]">🧪</span>
      <span>Tu práctica</span>
    </div>
    <div class="flex flex-col gap-1.5 p-2 rounded-lg bg-[var(--background-tertiary)]">
      <div class="flex items-center gap-2 pb-1.5 border-b border-[var(--border-subtle)]">
        <span class="w-[26px] h-[26px] shrink-0 flex items-center justify-center rounded-full bg-[var(--background-secondary)] text-[15px]">🐝</span>
        <div>
          <strong class="block text-xs text-[var(--text-primary)]">Asistente</strong>
          <small class="text-[10px] text-[var(--text-tertiary)]">Te explica y responde tus dudas</small>
        </div>
      </div>
      <div class="flex flex-col gap-1.5 min-h-[62px]">
        <span class="${BURBUJA}">Vamos con el primer paso: sigue las instrucciones de la pantalla.</span>
        <span class="${BURBUJA_TU} [animation:tbEntrar_0.3s_ease-out_2s_both]">¿Qué significa esto?</span>
        <span class="${BURBUJA} [animation:tbEntrar_0.3s_ease-out_2.5s_both]">¡Claro! Te explico…</span>
      </div>
      <div class="mt-0.5 flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--background-secondary)] text-[11px] text-[var(--text-tertiary)]">
        <span class="inline-block whitespace-nowrap overflow-hidden [animation:tbTypewriter_2s_linear_0.3s_both]">¿Qué significa esto?</span>
        <span class="ml-auto [animation:tbSendPop_0.3s_ease-out_1.8s_both]">➤</span>
      </div>
    </div>
  </div>`;

// Genérico a propósito (igual que chatTutor): no todas las prácticas se resuelven igual, pero
// todas marcan los pasos como hechos de la misma forma.
const pasosHechos = `
  <ul class="list-none m-0 p-0 flex flex-col gap-1.5 w-full" aria-hidden="true">
    <li class="px-2.5 py-[7px] rounded-lg bg-[var(--background-tertiary)] text-[13px] animate-[tbEntrar_0.45s_ease-out_both] text-[#3fb950]">✓ Paso 1 — Hecho</li>
    <li class="px-2.5 py-[7px] rounded-lg bg-[var(--background-tertiary)] text-[13px] animate-[tbEntrar_0.45s_ease-out_both] text-[#3fb950] [animation-delay:0.25s]">✓ Paso 2 — Hecho</li>
    <li class="px-2.5 py-[7px] rounded-lg bg-[var(--background-tertiary)] text-[13px] animate-[tbEntrar_0.45s_ease-out_both] border border-[var(--accent-primary)] text-[var(--text-primary)] [animation-delay:0.5s]">→ Paso 3</li>
  </ul>`;

const insignia = `<div class="text-[54px] animate-[tbInsignia_1.4s_ease-out_both]" aria-hidden="true">🏅</div>`;

export const PASOS_BIENVENIDA: PasoBienvenida[] = [
  {
    audio: '01.mp3', titulo: 'Bienvenido a LaboRemoto', pagina: 'landing',
    texto: 'Hola, soy el Profesor Bee. Bienvenido a LaboRemoto, el laboratorio remoto de la Universidad Piloto.',
    ilustracion: img('/abeja-Profesor.jpeg', 'Profesor Bee'),
  },
  {
    audio: '02.mp3', titulo: 'Un laboratorio real, desde tu computador',
    texto: 'Desde tu computador vas a manejar equipos reales del laboratorio, como robots y otros computadores, sin necesidad de estar allí.',
    ilustracion: img('/Abeja Computador.png', 'Profesor Bee con un computador'),
  },
  {
    audio: '03.mp3', titulo: 'El menú', elementos: ['[data-tour="sidebar-navigation"]'], lado: 'right',
    texto: 'A la izquierda tienes el menú. Desde ahí llegas a todo lo que necesitas.',
  },
  {
    audio: '04.mp3', titulo: 'Inicio', pagina: 'landing',
    elementos: ['[data-tour="inicio-tutorial"]', '[data-page="landing"]'], lado: 'bottom',
    texto: 'En Inicio tienes los accesos rápidos y el botón para volver a ver este tutorial cuando quieras.',
  },
  {
    audio: '05.mp3', titulo: 'Prácticas', pagina: 'practices', antes: () => pedirVistaPracticas(null),
    elementos: ['[data-tour="practicas-categorias"]', '[data-page="practices"]'], lado: 'bottom',
    texto: 'En Prácticas están todas las prácticas del laboratorio, organizadas por tema: computadores, robots y más.',
  },
  {
    audio: '06.mp3', titulo: 'Elige y comienza', pagina: 'practices', antes: () => pedirVistaPracticas(null),
    elementos: ['[data-tour="practicas-categorias"] > *:first-child', '[data-page="practices"]'], lado: 'right',
    // «elige un tema» → se abre Linux de verdad; «y luego una práctica, y pulsa Iniciar Práctica» → el botón
    // real del primer módulo (PracticeCard.tsx dice «Iniciar Práctica», no «Comenzar» — ver el texto exacto).
    // 3.2s (audio de 5.28s) para que a la card de categoría le dé tiempo de verse antes de saltar al botón — con
    // 2s antes no alcanzaba a entenderse que esas cards son clicables.
    luego: { aLosMs: 3200, antes: () => pedirVistaPracticas('linux'), elementos: ['[data-tour="practica-iniciar"]'], lado: 'bottom' },
    texto: 'Para empezar, elige un tema y luego una práctica, y pulsa Iniciar Práctica.',
  },
  {
    audio: '07.mp3', titulo: 'Tu contraseña institucional',
    texto: 'La aplicación te pedirá tu contraseña institucional y se conectará sola al equipo del laboratorio.',
    escena: 'contrasena', elementos: ['.tb-escena-contrasena'], lado: 'right',
  },
  {
    audio: '08.mp3', titulo: 'Tu chat-guía',
    texto: 'Dentro de cada práctica tienes un chat a la derecha. Es tu guía: te va diciendo qué hacer en cada paso. Y si no entiendes algo, se lo preguntas ahí mismo y te responde.',
    ilustracion: chatTutor,
  },
  {
    audio: '09.mp3', titulo: 'Escribe tu pregunta',
    texto: 'Mira cómo se hace: escribes tu pregunta aquí abajo, así, y la envías.',
    ilustracion: chatDemo,
  },
  {
    audio: '10.mp3', titulo: 'La guía avanza contigo',
    texto: 'La guía avanza contigo: cuando haces bien un paso, se marca como hecho y aparece el siguiente.',
    ilustracion: pasosHechos,
  },
  {
    audio: '11.mp3', titulo: 'Tus insignias', elementos: ['[data-tour="sidebar-usuario"]'], lado: 'right',
    texto: 'Al completar una práctica ganas una insignia. Las encuentras en tu perfil, en la Sala de Trofeos.',
    ilustracion: insignia,
  },
  {
    audio: '13.mp3', titulo: '¡A practicar!', pagina: 'landing',
    texto: 'Y ya está. Elige tu primera práctica y empieza a aprender haciendo.',
    ilustracion: img('/abeja-Profesor.jpeg', 'Profesor Bee'),
  },
];
