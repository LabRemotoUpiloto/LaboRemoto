# Guía rápida para agentes de IA en este repositorio

> **⚠️ IMPORTANTE**: Antes de realizar CUALQUIER modificación en el código frontend, DEBES leer y seguir las directrices en [`AGENTS.md`](../AGENTS.md). Este archivo contiene reglas obligatorias sobre reutilización de componentes, sistema de temas y patrones establecidos.

Esta app es un cliente de escritorio Tauri v2 (backend en Rust) con un frontend en React + Vite. Ofrece un terminal SSH, SFTP, almacenamiento cifrado de hosts y un asistente de IA que compone comandos de terminal y acciones sobre archivos de forma segura.

## Arquitectura y límites
- Backend (Rust, Tauri): apps/desktop/src-tauri
  - Los comandos expuestos a la UI viven en src-tauri/src/cmd/* y se registran en src-tauri/src/lib.rs mediante tauri::generate_handler!.
  - Módulos clave:
    - cmd/ssh.rs — Ciclo de vida de sesiones SSH y streaming de I/O.
    - cmd/sftp.rs — Operaciones SFTP (vía libssh2; bloqueo envuelto con spawn_blocking).
    - cmd/local.rs — Listado de FS local y unidades.
    - cmd/hosts.rs — Guardar/cargar/listar/borrar hosts cifrados.
    - cmd/ai.rs — Endpoint de chat de IA con reglas/contratos estrictos.
    - state.rs — Memoria efímera por sesión (TTL 2h) y eventos hacia la UI.
    - storage.rs — Almacenamiento cifrado (Argon2/HKDF + ChaCha20-Poly1305; clave maestra en el keyring del SO).
    - tools.rs — Utilidades (ejecución de comandos, leer/escribir/buscar archivos).
- Frontend (React 19 + Vite): apps/desktop/web
  - Terminal UI en components/TerminalPane.tsx y components/TerminalView.tsx (xterm.js + fit, links).
  - Shell de la app/pestañas en src/App.tsx; páginas en src/pages/*; contextos en src/contexts/*.
  - UI/lógica de chat en components/ChatPane.tsx (parsea la salida del modelo en acciones/scripts).

## Patrones de comunicación entre componentes
- Comandos Tauri (invocados desde la web con invoke(nombre, params)):
  - SSH: ssh_connect, ssh_connect_stored, ssh_stdin, ssh_resize, ssh_disconnect, ssh_ui_ready.
  - IA: ai_chat.
  - Hosts: save_host_encrypted, load_host_encrypted, save_host_master, load_host_master, list_hosts_entries, list_hosts_files, delete_host_file.
  - FS local: local_home_dir, local_list_dir, local_list_drives.
- Eventos (emitidos desde Rust, escuchados en la web):
  - Stream del terminal: ssh_out_<sessionId> (el sessionId se sanea antes de construir el nombre del tópico).
  - Resultados de terminal (snapshots): copilot/terminal-result (para actualizar memoria efímera).

## Ciclo de vida del terminal SSH (camino feliz)
1) ssh_connect(...) devuelve un UUID de sesión y lanza un lector en segundo plano.
2) El frontend monta TerminalPane, se suscribe a ssh_out_<id> y envía pulsaciones vía ssh_stdin.
3) El frontend envía ssh_resize al montar y en cada resize de ventana/terminal.
4) Cuando la UI está lista, llama ssh_ui_ready para que el backend vacíe el buffer pendiente de esa sesión.
5) Al cerrar, invoca ssh_disconnect para desmontar la sesión y limpiar el estado efímero.

## Contratos del agente de IA y convenciones de la UI
- El modo “Agent” (ver cmd/ai.rs) impone salidas estrictas:
  - Preferir JSON estructurado con version: "ui-v1", mode: "agent", intent: "create" y actions como {type: "create_file"|"command"}.
  - Modo textual de respaldo: devolver exactamente UN bloque de código (sin etiqueta de lenguaje) cuya primera línea sea el primer comando a ejecutar; sin comentarios/prompts; evitar conectores (&&, ||, ;, |).
  - Creación de archivos: usar here-doc seguro cat > ruta <<'EOF' ... EOF y a menudo añadir cat <ruta> para mostrar el resultado.
- La UI aplica seguridad/normalización:
  - Convierte invocaciones python a python3 cuando corresponde.
  - Asigna nivel de riesgo para operaciones peligrosas (p. ej., rm -rf, mkfs, dd, chmod amplios).
  - Primero intenta parsear acciones JSON; en su defecto extrae texto dentro de bloque de código; puede añadir la ejecución de .py/.sh recién creados si el usuario pidió “ejecútalo”.
- Follow-ups: la UI puede sintetizar comandos simples (renombrar/mover/borrar/listar/cd/chmod) sin ida y vuelta cuando el usuario escribe indicaciones cortas en español.

## Almacenamiento y seguridad
- Hosts cifrados por usuario bajo el directorio de datos de la app; nombres de archivo con hash y extensión .json.enc.
- Dos modos de guardado/carga: clave derivada de passphrase (Argon2id) o clave maestra del SO (keyring) + HKDF.
- Seguridad: el agente y la UI rechazan conectores multi-comando para “una sola instrucción”; operaciones destructivas requieren salvaguardas; la memoria de sesión es efímera con TTL de 2h.

## Compilación, ejecución y empaquetado
- Servidor de desarrollo: tauri.conf.json define devUrl en http://localhost:5174 y beforeDevCommand para arrancar el dev server web.
  - Con la CLI de Tauri, una sesión de dev inicia la web en 5174 y el backend Rust, cargando esa URL en la ventana.
  - Alternativamente, arranca el dev server desde apps/desktop/web y ejecuta la app Rust desde apps/desktop/src-tauri; la ventana se conectará al devUrl.
- Compilar solo backend: la tarea de VS Code “Build desktop Tauri app” corre cargo build para el crate Tauri.
- Empaquetado instalador: usar el bundler de Tauri (objetivo NSIS configurado; updater apunta a GitHub Releases latest.json). Asegura que la web esté construida antes (Vite exporta a ../web/dist).

## Cómo extender
- Añadir un nuevo comando Tauri:
  - Implementa un #[tauri::command] fn en src-tauri/src/cmd/<feature>.rs.
  - Regístralo en la lista invoke_handler de src-tauri/src/lib.rs.
  - Desde la web, llama invoke('<command_name>', { ...params }) y, si hace falta, emite/escucha eventos con la API de eventos de Tauri.
- Tópicos de salida del terminal: al emitir desde Rust usa format!("ssh_out_{}", id); en web, suscríbete con listen('ssh_out_<id>') después de sanear el id como hace TerminalPane.

Referencias:
- Backend (entrada): src-tauri/src/lib.rs, src-tauri/src/main.rs
- Terminal UI: web/src/components/TerminalPane.tsx
- Lógica de IA: src-tauri/src/cmd/ai.rs y web/src/components/ChatPane.tsx
- Almacenamiento: src-tauri/src/storage.rs
- Estado efímero y eventos: src-tauri/src/state.rs