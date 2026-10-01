//! cmd/filesystem/images — Guardar una imagen (base64) elegida por el usuario
//! en disco. Hoy la usa la Sala de Trofeos (pósters ganados en prácticas de
//! Linux), pero es genérico -- cualquier imagen en base64 con su mime real.

use base64::{engine::general_purpose, Engine as _};
use std::fs;
use crate::cmd::protocol::{map_io_error, CommandError};

fn extension_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    }
}

#[tauri::command]
pub async fn save_image_base64(
    default_name: String,
    mime: String,
    base64_data: String,
) -> Result<String, CommandError> {
    let base64_payload = if base64_data.contains(',') {
        base64_data.split(',').nth(1).unwrap_or(&base64_data)
    } else {
        &base64_data
    };

    let image_bytes = general_purpose::STANDARD
        .decode(base64_payload)
        .map_err(|e| CommandError::permanent("INVALID_FORMAT", format!("Error decodificando Base64: {}", e)))?;

    let ext = extension_for_mime(&mime);
    let suggested_name = if default_name.ends_with(&format!(".{ext}")) {
        default_name
    } else {
        format!("{default_name}.{ext}")
    };

    let output_path = rfd::AsyncFileDialog::new()
        .set_title("Guardar imagen")
        .set_file_name(&suggested_name)
        .add_filter("Imagen", &[ext])
        .save_file()
        .await
        .ok_or_else(|| CommandError::permanent("VALIDATION_FAILED", "Operación cancelada por el usuario"))?
        .path()
        .to_path_buf();

    tokio::task::spawn_blocking(move || {
        fs::write(&output_path, image_bytes)
            .map_err(|e| map_io_error(e, "save_image_base64", &output_path.display().to_string()))?;
        Ok(output_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}
