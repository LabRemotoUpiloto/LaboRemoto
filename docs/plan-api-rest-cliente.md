# Plan de Implementación API REST — Cliente Rust/Tauri

## Objetivo

Crear una API REST general sobre el backend actual (Tauri/Rust), exponiendo sus capacidades (SSH, SFTP, IA, prácticas, Moodle, hardware, VNC, streaming) a otros desarrollos sin duplicar lógica.

## Principio Técnico

Separar la lógica en tres capas:

```
Core de negocio   →   Adaptador Tauri   →   Frontend actual
                  →   Adaptador REST    →   Consumidores externos
```

Ejemplo:

```rust
ssh_connect_core(params)        // lógica real
ssh_connect_tauri(params)       // Tauri command → llama a core
POST /api/v1/ssh/sessions       // REST handler → llama a core
```

## Dependencias

```toml
axum = "0.7"
tower-http = { version = "0.5", features = ["cors", "trace"] }
tokio-stream = "0.1"
```

Opcional (documentación):

```toml
utoipa = "5"
utoipa-swagger-ui = { version = "8", features = ["axum"] }
```

## Estructura Propuesta

```
Cliente-Rust/backend/src/api/
  mod.rs          → declaración del módulo
  server.rs       → servidor axum + arranque
  error.rs        → tipos de error JSON estándar
  auth.rs         → middleware Bearer token
  routes/
    mod.rs        → agregación de rutas
    health.rs     → GET /api/v1/health
    ssh.rs        → sesiones SSH
    sftp.rs       → SFTP
    hosts.rs      → hosts guardados
    ai.rs         → IA / chat / agente
    sessions.rs   → logs de sesión
    practices.rs  → prácticas
    moodle.rs     → Moodle
    hardware.rs   → GPIO / Arduino
    streaming.rs  → cámaras / VNC
```

## Configuración (variables de entorno)

```env
REST_API_ENABLED=false          # desactivada por defecto
REST_API_HOST=127.0.0.1
REST_API_PORT=8787
REST_API_TOKEN=change-me
REST_ALLOWED_LOCAL_ROOTS=C:\Users
```

## Autenticación

```
Authorization: Bearer <REST_API_TOKEN>
```

- `GET /api/v1/health` es público.
- Todo lo demás requiere token.
- Si no hay token configurado, el servidor rechaza arrancar.

## Respuesta Estándar

Éxito:

```json
{ "status": "ok", "data": { ... } }
```

Error:

```json
{ "error": { "code": "NOT_FOUND", "message": "Sesión no encontrada" } }
```

## Primera Entrega (mínima funcional)

```
GET  /api/v1/health
GET  /api/v1/hosts
POST /api/v1/hosts
GET  /api/v1/hosts/:id
POST /api/v1/ssh/sessions
GET  /api/v1/ssh/sessions/:id
GET  /api/v1/sftp/:id/list?path=/home/pi
DELETE /api/v1/ssh/sessions/:id
```

## Entregas Posteriores

| Etapa | Módulos |
|-------|---------|
| 2 | SFTP completo (upload, download, progreso, cancelar) |
| 3 | IA status + chat + streaming SSE |
| 4 | Logs de sesión |
| 5 | Prácticas + Moodle |
| 6 | Hardware GPIO + Arduino |
| 7 | VNC + Streaming |
| 8 | OpenAPI / Swagger |
| 9 | SDK TypeScript |

## Orden De Implementación

1. Estructura `api/` + dependencias
2. Servidor axum + `/health`
3. Configuración desde `.env`
4. Autenticación Bearer
5. Integración con `lib.rs`
6. Hosts (list, create, get, delete)
7. SSH (create session, info, disconnect)
8. SFTP (list)
9. Terminal events (SSE)
10. IA chat
11. Logs
12. Prácticas
13. Moodle
14. Hardware
15. VNC / Streaming
16. OpenAPI docs
17. SDK TypeScript
18. Tests

## Riesgos

- Funciones actuales dependen de `AppHandle` de Tauri → desacoplar eventos
- Terminal interactiva requiere SSE o WebSocket
- Passwords nunca deben exponerse en respuestas
- SFTP con archivos grandes necesita progreso y cancelación
- API abierta sin autenticación es peligrosa
