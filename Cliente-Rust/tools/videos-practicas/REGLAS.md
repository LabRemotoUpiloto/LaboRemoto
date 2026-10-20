# Reglas para los videos de las prácticas

Cómo se hacen los videos animados que acompañan a los módulos de Linux (en la Pi, `content/<módulo>/media/videos/`).
Leerlo antes de hacer uno nuevo. Ejemplos ya hechos: «Tu carpeta personal» (módulo 2) y «Permisos» (módulo 3).

## Para qué es un video

- Explica lo que en texto se vuelve enredado para alguien que **nunca usó una terminal**: algo visual, con partes que
  se mueven o se transforman (rutas, el árbol de carpetas, una línea de `ls -l`, los permisos).
- Dura entre 1 y 1:30. Una idea por video.
- Va donde el estudiante lo necesita. Si resuelve un problema, después de que el problema aparece (ej. el video de
  permisos va justo después de «Permiso denegado»).
- Termina invitando a hacer algo en la terminal («Probalo vos: escribí…»).

## Elegir, no acumular

Las 9 técnicas de abajo son una caja de herramientas, **no una lista que haya que cumplir entera**. Para cada video
se eligen las que le sirven a lo que se explica, y se usan con medida:

- **Cuanto más texto hay en pantalla para leer (terminal, salidas, etiquetas), menos tiene que moverse.** El texto
  que se lee nunca flota, nunca tiembla ni «respira».
- **El micro-movimiento (9) es la excepción, no la regla:** como mucho uno o dos elementos decorativos en un momento
  de pausa larga, casi imperceptible. Si se nota, sobra. El cursor que parpadea suele alcanzar.
- **El rebote (6) va en los remates** (el chip que presenta una idea, el resultado que cierra una explicación), no
  en cada elemento que entra. Una lista o una salida de terminal entra con un desliz corto sin rebote.
- **El parallax (8)** solo cuando la cámara recorre distancias largas, y sutil (el fondo, sin capas que distraigan).
- Ante la duda, menos. Un video tranquilo donde se mueve solo lo que se está explicando se entiende mejor.

(Lección del video «Opciones»: con todas las técnicas a la vez y las letras flotando sin parar quedó feo y
cansador; se rehizo quitando el micro-movimiento del texto, la capa de glifos y los rebotes en la salida.)

## Las 9 técnicas de animación (elegir según el video)

1. **Máscara de texto.** Títulos y frases no «aparecen»: suben desde abajo dentro de una ranura recortada
   (`overflow: hidden`), como si salieran de una rendija. Un `span` con `overflow: hidden` y, dentro, otro con
   `translateY` de ~118 % a 0 con easeInOut, ~0,75 s. Para irse, la misma ranura hacia arriba.
2. **Movimientos encadenados.** Nada se queda quieto esperando: cuando un elemento termina, el siguiente ya está
   arrancando (entra uno mientras sale otro). Las escenas no cortan en seco: cambio de fondo con **iris circular**
   (`clipPath: circle(...)`) o con desplazamiento. Entradas con resorte suave (`spring`).
3. **Cámara que sigue.** Una sola «cámara» recorre un mundo más ancho que la pantalla, con claves
   `[tiempo, x, y, zoom]` y suavizado entre ellas, y acompaña a lo importante (el objeto que viaja, la parte de la
   línea que se explica). Cámara quieta solo en escenas muy cortas.
4. **Objeto que se transforma.** Un mismo elemento cambia de forma en vez de desaparecer y aparecer otro (ícono →
   tarjeta → etiqueta; una ruta que se reescribe; letras que saltan de una línea a tres tarjetas; sumas que se
   juntan en un número). Sirve para explicar causa → efecto.
5. **Sincronía con la voz.** Cada animación cae **en la palabra** que se dice, no «más o menos». Se miden los
   tiempos de cada palabra con Whisper y cada animación pregunta «¿en qué frame empieza la palabra X de la frase
   Y?». El énfasis es un resaltador que barre la palabra justo al decirla. Los subtítulos resaltan la palabra activa.
6. **Curvas con easing y un pequeño rebote al final.** Nada se mueve lineal: easeInOut / easeOut en los recorridos y,
   al llegar, un leve sobrepaso que vuelve (`Easing.out(Easing.back(1.4))` o un `spring` con poco amortiguamiento).
   El rebote fuerte queda para los remates.
7. **Entradas escalonadas.** Cuando entran varios elementos parecidos (carpetas, letras, tarjetas, filas), entran
   uno después del otro con unos frames de diferencia, nunca todos a la vez.
8. **Parallax: fondo, medio y frente.** El fondo (textura de panal), el medio (decoración, siluetas) y el frente
   (lo que se explica) se mueven a velocidades distintas cuando la cámara se mueve: el fondo poco (~0,3 de la
   cámara), el medio a ~0,6, el frente con la cámara. Da profundidad sin distraer.
9. **Micro-movimiento en reposo.** En una pausa larga, un detalle casi imperceptible para que la imagen no se vea
   congelada: el cursor que parpadea, o un elemento decorativo que flota 1–2 px en un ciclo lento. **Nunca en texto
   que se lee** ni en varios elementos a la vez (ver «Elegir, no acumular»).

## Armado de la serie (siempre igual)

Todos los videos tienen la misma estructura, para que se reconozcan como parte de la misma serie:

1. **Entrada** (`src/comun/Bumper.tsx`, ~3,3 s antes de la voz): fondo amarillo con panal, el **Profesor Bee**
   (`bee-professor.jpeg`) entra desde la derecha y queda flotando, tarjeta «MÓDULO N · BITÁCORA DEL OPERADOR» con el
   subrayado que se dibuja, el título del video y una ráfaga de confeti.
2. **Cuerpo**: fondo papel con el panal de `HoneycombBackground` (quieto, sin parallax de colores ni capas extra),
   la terminal oscura de siempre y los subtítulos abajo.
3. **Cierre** (`src/comun/CierreCTA.tsx`, con iris desde el cuerpo): fondo amarillo con panal, la **abeja en la
   computadora** (`bee-computer.png`) entra desde la izquierda, «Ahora probá vos» en rojo y el comando en una tarjeta
   tinta con letra amarilla.

La abeja es la única que «flota» en reposo, como en los videos originales (U1, U2).

## Estilo visual

- Colores de `video-u1/src/theme.ts`: rojo `#E21F19`, amarillo `#F7CD3D`, tinta `#211C16`, papel `#FAF5E9`,
  verde azulado `#2B6E6E`. Fondo papel con panal (`HoneycombBackground`); el cierre, fondo tinta.
- Fuentes: `FONT_STACK` (Segoe UI) para texto y `MONO_STACK` (Consolas) para comandos, rutas y salidas.
- Terminal de mentira: fondo `#1E1A14`, barra con los 3 puntos, prompt `usuario@raspberrypi:~ $` con el usuario en
  verde (`#7BD88F`) y la ruta en azul (`#6CB6FF`).
- Analogías con **Windows** cuando ayudan (carpeta de usuario ↔ `/home`, unidad `C:` ↔ raíz `/`, Propiedades ›
  Seguridad ↔ permisos).
- 1280×720, 30 fps. Subtítulos siempre abajo; nada importante detrás de ellos (dejar libres ~110 px de abajo).
- Revisar los encuadres: con la cámara alejada, el texto chico no se lee; con zoom, lo de los costados se corta.

## Guion y voz

- Voz: **Profesor Bee**, VoiceStudio, perfil `23e2af72`, `steps: 32`. Una llamada **por frase** (12–14 frases).
- Voseo, igual que el contenido de los módulos («escribí», «fijate», «sabés»). Frases cortas.
- Lo que la voz pronuncia mal se escribe distinto para la voz y se muestra bien en el subtítulo. En el guion, cada
  token es `"palabra"` (igual en los dos) o `["se ve", "se dice"]`:
  `pwd` → «pe, doble ve, de» · `cd` → «ce de» · `ls -l` → «ele ese, guion ele» · `/home` → «barra jom» ·
  `~` → «virgulilla» · `chmod` → «che mod» · `r/w/x` → «ere / doble ve / equis» · `C:` → «ce».
- Después de generar, revisar lo que oyó Whisper: si la voz se comió una palabra (pasó con «cuatro más **uno**:
  cinco»), regenerar esa frase con comas o puntos suspensivos que la obliguen a pausar.
- No hablar de «scripts»: para estudiantes que empiezan, «programa».

## Cómo se hace (paso a paso)

Todo vive en `Cliente-Rust/video-u1/` (Remotion; carpeta fuera de git, solo en la máquina de quien hace los videos).

1. **Guion:** `narracion/<video>/guion.py` (lista de frases con su pausa posterior y los tokens).
2. **Voz:** VoiceStudio por MCP (si no responde: abrir Docker Desktop, `docker start voicestudio` y reconectar el
   MCP con `/mcp`). Los `.wav` caen en `frontend/public/tutorial/bienvenida/` por el volumen de Docker: **moverlos
   siempre** a `narracion/<video>/voz/fNN.wav` (que no queden en el frontend).
3. **Alinear:** `python alinear.py voz public/<video>/voz.wav src/<video>/timings.json` (con el Python que tiene
   Whisper). Une las frases con sus pausas, recorta silencios, pasa las cifras de Whisper a palabras («4» →
   «cuatro») y alinea cada palabra del guion con lo que oyó.
4. **Composición:** `src/<video>/<Video>.tsx` + `tiempos.ts` (`armarTiempos(timings)` de `src/comun/tiempos.ts`).
   Piezas listas: `Mascara`, `Resalta`, `Carpeta`, `camaraEn`, `Iris`, `Tecleo`, `useResorte` (en
   `src/carpetas/piezas.tsx`) y `Subtitulos` (en `src/comun/`). Registrar la composición en `src/Root.tsx`.
   Las animaciones se escriben con `fw('f06', 'raíz')` (frame en que empieza la palabra), nunca con números a mano.
5. **Borrador:** `npx remotion render src/index.ts <Id> out/borrador.mp4 --scale=0.5`, sacar cuadros en los momentos
   clave con ffmpeg y revisarlos (encuadre, textos que se pisan, sincronía).
6. **Final:** render a `--crf=18` y comprimir:
   `ffmpeg -i out/x.mp4 -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 96k out/final.mp4`
   (queda en ~5 MB por minuto y medio).
7. **Mostrarlo antes de subirlo:** quien pidió el video lo revisa; recién con su visto bueno se sube.
8. **Subir:** a `content/<módulo>/media/videos/` en la Pi, comprobar el hash (`MATCH`) y agregar el bloque al
   `module.json`: `{"type": "media", "kind": "video", "id": "b-video-…", "file": "videos/….mp4", "caption": "…"}`.
   Antes de subir el `module.json`, bajar el de la Pi y comprobar que nadie lo cambió mientras tanto.
