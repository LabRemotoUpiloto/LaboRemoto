// tours/tour_linux/pasos.ts — pasos del tour narrado que se ofrece al entrar por primera vez a una
// práctica de Linux. Cada paso suena con su audio (public/tutorial/practica-linux/NN.mp3, voz clonada
// del Profesor Bee con VoiceStudio, guion en Cliente-Rust/tools/practica-linux-tour/frases_elevenlabs.txt)
// y resalta un elemento real de la pantalla de práctica (ya abierta — a diferencia del tour de bienvenida,
// este no navega entre páginas). El texto es el subtítulo: debe decir lo mismo que el audio.
export interface PasoPracticaLinux {
  /** Archivo de audio en public/tutorial/practica-linux/. */
  audio: string;
  titulo: string;
  /** Subtítulo: lo mismo que dice la voz. */
  texto: string;
  /** Selector del elemento real a resaltar (data-tour en el componente correspondiente). */
  elementos: string[];
  lado?: 'top' | 'right' | 'bottom' | 'left';
}

export const PASOS_PRACTICA_LINUX: PasoPracticaLinux[] = [
  {
    audio: '01.mp3', titulo: 'Tu chat-guía',
    texto: 'Este es tu chat. Te va diciendo qué hacer en cada paso, y le puedes preguntar lo que quieras.',
    elementos: ['[data-tour="practica-chat"]'], lado: 'left',
  },
  {
    audio: '02.mp3', titulo: 'La terminal',
    texto: 'Esta es la terminal. Aquí escribes los comandos que el chat te vaya pidiendo.',
    elementos: ['[data-tour="practica-terminal"]'], lado: 'right',
  },
  {
    audio: '03.mp3', titulo: 'Tu progreso',
    texto: 'Arriba ves cuánto llevas: cuántos pasos has completado y cuántos faltan.',
    elementos: ['[data-tour="practica-progreso"]'], lado: 'bottom',
  },
  {
    audio: '04.mp3', titulo: 'Pregunta cuando quieras',
    texto: 'Y aquí abajo le escribes tus preguntas al chat, cuando tengas dudas.',
    elementos: ['[data-tour="practica-pregunta"]'], lado: 'top',
  },
];
