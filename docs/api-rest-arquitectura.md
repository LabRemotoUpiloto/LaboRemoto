# API REST - Arquitectura

## Patron Aplicado

La API queda organizada con un patron por capas liviano:

```text
api/
  core/
    mod.rs
    config.rs      -> configuracion por variables de entorno
    auth.rs        -> autenticacion Bearer token
    error.rs       -> errores JSON estandarizados
  http/
    mod.rs
    server.rs      -> arranque HTTP y middleware global
  docs/
    mod.rs
    openapi.rs     -> OpenAPI JSON + Swagger UI
  routes/
    mod.rs         -> composicion de routers publicos/protegidos
  modules/
    mod.rs
    health/        -> health check
    hosts/         -> hosts guardados
    ssh/           -> sesiones SSH
    sftp/          -> exploracion SFTP
    ai/            -> estado y prueba de llaves AI
    sessions/      -> logs de sesiones
    practices/     -> practicas
    moodle/        -> integracion Moodle
    hardware/      -> GPIO + Arduino
```

## Responsabilidades

`server.rs` solo debe encargarse de:

- Crear el router raiz.
- Aplicar CORS.
- Inyectar `ApiConfig`.
- Abrir el listener HTTP.

`routes/mod.rs` debe encargarse de:

- Registrar rutas publicas.
- Registrar rutas protegidas.
- Aplicar el middleware Bearer a rutas protegidas.

Cada archivo dentro de `routes/` debe encargarse de:

- Componer URLs y metodos HTTP.
- Agrupar rutas publicas y protegidas.

Cada carpeta dentro de `modules/` debe encargarse de:

- Validar request de su modulo.
- Llamar comandos o servicios existentes.
- Convertir respuestas a JSON seguro.
- Evitar exponer secretos como passwords.

## Rutas Publicas

```text
GET /api/v1/health
GET /api/v1/openapi.json
GET /api/v1/docs
```

## Rutas Protegidas

Todas las demas rutas usan:

```text
Authorization: Bearer <REST_API_TOKEN>
```

## Swagger

Swagger UI queda disponible en:

```text
http://127.0.0.1:8787/api/v1/docs
```

OpenAPI JSON queda disponible en:

```text
http://127.0.0.1:8787/api/v1/openapi.json
```

## Siguiente Refactor Recomendado

Cuando crezca la API, mover logica reutilizable a una carpeta de servicios:

```text
api/
  services/
    hosts_service.rs
    ssh_service.rs
    sftp_service.rs
```

Asi los handlers HTTP quedan pequenos y la logica compartida puede reutilizarse por Tauri y REST.
