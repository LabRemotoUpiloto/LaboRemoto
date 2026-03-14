use base64::{engine::general_purpose, Engine as _};
use std::fs;
use crate::cmd::logs::{STORAGE, LogStorage};

#[tauri::command]
pub async fn save_pdf_base64(session_log_id: String, base64_data: String) -> Result<String, String> {
    // 1. Obtener metadatos para armar el nombre por defecto
    let log = STORAGE.get_log(&session_log_id)
        .map_err(|e| format!("Error obteniendo log: {}", e))?;
    
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
        .map_err(|e| format!("Error decodificando Base64: {}", e))?;

    // 4. Abrir diálogo de guardado
    let output_path = rfd::AsyncFileDialog::new()
        .set_title("Guardar Reporte de Sesión SSH")
        .set_file_name(&default_name)
        .add_filter("PDF Document", &["pdf"])
        .save_file()
        .await
        .ok_or("Operación cancelada por el usuario")?
        .path()
        .to_path_buf();

    // 5. Guardar archivo en disco
    fs::write(&output_path, pdf_bytes)
        .map_err(|e| format!("Error escribiendo archivo: {}", e))?;

    Ok(output_path.to_string_lossy().to_string())
}
