# Video introductorio del módulo 1 de EV3

Mismo estilo que el video del módulo 1 de Linux (mascota Prof. Bee, fondos amarillo / oscuro /
crema con panal, tarjetas de colores, subtítulos en barra oscura). 1280x720, 30 fps.
El robot que aparece es **el del Gemelo 3D del cliente** (`components/ev3/Ev3Twin.tsx`), renderizado
tal cual en un navegador sin pantalla; si el diseño del Gemelo cambia, el video se regenera con el
cambio. No se versiona el video, solo las herramientas.

## Piezas

| Archivo | Para qué |
|---|---|
| `gen_video_ev3.py` | Arma las escenas 2D, los subtítulos, el audio y el MP4 final (Pillow + numpy + ffmpeg). |
| `twin/main.tsx` | Página que monta `Ev3Robot` + `Floor` del Gemelo 3D y la maneja fotograma a fotograma. |
| `twin/build.mjs` | Empaqueta la página con el esbuild y las dependencias de `Cliente-Rust/frontend`. |
| `twin/capture.mjs` | Captura los planos como PNG con Edge sin pantalla (Playwright, que ya es dependencia de desarrollo). |
| `frases_elevenlabs.txt` | Guion por frases para generar las voces. |

## Pasos

1. **Voces**: genera una por frase de `frases_elevenlabs.txt` en ElevenLabs y guárdalas como
   `1.mp3` ... `14.mp3` (también vale `01.mp3`) en una carpeta. Las palabras en inglés ya van
   escritas como suenan (Línux, Páiton, Dáshbord, E-V tres); los subtítulos llevan la ortografía correcta.
2. **Calendario de planos 3D** (usa las duraciones reales de las voces):
   `python gen_video_ev3.py --audio-dir <audios> --emit-shots shots.json`
3. **Robot 3D**: `cd twin && node build.mjs && node capture.mjs ../shots.json <frames>`
   (~0,25 s por fotograma; unos 10 minutos para todo el video).
4. **Video final**:
   `python gen_video_ev3.py --audio-dir <audios> --twin-dir <frames> --out video-intro.mp4`
   Las escenas y los subtítulos se alinean a la duración real de cada frase (se recortan los
   silencios del inicio y del final de cada audio).
   `--sheet hoja.png` genera una hoja de contacto para revisar el diseño; sin `--audio-dir`
   se hace un borrador sin voz con duraciones estimadas.

## Publicarlo en el módulo

1. Copiar `video-intro.mp4` a la Pi4: `/opt/practicas-linux-api/content/ev3-m1/media/videos/video-intro.mp4`
   (dueño `pi:pi`, 644).
2. Agregar al `module.json` de `ev3-m1` (y al generador de módulos) un bloque, justo después de
   `b-intro`: `{ "type": "media", "id": "b-video-intro", "kind": "video", "file": "videos/video-intro.mp4",
   "caption": "Introducción: conociendo el EV3" }`.
3. Mantenerlo por debajo de ~5 MB: el enlace de la Pi es de ~23 Mbps y el video se baja bajo demanda.

## Escenas

1. Portada con Prof. Bee. 2. El ladrillo en 3D (pantalla, botones, batería; Linux y Python).
3. Laboratorio remoto (panel → puente → robot). 4. Sensores y actuadores (anillos sobre el robot 3D).
5. Los 8 puertos (motores A–D, sensores 1–4 señalados en el robot). 6. Dos ruedas, cualquier
movimiento (el robot 3D maneja de verdad). 7. "Ahora, a practicar".

## Notas técnicas

- `advance()` de react-three-fiber en `frameloop="never"` recibe **segundos**; pasarle milisegundos
  hace que el balanceo del robot (que usa `delta`) diverja.
- Las posiciones de las partes del robot en pantalla (pantalla, botones, ruedas, sensores) se
  proyectan en cada fotograma y se guardan en `meta.json`, para que los señalamientos 2D sigan al robot.
- Requiere Microsoft Edge (`channel: 'msedge'`) y las fuentes de Windows (Segoe UI, Consolas).
