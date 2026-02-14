# Auditoría de Código - Cliente Rust

Este documento detalla los hallazgos de la auditoría de código realizada sobre el proyecto. Se han identificado bugs potenciales, malas prácticas, deuda técnica y áreas de mejora.

## 🚨 1. Estabilidad y Manejo de Errores (Rust)

### Uso peligroso de `unwrap()`
Se detectaron múltiples usos de `.unwrap()` en código de producción. En Rust, esto causa un "panic" (cierre forzoso de la aplicación) si el valor es `None` o `Err`.

*   **Riesgo Alto**: En `apps/desktop/src-tauri/src/cmd/ssh.rs`, se usa `unwrap()` al adquirir locks de Mutex (`SESSIONS.lock().unwrap()`).
    *   *Consecuencia*: Si un hilo entra en pánico mientras tiene el lock, el Mutex se "envenena" (poisoned). El siguiente hilo que intente hacer `lock().unwrap()` también entrará en pánico, provocando una caída en cascada de todo el backend.
*   **Archivos afectados**:
    *   `src/cmd/ssh.rs`
    *   `src/cmd/sftp.rs`
    *   `src/cmd/ai.rs`
    *   `src/cmd/jwt.rs`
    *   `src/cmd/ldap_auth.rs`

**Recomendación**: Reemplazar `unwrap()` por manejo de errores explícito (`match`, `if let`, o `?` operator) para manejar gracefully los fallos.

## 🧹 2. Limpieza de Código y Logs (Frontend)

### `console.log` en Producción
Se encontraron numerosos `console.log` dispersos en el código del frontend.

*   **Problema**: Ensucia la consola del navegador y puede exponer información sensible (datos de sesión, errores internos) en versiones de producción.
*   **Archivos afectados** (13 archivos encontrados):
    *   `web/src/pages/UsersAdminPage.tsx`
    *   `web/src/pages/LogsPage.tsx`
    *   `web/src/api/sessionCapture.ts`
    *   `web/src/components/terminal/TerminalPane.tsx`
    *   ... y otros.

**Recomendación**: Eliminar los logs de depuración o usar una librería de logging que permita desactivarlos en builds de producción (ej. `loglevel`).

## 🚧 3. Deuda Técnica y Mantenibilidad

### Alias y Lógica Legacy en `ChatMode`
En `apps/desktop/src-tauri/src/cmd/ai.rs`, el enum `ChatMode` mantiene una gran cantidad de alias para compatibilidad con versiones anteriores (`"agent"`, `"super"`, `"busqueda"`, etc.).

```rust
#[serde(
  alias = "ASK", alias = "Ask",
  alias = "consulta", ...
  alias = "busqueda", ...
  alias = "agent", ...
)]
```

*   **Problema**: Esto indica que el frontend y el backend han evolucionado de forma desincronizada, acumulando "basura" lógica para soportar casos antiguos que quizás ya no existen. Dificulta la lectura y comprensión del código.

### Constantes "Hardcoded" (Hardcoding)
En `apps/desktop/src-tauri/src/cmd/ai.rs`, los prompts del sistema (`MENSAJE_IDENTIDAD`, `MENSAJE_CAPACIDADES`) están escritos directamente en el código Rust.
*   **Problema**: Para cambiar el comportamiento o el idioma del agente, es necesario recompilar el backend.
*   **Mejora**: Mover estos textos a un archivo de configuración (JSON/TOML) o variables de entorno.

### TODOs y FIXMEs pendientes
Se encontraron comentarios `TODO` y `FIXME` que indican trabajo incompleto o deuda técnica explícita:

*   **[pdf_reports.rs](apps/desktop/src-tauri/src/cmd/pdf_reports.rs)**:
    *   `TODO: Implementar parser HTML para extraer solo los comandos ejecutados` (Línea 365)
    *   `TODO: validar grupo` (En logs de impresión, Líneas 68 y 421)
*   **[dashboards.rs](apps/desktop/src-tauri/src/cmd/dashboards.rs)**:
    *   `TODO: Implementar si es necesario` (Relacionado con `inactive_students`, Línea 405)

*   **Problema**: Indican funcionalidades a medio implementar o validaciones de seguridad faltantes (como la validación de grupos en reportes).

## 🧩 4. Arquitectura y Complejidad

### Componente `TerminalPane.tsx` Sobrecargado
El archivo `apps/desktop/web/src/components/terminal/TerminalPane.tsx` viola el Principio de Responsabilidad Única (SRP).
*   **Responsabilidades mezcladas**:
    *   Renderizado de la terminal (xterm.js).
    *   Manejo de foco (focus loops, timeouts).
    *   Lógica de redimensionamiento.
    *   **Captura y guardado de sesiones en la nube** (`captureAndSaveSessionCloud`).
*   **Riesgo**: Hace que el componente sea difícil de testear y mantener. La lógica de persistencia de datos debería estar en un hook personalizado o en la capa de servicios, no dentro del componente de vista.

### Lógica de "Focus Loop" Frágil
En `TerminalPane.tsx`, existe una función `startFocusLoop` que intenta forzar el foco al terminal repetidamente mediante `setInterval`.
*   **Problema**: Es una solución "hacky" para pelear contra el navegador por el foco. Puede causar problemas de accesibilidad o comportamiento errático en diferentes sistemas operativos.

## 🔄 5. Duplicidad

### Modelos de Datos
Parece haber cierta duplicidad o solapamiento entre los tipos definidos en el backend (Rust structs) y los interfaces en el frontend (TypeScript interfaces), lo cual es normal, pero requiere sincronización manual. Herramientas como `ts-rs` podrían automatizar esto para evitar bugs de discrepancia de tipos.

---
**Resumen**: El proyecto es funcional y tiene una arquitectura base sólida (Tauri + React), pero necesita una ronda de "refactoring" para endurecer el manejo de errores en el backend (eliminar `unwrap`) y limpiar la lógica de presentación en el frontend antes de escalar más.
