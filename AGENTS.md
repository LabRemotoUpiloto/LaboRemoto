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
- **READMEs de `infra/`:** algunos están desfasados (`broker-gateway` no lista `/nvr/encuestas`; `broker-sesiones` no documenta encuestas; `practicas-linux` y `keycloak` no tienen README).
- **`INFRAESTRUCTURA-LOCAL.md`** (direcciones y accesos del laboratorio) existe solo en la copia local de quien lo mantiene y está excluido de git: no lo recrees ni copies su contenido al repositorio.

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
