/// Módulo de gestión de logs de sesión
/// Diseñado con capa de abstracción (trait LogStorage) para facilitar migración futura a Azure SQL
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use chrono::{DateTime, Utc};

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

/// Trait que abstrae el almacenamiento de logs
/// Permite migrar fácilmente de filesystem local a Azure SQL
#[allow(dead_code)]
pub trait LogStorage: Send + Sync {
    /// Guarda un log de sesión completo
    fn save_log(&self, log: SessionLog) -> Result<(), String>;
    
    /// Lista todos los logs disponibles (solo metadatos)
    fn list_logs(&self) -> Result<Vec<SessionLogMetadata>, String>;
    
    /// Obtiene el contenido HTML de un log específico
    fn get_log_content(&self, session_id: &str) -> Result<String, String>;
    
    /// Obtiene log completo (metadatos + contenido)
    fn get_log(&self, session_id: &str) -> Result<SessionLog, String>;
    
    /// Elimina un log
    fn delete_log(&self, session_id: &str) -> Result<(), String>;
    
    /// Limpia logs antiguos (política de retención)
    fn cleanup_old_logs(&self, days: i64) -> Result<usize, String>;
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
    fn save_log(&self, log: SessionLog) -> Result<(), String> {
        // Guardar metadatos
        let meta_json = serde_json::to_string_pretty(&log.metadata)
            .map_err(|e| format!("Error serializando metadatos: {}", e))?;
        
        fs::write(self.metadata_path(&log.metadata.session_id), meta_json)
            .map_err(|e| format!("Error guardando metadatos: {}", e))?;
        
        // Guardar contenido HTML
        fs::write(self.content_path(&log.metadata.session_id), &log.html_content)
            .map_err(|e| format!("Error guardando contenido HTML: {}", e))?;
        
        Ok(())
    }
    
    fn list_logs(&self) -> Result<Vec<SessionLogMetadata>, String> {
        let mut logs = Vec::new();
        
        let entries = fs::read_dir(&self.base_path)
            .map_err(|e| format!("Error leyendo directorio de logs: {}", e))?;
        
        for entry in entries.flatten() {
            let path = entry.path();
            
            // Solo procesar archivos .meta.json
            if path.extension().and_then(|s| s.to_str()) == Some("json") 
                && path.to_string_lossy().contains(".meta.") {
                
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(metadata) = serde_json::from_str::<SessionLogMetadata>(&content) {
                        logs.push(metadata);
                    }
                }
            }
        }
        
        // Ordenar por fecha (más recientes primero)
        logs.sort_by(|a, b| b.start_time.cmp(&a.start_time));
        
        Ok(logs)
    }
    
    fn get_log_content(&self, session_id: &str) -> Result<String, String> {
        fs::read_to_string(self.content_path(session_id))
            .map_err(|e| format!("Error leyendo contenido del log: {}", e))
    }
    
    fn get_log(&self, session_id: &str) -> Result<SessionLog, String> {
        // Leer metadatos
        let meta_content = fs::read_to_string(self.metadata_path(session_id))
            .map_err(|e| format!("Error leyendo metadatos: {}", e))?;
        
        let metadata: SessionLogMetadata = serde_json::from_str(&meta_content)
            .map_err(|e| format!("Error parseando metadatos: {}", e))?;
        
        // Leer contenido
        let html_content = self.get_log_content(session_id)?;
        
        Ok(SessionLog {
            metadata,
            html_content,
        })
    }
    
    fn delete_log(&self, session_id: &str) -> Result<(), String> {
        // Intentar eliminar ambos archivos
        let _ = fs::remove_file(self.metadata_path(session_id));
        let _ = fs::remove_file(self.content_path(session_id));
        Ok(())
    }
    
    fn cleanup_old_logs(&self, days: i64) -> Result<usize, String> {
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
static STORAGE: once_cell::sync::Lazy<LocalFileLogStorage> = once_cell::sync::Lazy::new(|| {
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
) -> Result<(), String> {
    let start_time = DateTime::parse_from_rfc3339(&start_time)
        .map_err(|e| format!("Error parseando start_time: {}", e))?
        .with_timezone(&Utc);
    
    let end_time = DateTime::parse_from_rfc3339(&end_time)
        .map_err(|e| format!("Error parseando end_time: {}", e))?
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
        command_count: None,
    };
    
    let log = SessionLog {
        metadata,
        html_content,
    };
    
    STORAGE.save_log(log)
}

#[tauri::command]
pub async fn list_session_logs() -> Result<Vec<SessionLogMetadata>, String> {
    STORAGE.list_logs()
}

#[tauri::command]
pub async fn get_session_log_content(session_id: String) -> Result<String, String> {
    STORAGE.get_log_content(&session_id)
}

#[tauri::command]
pub async fn get_session_log(session_id: String) -> Result<SessionLog, String> {
    STORAGE.get_log(&session_id)
}

#[tauri::command]
pub async fn delete_session_log(session_id: String) -> Result<(), String> {
    STORAGE.delete_log(&session_id)
}

#[tauri::command]
pub async fn cleanup_old_session_logs(days: i64) -> Result<usize, String> {
    STORAGE.cleanup_old_logs(days)
}
