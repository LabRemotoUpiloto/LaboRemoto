// features/circuitos/tour/pasos.ts — pasos del tour narrado que se muestra al abrir una práctica de circuitos. Mismo motor
// que el de Linux (practicas/tour/tutorialPracticaLinux.ts). Audios en public/tutorial/practica-circuitos/NN.mp3 (voz del
// Profesor Bee con VoiceStudio; guion en Cliente-Rust/tools/practica-circuitos-tour/frases.txt). Lo que pasa dentro del
// simulador no se puede resaltar (es otra página, en un iframe): esos pasos resaltan el simulador entero y muestran un
// clip grabado del simulador real (clip-*.mp4, en la misma carpeta).
import type { PasoTourPractica } from '@/features/practicas/tour/pasos';

export const CARPETA_TOUR_CIRCUITOS = 'practica-circuitos';

export const PASOS_PRACTICA_CIRCUITOS: PasoTourPractica[] = [
  {
    audio: '01.mp3', titulo: 'Tu chat-guía',
    texto: 'Este es tu chat. Te da la práctica paso a paso, y le puedes preguntar lo que quieras.',
    elementos: ['[data-tour="practica-chat"]'], lado: 'left',
  },
  {
    audio: '02.mp3', titulo: 'Qué toca ahora',
    texto: 'Aquí ves qué toca ahora. Se marca solo cuando lo logras en el simulador.',
    elementos: ['[data-tour="practica-guia"]'], lado: 'left',
  },
  {
    audio: '03.mp3', titulo: 'Encajar las piezas',
    texto: 'Para poner una pieza en la protoboard, arrástrala y suéltala sobre los agujeros.',
    elementos: ['[data-tour="circuito-simulador"]'], lado: 'right', clip: 'clip-encajar.mp4',
  },
  {
    audio: '04.mp3', titulo: 'Hacer un cable',
    texto: 'Para hacer un cable, haz clic en un borne o en una pata, y luego en el agujero donde lo quieres llevar.',
    elementos: ['[data-tour="circuito-simulador"]'], lado: 'right', clip: 'clip-cable.mp4',
  },
  {
    audio: '05.mp3', titulo: 'Cambiar la resistencia',
    texto: 'Para cambiar el valor de la resistencia, haz clic derecho sobre ella.',
    elementos: ['[data-tour="circuito-simulador"]'], lado: 'right', clip: 'clip-resistencia.mp4',
  },
  {
    audio: '06.mp3', titulo: 'Pregúntale al tutor',
    texto: 'Si algo no funciona, pregúntale al tutor: él ve tu circuito.',
    elementos: ['[data-tour="practica-pregunta"]'], lado: 'top',
  },
  {
    audio: '07.mp3', titulo: 'Empezar de nuevo',
    texto: 'Y si te enredas, con este botón vuelves a poner las piezas como al principio.',
    elementos: ['[data-tour="circuito-reiniciar"]'], lado: 'bottom',
  },
];
