use std::path::{PathBuf};
use std::fs;
use std::process::Command;

fn saved_logs_dir() -> Result<PathBuf, String> {
    let dir = std::env::current_dir()
        .map_err(|e| format!("No se pudo obtener directorio actual: {}", e))?
        .join("savedLogs");
    fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear savedLogs: {}", e))?;
    Ok(dir)
}

fn html_path(session_id: &str) -> Result<PathBuf, String> {
    Ok(saved_logs_dir()?.join(format!("{}.html", session_id)))
}

fn pdf_path(session_id: &str) -> Result<PathBuf, String> {
    Ok(saved_logs_dir()?.join(format!("{}.pdf", session_id)))
}

fn try_weasyprint(input: &PathBuf, output: &PathBuf) -> Result<(), String> {
    let status = Command::new("weasyprint")
        .arg(input.as_os_str())
        .arg(output.as_os_str())
        .status()
        .map_err(|e| format!("Error ejecutando weasyprint: {}", e))?;
    if !status.success() {
        return Err(format!("weasyprint devolvió estado {:?}", status.code()));
    }
    Ok(())
}

fn try_wkhtmltopdf(input: &PathBuf, output: &PathBuf) -> Result<(), String> {
    let status = Command::new("wkhtmltopdf")
        .arg("--quiet")
        .arg(input.as_os_str())
        .arg(output.as_os_str())
        .status()
        .map_err(|e| format!("Error ejecutando wkhtmltopdf: {}", e))?;
    if !status.success() {
        return Err(format!("wkhtmltopdf devolvió estado {:?}", status.code()));
    }
    Ok(())
}

#[tauri::command]
pub async fn generate_session_pdf_local(session_log_id: String) -> Result<String, String> {
    let html = html_path(&session_log_id)?;
    if !html.exists() {
        return Err("No existe el HTML de la sesión. Abre el log primero para generarlo.".into());
    }
    let pdf = pdf_path(&session_log_id)?;

    // Intentar weasyprint primero, luego wkhtmltopdf
    let weasy = try_weasyprint(&html, &pdf);
    let result = match weasy {
        Ok(_) => Ok(()),
        Err(_) => try_wkhtmltopdf(&html, &pdf),
    };

    match result {
        Ok(_) => Ok(pdf.to_string_lossy().to_string()),
        Err(_) => Err("No se encontró weasyprint ni wkhtmltopdf en PATH. Instala uno para generar PDF.".into()),
    }
}
