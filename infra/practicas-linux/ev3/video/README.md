# Video introductorio del módulo 1 de EV3

Mismo estilo que el video del módulo 1 de Linux (mascota Prof. Bee, fondos amarillo / oscuro /
crema con panal, tarjetas de colores, subtítulos en barra oscura). 1280x720, 30 fps.
Lo genera `gen_video_ev3.py` con Pillow, numpy y ffmpeg; no se versiona el video, solo el generador.

## Pasos

1. **Guion para las voces**: `python gen_video_ev3.py --export-script frases_elevenlabs.txt`
   (ya está generado como `frases_elevenlabs.txt`). Son 14 frases numeradas; las palabras en inglés
   van escritas como suenan (Línux, Páiton, Dáshbord, E-V tres). Los subtítulos sí llevan la
   ortografía correcta.
2. **Audios**: genera una voz por frase en ElevenLabs y guárdalas como `01.mp3` ... `14.mp3`
   en una carpeta. Usa siempre la misma voz que los videos de Linux.
3. **Revisar el diseño** (opcional): `python gen_video_ev3.py --sheet hoja.png`.
4. **Video final**: `python gen_video_ev3.py --audio-dir <carpeta> --out video-intro.mp4`.
   Las escenas y los subtítulos se alinean a la duración real de cada frase (se recortan los
   silencios del inicio y del final de cada audio).
   Sin `--audio-dir` se hace un borrador sin voz con duraciones estimadas.

## Publicarlo en el módulo

1. Copiar `video-intro.mp4` a la Pi4: `/opt/practicas-linux-api/content/ev3-m1/media/videos/video-intro.mp4`
   (dueño `pi:pi`, 644).
2. Agregar al `module.json` de `ev3-m1` (y al generador de módulos) un bloque, justo después de
   `b-intro`: `{ "type": "media", "id": "b-video-intro", "kind": "video", "file": "videos/video-intro.mp4",
   "caption": "Introducción: conociendo el EV3" }`.
3. Mantenerlo por debajo de ~5 MB: el enlace de la Pi es de ~23 Mbps y el video se baja bajo demanda.

## Escenas

1. Portada con Prof. Bee. 2. El ladrillo (pantalla, botones; Linux y Python). 3. Laboratorio remoto
(panel → puente → robot). 4. Sensores y actuadores. 5. Los 8 puertos (A–D motores, 1–4 sensores).
6. Dos ruedas, cualquier movimiento. 7. "Ahora, a practicar" (Dashboard, Consola, preguntas).
