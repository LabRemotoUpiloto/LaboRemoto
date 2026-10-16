// tour/bienvenida/pasos.ts — pasos del tutorial narrado de bienvenida (estudiantes). Cada paso suena con su audio
// (public/tutorial/bienvenida/NN.mp3, voces de ElevenLabs, guion en Cliente-Rust/tools/video-bienvenida/frases_elevenlabs.txt)
// y resalta un elemento real de la app. El texto es el subtítulo: debe decir lo mismo que el audio.
import { pedirVistaPracticas } from '../../services/practiceNavigation.service';

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

const img = (src: string, alt: string) => `<img class="tb-ilustracion-img" src="${src}" alt="${alt}" />`;

const pantallaPractica = `
  <div class="tb-maqueta" aria-hidden="true">
    <div class="tb-maqueta-terminal"><span>$ ls -l</span><span>$ cd prácticas</span><span class="tb-cursor">$ ▍</span></div>
    <div class="tb-maqueta-chat"><span class="tb-burbuja">Paso 1: lista los archivos con <b>ls</b></span><span class="tb-burbuja tb-ok">✓ Hecho</span></div>
  </div>`;

const pasosHechos = `
  <ul class="tb-checklist" aria-hidden="true">
    <li class="hecho">✓ Lista los archivos</li>
    <li class="hecho">✓ Entra a la carpeta</li>
    <li class="actual">→ Crea un archivo nuevo</li>
  </ul>`;

const asistente = `
  <div class="tb-maqueta-chat solo" aria-hidden="true">
    <span class="tb-burbuja tu">¿Qué hace el comando <b>chmod</b>?</span>
    <span class="tb-burbuja">Cambia los permisos de un archivo. Por ejemplo…</span>
  </div>`;

const insignia = `<div class="tb-insignia" aria-hidden="true">🏅</div>`;

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
    texto: 'En Prácticas están todas las prácticas del laboratorio, organizadas por tema: Linux, robótica y más.',
  },
  {
    audio: '06.mp3', titulo: 'Elige y comienza', pagina: 'practices', antes: () => pedirVistaPracticas(null),
    elementos: ['[data-tour="practicas-categorias"] > *:first-child', '[data-page="practices"]'], lado: 'right',
    // «elige un tema» → se abre Linux de verdad; «y luego una práctica, y pulsa Comenzar» → el botón del primer módulo
    luego: { aLosMs: 2000, antes: () => pedirVistaPracticas('linux'), elementos: ['[data-tour="practica-iniciar"]'], lado: 'bottom' },
    texto: 'Para empezar, elige un tema y luego una práctica, y pulsa Comenzar.',
  },
  {
    audio: '07.mp3', titulo: 'Tu contraseña institucional',
    texto: 'La aplicación te pedirá tu contraseña institucional y se conectará sola al equipo del laboratorio.',
    escena: 'contrasena', elementos: ['.tb-escena-contrasena'], lado: 'right',
  },
  {
    audio: '08.mp3', titulo: 'Terminal y chat',
    texto: 'Dentro de la práctica tienes la terminal, donde escribes los comandos, y al lado el chat, donde la guía te explica cada paso.',
    ilustracion: pantallaPractica,
  },
  {
    audio: '09.mp3', titulo: 'La guía avanza contigo',
    texto: 'La guía avanza contigo: cuando haces bien un paso, se marca como hecho y aparece el siguiente.',
    ilustracion: pasosHechos,
  },
  {
    audio: '10.mp3', titulo: 'Pregúntale al asistente',
    texto: 'Si tienes dudas, escríbele al asistente en el mismo chat. Te ayuda a entender lo que estás haciendo.',
    ilustracion: asistente,
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
