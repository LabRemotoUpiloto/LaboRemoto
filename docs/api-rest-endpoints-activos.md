# API REST - Endpoints Activos

## Arranque Local

Desde `Cliente-Rust/backend`:

```powershell
$env:REST_API_ENABLED="true"
$env:REST_API_TOKEN="test-token"
$env:REST_API_HOST="127.0.0.1"
$env:REST_API_PORT="8787"
cargo run
```

Base URL:

```text
http://127.0.0.1:8787/api/v1
```

Header para endpoints protegidos:

```text
Authorization: Bearer test-token
```

## Publico

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| GET | `/health` | Verifica que la API este activa |
| GET | `/openapi.json` | Documento OpenAPI para herramientas externas |
| GET | `/docs` | Swagger UI interactivo |

Swagger UI:

```text
http://127.0.0.1:8787/api/v1/docs
```

OpenAPI JSON:

```text
http://127.0.0.1:8787/api/v1/openapi.json
```

## Hosts

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| GET | `/hosts` | Lista hosts guardados sin exponer passwords |
| POST | `/hosts` | Crea un host cifrado |
| GET | `/hosts/:id` | Obtiene un host por ID logico o archivo `.json.enc` |
| DELETE | `/hosts/:id` | Elimina un host |

Body para `POST /hosts`:

```json
{
  "id": "postman-test-host",
  "host": "127.0.0.1",
  "port": 22,
  "user": "tester",
  "password": "secret",
  "name": "Postman Test Host"
}
```

## SSH

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| POST | `/ssh/sessions` | Crea una sesion SSH |
| GET | `/ssh/sessions/:id` | Consulta metadata de una sesion SSH |
| DELETE | `/ssh/sessions/:id` | Cierra una sesion SSH |

Body para `POST /ssh/sessions`:

```json
{
  "host": "IP_O_HOST",
  "port": 22,
  "user": "USUARIO",
  "password": "PASSWORD",
  "cols": 120,
  "rows": 32
}
```

## SFTP

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| GET | `/sftp/:session_id/home` | Obtiene el home remoto de la sesion |
| GET | `/sftp/:session_id/list?path=/ruta` | Lista archivos remotos |

Ejemplo:

```text
GET /sftp/TU_SESSION_ID/list?path=/home/pi
```

## AI

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| GET | `/ai/status` | Estado de llaves/modelo configurado |
| POST | `/ai/test-key` | Prueba la llave activa contra el proveedor configurado |

Nota: `POST /ai/chat` aun no esta implementado.

## Logs De Sesion

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| GET | `/session-logs` | Lista logs de sesiones guardadas |
| GET | `/session-logs/:session_id` | Obtiene contenido HTML de un log |
| DELETE | `/session-logs/:session_id` | Elimina un log |

## Practicas

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| GET | `/practices/categories` | Lista categorias de practicas |
| GET | `/practices/config?practice_id=ID` | Obtiene configuracion de una practica |

Ejemplo:

```text
GET /practices/config?practice_id=linux-basic
```

## Moodle

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| POST | `/moodle/sync-assignment` | Sincroniza/verifica una tarea |
| POST | `/moodle/prepare-grade` | Prepara payload de calificacion |
| POST | `/moodle/submit-grade` | Envia calificacion directa |

Body para `POST /moodle/sync-assignment`:

```json
{
  "assignment_id": 123,
  "username": "usuario"
}
```

Body para `POST /moodle/prepare-grade`:

```json
{
  "assignment_id": 123,
  "username": "usuario",
  "grade": 4.5,
  "comment": "Buen trabajo"
}
```

Body para `POST /moodle/submit-grade`:

```json
{
  "assignment_id": 123,
  "user_id": 456,
  "username": "usuario",
  "grade": 4.5,
  "comment": "Buen trabajo"
}
```

## Hardware GPIO

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| GET | `/hardware/gpio/:session_id/pins` | Estado de pines GPIO |
| POST | `/hardware/gpio/:session_id/pins/:pin/mode` | Configura modo del pin |
| POST | `/hardware/gpio/:session_id/pins/:pin/pull` | Configura pull del pin |
| POST | `/hardware/gpio/:session_id/pins/:pin/write` | Escribe nivel en el pin |
| GET | `/hardware/gpio/:session_id/pins/:pin/read` | Lee nivel del pin |

Body para modo:

```json
{
  "mode": "out"
}
```

Body para pull:

```json
{
  "pull": "up"
}
```

Body para write:

```json
{
  "level": 1
}
```

## Hardware Arduino

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| GET | `/hardware/arduino/:session_id/status` | Estado del bridge Arduino |
| POST | `/hardware/arduino/:session_id/cmd` | Envia comando al bridge Arduino |
| GET | `/hardware/arduino/:session_id/buffer` | Lee buffer del bridge Arduino |

Body para `POST /hardware/arduino/:session_id/cmd`:

```json
{
  "command": "LED_ON"
}
```

## Pendientes

Estos endpoints aun no estan implementados:

- `POST /ai/chat`
- Streaming/SSE de terminal
- SFTP upload/download/progreso/cancelacion
- VNC
- Streaming de camaras
- OpenAPI/Swagger
- SDK TypeScript
