//! cmd/logs — Gestión de logs de sesión SSH
//!
//! Este módulo proporciona:
//! - Almacenamiento de logs de sesión (HTML + metadatos)
//! - Trait LogStorage para abstracción de almacenamiento (facilita migración a Azure SQL)
//! - Implementación LocalFileLogStorage para almacenamiento en filesystem
//! - Comandos Tauri para guardar, listar, obtener y eliminar logs
//! - Conteo de comandos ejecutados en una sesión
//! - Limpieza automática de logs antiguos (política de retención)

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use chrono::{DateTime, Utc};
use regex::Regex;

use crate::cmd::protocol::CommandError;

// ── Migración precisa a CommandError (REFACTOR #3 FASE B, Batch 7) ──────────
//
// Cada fuente de error (I/O de filesystem, (de)serialización JSON, parseo de
// timestamps RFC3339) se mapea explícitamente a la categoría de
// `CommandError` que le corresponde, usando el `std::io::ErrorKind` /
// `serde_json::Error` real en vez de heurísticas sobre el texto del mensaje.

/// Mapea un `std::io::Error` de operaciones sobre archivos de log a un
/// `CommandError` preciso: archivo/sesión no encontrada → permanente
/// (`RESOURCE_NOT_FOUND`), permiso denegado → permanente (`ACCESS_DENIED`),
/// cualquier otro fallo de E/S → transitorio (`IO_ERROR`, reintentable).
fn io_error_to_command(e: std::io::Error, operation: &str, resource: &str) -> CommandError {
    use std::io::ErrorKind::*;
    let error = match e.kind() {
        NotFound => CommandError::permanent("RESOURCE_NOT_FOUND", format!("No encontrado: {}", e)),
        PermissionDenied => CommandError::permanent("ACCESS_DENIED", format!("Permiso denegado: {}", e)),
        _ => CommandError::transient("IO_ERROR", format!("Error de E/S: {}", e)),
    };
    error.with_context(operation, resource)
}

/// Mapea un `serde_json::Error` (fallo de (de)serialización de metadatos de
/// log) a un `CommandError` permanente (`INVALID_DATA`): un JSON corrupto o
/// con formato inesperado no se arregla reintentando.
fn json_error_to_command(e: serde_json::Error, operation: &str, resource: &str) -> CommandError {
    CommandError::permanent("INVALID_DATA", format!("Error parseando datos: {}", e))
        .with_context(operation, resource)
}

/// Mapea un fallo de parseo de timestamp RFC3339 (`start_time`/`end_time`
/// recibidos del frontend) a un `CommandError` permanente
/// (`INVALID_FORMAT`): el formato del argumento es inválido, no un fallo
/// transitorio.
fn timestamp_format_error(e: chrono::ParseError, field: &str, operation: &str, resource: &str) -> CommandError {
    CommandError::permanent("INVALID_FORMAT", format!("Error parseando {}: {}", field, e))
        .with_context(operation, resource)
}

/// Metadatos de una sesión SSH capturada
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionLogMetadata {
    pub session_id: String,
    pub user: String,
    pub host: String,
    pub port: u16,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub duration_seconds: i64,
    pub buffer_size_bytes: usize,
    pub command_count: Option<i32>, // Para futuras mejoras
}

/// Estructura completa de un log de sesión (metadatos + contenido)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionLog {
    pub metadata: SessionLogMetadata,
    pub html_content: String,
}

fn build_session_html(metadata: &SessionLogMetadata, terminal_html: &str) -> String {
    let duration = metadata.duration_seconds;
    let duration_str = if duration >= 3600 {
        format!("{}h {}m {}s", duration / 3600, (duration % 3600) / 60, duration % 60)
    } else if duration >= 60 {
        format!("{}m {}s", duration / 60, duration % 60)
    } else {
        format!("{}s", duration)
    };
    let template = include_str!("../../templates/session_log.html")
        .replace("__LOGO_BASE64__", include_str!("../../templates/logo_base64.txt"));
    template
        .replace("{session_id}", &metadata.session_id)
        .replace("{user}", &metadata.user)
        .replace("{host}", &metadata.host)
        .replace("{port}", &metadata.port.to_string())
        .replace("{short_id}", &metadata.session_id.chars().take(8).collect::<String>())
        .replace("{start}", &metadata.start_time.to_rfc3339())
        .replace("{end}", &metadata.end_time.to_rfc3339())
        .replace("{duration}", &duration_str)
        .replace("{terminal}", terminal_html)
}

/// Counts the number of commands detected in the HTML content.
/// This mirrors the logic in the frontend `extractValidCommands` utility.
fn count_commands_in_html(html: &str) -> i32 {
    // Strip HTML tags, replace br/div with newlines
    let br_re = Regex::new(r"(?i)<br\s*/?>|</div>").unwrap();
    let tag_re = Regex::new(r"<[^>]*>").unwrap();
    let br_replaced = br_re.replace_all(html, "\n");
    let text = tag_re.replace_all(&br_replaced, "");

    // Decode common HTML entities
    let text = text
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");

    // Match terminal prompt endings: `$ cmd`, `# cmd`, `% cmd`
    let prompt_re = Regex::new(r"[$#%]\s+(.+)$").unwrap();
    let mut count = 0i32;
    let mut last_cmd = String::new();

    for line in text.lines() {
        if let Some(cap) = prompt_re.captures(line) {
            let cmd = cap[1].trim().to_string();
            if !cmd.is_empty() && cmd != last_cmd {
                count += 1;
                last_cmd = cmd;
            }
        }
    }
    count
}

/// Trait que abstrae el almacenamiento de logs
/// Permite migrar fácilmente de filesystem local a Azure SQL
#[allow(dead_code)]
pub trait LogStorage: Send + Sync {
    /// Guarda un log de sesión completo
    fn save_log(&self, log: SessionLog) -> Result<(), CommandError>;

    /// Lista todos los logs disponibles (solo metadatos)
    fn list_logs(&self) -> Result<Vec<SessionLogMetadata>, CommandError>;

    /// Obtiene el contenido HTML de un log específico
    fn get_log_content(&self, session_id: &str) -> Result<String, CommandError>;

    /// Obtiene log completo (metadatos + contenido)
    fn get_log(&self, session_id: &str) -> Result<SessionLog, CommandError>;

    /// Elimina un log
    fn delete_log(&self, session_id: &str) -> Result<(), CommandError>;

    /// Limpia logs antiguos (política de retención)
    fn cleanup_old_logs(&self, days: i64) -> Result<usize, CommandError>;
}

/// Implementación de almacenamiento en filesystem local
/// En el futuro, crear AzureSqlLogStorage que implemente el mismo trait
pub struct LocalFileLogStorage {
    base_path: PathBuf,
}

impl LocalFileLogStorage {
    pub fn new() -> Result<Self, String> {
        // Usar carpeta savedLogs en la raíz del proyecto
        // En desarrollo, esto será la raíz del proyecto
        // En producción, usar el directorio actual de ejecución
        let base_path = std::env::current_dir()
            .map_err(|e| format!("No se pudo obtener directorio actual: {}", e))?
            .join("savedLogs");
        
        // Crear directorio si no existe
        fs::create_dir_all(&base_path)
            .map_err(|e| format!("Error creando directorio de logs: {}", e))?;
        
        Ok(Self { base_path })
    }
    
    /// Ruta al archivo de metadatos de una sesión
    fn metadata_path(&self, session_id: &str) -> PathBuf {
        self.base_path.join(format!("{}.meta.json", session_id))
    }
    
    /// Ruta al archivo HTML de contenido de una sesión
    fn content_path(&self, session_id: &str) -> PathBuf {
        self.base_path.join(format!("{}.html", session_id))
    }
}

impl LogStorage for LocalFileLogStorage {
    fn save_log(&self, log: SessionLog) -> Result<(), CommandError> {
        let session_id = &log.metadata.session_id;

        // Guardar metadatos
        let meta_json = serde_json::to_string_pretty(&log.metadata)
            .map_err(|e| json_error_to_command(e, "save_log_metadata", session_id))?;

        fs::write(self.metadata_path(session_id), meta_json)
            .map_err(|e| io_error_to_command(e, "save_log_metadata", session_id))?;

        // Guardar contenido HTML
        fs::write(self.content_path(session_id), &log.html_content)
            .map_err(|e| io_error_to_command(e, "save_log_content", session_id))?;

        Ok(())
    }

    fn list_logs(&self) -> Result<Vec<SessionLogMetadata>, CommandError> {
        let mut logs = Vec::new();

        let entries = fs::read_dir(&self.base_path)
            .map_err(|e| io_error_to_command(e, "list_logs", &self.base_path.to_string_lossy()))?;

        for entry in entries.flatten() {
            let path = entry.path();
            
            // Solo procesar archivos .meta.json
            if path.extension().and_then(|s| s.to_str()) == Some("json") 
                && path.to_string_lossy().contains(".meta.") {
                
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(mut metadata) = serde_json::from_str::<SessionLogMetadata>(&content) {
                        // Backfill command_count for old sessions that were saved with None
                        if metadata.command_count.is_none() {
                            let html_path = self.content_path(&metadata.session_id);
                            if let Ok(html) = fs::read_to_string(&html_path) {
                                let count = count_commands_in_html(&html);
                                metadata.command_count = Some(count);
                                // Persist back so next load is instant
                                if let Ok(updated_json) = serde_json::to_string_pretty(&metadata) {
                                    let _ = fs::write(&path, updated_json);
                                }
                            }
                        }
                        logs.push(metadata);
                    }
                }
            }
        }
        
        // Ordenar por fecha (más recientes primero)
        logs.sort_by(|a, b| b.start_time.cmp(&a.start_time));
        
        Ok(logs)

    }
    
    fn get_log_content(&self, session_id: &str) -> Result<String, CommandError> {
        fs::read_to_string(self.content_path(session_id))
            .map_err(|e| io_error_to_command(e, "get_log_content", session_id))
    }

    fn get_log(&self, session_id: &str) -> Result<SessionLog, CommandError> {
        // Leer metadatos
        let meta_content = fs::read_to_string(self.metadata_path(session_id))
            .map_err(|e| io_error_to_command(e, "get_log_metadata", session_id))?;

        let metadata: SessionLogMetadata = serde_json::from_str(&meta_content)
            .map_err(|e| json_error_to_command(e, "get_log_metadata", session_id))?;

        // Leer contenido
        let html_content = self.get_log_content(session_id)?;

        Ok(SessionLog {
            metadata,
            html_content,
        })
    }

    fn delete_log(&self, session_id: &str) -> Result<(), CommandError> {
        // Intentar eliminar ambos archivos
        let _ = fs::remove_file(self.metadata_path(session_id));
        let _ = fs::remove_file(self.content_path(session_id));
        Ok(())
    }

    fn cleanup_old_logs(&self, days: i64) -> Result<usize, CommandError> {
        let cutoff = Utc::now() - chrono::Duration::days(days);
        let logs = self.list_logs()?;
        let mut deleted = 0;

        for log in logs {
            if log.start_time < cutoff {
                self.delete_log(&log.session_id)?;
                deleted += 1;
            }
        }

        Ok(deleted)
    }
}

/// Instancia global del storage (singleton)
/// En el futuro, esto se puede cambiar a AzureSqlLogStorage
pub static STORAGE: once_cell::sync::Lazy<LocalFileLogStorage> = once_cell::sync::Lazy::new(|| {
    LocalFileLogStorage::new().expect("No se pudo inicializar el almacenamiento de logs")
});

/// Comandos Tauri expuestos al frontend

#[tauri::command]
pub async fn save_session_log(
    session_id: String,
    user: String,
    host: String,
    port: u16,
    start_time: String, // ISO 8601
    end_time: String,   // ISO 8601
    html_content: String,
) -> Result<(), CommandError> {
    let start_time = DateTime::parse_from_rfc3339(&start_time)
        .map_err(|e| timestamp_format_error(e, "start_time", "save_session_log", &session_id))?
        .with_timezone(&Utc);

    let end_time = DateTime::parse_from_rfc3339(&end_time)
        .map_err(|e| timestamp_format_error(e, "end_time", "save_session_log", &session_id))?
        .with_timezone(&Utc);
    
    let duration_seconds = (end_time - start_time).num_seconds();
    let buffer_size_bytes = html_content.len();
    
    let metadata = SessionLogMetadata {
        session_id: session_id.clone(),
        user,
        host,
        port,
        start_time,
        end_time,
        duration_seconds,
        buffer_size_bytes,
        command_count: Some(count_commands_in_html(&html_content)),
    };
    
    let log = SessionLog {
        metadata,
        html_content,
    };

    tokio::task::spawn_blocking(move || STORAGE.save_log(log))
        .await
        .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}

/// Guarda un log recibiendo SOLO el HTML del terminal (fragmento) y
/// genera en backend el HTML completo con cabecera/estilos.
#[tauri::command]
pub async fn save_session_log_fragment(
    session_id: String,
    user: String,
    host: String,
    port: u16,
    start_time: String, // ISO 8601
    end_time: String,   // ISO 8601
    html_fragment: String,
) -> Result<(), CommandError> {
    let start_time = DateTime::parse_from_rfc3339(&start_time)
        .map_err(|e| timestamp_format_error(e, "start_time", "save_session_log_fragment", &session_id))?
        .with_timezone(&Utc);
    let end_time = DateTime::parse_from_rfc3339(&end_time)
        .map_err(|e| timestamp_format_error(e, "end_time", "save_session_log_fragment", &session_id))?
        .with_timezone(&Utc);
    let duration_seconds = (end_time - start_time).num_seconds();
    let metadata = SessionLogMetadata {
        session_id: session_id.clone(),
        user,
        host,
        port,
        start_time,
        end_time,
        duration_seconds,
        buffer_size_bytes: html_fragment.len(),
        command_count: Some(count_commands_in_html(&html_fragment)),
    };
    let full_html = build_session_html(&metadata, &html_fragment);
    let log = SessionLog {
        metadata,
        html_content: full_html,
    };
    tokio::task::spawn_blocking(move || STORAGE.save_log(log))
        .await
        .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}

#[tauri::command]
pub async fn list_session_logs() -> Result<Vec<SessionLogMetadata>, CommandError> {
    // Perf: recorre y lee TODOS los .meta.json/.html guardados — potencialmente
    // muchos archivos — así que nunca debe correr inline en el runtime async.
    tokio::task::spawn_blocking(|| STORAGE.list_logs())
        .await
        .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}

#[tauri::command]
pub async fn get_session_log_content(session_id: String) -> Result<String, CommandError> {
    tokio::task::spawn_blocking(move || STORAGE.get_log_content(&session_id))
        .await
        .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}

#[tauri::command]
pub async fn get_session_log(session_id: String) -> Result<SessionLog, CommandError> {
    tokio::task::spawn_blocking(move || STORAGE.get_log(&session_id))
        .await
        .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}

#[tauri::command]
pub async fn delete_session_log(session_id: String) -> Result<(), CommandError> {
    tokio::task::spawn_blocking(move || STORAGE.delete_log(&session_id))
        .await
        .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}

#[tauri::command]
pub async fn cleanup_old_session_logs(days: i64) -> Result<usize, CommandError> {
    tokio::task::spawn_blocking(move || STORAGE.cleanup_old_logs(days))
        .await
        .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cmd::protocol::ErrorCategory;

    #[test]
    fn io_error_not_found_maps_to_permanent_resource_not_found() {
        let e = std::io::Error::new(std::io::ErrorKind::NotFound, "no such file");
        let err = io_error_to_command(e, "get_log_content", "session-1");
        assert_eq!(err.code, "RESOURCE_NOT_FOUND");
        assert_eq!(err.category, ErrorCategory::Permanent);
        assert!(!err.is_retryable());
        assert_eq!(err.context.as_ref().unwrap().operation.as_deref(), Some("get_log_content"));
        assert_eq!(err.context.as_ref().unwrap().resource.as_deref(), Some("session-1"));
    }

    #[test]
    fn io_error_permission_denied_maps_to_permanent_access_denied() {
        let e = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");
        let err = io_error_to_command(e, "save_log_metadata", "session-2");
        assert_eq!(err.code, "ACCESS_DENIED");
        assert_eq!(err.category, ErrorCategory::Permanent);
        assert!(!err.is_retryable());
    }

    #[test]
    fn io_error_other_kind_maps_to_transient_io_error() {
        let e = std::io::Error::new(std::io::ErrorKind::Other, "disk hiccup");
        let err = io_error_to_command(e, "list_logs", "savedLogs");
        assert_eq!(err.code, "IO_ERROR");
        assert_eq!(err.category, ErrorCategory::Transient);
        assert!(err.is_retryable());
    }

    #[test]
    fn json_error_maps_to_permanent_invalid_data() {
        let parse_err = serde_json::from_str::<SessionLogMetadata>("not json").unwrap_err();
        let err = json_error_to_command(parse_err, "get_log_metadata", "session-3");
        assert_eq!(err.code, "INVALID_DATA");
        assert_eq!(err.category, ErrorCategory::Permanent);
        assert!(!err.is_retryable());
    }

    #[test]
    fn timestamp_format_error_maps_to_permanent_invalid_format() {
        let parse_err = DateTime::parse_from_rfc3339("not-a-date").unwrap_err();
        let err = timestamp_format_error(parse_err, "start_time", "save_session_log", "session-4");
        assert_eq!(err.code, "INVALID_FORMAT");
        assert_eq!(err.category, ErrorCategory::Permanent);
        assert!(!err.is_retryable());
        assert!(err.message.contains("start_time"));
    }

    #[test]
    fn get_log_content_on_missing_session_returns_resource_not_found() {
        // STORAGE apunta a savedLogs/ real; un session_id inexistente debe
        // fallar con RESOURCE_NOT_FOUND (no con un error genérico interno).
        let err = STORAGE
            .get_log_content("session-that-does-not-exist-xyz")
            .unwrap_err();
        assert_eq!(err.code, "RESOURCE_NOT_FOUND");
        assert_eq!(err.category, ErrorCategory::Permanent);
    }
}
