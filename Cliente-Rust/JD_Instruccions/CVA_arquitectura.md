# Arquitectura técnica — Módulo de control por gestos (CVA)

**Fecha:** 2026-08-10 (actualizada 2026-10-12)
**Estado:** Aprobado. **Actualización 2026-10-12:** el reconocimiento en la Pi ya no es YOLO + OpenCV sino
MediaPipe HandLandmarker con clasificación geométrica; se corrigieron §1, §2.4, §2.9, §2.10, §3,
§4 y §5. Detalle y evidencia en `CVA_deteccion-gestos_plan.md`.

---

## 1. Flujo end-to-end

```
Usuario (gesto frente a su webcam)
   │  autorización explícita (modal + indicador visible)
   ▼
Cliente Tauri — CVA_VideoVerificationPage + CVA_GesturePracticePage capturan frames
   │  SSH — reutiliza stream_start/stream_stop (túnel direct-tcpip existente)
   ▼
Raspberry Pi 5 del laboratorio
   │  cva_gesture_bridge (nuevo) recibe frames, corre MediaPipe HandLandmarker + geometría
   │  aplica mapeo gesto → instrucción según el módulo activo
   ▼
Servicio del robot (Eve3, protocolo TBD) o arduino_bridge.py existente (Domótica)
   ▼
Robot Eve3 / Arduino de domótica actúa
```

> **Nota de topología de red (decisión de JD, 2026-09-15):** el salto "Cliente → Pi5"
> del diagrama de arriba es lógico, no físico. En la práctica el cliente solo alcanza
> Pi4 por SSH; Pi4 reenvía el puerto `8766` hacia Pi5 mediante el servicio systemd
> `cva-forward-pi5.service` (ver `CVA_pi4-pi5-forward-temporal.md`). **Este esquema de
> dos saltos (cliente↔Pi4 directo, Pi4↔Pi5 vía forward) queda como la topología
> indefinida del proyecto** — no se persigue como meta a corto/mediano plazo que Pi5
> sea alcanzable directamente desde la red del cliente. El túnel `direct-tcpip` del
> cliente sigue terminando en Pi4, no en Pi5.

## 2. Componentes

### 2.1 Cliente — `frontend/src/pages/cva-gestures/` y `components/cva-gestures/`

- `CVA_VideoVerificationPage.tsx`: consentimiento explícito + self-view, antes de
  entrar a la práctica.
- `CVA_GesturePracticePage.tsx`: cámara del laboratorio + cámara propia + estado del
  gesto + selector de sensibilidad + parada de emergencia en sección unificada + log de Pi.
- `CVA_ConfigSidebar.tsx`: drawer de configuración lateral (sensibilidad FPS, color/visibilidad
  del esqueleto decorativo y toggle de barra de métricas). *Nota de diseño:* las tarjetas
  adicionales maquetadas preliminarmente (selector de dispositivo multicámara, umbral de confianza
  de detección y retroalimentación háptica/sonora) se retiraron temporalmente para mantener
  la vista limpia y funcional; deben reconstruirse e integrarse funcionalmente en las Fases 6+, 8+ y 9+.
- Captura de frames vía `<canvas>` oculto a intervalo fijo (5–8 fps), comprimido a JPEG.
- Hook compartido `useLocalCamera.ts` (extraído de la lógica ya existente en
  `CameraPanel.tsx`), sin prefijo CVA por ser un hook de React (debe empezar con `use`).

### 2.2 Transporte — reutiliza `cmd/streaming/stream.rs`

- Túnel `stream_start(session_id, remote_port, local_port)` hacia el puerto donde
  escucha `cva_gesture_bridge` en la Pi (propuesta: `127.0.0.1:8766`, siguiendo la
  convención de `8765` del bridge de Arduino).
- Sobre ese túnel, un WebSocket simple transporta frames JPEG binarios.
- Se cierra con `stream_stop` al desactivar el modo, salir de la práctica, o perder
  el heartbeat implícito (ausencia de frames).

### 2.3 Backend Rust — `backend/src/cmd/cva_gestures/`

- `cva_gestures_session_start(session_id, module_id) -> Result<CvaGestureSession, CommandError>`
  — valida config, abre el túnel, registra la sesión.
- `cva_gestures_session_stop(session_id) -> Result<(), CommandError>`
- Errores con `CommandError` categorizado, igual que el resto del backend.
- Structs `CvaGestureSession`/`CvaGestureConfig` con `#[derive(TS)]` → bindings
  generados automáticamente con esos nombres.

### 2.4 Raspberry Pi 5 — `cva_gesture_bridge/` (ver estructura completa en `CVA_plan.md`)

- Servidor TCP local (protocolo crudo, no WebSocket) que recibe frames JPEG con cabecera
  de longitud, en el puerto `8766` por defecto (variable `CVA_BRIDGE_PORT` en la Pi; el
  cliente lo tiene fijo en `DEFAULT_CVA_BRIDGE_PORT`, así que cambiar uno sin el otro
  rompe la conexión).
- Pipeline de visión (`vision/detector.py`): MediaPipe HandLandmarker en modo VIDEO
  (`num_hands=1`, coordenadas de mundo, modelo `models/hand_landmarker.task` fuera de
  git), filtro One Euro sobre los landmarks y clasificación geométrica del catálogo
  (`puño_cerrado`, `palma_abierta`, `dedo_pulgar`, `dedo_menique`) con estado explícito
  "sin gesto". Ya no usa YOLO, segmentación de piel ni `MotionGate`.
- `GestureStabilizer`: confirma un gesto cuando 5 de los últimos 7 cuadros coinciden
  (con histéresis) y lo emite **una sola vez, solo al cambiar**. Al dejar de ver la
  mano emite `gesto: ninguno` (`RELEASE_LINE`) tras 20 cuadros sin gesto con mano
  presente o 16 sin mano. A ~7 fps eso es un retraso de liberación de unos 2,3 s.
- Línea de salida hacia el cliente: `gesto: <nombre>, confianza: <0.00>` y
  `gesto: ninguno` (ver §2.10).
- Mapea gesto → instrucción según el módulo activo y ejecuta la instrucción llamando a
  `arduino_bridge.py` (Domótica) o al servicio del robot (Eve3). **Esa parte (Fases 9 y 11)
  aún no está construida;** hoy la Pi solo emite la línea de texto.
- Watchdog: sin frames en N segundos, deja de emitir instrucciones.
- **Lógica centralizada en la Pi**: el Arduino se queda "tonto", solo ejecuta comandos
  simples por serial vía `arduino_bridge.py` (que no se toca).
- Corre como servicio systemd (`cva-gesture-bridge.service`). Un servicio de sistema no
  tiene sesión de audio: `detector.py` instala un sustituto vacío de `sounddevice` solo si
  el import real falla, porque `mediapipe` 1.0.1 inicializa PortAudio al importarse.

### 2.7 Manejo profesional de cámara (privacidad y UX — estándar Zoom/Teams/Meet)

Requisitos concretos, más allá del `getUserMedia` básico, que ya se aplican en
`useLocalCamera.ts`/`CVA_VideoVerificationPage.tsx` o quedan pendientes de agregar
(estado real verificado en la revisión de Fase 2, 2026-08-12):

| # | Requisito | Estado |
|---|---|---|
| P1 | Nunca auto-iniciar: la cámara solo se activa con clic explícito en "Probar Cámara", nunca en `useEffect` al montar la pantalla | Ya cumplido |
| P2 | Pantalla de consentimiento explicando qué pasa con el video *antes* del prompt nativo del SO (patrón de "priming") | Ya cumplido |
| P3 | Indicador "LIVE"/"transmitiendo" siempre visible mientras la cámara está activa, no solo en la pantalla de verificación | Ya cumplido |
| P4 | Un solo stream compartido entre subpáginas (no reabrir `getUserMedia` al navegar entre verificación y práctica) | Ya cumplido (lifting state up) |
| P5 | Detectar cámara ocupada por otra app (`NotReadableError`/`TrackStartError`) con mensaje específico, distinto de "permiso denegado" | **Pendiente** — el hook solo distingue `NotAllowedError`/`NotFoundError` hoy |
| P6 | Detectar corte de cámara a mitad de sesión (desconexión física, revocación de permiso desde el SO, otra app toma control exclusivo) vía `track.onended`, y reaccionar deteniendo la sesión de gestos automáticamente en vez de quedarse esperando frames que no llegan | **Pendiente** |
| P7 | Selección de dispositivo si hay más de una cámara conectada (`enumerateDevices()` filtrando `videoinput`); si solo hay una, se usa por defecto sin pedir nada extra | **Pendiente** (bajo impacto mientras se prueba con un solo dispositivo; subir prioridad antes de piloto con usuarios reales) |
| P8 | Restricciones de captura con rango (`min`/`ideal`/`max`), no solo `ideal`, para evitar que un dispositivo entregue una resolución que perjudique el reconocimiento en la Pi o el rendimiento del cliente | **Pendiente** — hoy solo usa `ideal` |
| P9 | Confirmar que el contexto de la webview de Tauri cuenta como "secure context" para `getUserMedia` (normalmente sí, pero no se ha verificado explícitamente en este proyecto) | **Pendiente de verificación** — riesgo, ver §5 |

Los ítems "Pendiente" no son un bloqueo retroactivo de la Fase 2 ya entregada — se
resuelven como corrección dirigida antes de avanzar a Fase 3, ya que tocan el mismo
hook que Fase 2 ya construyó.

### 2.6 Config — `config/cva-gestures/*.json` (separada de `practicas.rs` a propósito)

Un archivo por módulo: `domotica.json`, `robot.json` (nombre = `module_id` exacto, sin
tabla de traducción). Se crean en Fase 3 como esqueleto con `mapping: {}` vacío;
`cva_gestures_session_start` valida que el archivo exista, sea JSON válido y tenga
`enabled: true` antes de abrir el túnel — si falta o es inválido, `CommandError::permanent
("CONFIG_NOT_FOUND", ...)`. El `mapping` real (gesto → instrucción) se completa en
Fase 9 (Domótica) y Fase 11 (Robot), después de validar el reconocimiento con hardware
real — la mecánica de validación no depende de que el mapeo ya esté definido.

```json
{
  "enabled": true,
  "min_confidence": 0.75,
  "mapping": {
    "dedo_indice": "avanzar",
    "dos_dedos": "retroceder",
    "puno_cerrado": "detener"
  }
}
```

### 2.8 Conexión automática a la Raspberry Pi (agregado 2026-08-22)

**Problema que resuelve:** hasta la Fase 4, `CVA_GesturePracticePage.tsx` dependía de
que el usuario ya tuviera una pestaña de sesión SSH abierta manualmente (vía la pantalla
de "Nueva conexión"), y CVA solo leía esa sesión existente. Eso obligaba a un paso fuera
de la sección de Video analítica, contrario a la intención del producto.

**Solución — reutiliza el patrón ya existente de las prácticas del catálogo**, no
inventa uno nuevo (Principio 1):

- El catálogo de prácticas (`practicas.rs`) ya resuelve esto para Eve3: cuando el
  usuario inicia una práctica, `usePracticeSession.ts` pide la configuración real vía
  `practicas_get_config` (host/usuario/contraseña salen de variables de entorno en
  `.env.practicas`, fuera del control de versiones) y llama `sshConnect` automáticamente,
  sin pasar por la pantalla de conexión manual. Las dos prácticas Eve3 existentes
  comparten literalmente el mismo host de Raspberry Pi.
- CVA sigue el mismo mecanismo: nuevas variables dedicadas en `.env.practicas`
  (`PRACTICE_CVA_HOST`/`PORT`/`USER`/`PASSWORD`), con el mismo valor que usa Eve3 por
  ahora — pero **independientes**, para poder apuntar Video analítica a una Raspberry Pi
  distinta en el futuro sin tocar la config de las demás prácticas.
- Al entrar a la sección de Video analítica, el frontend llama automáticamente al mismo
  flujo de conexión (`sshConnect` con estas credenciales), obtiene un `session_id` propio,
  y ese es el que se usa para `cva_gestures_session_start`. Ya no depende de
  `activeSessionId` pasado desde una pestaña externa.
- Como en el resto del proyecto, cada vez que se entra a Video analítica se abre una
  sesión SSH nueva — no existe hoy ningún mecanismo de reutilización de sesiones ya
  abiertas en ningún lugar de la app (confirmado en el código existente), así que CVA no
  necesita inventar uno.

### 2.9 Esqueleto de mano decorativo (agregado 2026-08-22)

**Naturaleza: 100% cosmético, cliente-only.** Dibuja el esqueleto de la mano (puntos +
líneas) sobre el `<video>` de la cámara propia del usuario, en `CVA_VideoVerificationPage.tsx`
y `CVA_GesturePracticePage.tsx`. No se conecta con la Pi, no envía datos a ningún lado,
no influye en qué instrucción se ejecuta — esa decisión sigue siendo exclusiva del
reconocimiento en la Pi (Fase 8). Aunque ambos usan MediaPipe, son dos instancias
independientes: la del navegador solo dibuja, la de la Pi decide. Ver `CVA_posibles-mejoras.md` para la idea (descartada por ahora) de
volverlo funcional más adelante.

- Librería: `@mediapipe/tasks-vision` (`HandLandmarker`). **Corrección (2026-08-24):**
  Google solo publica un modelo para Hand Landmarker (`hand_landmarker.task`), que ellos
  mismos etiquetan "full" — no existe una variante "lite" para esta tarea (a diferencia
  de Pose Landmarker). El requisito original de "modelo lite" era una suposición
  incorrecta de Claude; se usa el único modelo disponible.
- Configurado a **una sola mano** (`numHands: 1`) — reduce cómputo y cumple el pedido
  explícito de JD.
- Color del esqueleto seleccionable por el usuario (color picker en la interfaz),
  aplicado al dibujar los puntos/líneas en el canvas.
- Ritmo de detección desacoplado del muestreo/envío real de frames (Fase 4) — no tiene
  que analizar cada frame que se manda a la Pi, corre a su propio ritmo.
- **Autopausa por rendimiento (Principio 8 ampliado):** se reutiliza la métrica de
  `cpuLoad` ya construida en Fase 4. **Umbral decidido en Fase 5b: 70% de carga de CPU
  estimada del cliente** — al superarlo, se desactiva el renderizado del esqueleto para
  preservar la fluidez de la transmisión real. El envío real de frames tiene prioridad
  siempre.
- Si el modelo no carga o falla en runtime, se desactiva en silencio (ver tabla de
  errores en `CVA_spec.md` §4) — nunca bloquea la práctica.

### 2.10 Canal de mensajes Pi→cliente — panel de log de instrucciones (agregado 2026-08-22)

**Problema que resuelve:** hoy la conexión TCP persistente que se construyó en Fase 4
(`CVA_TCP_CONNECTIONS`) solo escribe hacia la Pi — nunca lee nada de vuelta. JD pidió un
panel tipo terminal, debajo de la Cámara del Laboratorio, que muestre en vivo qué
instrucción generó cada gesto (ej.: "gesto: dedo anular, instrucción: mover adelante").

**Lo que implica, técnicamente:**

- **Formato real (definido en Fase 8, 2026-10):** el bridge manda de vuelta, sobre la misma
  conexión persistente, **una línea de texto por cambio de gesto confirmado, no por cada
  frame**: `gesto: <nombre>, confianza: <0.00>`, y `gesto: ninguno` cuando se suelta. No es
  el JSON propuesto originalmente (`{"gesture", "instruction", "confidence"}`): ese incluía
  la instrucción, que recién existirá con el mapeo de las Fases 9 y 11. El cliente no
  interpreta la línea; la emite tal cual como evento de Tauri `cva:pi_instruction` con
  `{ session_id, message }`.
- En el backend Rust, la conexión persistente (`TcpStream` dentro de `Arc<AsyncMutex<..>>`)
  hoy solo se usa para escribir. Para leer al mismo tiempo sin bloquear la escritura,
  hace falta separar el stream en sus mitades de lectura/escritura (`tokio::io::split` o
  `into_split()` sobre el `TcpStream`) — la mitad de escritura la sigue usando
  `cva_gestures_send_frame`, la mitad de lectura corre en una tarea de fondo que parsea
  los mensajes entrantes y los emite al frontend como eventos de Tauri
  (`app_handle.emit(...)`).
- El frontend escucha esos eventos y los agrega, en orden cronológico, a un componente
  de log/terminal nuevo, ubicado debajo del panel "Cámara del Laboratorio" en
  `CVA_GesturePracticePage.tsx`.
- **Historia:** en la Fase 5b el panel se construyó con mensajes simulados (mismo patrón
  que la Fase 1: UI con datos mock antes del backend real). Con el bridge real ya
  mandando líneas, los mensajes simulados `[Simulación Pi]` deben retirarse; hay una
  prueba en `cvaPiInstructionLog.test.tsx` que exige su ausencia. **Pendiente:** el reporte
  de Antigravity y su verificación contra el código y los cambios commiteados.
- Si nunca llegan mensajes reales (bridge caído o inexistente), el panel se queda vacío
  o dice "sin actividad" — no es un error que bloquee nada (ver `CVA_spec.md` §4).

### 2.11 Reorganización de la interfaz de práctica (agregado 2026-08-22)

- El panel "Métricas de Rendimiento y Consumo (IPC / Túnel SSH)" deja de estar siempre
  visible debajo de las cámaras.
- Nuevo sidebar de configuración a la derecha de la pantalla, con casillas de opciones.
  Una de ellas: "Ver métricas".
- Al activar esa casilla, el panel de métricas aparece como una **barra horizontal
  compacta en la parte superior** de la pantalla — pequeña, sin tapar ni interferir con
  la vista de las cámaras. Al desactivarla, desaparece.
- El panel de log de instrucciones de la Pi (§2.10) se ubica debajo de la Cámara del
  Laboratorio, como un panel fijo (no depende del sidebar de configuración, a menos que
  más adelante se decida agregarle su propia casilla de mostrar/ocultar).

---

## 3. Fail-safes

| Mecanismo | Detalle |
|---|---|
| Heartbeat implícito | Sin frames en N segundos → `cva_gesture_bridge` detiene instrucciones y notifica |
| Umbral de confianza | El gesto debe superar `min_confidence` antes de traducirse (hoy: `MIN_CONFIDENCE` en el bridge, variable `CVA_MIN_CONFIDENCE`, 0,5 por defecto; el `min_confidence` de `config/cva-gestures/*.json` es del cliente y la Pi no lo lee) |
| Rate limit | Máximo de instrucciones por segundo hacia el hardware |
| Parada de emergencia | Botón en cliente, visible mientras el modo está activo, corta todo y manda `STOP` explícito. **Decisión pendiente (Fases 9/10):** no puede depender solo de `gesto: ninguno`, que llega con ~2,3 s de retraso; las órdenes deben tener duración limitada |
| Límites de movimiento | A definir junto con el protocolo del "servicio del robot" |

---

## 4. Qué se reutiliza vs. qué es nuevo

| Reutiliza | Nuevo |
|---|---|
| `cmd/streaming/stream.rs` (túnel SSH) | `cmd/cva_gestures/` (backend Rust) |
| `cmd/hardware/arduino.rs` (Domótica) | `cva_gesture_bridge/` (Pi; MediaPipe en lugar de YOLO) |
| `ssh_core`, `CommandError` | UI de consentimiento + indicador visual |
| `CameraPanel.tsx` (lógica extraída a hook) | Config `cva-gestures/*.json` |
| Patrón de auto-conexión de `usePracticeSession.ts`/`practicas_get_config` (§2.8) | Variables `PRACTICE_CVA_*` en `.env.practicas`, dependencia `@mediapipe/tasks-vision`, panel de log Pi→cliente, sidebar de configuración |

---

## 5. Supuestos y riesgos abiertos (no bloquean, se resuelven en implementación)

1. Protocolo exacto del "servicio del robot" (Eve3) — se investiga en la Fase 11
   del plan.
2. Rendimiento real del túnel SSH con tráfico de video continuo — nunca probado así.
3. ~~Capacidad de cómputo real de la Pi 5 para YOLO en tiempo real.~~ **Cerrado:** YOLO se
   retiró; MediaPipe rinde 34-64 ms por cuadro en la Pi 5 real, ~7 fps, CPU y memoria
   estables (Fase A). Queda abierto el rendimiento con otras distancias, iluminación y otro
   tono de piel (Fase D, solo cubierta a 50 cm).
4. Contexto seguro de la webview de Tauri para `getUserMedia` (§2.7, P9) — Tauri
   normalmente sirve el frontend sobre un esquema que el navegador embebido trata como
   seguro, pero no se ha confirmado explícitamente en build de producción de este
   proyecto. Si falla, `getUserMedia` se rechaza silenciosamente en algunos webviews;
   se verifica temprano en la corrección de Fase 2 para no descubrirlo tarde.
5. Impacto real de CPU de correr MediaPipe Hands (§2.9) al mismo tiempo que el muestreo
   y envío de frames (Fase 4) — se mide con datos reales durante la Fase 5b antes de
   dejar el overlay activado por defecto; el umbral de autopausa se ajusta con esos datos.
6. Separar el `TcpStream` persistente de `CVA_TCP_CONNECTIONS` en mitades de
   lectura/escritura (§2.10) sin romper el comportamiento ya aprobado de
   `cva_gestures_send_frame` — se verifica con los tests existentes de Fase 4 más los
   nuevos de Fase 5b antes de aprobar.

---

## 6. Estabilidad en sesión continua (hasta 3 horas)

Para garantizar operaciones continuas de hasta 3 horas sin degradación de rendimiento, congestión de sockets ni fugas de memoria, se establecen las siguientes decisiones arquitectónicas:

### 6.1 Métrica `cpuLoad` (Factor de Ocupación de Transmisión)
- **Definición técnica:** `cpuLoad = Math.min(100, Math.round(((t_encode + t_ipc) / t_intervalo) * 100))`.
- **Qué mide realmente:** Representa la fracción de tiempo del ciclo de muestreo (125–167 ms a 6–8 FPS) consumida por la codificación JPEG en `<canvas>` y el viaje IPC/túnel SSH (`cva_gestures_send_frame`).
- **Qué NO mide:** No mide el uso del procesador (CPU) del sistema operativo del host. La etiqueta visual en la UI ("CPU Cliente") se conserva por compatibilidad de interfaz con el usuario.

### 6.2 Guardia de Cuadro en Vuelo (Single In-Flight Frame Guard)
- **Comportamiento Tokio Mutex en Rust:** En `backend/src/cmd/cva_gestures/session.rs`, la mitad escritora del socket persistente `write_half` está protegida por un `Arc<tokio::sync::Mutex<WriteHalf<TcpStream>>>`. Las llamadas concurrentes esperan el lock en orden FIFO. Si el frontend emite cuadros a mayor velocidad de la que el socket o el túnel SSH alcanzan a transmitir y vaciar (`flush`), las tareas asíncronas de Tokio se encolan secuencialmente esperando el mutex, generando una acumulación en cascada de latencia y cuadros desactualizados.
- **Solución implementada:** En el cliente (`CVA_GesturePracticePage.tsx`), una referencia `isSendingRef` descarta cualquier cuadro subsiguiente si el previo aún no ha completado su viaje IPC y retorno de estadísticas (`finally { isSendingRef.current = false; }`). De este modo, existe como máximo 1 cuadro en vuelo simultáneamente, eliminando cualquier saturación en la cola del backend.

### 6.3 Adaptación de Tasa del Esqueleto MediaPipe con Histéresis
- **Límite superior:** El esqueleto se acota a un máximo configurable de 15 FPS en lugar de procesar a la tasa completa de la pantalla (60/120 Hz en RAF).
- **Medición de costo:** Se mide la duración real de `detectForVideo` y el trazado de landmarks mediante `performance.now()` con promedio móvil exponencial (EMA).
- **Histéresis escalonada:**
  - 15 FPS → 10 FPS si costo > 28 ms; 10 FPS → 15 FPS si costo < 18 ms.
  - 10 FPS → 5 FPS si costo > 45 ms; 5 FPS → 10 FPS si costo < 30 ms.
  - 5 FPS → 0 FPS (pausa) si costo > 75 ms; 0 FPS → 5 FPS si costo < 35 ms.
- **Prioridad de transmisión:** Si `cpuLoad > 70%`, el esqueleto se autopausa inmediatamente para priorizar el envío hacia el hardware.

### 6.4 Resiliencia y Recuperación ante Errores en Tiempo de Ejecución
- Ante 3 fallos consecutivos en `detectForVideo` (p. ej. pérdida de contexto WebGL o error de WASM), el esqueleto pasa a estado `recuperando` y activa reintentos con retroceso exponencial (`1000ms * 2^(intento-1)`).
- Si agota 3 intentos de recuperación, se marca en estado `error`, se deshabilita en silencio y suprime las advertencias por cuadro en consola.
- El estado (`activo | pausado por carga | recuperando | error`) se expone en la UI en el sidebar de configuración.

### 6.5 Prevención de Recolección de Basura y Reset de Contexto Canvas
- En cada ciclo de RAF y muestreo a 320x240, se verifica `canvas.width !== targetWidth` antes de reasignar. Reasignar dimensiones idénticas en canvas reinicia innecesariamente el contexto 2D y genera presión continua sobre el recolector de basura (GC).

### 6.6 Búfer Circular de Diagnósticos y Exportación CSV
- Búfer acotado `BoundedCircularBuffer<CvaDiagnosticSnapshot>` de 1.200 muestras (~3.3 horas a 1 muestra cada 10 s).
- Registra `envioCargaPct`, `esqueletoCostoMs`, `esqueletoFps`, `esqueletoEstado`, `cuadrosEnviados`, `cuadrosDescartados`, `cuadrosFallidos`, `memoriaJsMb` (`performance.memory`) y recuento de tareas largas (`LongTaskTracker` vía `PerformanceObserver`).
- Permite exportar los datos recopilados en un archivo CSV descargable (`cva_diagnostico_sesion_3h.csv`).

