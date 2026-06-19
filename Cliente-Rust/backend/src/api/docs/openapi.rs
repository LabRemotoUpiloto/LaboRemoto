use axum::{response::Html, Json};

pub async fn openapi_json() -> Json<serde_json::Value> {
    let mut doc: serde_json::Value = serde_json::from_str(OPENAPI_JSON)
        .unwrap_or_else(|_| serde_json::json!({ "error": "invalid_openapi_document" }));
    if let Some(info) = doc.get_mut("info") {
        info["version"] = serde_json::Value::String(env!("CARGO_PKG_VERSION").to_string());
    }
    Json(doc)
}

pub async fn swagger_ui() -> Html<&'static str> {
    Html(r#"<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cliente SSH Unipiloto API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/api/v1/openapi.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout'
    });
  </script>
</body>
</html>"#)
}

const OPENAPI_JSON: &str = r##"
{
  "openapi": "3.0.3",
  "info": {
    "title": "Cliente SSH Unipiloto REST API",
    "version": "0.0.0",
    "description": "API REST local para consumir funciones del cliente SSH/Tauri desde otros desarrollos."
  },
  "servers": [
    { "url": "http://127.0.0.1:8787/api/v1", "description": "Servidor local" }
  ],
  "components": {
    "securitySchemes": {
      "bearerAuth": { "type": "http", "scheme": "bearer" }
    },
    "schemas": {
      "CreateHostRequest": {
        "type": "object",
        "required": ["id", "host", "port", "user", "password"],
        "properties": {
          "id": { "type": "string", "example": "postman-test-host" },
          "host": { "type": "string", "example": "127.0.0.1" },
          "port": { "type": "integer", "example": 22 },
          "user": { "type": "string", "example": "tester" },
          "password": { "type": "string", "example": "secret" },
          "name": { "type": "string", "nullable": true, "example": "Postman Test Host" }
        }
      },
      "CreateSshSessionRequest": {
        "type": "object",
        "required": ["host", "port", "user", "password"],
        "properties": {
          "host": { "type": "string", "example": "192.168.1.20" },
          "port": { "type": "integer", "example": 22 },
          "user": { "type": "string", "example": "pi" },
          "password": { "type": "string", "example": "raspberry" },
          "cols": { "type": "integer", "example": 120 },
          "rows": { "type": "integer", "example": 32 }
        }
      },
      "MoodleSyncAssignmentRequest": {
        "type": "object",
        "required": ["assignment_id", "username"],
        "properties": {
          "assignment_id": { "type": "integer", "example": 123 },
          "username": { "type": "string", "example": "usuario" }
        }
      },
      "MoodlePrepareGradeRequest": {
        "type": "object",
        "required": ["assignment_id", "username", "grade", "comment"],
        "properties": {
          "assignment_id": { "type": "integer", "example": 123 },
          "username": { "type": "string", "example": "usuario" },
          "grade": { "type": "number", "example": 4.5 },
          "comment": { "type": "string", "example": "Buen trabajo" }
        }
      },
      "MoodleSubmitGradeRequest": {
        "type": "object",
        "required": ["assignment_id", "user_id", "grade", "comment"],
        "properties": {
          "assignment_id": { "type": "integer", "example": 123 },
          "user_id": { "type": "integer", "example": 456 },
          "username": { "type": "string", "nullable": true, "example": "usuario" },
          "grade": { "type": "number", "example": 4.5 },
          "comment": { "type": "string", "example": "Buen trabajo" }
        }
      },
      "ModeRequest": { "type": "object", "required": ["mode"], "properties": { "mode": { "type": "string", "example": "out" } } },
      "PullRequest": { "type": "object", "required": ["pull"], "properties": { "pull": { "type": "string", "example": "up" } } },
      "WriteRequest": { "type": "object", "required": ["level"], "properties": { "level": { "type": "integer", "example": 1 } } },
      "ArduinoCmdRequest": { "type": "object", "required": ["command"], "properties": { "command": { "type": "string", "example": "LED_ON" } } }
    }
  },
  "paths": {
    "/health": { "get": { "tags": ["System"], "summary": "Health check", "responses": { "200": { "description": "API activa" } } } },
    "/openapi.json": { "get": { "tags": ["System"], "summary": "OpenAPI JSON", "responses": { "200": { "description": "Documento OpenAPI" } } } },
    "/docs": { "get": { "tags": ["System"], "summary": "Swagger UI", "responses": { "200": { "description": "Swagger UI" } } } },

    "/hosts": {
      "get": { "tags": ["Hosts"], "summary": "Listar hosts", "security": [{ "bearerAuth": [] }], "responses": { "200": { "description": "Hosts guardados" } } },
      "post": { "tags": ["Hosts"], "summary": "Crear host", "security": [{ "bearerAuth": [] }], "requestBody": { "required": true, "content": { "application/json": { "schema": { "$ref": "#/components/schemas/CreateHostRequest" } } } }, "responses": { "200": { "description": "Host creado" } } }
    },
    "/hosts/{id}": {
      "get": { "tags": ["Hosts"], "summary": "Obtener host", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }], "responses": { "200": { "description": "Host" }, "404": { "description": "No encontrado" } } },
      "delete": { "tags": ["Hosts"], "summary": "Eliminar host", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }], "responses": { "200": { "description": "Eliminado" } } }
    },
    "/ssh/sessions": { "post": { "tags": ["SSH"], "summary": "Crear sesion SSH", "security": [{ "bearerAuth": [] }], "requestBody": { "required": true, "content": { "application/json": { "schema": { "$ref": "#/components/schemas/CreateSshSessionRequest" } } } }, "responses": { "200": { "description": "Sesion creada" }, "400": { "description": "Error de conexion" } } } },
    "/ssh/sessions/{id}": {
      "get": { "tags": ["SSH"], "summary": "Consultar sesion SSH", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }], "responses": { "200": { "description": "Sesion" }, "404": { "description": "No encontrada" } } },
      "delete": { "tags": ["SSH"], "summary": "Cerrar sesion SSH", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }], "responses": { "200": { "description": "Sesion cerrada" } } }
    },
    "/sftp/{session_id}/home": { "get": { "tags": ["SFTP"], "summary": "Home remoto", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "session_id", "in": "path", "required": true, "schema": { "type": "string" } }], "responses": { "200": { "description": "Home remoto" } } } },
    "/sftp/{session_id}/list": { "get": { "tags": ["SFTP"], "summary": "Listar directorio remoto", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "session_id", "in": "path", "required": true, "schema": { "type": "string" } }, { "name": "path", "in": "query", "schema": { "type": "string" }, "example": "/home/pi" }], "responses": { "200": { "description": "Entradas" } } } },
    "/ai/status": { "get": { "tags": ["AI"], "summary": "Estado AI", "security": [{ "bearerAuth": [] }], "responses": { "200": { "description": "Estado" } } } },
    "/ai/test-key": { "post": { "tags": ["AI"], "summary": "Probar llave AI", "security": [{ "bearerAuth": [] }], "responses": { "200": { "description": "Resultado" } } } },
    "/session-logs": { "get": { "tags": ["Logs"], "summary": "Listar logs", "security": [{ "bearerAuth": [] }], "responses": { "200": { "description": "Logs" } } } },
    "/session-logs/{session_id}": { "get": { "tags": ["Logs"], "summary": "Obtener log HTML", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "session_id", "in": "path", "required": true, "schema": { "type": "string" } }], "responses": { "200": { "description": "Log" } } }, "delete": { "tags": ["Logs"], "summary": "Eliminar log", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "session_id", "in": "path", "required": true, "schema": { "type": "string" } }], "responses": { "200": { "description": "Eliminado" } } } },
    "/practices/categories": { "get": { "tags": ["Practicas"], "summary": "Listar categorias", "security": [{ "bearerAuth": [] }], "responses": { "200": { "description": "Categorias" } } } },
    "/practices/config": { "get": { "tags": ["Practicas"], "summary": "Config de practica", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "practice_id", "in": "query", "required": true, "schema": { "type": "string" } }], "responses": { "200": { "description": "Config" } } } },
    "/moodle/sync-assignment": { "post": { "tags": ["Moodle"], "summary": "Sincronizar tarea", "security": [{ "bearerAuth": [] }], "requestBody": { "content": { "application/json": { "schema": { "$ref": "#/components/schemas/MoodleSyncAssignmentRequest" } } } }, "responses": { "200": { "description": "Resultado" } } } },
    "/moodle/prepare-grade": { "post": { "tags": ["Moodle"], "summary": "Preparar calificacion", "security": [{ "bearerAuth": [] }], "requestBody": { "content": { "application/json": { "schema": { "$ref": "#/components/schemas/MoodlePrepareGradeRequest" } } } }, "responses": { "200": { "description": "Resultado" } } } },
    "/moodle/submit-grade": { "post": { "tags": ["Moodle"], "summary": "Enviar calificacion", "security": [{ "bearerAuth": [] }], "requestBody": { "content": { "application/json": { "schema": { "$ref": "#/components/schemas/MoodleSubmitGradeRequest" } } } }, "responses": { "200": { "description": "Resultado" } } } },
    "/hardware/gpio/{session_id}/pins": { "get": { "tags": ["Hardware GPIO"], "summary": "Estado de pines", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "session_id", "in": "path", "required": true, "schema": { "type": "string" } }], "responses": { "200": { "description": "Pines" } } } },
    "/hardware/gpio/{session_id}/pins/{pin}/mode": { "post": { "tags": ["Hardware GPIO"], "summary": "Configurar modo", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "session_id", "in": "path", "required": true, "schema": { "type": "string" } }, { "name": "pin", "in": "path", "required": true, "schema": { "type": "integer" } }], "requestBody": { "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ModeRequest" } } } }, "responses": { "200": { "description": "OK" } } } },
    "/hardware/gpio/{session_id}/pins/{pin}/pull": { "post": { "tags": ["Hardware GPIO"], "summary": "Configurar pull", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "session_id", "in": "path", "required": true, "schema": { "type": "string" } }, { "name": "pin", "in": "path", "required": true, "schema": { "type": "integer" } }], "requestBody": { "content": { "application/json": { "schema": { "$ref": "#/components/schemas/PullRequest" } } } }, "responses": { "200": { "description": "OK" } } } },
    "/hardware/gpio/{session_id}/pins/{pin}/write": { "post": { "tags": ["Hardware GPIO"], "summary": "Escribir pin", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "session_id", "in": "path", "required": true, "schema": { "type": "string" } }, { "name": "pin", "in": "path", "required": true, "schema": { "type": "integer" } }], "requestBody": { "content": { "application/json": { "schema": { "$ref": "#/components/schemas/WriteRequest" } } } }, "responses": { "200": { "description": "OK" } } } },
    "/hardware/gpio/{session_id}/pins/{pin}/read": { "get": { "tags": ["Hardware GPIO"], "summary": "Leer pin", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "session_id", "in": "path", "required": true, "schema": { "type": "string" } }, { "name": "pin", "in": "path", "required": true, "schema": { "type": "integer" } }], "responses": { "200": { "description": "Nivel" } } } },
    "/hardware/arduino/{session_id}/status": { "get": { "tags": ["Hardware Arduino"], "summary": "Estado Arduino", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "session_id", "in": "path", "required": true, "schema": { "type": "string" } }], "responses": { "200": { "description": "Estado" } } } },
    "/hardware/arduino/{session_id}/cmd": { "post": { "tags": ["Hardware Arduino"], "summary": "Enviar comando", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "session_id", "in": "path", "required": true, "schema": { "type": "string" } }], "requestBody": { "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ArduinoCmdRequest" } } } }, "responses": { "200": { "description": "Respuesta" } } } },
    "/hardware/arduino/{session_id}/buffer": { "get": { "tags": ["Hardware Arduino"], "summary": "Leer buffer", "security": [{ "bearerAuth": [] }], "parameters": [{ "name": "session_id", "in": "path", "required": true, "schema": { "type": "string" } }], "responses": { "200": { "description": "Buffer" } } } }
  }
}
"##;
