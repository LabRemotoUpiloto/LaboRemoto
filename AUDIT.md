# Auditoría de Código y Arquitectura – Cliente SSH Unipiloto

Esta auditoría se ha realizado sobre el estado actual del repositorio, cubriendo:

- Arquitectura y estructura de carpetas
- Backend Rust (Tauri v2)
- Frontend React + TypeScript
- Seguridad, manejo de credenciales y almacenamiento
- Calidad de código y experiencia de usuario en funcionalidades clave (Terminal, SFTP, Logs, Hosts, Raspberry, IA)

Las observaciones anteriores de la auditoría pasada se han descartado cuando ya no reflejan el código actual.

---

## 1. Resumen Ejecutivo

### 1.1 Puntos fuertes

- Arquitectura bien definida: separación clara entre backend Rust (`apps/desktop/src-tauri`) y frontend React (`apps/desktop/web`), alineada con el diagrama en `docs/`.
- Backend con enfoque en seguridad:
  - Almacenamiento cifrado de hosts con Argon2id + ChaCha20-Poly1305 y master key en el llavero del sistema (`apps/desktop/src-tauri/src/storage.rs`).
  - Capa de validación de operaciones potencialmente peligrosas (`apps/desktop/src-tauri/src/security.rs`).
- Frontend modularizado por dominios (terminal, SFTP, logs, hosts, raspberry, snippets, tour) con componentes reutilizables y contextos (`ThemeContext`, `LoadingContext`, `ToastContext`).
- SFTP y terminal integrados de forma coherente con el backend asincrónico (uso de `spawn_blocking` para SFTP).
- Sistema de logs de sesiones bastante completo (listado, filtrado, borrado y generación de PDF).

### 1.2 Riesgos y focos de mejora prioritarios

- Falta de linting/estándares formales en el frontend: `.eslintrc.cjs` vacío y sin reglas activas.
- Uso extendido de `any` en TypeScript, especialmente en integración con Tauri (`invoke`, `listen`) y manejadores de errores.
- Páginas clave muy grandes y con muchas responsabilidades:
  - `App.tsx` (navegación principal, pestañas, coordinación de múltiples vistas).
  - `SftpPage.tsx` (545+ líneas, mezcla de lógica de negocio, control de UI, gestión de eventos Tauri y estado de transferencias).
  - `ConnectForm.tsx` (formulario de conexión con muchas ramas de lógica).
- Logs en consola (`console.log`/`console.error`) aún presentes en componentes de UI (ej. `LogsPage.tsx`), aunque se mitigan en producción con el apagado global en `main.tsx`.
- Pruebas automatizadas limitadas al backend; no se encontraron tests de frontend.

### 1.3 Quick wins recomendados

- Activar ESLint con un conjunto mínimo de reglas y agregar scripts `lint` a `package.json` del frontend.
- Introducir un pequeño helper de logging en frontend en lugar de utilizar `console` directamente.
- Refactorizar `SftpPage.tsx` y `ConnectForm.tsx` en hooks y subcomponentes más pequeños.
- Reducir el uso de `any` en puntos de borde clave (API de Tauri, eventos, modelos de datos compartidos).

---

## 2. Arquitectura y Estructura de Carpetas

### 2.1 Vista general

- Raíz:
  - `apps/desktop/src-tauri`: backend Rust + Tauri v2.
  - `apps/desktop/web`: frontend React + Vite.
  - `docs/`: diagramas de arquitectura (`arquitectura-general.puml`, `flujo-datos.puml`).
  - `AUDIT.md`, `README.md`.

### 2.2 Valoración

- La separación entre frontend y backend es clara y consistente.
- Dentro de `src-tauri/src/cmd` hay una buena organización por dominio: `ssh`, `sftp`, `file_edit`, `ai`, `logs`, `hosts`, `local`, `pdf_reports`, etc.
- En el frontend, `src/components` se organiza por áreas funcionales (`terminal`, `sftp`, `logs`, `raspberry`, `modals`, `ui`, etc.) y `src/pages` agrupa las vistas de alto nivel.

### 2.3 Mejoras propuestas

- Definir un “feature module” más explícito en el frontend:
  - Por ejemplo, agrupar por dominio: `features/sftp`, `features/logs`, `features/terminal` que contengan `page + componentes + API + hooks`, en lugar de dispersar partes entre `components/` y `pages/`.
- Documentar en `README.md` (o en los diagramas de `docs/`) el flujo básico de navegación (pestañas, landing, páginas de conexión, logs, SFTP) para facilitar onboarding de nuevos desarrolladores.

---

## 3. Backend Rust (Tauri)

### 3.1 Organización general

- Punto de entrada:
  - `apps/desktop/src-tauri/src/main.rs` delega en `app::run()`.
  - `apps/desktop/src-tauri/src/lib.rs` registra todos los comandos Tauri y plugins (`updater`, `process`) y gestiona el `AppState`.
- Módulos principales:
  - `error.rs`: enum `AppError` y alias `AppResult<T>`.
  - `state.rs`: memoria efímera de sesión y eventos hacia la UI (evento `copilot/terminal-result`).
  - `storage.rs`: cifrado y almacenamiento de hosts.
  - `security.rs`: reglas de seguridad para comandos y operaciones sobre ficheros.
  - `cmd/*`: comandos Tauri organizados por dominio.

Valoración: la modularización es buena y los nombres de módulos son claros.

### 3.2 Manejo de errores

- Existe un tipo de error común `AppError`, pero muchos comandos Tauri exponen `Result<_, String>` hacia JS. Esto es comprensible (la capa Tauri requiere `String`), pero:
  - Se pierde parcialmente la estructura semántica de `AppError`.
  - Hay lógica repetida de `map_err(|e| e.to_string())`.

**Mejoras recomendadas**

- Introducir funciones helpers para convertir `AppError` → `String` con mensajes homogéneos (por ejemplo, prefijos por dominio: `SSH: ...`, `SFTP: ...`, `AI: ...`).
- A nivel interno, preferir `AppResult<T>` y solo convertir a `String` en el borde Tauri, manteniendo la riqueza del tipo de error dentro del backend.

### 3.3 Uso de `unwrap` y robustez

- El uso de `unwrap()` peligroso mencionado en la auditoría anterior (por ejemplo, en `SESSIONS.lock().unwrap()`) ya no está presente.
- Los `unwrap()` actuales están acotados y se usan en situaciones donde previamente se ha comprobado la condición:
  - `strip_prefix("cd").unwrap()` en `cmd/ssh.rs` se ejecuta solo cuando la línea comienza con `cd`.
  - `filtered.pop().unwrap()` en `cmd/file_edit.rs` se usa tras comprobar que `filtered.len() > 1`.
  - `get_claude_api_key().unwrap()` se ejecuta solo si `is_some()` ha sido verificado.

**Mejora sugerida (estilo)**

- Aunque no representan un riesgo alto de pánico, se recomienda sustituir algunos `unwrap()` por `expect()` con mensajes explícitos o por `match`/`if let`, para mejorar la legibilidad y facilitar el debugging en caso de regresiones.

### 3.4 Concurrencia y operaciones bloqueantes

- `ssh2` se usa para SFTP con `spawn_blocking`, lo que evita bloquear el runtime async de Tokio (patrón correcto).
- El módulo `cmd/sftp.rs` mantiene un mapa de sesiones y un mapa de transferencias, con cancelación mediante `AtomicBool` y eventos `sftp_transfer` hacia el frontend.

**Mejoras sugeridas**

- Revisar la política de limpieza de transferencias:
  - Ahora se marca como `cancelled/done/error` pero los elementos se mantienen en memoria hasta que la UI los limpia.
  - Podría añadirse, en backend, una limpieza periódica de entradas antiguas o un TTL, para evitar crecimiento en sesiones de larga duración.
- Considerar timeouts explícitos para operaciones de SFTP muy largas (por ejemplo, lectura/escritura en bucles de transferencia) para evitar bloqueos prolongados si el servidor remoto deja de responder.

### 3.5 Seguridad y almacenamiento de credenciales

- `storage.rs`:
  - Usa `ProjectDirs` para localizar el directorio de datos y un subdirectorio `hosts`.
  - Deriva claves con Argon2id y HKDF, cifra con ChaCha20-Poly1305 y almacena blobs en JSON.
  - Utiliza el llavero del sistema (`keyring`) para la master key, lo cual es una buena práctica.
- `cmd/ssh.rs`:
  - El struct `SessionExt` mantiene `host`, `port`, `user`, `password` en memoria para reutilizar la sesión SFTP.
  - Esto es razonable para una sesión interactiva, pero conviene recordar que las credenciales viven en memoria mientras la sesión esté abierta.

**Mejoras sugeridas**

- Revisar `ProjectDirs::from("com", "example", "ssh-ai-client")` en `storage.rs`:
  - El identificador no coincide con el `identifier` de Tauri (`co.unipiloto.sshclient`) ni con el `productName`.
  - Sería más consistente usar el mismo identificador en todo el stack para evitar confusión y posibles colisiones en el sistema.
- Documentar explícitamente en código o en documentación que:
  - Las credenciales persistentes siempre se guardan cifradas.
  - Las credenciales en memoria solo viven mientras la sesión está activa.

---

## 4. Frontend React + TypeScript

### 4.1 Configuración y tooling

- `tsconfig.json`:
  - Target `ES2020`, `module` `ESNext`, `moduleResolution` `Bundler`, `jsx` `react-jsx`.
  - Falta configuración explícita de `strict`, `noImplicitAny`, etc. (no están visibles en el archivo actual).
- `.eslintrc.cjs` existe pero está vacío (0 líneas).
- `package.json` del frontend define scripts `dev`, `build`, `preview`, pero no `lint` ni `test`.

**Mejoras recomendadas**

- Activar TypeScript estricto:
  - Añadir en `tsconfig.json` opciones como: `"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`.
- Configurar ESLint:
  - Rellenar `.eslintrc.cjs` con:
    - Base `eslint:recommended`, `plugin:react-hooks/recommended`, `@typescript-eslint`.
    - Reglas mínimas: `no-console` (en producción), `eqeqeq`, `prefer-const`, `no-explicit-any` (o al menos `warn`).
  - Añadir script `"lint": "eslint src --ext .ts,.tsx"` en `package.json`.
- Considerar Prettier o reglas de formato en ESLint para mantener estilo consistente.

### 4.2 Uso de `any` y tipado

Se encontraron usos frecuentes de `any` en:

- `components/ChatPane.tsx`
- `App.tsx`
- `navigation/navigation.ts`
- `tour/useTour.ts`
- `components/connect/ConnectForm.tsx`
- `pages/SavedHostsPage.tsx`
- `components/raspberry/PinsPanel.tsx`
- `components/chatModes/*`
- `api/storage.ts`

**Mejoras recomendadas**

- Introducir tipos específicos para:
  - Payloads de eventos Tauri (`listen`): crear interfaces `SftpTransferEvent`, `TerminalResultEvent`, etc.
  - Respuestas de APIs (`SessionLog`, `SftpEntry`, `LocalEntry`) ya están parcialmente tipadas, pero conviene extenderlas donde aún se usa `any`.
  - Estructuras de estado complejas (`ChatModeState`, `TourState`, etc.).
- En `useTour.ts`, reemplazar `let jumpTimer: any = null` por un `useRef<number | null>` manejado dentro del hook para evitar estado global mutable.

### 4.3 Logs y depuración

- `src/main.tsx` anula `console.log/debug/info/warn/error` cuando `!import.meta.env.DEV`, lo que mitiga el riesgo de logs en producción.
- Aun así, hay llamadas a `console.log` y `console.error` en UI (ej. `LogsPage.tsx`) que no aportan valor directo al usuario.

**Mejoras recomendadas**

- Crear un pequeño módulo de logging, por ejemplo `src/utils/logger.ts`, con funciones `logInfo`, `logError`, etc., que:
  - Respeten el entorno (`DEV` vs `PROD`).
  - Puedan redirigirse en el futuro a un sistema de telemetría si se desea.
- Sustituir las llamadas directas a `console.*` en componentes UI por este helper o, cuando no aporten valor, eliminarlas.

### 4.4 Componentes y responsabilidades

**App.tsx**

- `App.tsx` coordina:
  - Tabs de sesiones, landing, logs, SFTP, snippets, temas, etc.
  - Contextos globales de loading, toasts y tema.
  - Apertura de `PinsPanel` de Raspberry, cámara, etc.
- Aunque está razonablemente estructurado, es un componente “god component” de la UI.

Mejoras:

- Extraer parte de la lógica de gestión de pestañas y rutas a un hook (`useTabs`) o a un pequeño router interno.
- Considerar definir un “tipo de página” con metadatos en un único lugar (id, icono, título, permisos futuros), para evitar condicionales dispersos.

**SftpPage.tsx**

- Implementa:
  - Navegación local y remota.
  - Filtros, ordenación, selección, contexto (menús).
  - Gestión de transfers (descarga/subida, cancelación, limpieza).
  - Suscripción a eventos `sftp_transfer`.
- El código es funcional y está bien comentado, pero el tamaño y número de responsabilidades dificultan su mantenibilidad.

Mejoras:

- Extraer hooks especializados:
  - `useLocalFsBrowser` (estado y acciones de `lpath`, `lrows`, filtros y ordenación local).
  - `useRemoteFsBrowser` (estado remoto, errores, recarga, navegación).
  - `useSftpTransfers` (gestión del array de transfers y suscripción a eventos).
- Sustituir `alert('download: ...')` y `alert('upload: ...')` por toasts usando `useToasts` para mantener consistencia de UX.

**ConnectForm.tsx**

- Lógica rica de validación de host/puerto, soporte para `QuickHost`, conexiones recientes, auto-conexión desde `initialPayload`, detección de Raspberry Pi, etc.

Mejoras:

- Dividir en:
  - Un hook `useConnectForm` con toda la lógica de validación, detección de Raspberry, estado de `AbortController`, etc.
  - Un componente de presentación que solo reciba props (`values`, `errors`, handlers) y se centre en el markup.
- Tipar mejor `initialPayload` y `recentConnection` con interfaces específicas en lugar de `any`.

**LogsPage.tsx**

- Diseño limpio con filtros, ordenación y grid de sesiones.
- Mantiene `console.log`/`console.error` para depuración y mostrar información de carga.

Mejoras:

- Reemplazar logs de depuración por el helper de logging o eliminarlos si no son necesarios.
- Considerar mostrar contadores/resúmenes (número de sesiones por host) en UI en lugar de logs de consola.

---

## 5. Funcionalidades Clave

### 5.1 Terminal interactiva

- `TerminalView.tsx` orquesta `TerminalPane` y el panel de chat.
- `TerminalPane.tsx` ha sido simplificado respecto a la auditoría anterior:
  - Usa el hook `useTerminal` para toda la lógica (foco, conexión, streaming), manteniendo el componente como una vista del contenedor y un overlay de “Conectando al servidor…”.

Mejoras:

- Revisar `useTerminal.ts` para asegurar:
  - Limpieza adecuada de listeners y recursos en `useEffect`/`return () => { ... }`.
  - Manejo de errores de conexión de forma consistente con `useToasts`.

### 5.2 Explorador SFTP

- UI bastante completa: navegación local/remota, breadcrumbs (`FileNavigationBar`), panel de transferencias, contexto con clic derecho.

Mejoras resumidas:

- Refactorizar la página en hooks, como se menciona arriba.
- Tipar el evento `sftp_transfer` en frontend y backend para evitar `any`.
- Añadir mensajes de error más amigables en UI, reutilizando `ToastContainer` en lugar de `alert`.

### 5.3 Hosts guardados

- `SavedHostsPage.tsx` + `api/storage.ts` + backend `storage.rs` ofrecen:
  - Listado de hosts cifrados.
  - Eliminación, edición y reutilización de conexiones.

Mejoras:

- Sustituir usos de `any` en eventos y listas.
- Mostrar de forma clara en el UI cuáles hosts usan passphrase y cuáles usan master key.

### 5.4 Logs y reportes PDF

- `LogsPage.tsx` + `LogDetailPage.tsx` + `cmd/logs.rs` + `cmd/pdf_reports.rs`:
  - Listado y filtrado de sesiones.
  - Vista de detalle HTML.
  - Generación de reportes PDF locales.

Mejoras:

- Añadir estados vacíos claros (sin sesiones, error de carga).
- En `LogDetailPage.tsx`, revisar el manejo de errores para que siempre haya feedback en UI (toast) cuando falle `getSessionLogContent` o la invocación de Tauri.

### 5.5 Integración Raspberry Pi

- `PinsPanel.tsx` y `CameraPanel.tsx` ofrecen UI específica para GPIO y cámara.

Mejoras:

- Reducir `any` en las respuestas del backend para GPIO.
- Definir un tipo `RaspberryPin`/`PinState` reutilizable entre backend y frontend (idealmente generado con `ts-rs` si se modela en Rust).

### 5.6 IA y análisis de archivos

- `cmd/file_edit.rs` contiene lógica extensa para:
  - Analizar archivos (`analyze_file`, `analyze_any_file`).
  - Generar resúmenes usando IA (Claude u OpenAI).
  - Gestionar caché de análisis (mapa en memoria con TTL y SHA-256).

Mejoras:

- Extraer las plantillas de prompts y la lógica de construcción de mensajes a funciones auxiliares o a un módulo dedicado, para reducir la complejidad del archivo.
- Considerar mover textos “largos” (prompts en español) a ficheros de configuración TOML/JSON para facilitar mantenimiento y localización.

---

## 6. Pruebas, CI y Calidad

### 6.1 Backend Rust

- Existen tests en `apps/desktop/src-tauri/tests/` para funcionalidades de IA/planificación y análisis de archivos.

Mejoras:

- Añadir tests unitarios específicos para:
  - `storage.rs` (cifrado/descifrado, manejo de errores).
  - `security.rs` (detección de comandos peligrosos y rutas sensibles).
  - `cmd/sftp.rs` en la medida de lo posible (tests de integración con un servidor SFTP local o mockeado).

### 6.2 Frontend

- No se encontraron tests de frontend (unitarios ni de integración).

Mejoras recomendadas:

- Introducir poco a poco Vitest + React Testing Library:
  - Empezar por utilidades puras (`fileFormatters.ts`, `pathUtils.ts`).
  - Luego componentes simples (ej. `Badge`, `Alert`, `FileNavigationBar`).
- Configurar al menos un workflow de CI que ejecute:
  - `cargo test` en `apps/desktop/src-tauri`.
  - `npm run build` (y, en el futuro, `npm run lint` y `npm test`) en `apps/desktop/web`.

---

## 7. Roadmap Sugerido de Mejora

Orden sugerido (de más rápido impacto a más estructural):

1. **Tooling y calidad básica**
   - Activar ESLint y TypeScript estricto.
   - Añadir scripts `lint` y, posteriormente, `test` en el frontend.
   - Eliminar o encapsular `console.*` en un helper de logging.

2. **Refactors locales de alta ganancia**
   - Dividir `SftpPage.tsx` en hooks y subcomponentes.
   - Dividir `ConnectForm.tsx` en hook + componente de presentación.
   - Tipar los eventos de Tauri (`sftp_transfer`, resultados de terminal, etc.) para eliminar `any` en esos puntos críticos.

3. **Convergencia de modelos y seguridad**
   - Alinear el identificador de `ProjectDirs` con el de Tauri.
   - Definir y reutilizar modelos de datos compartidos (ej. con `ts-rs`) para hosts, logs, pines, etc.

4. **Pruebas y observabilidad**
   - Extender tests en Rust a módulos de seguridad y almacenamiento.
   - Introducir tests de frontend para utilidades y componentes clave.
   - Evaluar en el futuro una capa ligera de telemetría/análisis de uso (respetando privacidad) para entender cómo se usan terminal, SFTP, logs y Raspberry.

Con estas acciones, el proyecto pasaría de un estado ya funcional y razonablemente seguro a uno más robusto, mantenible y escalable, facilitando futuras extensiones (nuevos modos de IA, dashboards por rol, más integraciones, etc.).
