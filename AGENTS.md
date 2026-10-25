# LaboRemoto — contexto para asistentes de código

Plataforma de laboratorio remoto de la Universidad Piloto de Colombia. Aplicación de escritorio **Tauri 2** (backend Rust, interfaz React 19 + TypeScript) que se conecta por SSH a equipos reales, más servicios de apoyo en `infra/`. Idioma del proyecto: **español** (interfaz, comentarios, commits, nombres de dominio). Descripción completa en [`Cliente-Rust/README.md`](./Cliente-Rust/README.md).

## Estructura

```
Cliente-Rust/
  backend/    Rust: crate `app` (lib + main). src/cmd/* = comandos Tauri por dominio,
              auth/ (Keycloak), ssh_core/, state_core/, session_manager/, ipc/
  frontend/   React: src/app (shell), src/features/* (un módulo por dominio),
              src/components (kit propio en español + mosaico), src/store (Zustand),
              src/lib/command.service.ts, src/bindings (GENERADO por ts-rs)
  scripts/    dev.ps1, check-comandos.mjs, comandos-sin-uso.txt
  tools/      guiones y reglas para los videos (no es código de la app)
infra/        Servicios del laboratorio (brokers Node, agente Python, contenido de prácticas)
docs/         Notas de infraestructura y planes (algunas son históricas)
.github/      Workflows: ci.yml, check-package-versions, block-sensitive-files,
              borrar-rama-tras-merge, release
```

## Comandos

Desde `Cliente-Rust/`:

| Tarea | Comando |
|---|---|
| Instalar | `npm run install:all` |
| Desarrollo | `npm run dev` (Windows, `scripts/dev.ps1`) · o `npm run dev:frontend` y `npm run dev:backend` |
| Comandos Tauri vs. frontend | `node scripts/check-comandos.mjs` |
| Tipos del frontend | `cd frontend && npx tsc --noEmit` |
| Pruebas del frontend | `cd frontend && npx vitest run` |
| Capturas del README | `cd frontend && npx vite --port 5199 --strictPort` y, en otra terminal, `npm run capturas` (interfaz con datos de demostración en `frontend/scripts/capturas.mjs`; enmascara IPs). Rehazlas cuando cambie la interfaz. |
| Compilar backend + tests | `cd backend && cargo check --all-targets` |
| Pruebas del backend | `cd backend && cargo test --lib --bins --test error_categorization_test --test protocol_test --test session_manager_flow_test --test session_manager_test` |

Antes de dar algo por terminado, corre las comprobaciones que toquen lo que cambiaste. El CI ejecuta las mismas en cada PR.

## Reglas del repositorio

1. **Comandos de Tauri.** Un comando nuevo lleva `#[tauri::command]` y se registra en `tauri::generate_handler![…]` de `backend/src/lib.rs` con **ruta completa y coma final**. El frontend los llama desde un `*.service.ts`, no con `invoke` suelto en los componentes. `scripts/check-comandos.mjs` falla si el frontend invoca un comando sin registrar o si hay uno registrado que nadie usa y no está justificado (`comandos-sin-uso.txt`, formato `nombre  # motivo`).
2. **Tipos generados.** `frontend/src/bindings/*.ts` los genera `ts-rs` desde Rust (`#[derive(TS)] #[ts(export)]`); no se editan a mano. `cargo test` los regenera: revisa `git status` y no subas cambios que solo sean saltos de línea.
3. **Dos conexiones SSH por sesión.** `russh` (asíncrona) para la terminal y el túnel de prácticas; `ssh2` (bloqueante, dentro de `spawn_blocking`) para SFTP, GPIO, `ssh_exec`, herramientas del agente y el escritorio remoto. Nunca hagas un *handshake* con el lock global `SESSIONS` tomado.
4. **Escritorio remoto (`cmd/vnc`).** `vnc_start` prepara la Pi con **scripts de shell enviados por la entrada estándar**, lanza `Xvnc` y comprueba que el puerto lo escucha el PID recién lanzado (no basta con que "algo" escuche). El display y el puerto se reservan con un `mkdir` atómico en `~/.cache/labremoto/claims`. Hay un candado por sesión (`START_LOCKS`) para serializar arranques. Los scripts tienen pruebas de sintaxis (`sh -n`) en `cmd/vnc/server.rs`; en los `pkill -f` usa corchetes (`[X]vnc`) para que el comando no se mate a sí mismo (hay una sola lista, `kill_display_cmd`), y cita siempre los datos que vienen del equipo remoto (rutas con comillas o espacios).
5. **Secretos y direcciones.** Nunca subas `.env`, `*.pem`, `*.key`, tokens ni contraseñas. El CI (`block-sensitive-files`) rechaza esos archivos y también **direcciones IPv4 en las líneas añadidas del código** (`.rs`, `.ts`, `.py`, `.sh`, `.yml`…; se exceptúan `.md`, `.json`, `.toml`, `.lock`, `127.0.0.1` y `0.0.0.0`). Lo que se embebe en el binario (`build.rs`) sale de secretos de GitHub Actions.
6. **Dependencias.** En todos los `package.json` las versiones son **exactas** (sin `^` ni `~`); `check-package-versions` lo comprueba.
7. **Git.** Ramas `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`, `perf/`, `ci/` desde `Desarrollo`; commits `tipo(ámbito): mensaje` en español; PR hacia `Desarrollo` (rama de integración). `Produccion` publica versiones. Al fusionar un PR la rama se borra sola (excepto las permanentes). No empujes directo a `Desarrollo` ni a `Produccion`.
8. **No reintroducir lo eliminado.** Se retiraron a propósito la API REST (`src/api`), el cliente MCP, el editor de archivos con IA (`cmd/editor`) y el streaming legacy (`cmd/streaming`). Si alguien los necesita, hay que discutirlo antes.

## Trampas conocidas

- **Windows:** `auth_ipc_dispatch_test` no arranca (`0xc0000139`, `tauri::test` sin manifiesto); por eso las pruebas del backend se listan explícitamente. Si el enlazador dice `LNK1285` (PDB corrupto) o "crate … required to be available in rlib format", hay un `target` dañado, normalmente por dos `cargo` a la vez: `cargo clean -p app`.
- **Prompts de la IA:** `cmd/ai/prompts.rs` busca `promts/ai.toml` (errata); el archivo real es `backend/prompts/ai.toml`. Hoy nunca se lee.
- **Seguridad pendiente:** `russh` no verifica la clave del servidor (`check_server_key` devuelve `true`); algunas credenciales de práctica se embeben en el binario de la app.
- **Versiones desalineadas:** `Cargo.toml`, `tauri.conf.json` y `package.json` tienen números distintos; `release.yml` calcula la versión que publica.
- **Scripts rotos:** `npm run build:windows` apunta a `scripts/build-windows-cross.sh`, que no existe.
- **Legado conviviendo:** `cmd/practices/practicas.rs` (Eve3 por variables de entorno) y `integration/moodle.rs` (Moodle directo) son el flujo viejo; el actual va por `linux_api` y los brokers. Hay 22 comandos sin uso conservados a propósito (`scripts/comandos-sin-uso.txt`).
- **READMEs de `infra/`:** algunos están desfasados (`broker-gateway` no lista `/nvr/encuestas`; `broker-sesiones` no documenta encuestas; `keycloak` no tiene README).
- **`INFRAESTRUCTURA-LOCAL.md`** (direcciones y accesos del laboratorio) existe solo en la copia local de quien lo mantiene y está excluido de git: no lo recrees ni copies su contenido al repositorio.

## Reglas de negocio del backend (Rust)

Son los límites y comportamientos que el código ya impone. Si cambias uno, cambia también la prueba y, cuando exista, el otro lado (broker o frontend). Las marcas **[brecha]** son riesgos conocidos, no diseño deseado.

### Autenticación y roles (`backend/src/auth/`)
- Inicio de sesión con OAuth 2.1 + PKCE. El *verifier* es de un solo uso y el `state` es un UUID. El *callback* escucha en un puerto efímero de `127.0.0.1` y caduca a los 300 s. Solo vale el último intento de inicio de sesión.
- El JWT se valida con RS256 contra el JWKS (caché de 1 h), `aud = "account"` y 30 s de holgura.
- Los roles se filtran: se descartan `default-roles*`, `offline_access` y `uma_authorization`. El `user_type` se agrega como rol en minúsculas.
- Los comandos `admin_*` y el avatar llaman a `check_admin_lab`. El avatar es una URL `data:image/…` de hasta 80 000 caracteres.
- El *daemon* de refresco renueva el token 45 s antes de que expire. Solo se persiste el `refresh_token`, cifrado. El cierre de sesión borra primero lo local.
- El token de acceso nunca llega al frontend.

### Sesiones SSH (`cmd/ssh`, `cmd/sesiones`)
- `russh` envía *keepalive* cada 30 s y cierra tras 120 sin respuesta.
- El lock global `SESSIONS` nunca se sostiene durante E/S de red.
- Los búferes de salida son circulares (300 entradas). La terminal local mide al menos 10×5. Una imagen pegada pesa como máximo 20 MB. La memoria de la conversación del chat caduca a las 2 h.
- **[brecha]** `check_server_key` devuelve `true`: no se verifica la clave del servidor.
- **[brecha, por revisar]** El identificador de sesión de los registros guardados (`savedLogs`) parece usarse en rutas de archivo sin sanear: valídalo antes de ampliar ese código.

### Escritorio remoto (`cmd/vnc`)
- Resoluciones: 1024×768, 1280×720 (por defecto), 1280×800 y 1920×1080. Perfiles de escritorio: `completo` y `practica`.
- Displays `:20`–`:99`, puertos 5900–5998. Nunca se toca `:0`. Las reservas (`claims`) caducan a los 3 min.
- `Xvnc` arranca con `-localhost` y sin contraseña: el único acceso es el túnel `direct-tcpip` de la propia sesión SSH.
- Se espera 15 s a que el puerto lo escuche el PID recién lanzado. Los restos de un intento fallido se limpian con marcas pendientes. `vnc_logs` devuelve como máximo 6000 caracteres.

### Archivos (SFTP, `cmd/sftp`)
- Bloques de 64 KB, progreso cada 150 ms y cancelación con `AtomicBool`.
- `sftp_read_text` lee como máximo 256 KB. Listar reintenta una vez. `SESSION_EXPIRED` es un error permanente (no se reintenta).
- Si el nombre de descarga ya existe se usa `nombre (1).ext`, hasta 999.

### Prácticas y Moodle (`cmd/practices`, `cmd/moodle_cursos`)
- La nota va de 0 a 100 y debe ser finita. La nota que calcula la app es **provisional** («lista para revisión»).
- El registro de la práctica se comprime (gzip + base64). Estados del envío: `adjuntado`, `no_enviado`, `fallo_la_subida`, `no_valido`, `subida_no_disponible`.
- Un `409` del broker es permanente; un `503` es transitorio (se reintenta tras 10 s).
- El validador local da por aprobada una práctica con ≥ 60 %.
- `environment.setup_commands`: cada comando es de una sola línea, empieza por un prefijo de `SETUP_ALLOWED_PREFIXES` (`sudo -n -u pi …` o `bash …` sobre los scripts `ev3-hop-*` de la Pi) y tiene 60 s por paso. Para permitir otro script hay que añadirlo en Rust y no solo en el `module.json`.
- Túnel a la API de prácticas: 6 s de *timeout*, *keepalive* de 15 s y 3 intentos. El panel de rendimiento consulta cada 30 s. El *proxy* local de medios escucha en el *loopback* con un token aleatorio.

### Agente y chat con IA (`cmd/ai`)
- `agent_chat` hace como máximo 8 rondas de herramientas; `plan_chat`, 6 y solo de lectura. `max_tokens` = 4096; temperatura 0,1 en el chat.
- `cambiar_pin` y `subir_archivo` quedan **pendientes** hasta que la persona pulsa «Aplicar». Los pines GPIO válidos son 0–27.
- **[brecha]** `ejecutar_comando`, `escribir_archivo` y `reiniciar_servicio` se ejecutan sin confirmación, y `SecurityManager` se crea pero no se usa (`_security`). No amplíes las herramientas del agente sin resolver esto.

### Hardware (`cmd/gpio`, `cmd/arduino`, `cmd/ev3`)
- El monitor GPIO muestrea cada 200 ms o más y hay uno por sesión.
- Comandos de Arduino: hasta 128 caracteres, con `curl` de 2 s/5 s.
- Velocidad EV3: −100…100. La consola EV3 devuelve hasta 20 000 bytes, corre como máximo 120 s y admite un solo programa a la vez.

### Datos locales y errores
- Credenciales y datos locales cifrados con ChaCha20-Poly1305 (clave derivada con HKDF/Argon2id y guardada en el llavero del sistema). Las escrituras son atómicas.
- Comandos guardados: máximo 500; título 120, comando 10 000 y descripción 300 caracteres; terminal `linux` o `powershell`.
- Todo error hacia el frontend es un `CommandError { code, message, retryable, retry_after_ms }`. Los errores transitorios e internos son reintentables. `wrap_result` clasifica por palabras clave del mensaje: si añades un error nuevo, comprueba cómo lo clasifica.
- Actividad: eventos `inicio`, `latido`, `fin` y `ubicacion`; la identidad sale del token, nunca del cuerpo. Resumen para los roles de supervisión: 1–90 días (30 por defecto). Encuestas: 1–365 días (90 por defecto).

## Reglas de negocio de los brokers y servicios (`infra/`)

- **Autenticación.** Los brokers validan el JWT con RS256 (JWKS en caché 5 min) y comprueban `exp` e `iss`. **[brecha]** No comprueban `aud`.
- **Gateway** (8091): enruta a cámaras (8092), sesiones (8093) y Moodle (8094) con 30 s de *timeout*. `/nvr/dispositivos/evento` no se expone: lo usa solo el agente de conexiones.
- **Cámaras.**
  - Sesión HLS de 15 min.
  - PTZ solo para `admin_lab`, `jefe_laboratorio`, `coordinador_laboratorio`, `laboratorista` y `semillerista`; velocidad 1–8.
  - SDP de WHEP ≤ 32 KB. Cuerpos ≤ 8 KB.
  - `/nvr/camaras*` (administración) es solo para `admin_lab`; `probar` admite 12 por minuto y persona.
  - Validación: nombre 1–40 caracteres, host solo IPv4 privada, puerto 1–65535, usuario con expresión regular, contraseña 1–64, ids `CamaraNN`/`camNN`, hasta 10 copias de respaldo. La clave de la API **nunca** se devuelve.
- **Sesiones.**
  - Id con `^[A-Za-z0-9._:-]{1,100}$`.
  - Se marca inactiva tras 3 min sin latido (revisión cada 60 s). Retención de 90 días.
  - El resumen es solo para los roles de supervisión.
- **Dispositivos.** El token del agente va en cabecera y se compara en tiempo constante. En línea = visto hace menos de 90 s. Hasta 300 conexiones por dispositivo; la cuenta `pi` es compartida.
- **Encuestas.** Una por persona y práctica, anónimas en el resumen. Valores 1–5 enteros, texto de hasta 1000 caracteres, `VERSION = 1`.
- **Moodle.**
  - El rol sale de Moodle (`editingteacher`/`teacher` = docente). Una práctica es una tarea con `idnumber` `labo:*`.
  - `403`: `no_matriculado` o `solo_docentes`. Nota 0–100; resumen ≤ 1500 caracteres; cuerpo ≤ 1,5 MB; registro comprimido ≤ 6 MB.
  - El puente público `abrir/:id` es una página con CSP.
- **Agente de conexiones.** Solo autenticación por contraseña o *keyboard-interactive*. Latido de 30 s, cola de 1000 eventos.
- **Vigilante de Shinobi.** Reinicia tras 3 min con cero monitores sanos y espera 30 min entre reinicios.
- **Contenido de prácticas** (`practicas-linux`, `practicas-ev3`).
  - Ids `linux-m1`, `linux-m2`, `linux-permisos`, `linux-m3`, `linux-archivos`, `linux-programa` y `ev3-m1…m9` (el orden lo da el campo `order`, no el id); `module.json` con sus campos obligatorios.
  - La validación de comandos es por coincidencia exacta salvo que el paso diga `fuzzy`; los cuestionarios, por igualdad.
  - Nota = puntos/total × 100 con un decimal. `passed` exige todos los pasos obligatorios.
  - Hay una prueba de integridad del contenido: córrela al editar un módulo.

## Reglas de diseño del frontend (`Cliente-Rust/frontend`)

### Temas, color y tipografía
- Cada tema es `html[data-theme="<id>"]` con variables CSS en `src/styles/themes/<id>.css`, importado desde `globals.css`. Para añadir uno: crear el CSS, importarlo, registrarlo en el contexto de temas y, si es claro, en `LIGHT_THEMES` (así `forceColorScheme` es siempre `light` o `dark`).
- Los roles `jefe_laboratorio`, `coordinador_laboratorio` y `laboratorista` están fijos en el tema `unipiloto`.
- Tokens de `unipiloto`: fondo `#f4f4f4`, acento principal `#d51f22`, secundario `#00a0d2`, terciario `#007a33`, textos `#1c1c1c`/`#494949`/`#7c7c7c`; tipografías Montserrat y Open Sans (`THEME_FONTS`).
- **No uses colores en hexadecimal dentro de componentes.** Tailwind solo con las utilidades `ui-*` (`@theme inline`). Los hex que hay hoy (`FileIcon`, `Ev3Twin`…) son deuda, no ejemplo.
- **Estilos de pantallas nuevas:** clases de Tailwind con las utilidades `ui-*`, sin crear un `.css` por feature. Un `.css` propio solo si Tailwind no alcanza (`@keyframes`, estilos de librerías externas como xterm, noVNC o driver.js) y siempre con variables de tema, nunca colores fijos. Los `.css` por feature que ya existen (`practicas`, `hardware/ev3`, `chat`, `sesion`, `escritorio`, `onboarding`) son heredados.
- Contraste WCAG AA. `--text-muted` no sirve para texto que se deba leer. Los ajustes de contraste y de foco van **al final** de `globals.css`.
- Radios: sm 6, md 10, lg 14, xl 20 y pill. Escala de texto en píxeles fijos: 13/12/11/10; las etiquetas van en mayúsculas con `tracking .08em`.
- Alturas: botón 34, campo 36, buscador 32, botón de icono 28. Barra lateral de 200 px (64 px plegada): `SIDEBAR_WIDTH_*` debe coincidir con `--sidebar-width` (`@property`, 0,4 s).

### Componentes
- Las pantallas nuevas usan `@/components/ui` (`Pagina`, `Encabezado`, `Campo`, `Tabla`, `Paginador`, `Dialogo`, `Aviso`, `BotonPrincipal`…). Mantine queda solo en lo heredado (barra lateral, chat, modales de SFTP, `CamarasAdminModal`, `PracticesPage`, `ConnectForm`, `GuestConnectPage`); SweetAlert2, solo en `PracticesPage`. No lo extiendas.
- Una pantalla tiene **un solo** `BotonPrincipal`. `BotonPeligro` solo para acciones irreversibles. `BotonIcono` exige `etiqueta` (nombre accesible).
- `Pagina`: ancho máximo 1080 px, `px-8 pb-12 pt-7`, separación `gap-7`. Estructura habitual: `<Pagina><Encabezado …/>…</Pagina>`.
- Vacío, error y sin permiso se muestran con `Aviso` (el crítico lleva `role="alert"`).
- Tablas: 5–8 filas por página y al filtrar se vuelve a la página 1.
- Formularios con `Campo`; usa `mono` para hosts, puertos y comandos. Nunca `outline-none` sin otro indicador de foco.
- Iconos de `lucide-react`, normalmente de 14 px, con `aria-hidden` cuando hay texto al lado.
- Avisos con `useToasts().push` (4000 ms). Evita `notifications.show` de Mantine en código nuevo.
- Animaciones con CSS, Tailwind o `element.animate`; el recorrido guiado usa `driver.js`. **No se usa `gsap`** (se retiró). Respeta siempre `prefers-reduced-motion`.

### Estructura, rutas y permisos
- Cada dominio vive en `features/<dominio>/` con `XxxPage.tsx`, `useXxx.ts` y `xxx.service.ts`.
- Para añadir una página: entrada perezosa en `app/diferidos.ts`, rama en `HomeContainer`, `PAGE_ACCESS` en `usePermissions.ts`, entrada en `Sidebar.tsx` y `ENTRADA_DE`. La barra lateral tiene 5 secciones y no pasa de 9 entradas.
- El control de acceso es doble: la barra lateral oculta y `HomeContainer` vuelve a comprobar. **El servidor valida siempre**; ocultar un botón no es seguridad.
- Grupos de roles (`usePermissions.ts`): `EVERYONE`, `STAFF` (admin_lab, jefe, coordinador, laboratorista, semillerista), `TECHNICAL` (admin_lab, semillerista), `LOGS` (STAFF + docente) y `SUPERVISION` (admin_lab, jefe, coordinador, laboratorista). `SUPERVISION` debe coincidir con `RESUMEN_ROLES` de los brokers.
- Una herramienta nueva de sesión se declara en `herramientasSesion.ts`, `SesionMosaico.tsx` y `SidebarHerramientasSesion.tsx`. Una sesión nueva abre solo la terminal.
- No renombres los atributos `data-tour` ni `data-page`: los usa el recorrido guiado.

### Datos y estado
- Zustand para datos; Context solo para estado de interfaz.
- `useQueryData` (TTL 30 s, caché LRU de 50 entradas, clave `comando:param`) para consultas con caché.
- Los servicios envuelven `invoke`. Los comandos migrados pasan por `commandClient.invoke` (parámetro `req`, reintento con espera `2^n × 1000 ms`). Los comandos SSH no se invocan directamente.
- Tipos de Rust con `import type … from '@/bindings/X'`. Todo `listen` se desuscribe. Los `CustomEvent` se llaman `dominio:accion`. Los reporteros informativos tragan sus errores.

### Texto, nombres y accesibilidad
- Español de Colombia, tuteo, mayúscula solo inicial, comillas «…», errores como «No se pudo <verbo>». Fechas con `es-CO` y fechas locales ISO (no `toISOString`); `formatBytes` con espacio duro.
- Dominio en español (`practicas`, `conexiones`); términos técnicos genéricos en inglés. Cada archivo empieza con `// ruta — qué hace`.
- Accesibilidad: enlace de salto, anillo `:focus-visible` global, `aria-current`, `aria-pressed`, `aria-live`, `role="status"` y `sr-only` donde haga falta.
- Pruebas en `tests/unit/**/*.test.ts(x)`, con `describe`/`it` en español, `// @vitest-environment jsdom` para componentes, mocks de Tauri y `MantineProvider` con `matchMedia` y `ResizeObserver` simulados.

### Incoherencias conocidas (no las copies)
- Conviven Mantine y `components/ui`; `Dialogo`, `Modal` y SweetAlert2; los *toasts* propios y `notifications.show`.
- Hay `invoke` directo en 9 `.tsx`; `useQueryData` solo se usa en `ChatPane`; `mensajeDe` está repetida 6 veces.
- `<html>` no declara `lang="es"`.
- `features/chat/tour/README.md` está obsoleto y el comentario «22 temas» de `ThemeContext` ya no es cierto.

## Dónde mirar

| Si vas a tocar… | Empieza por |
|---|---|
| Un comando de Rust | `backend/src/cmd/<dominio>/` y su registro en `backend/src/lib.rs` |
| Una pantalla | `frontend/src/features/<dominio>/` y `frontend/src/app/` (barra lateral, pestañas) |
| Permisos por rol | `frontend/src/features/cuenta/usePermissions.ts` (`PAGE_ACCESS`) |
| Login / token | `backend/src/auth/` |
| Cámaras, sesiones, Moodle | `backend/src/cmd/{nvr,sesiones,moodle_cursos}.rs` y `infra/broker-*` |
| Prácticas | `backend/src/cmd/practices/`, `frontend/src/features/practicas/`, `infra/practicas-*` |
| CI y publicación | `.github/workflows/` |
