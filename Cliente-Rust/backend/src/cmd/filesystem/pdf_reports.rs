use base64::{engine::general_purpose, Engine as _};
use std::fs;
use crate::cmd::logs::logs::{STORAGE, LogStorage};
use crate::cmd::protocol::{map_io_error, CommandError};

#[tauri::command]
pub async fn save_pdf_base64(session_log_id: String, base64_data: String) -> Result<String, CommandError> {
    // 1. Obtener metadatos para armar el nombre por defecto
    let log = {
        let id_for_task = session_log_id.clone();
        tokio::task::spawn_blocking(move || STORAGE.get_log(&id_for_task))
            .await
            .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
            .map_err(|e| CommandError::permanent("RESOURCE_NOT_FOUND", format!("Error obteniendo log: {}", e.message))
                .with_context("save_pdf_base64", &session_log_id))?
    };

    let metadata = log.metadata;
    let default_name = format!("SSH_Report_{}_{}.pdf", metadata.host,
        metadata.start_time.format("%Y%m%d_%H%M%S"));

    // 2. Extraer solo el contenido codificado (remover el prefijo "data:application/pdf;base64,")
    let base64_payload = if base64_data.contains(",") {
        base64_data.split(",").nth(1).unwrap_or(&base64_data)
    } else {
        &base64_data
    };

    // 3. Decodificar a bytes
    let pdf_bytes = general_purpose::STANDARD
        .decode(base64_payload)
        .map_err(|e| CommandError::permanent("INVALID_FORMAT", format!("Error decodificando Base64: {}", e)))?;

    // 4. Abrir diálogo de guardado
    let output_path = rfd::AsyncFileDialog::new()
        .set_title("Guardar Reporte de Sesión SSH")
        .set_file_name(&default_name)
        .add_filter("PDF Document", &["pdf"])
        .save_file()
        .await
        .ok_or_else(|| CommandError::permanent("VALIDATION_FAILED", "Operación cancelada por el usuario"))?
        .path()
        .to_path_buf();

    // 5. Guardar archivo en disco (potencialmente varios MB de PDF)
    tokio::task::spawn_blocking(move || {
        fs::write(&output_path, pdf_bytes)
            .map_err(|e| map_io_error(e, "save_pdf_base64", &output_path.display().to_string()))?;
        Ok(output_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}
