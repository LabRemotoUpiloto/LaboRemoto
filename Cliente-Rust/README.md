# Cliente-Rust — aplicación de escritorio de LaboRemoto

Cliente **Tauri 2** del laboratorio remoto de la Universidad Piloto de Colombia: el backend está en **Rust** y la interfaz en **React 19 + TypeScript**. Se conecta por SSH a los equipos del laboratorio (Raspberry Pi, robots EV3, Arduino), muestra cámaras, ofrece un escritorio gráfico remoto, guía prácticas con validación automática, se integra con Moodle y trae un asistente de IA.

Este documento describe el estado actual del código. El contexto para asistentes de código está en [`../AGENTS.md`](../AGENTS.md).

## Arquitectura

```
┌────────────────────────────── Aplicación de escritorio (Tauri) ──────────────────────────────┐
│  Frontend (React)  ──invoke() / eventos──►  Backend (Rust)                                    │
│  features/*  store/  lib/command.service     cmd/*  auth/  state_core/  ssh_core/  ipc/       │
└───────────────────────────────────────────────┬──────────────────────────────────────────────┘
                 SSH (russh + ssh2) · túnel a la API de prácticas · HTTP con token de Keycloak
        ┌───────────────────────────────────────┼──────────────────────────────┐
   Equipos del laboratorio              Brokers HTTP (infra/)           Keycloak (login)
   Raspberry Pi · EV3 · Arduino         cámaras · sesiones · Moodle
```

- El backend es la **única** parte que habla con la red: el frontend nunca ve el token de Keycloak (solo recibe un resumen de la sesión).
- Cada sesión SSH usa dos conexiones: `russh` (asíncrona) para la terminal interactiva y `ssh2` (libssh2, bloqueante) para SFTP, GPIO, ejecución de comandos y el escritorio remoto.
- Los servicios de [`../infra`](../infra) (brokers, agente de conexiones…) viven en la red del laboratorio; la app los consume con el `access_token` de Keycloak.

## La interfaz

El shell de la aplicación (`frontend/src/app/`) es una **barra lateral flotante** (200 px, o 64 px plegada) y un área de contenido.

**Barra lateral**

| Sección | Páginas |
|---|---|
| Aprender | Inicio · Prácticas · Mis cursos · Reservas |
| Conectar | Conexiones |
| Laboratorio | Monitoreo · Vigilancia |
| Personas | Actividad · Usuarios |

Debajo van las pestañas de sesión abiertas, el bloque **Esta sesión** y el menú de usuario (Perfil, Ajustes, Temas, «Ver como» solo para administradores, Cerrar sesión).

**Pestañas.** Hay cuatro tipos: `home` (nunca se cierra), `session` (una conexión SSH), `log` (un registro de sesión) y `local-terminal` (terminal local). Las páginas de la pestaña Inicio se eligen en `HomeContainer` (`landing`, `connect`, `ssh-guest`, `practices`, `reservas`, `mis-cursos`, `admin-users`, `vigilancia`, `dashboard`, `rendimiento`, `perfil`, `ajustes`, `themes`).

**Sesiones.** Una conexión SSH normal abre un **mosaico** de herramientas que se reacomodan arrastrando (`components/mosaico`, `features/sesion/herramientasSesion.ts`): Terminal, Chat, Cámara, Escritorio, Pines, Archivos y Comandos. Las **prácticas** usan una vista propia (`VistaPractica`): barra de progreso, cámara, terminal o escritorio, chat y, si el módulo lo pide, el panel del robot EV3.

**Roles** <a id="roles"></a>

`features/cuenta/usePermissions.ts` define siete roles y `PAGE_ACCESS` decide qué página ve cada uno: `admin_lab`, `jefe_laboratorio`, `coordinador_laboratorio`, `laboratorista`, `semillerista`, `docente` y `estudiante` (el rol por defecto). Monitoreo y Usuarios son solo para `admin_lab`; «Ver como» también. Los roles de jefatura y laboratorista usan siempre el tema institucional. Los roles y el tipo de usuario (`Estudiante` o `Docente`) llegan en el token de Keycloak (`realm_access.roles`); los administradores los gestionan desde la página Usuarios.

## Frontend (`frontend/src`)

| Carpeta | Contenido |
|---|---|
| `app/` | Shell: `App.tsx`, barra lateral, hooks de pestañas y paneles, proveedores (tema, avisos, carga). |
| `features/` | Un módulo por dominio (tabla siguiente). Cada uno mezcla componentes, hooks y `*.service.ts`. |
| `components/ui/`, `components/mosaico/` | Kit de componentes propio (en español: `Boton`, `Campos`, `Dialogo`, `Tabla`…) y el mosaico de paneles redimensionables. |
| `lib/` | `command.service.ts` (cliente del protocolo versionado de comandos), `useQueryData`, almacenamiento y utilidades. |
| `store/` | Estado global con Zustand (autenticación, caché de consultas, terminal local). |
| `bindings/` | Tipos TypeScript **generados** desde Rust con `ts-rs`. No se editan a mano. |
| `styles/` | `globals.css` (Tailwind 4, CSS-first) y `themes/*.css`. |

| `features/` | Qué hace |
|---|---|
| `actividad` | Panel de actividad: sesiones, dispositivos conectados, mapa y encuestas. |
| `camaras` | Vigilancia: rejilla de cámaras (HLS/WebRTC), control PTZ y administración. |
| `chat` | Chat con IA en modos Ask, Plan y Agente; pasos del agente en vivo. |
| `comandos` | Comandos guardados que se envían a la terminal. |
| `conexion` | Equipos guardados, nueva conexión, registros, conexión como invitado. |
| `cuenta` | Autenticación, perfil, ajustes, temas y permisos por rol. |
| `cursos` | Mis cursos de Moodle, resumen y envío de entregas. |
| `escritorio` | Escritorio remoto con noVNC. |
| `hardware` | Robot EV3 (panel, consola, gemelo 3D), pines GPIO y panel de domótica (Arduino). |
| `inicio` | Portada con el estado del laboratorio o el avance del estudiante. |
| `logs` | Registros de sesiones SSH (lista, detalle, reporte). |
| `monitoreo` | Rendimiento de la Raspberry Pi del laboratorio (gráficas, procesos, prueba exportable). |
| `onboarding` | Tutorial de bienvenida con narración. |
| `practicas` | Catálogo y módulos de Linux y EV3: guía, validación, insignias, quiz y encuesta. |
| `reservas` | Reserva de horas de laboratorio (prototipo: horarios simulados). |
| `sesion`, `terminal`, `sftp` | Contenedor de sesiones, terminales (xterm) y gestor de archivos. |
| `usuarios` | Gestión de usuarios y roles (administradores). |

**Estado y datos.** Zustand 5 para el estado global; tema, avisos y carga siguen como Context. Todo lo que toca el backend pasa por funciones `*.service.ts` que encapsulan `invoke`. Los comandos usan el protocolo versionado (`CommandRequest`/`CommandResponse` con reintentos y errores tipados, reflejo de `backend/src/cmd/protocol.rs`). Los eventos llegan con `listen` (`ssh_out_<id>`, `ai:chunk`, `agent:step`, `auth:*`, `sftp_transfer`, `comandos:cambio`…).

**UI y estilos.** Mantine 9 + Tailwind 4 + CSS por tema (unos 40 temas; el predeterminado es el institucional `unipiloto`, claro). Tutoriales guiados con driver.js. Terminal con xterm 5, escritorio remoto con noVNC 1.4, 3D con three y react-three-fiber.

**Pruebas.** `vitest` (≈250 pruebas, en `frontend/tests/unit`) y un spec de `playwright` que hay que ejecutar a mano. TypeScript tiene `noUnusedLocals` y `noUnusedParameters`.

## Backend (`backend/src`)

| Módulo | Qué hace |
|---|---|
| `cmd/ssh` | Terminal SSH interactiva, sesiones guardadas y control de pines GPIO. |
| `cmd/terminal_local` | Terminal local (PTY) y portapapeles nativo. |
| `cmd/sftp`, `cmd/filesystem` | Transferencias SFTP; archivos locales, historial del chat, PDF e imágenes. |
| `cmd/vnc` | Escritorio remoto: arranca `Xvnc` con un entorno ligero en la Pi, espera a que escuche el proceso recién lanzado y lo expone con un puente WebSocket por SSH (`vnc_start/stop/status/logs/cleanup_all`). |
| `cmd/ai`, `cmd/tools` | Chat con IA (Groq) y modo agente con herramientas (API externa de modelos de lenguaje). |
| `cmd/practices` | Prácticas: API de contenido de la Pi por túnel SSH (`linux_api`, `linux_tunnel`), proxy local de medios, validador, prácticas Eve3 heredadas. |
| `cmd/hardware` | Arduino y robot EV3 (por `ssh_exec` hacia la Pi). |
| `cmd/nvr`, `cmd/camaras_admin` | Cámaras y su administración, a través del broker. |
| `cmd/sesiones`, `cmd/dispositivos`, `cmd/encuestas` | Registro de sesiones y dispositivos, y encuestas (broker). |
| `cmd/moodle_cursos`, `cmd/integration` | Cursos y entregas de Moodle por el broker; cliente directo antiguo. |
| `cmd/comandos`, `cmd/logs` | Comandos guardados; logs de sesión con conversión ANSI→HTML. |
| `cmd/state`, `state_core`, `session_manager` | Sesiones SSH activas, memoria efímera por sesión (TTL 2 h) y almacén de sesión/autenticación (solo en memoria; `RedisSessionManager` es un esqueleto sin implementar). |
| `cmd/protocol.rs`, `error.rs` | Protocolo versionado y `CommandError` (`code`, `message`, `retryable`, `retry_after_ms`). |
| `auth/` | Login OAuth 2.1 + PKCE con Keycloak (ver abajo). |
| `ssh_core/` | `client.rs` (russh), `ssh2_sftp.rs` y `exec.rs` (ssh2). |
| `ipc/` | Cola de eventos con respuesta (ACK) y presión inversa; hoy solo la usa `auth`. |
| `storage.rs`, `security.rs`, `user_config.rs` | Hosts cifrados (Argon2id + ChaCha20-Poly1305, clave maestra en el llavero del sistema), validación de comandos, y carga de la configuración del usuario. |

**Autenticación.** Keycloak con OAuth 2.1 Authorization Code + PKCE (cliente público). `auth_login_url` genera el verificador, abre el navegador del sistema y espera el código en un servidor `axum` de loopback que se apaga a los 5 min. El JWT se valida con RS256 (JWKS en caché 1 h). Un demonio renueva el token 45 s antes de que expire y solo el *refresh token* se guarda, cifrado, en disco. Los enlaces `laboremoto://practica/<id>` los procesa el frontend (el backend registra el esquema y mantiene una sola instancia).

**Cómo se conecta a los equipos.** Terminal interactiva y túnel hacia la API de prácticas con `russh`; todo lo demás con `ssh2`, que abre su propia conexión con las credenciales guardadas en `SessionExt`. El túnel de prácticas entra por una cuenta de servicio restringida en la Pi.

**Configuración.** Se lee, en este orden: `.env` desde el directorio actual hacia arriba; `.env` y `.env.practicas` junto al código (solo útil en desarrollo); y el `.env` del usuario en `<config_dir>/co.unipiloto.sshclient/` (Windows: `%APPDATA%`) o junto al ejecutable. Lo que ya esté definido no se pisa. Algunas claves se **embeben al compilar** (`build.rs`) como último respaldo.

| Grupo | Variables (nombres; los valores no se versionan) |
|---|---|
| Keycloak | `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID` (tienen valor por defecto) |
| IA | `GROQ_API_KEY`, `OPENAI_MODEL`; el modo agente usa su propia clave (ver `.env.example`) |
| Prácticas Linux | `PRACTICE_LINUX_TUNNEL_{HOST,PORT,USER,PASSWORD}`, `PRACTICE_LINUX_API_REMOTE_PORT`, `PRACTICE_LINUX_API_TOKEN`, `PRACTICE_LINUX_SSH_{HOST,PORT}`, `PRACTICE_LINUX_LOCAL_{HOST,PORT}` |
| Heredado | `PRACTICE_EVE3_*`, `PI4_*`, `MOODLE_URL`, `MOODLE_TOKEN` |

La guía para el `.env` de la app instalada está en [`CONFIGURACION-ALUMNOS.md`](./CONFIGURACION-ALUMNOS.md).

**Comandos de Tauri.** Un comando nuevo se declara con `#[tauri::command]` y se registra con su **ruta completa y coma final** en `tauri::generate_handler![…]` de `backend/src/lib.rs`. `scripts/check-comandos.mjs` falla si el frontend invoca un comando no registrado o si hay uno registrado que nadie usa y no está justificado en `scripts/comandos-sin-uso.txt`.

**Tipos compartidos.** Las estructuras marcadas con `#[derive(TS)] #[ts(export)]` generan sus tipos en `frontend/src/bindings` (la ruta sale de `backend/.cargo/config.toml`). `cargo test` los regenera: revisa `git status` antes de hacer commit.

## Desarrollo

```bash
npm run install:all     # raíz + frontend
cp .env.example .env
npm run dev             # Windows: scripts/dev.ps1 → cargo tauri dev
# o por separado: npm run dev:frontend  /  npm run dev:backend
```

| Qué | Comando (desde `Cliente-Rust/`) |
|---|---|
| Comandos Tauri vs. frontend | `node scripts/check-comandos.mjs` |
| Tipos del frontend | `cd frontend && npx tsc --noEmit` |
| Pruebas del frontend | `cd frontend && npx vitest run` |
| Capturas de las páginas (sin conexión real) | `cd frontend && npx vite --port 5199 --strictPort` y, en otra terminal, `npm run capturas` |
| Compilar el backend (con tests) | `cd backend && cargo check --all-targets` |
| Pruebas del backend (las del CI) | `cd backend && cargo test --lib --bins --test error_categorization_test --test protocol_test --test session_manager_flow_test --test session_manager_test` |

**Capturas de pantalla** (carpeta `docs/imagenes/`, se usan en el `README.md` raíz). Hay dos formas, según la vista:

- *Páginas* (inicio, prácticas, conexiones, cursos, monitoreo, actividad, usuarios): `npm run capturas` abre la interfaz en un navegador con un Tauri simulado y datos propios del script (`frontend/scripts/capturas.mjs`), sin Keycloak ni equipos. Enmascara cualquier IP visible.
- *Sesión real* (terminal, chat, archivos, escritorio remoto): con la app abierta y una sesión SSH iniciada, `scripts/capturar-ventana.ps1 -Salida captura.png` fotografía solo la ventana de la app y `scripts/tapar-usuario.py captura.png salida.png usuario` sustituye el usuario de la barra lateral. **Revisa cada imagen antes de subirla**: puede mostrar el prompt con tu usuario o correo, listados de archivos, rutas locales, nombres de otras personas o direcciones IP. Antes de capturar usa carpetas de demostración (`/tmp/demo` en remoto, `C:\demo` en local) y, si el prompt muestra tu correo, táppalo a mano.

**Ramas y CI.** Se trabaja en ramas `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`… con commits `tipo(ámbito): mensaje` en español, y se abre un PR hacia `Desarrollo`. En cada PR corre `.github/workflows/ci.yml` (comandos, backend, frontend), la comprobación de versiones exactas en `package.json` y la de archivos sensibles (`.env`, `*.pem`, `*.key`, direcciones IP en el código). Al fusionar, la rama se borra sola.

**Publicación.** Un push a `Produccion` ejecuta `release.yml`: instalador de Windows (NSIS, firmado) con el `latest.json` del actualizador, y paquetes `.deb` y AppImage para varias versiones de Ubuntu. Requiere secretos de GitHub Actions con las claves que se embeben en la app.

## Servicios del laboratorio (`../infra`)

Brokers en Node (sin framework) detrás de un gateway: `broker-gateway` (8091) reparte `/nvr/*` a `broker-camaras` (8092), `broker-sesiones` (8093) y `broker-moodle` (8094); `broker-comun` es la librería compartida (valida el JWT). `agente-conexiones` (Python) corre en la Pi de entrada, lee sus accesos SSH y los reporta a `broker-sesiones`; `shinobi-vigilante` reinicia Shinobi si se traba; `practicas-linux` y `practicas-ev3` son el **contenido** (módulos, validación) que sirve la API de prácticas de la Pi, cuyo código no está en este repositorio. El detalle de cada servicio está en su `README.md` (los de `practicas-linux` y `keycloak` aún no existen).

## Problemas conocidos

- **Windows: `auth_ipc_dispatch_test`** no arranca (`0xc0000139`): los tests con `tauri::test` necesitan un manifiesto que `tauri-build` solo pone al binario de la app. Un `cargo test` completo falla en ese test; por eso el CI lo excluye.
- **Windows: PDB corrupto** (`LNK1285`) si dos `cargo` compilan a la vez el mismo `target`. Solución: `cargo clean -p app`.
- **`promts/ai.toml`**: `cmd/ai/prompts.rs` busca ese archivo con una errata (`promts`), pero el real es `backend/prompts/ai.toml`; hoy siempre se usan los textos por defecto del código.
- **Claves de host SSH** de `russh` no se verifican (`check_server_key` acepta cualquiera).
- **Versiones**: `Cargo.toml`, `tauri.conf.json` y `package.json` no coinciden; el release calcula la versión que publica.
