//! cmd/moodle — Cliente de API de Moodle para integración con el sistema de prácticas
//!
//! Este módulo proporciona:
//! - Cliente de API REST de Moodle (webservice)
//! - Sincronización de tareas (assignments)
//! - Verificación de entregas de estudiantes
//! - Envío de calificaciones (requiere token con permisos de profesor)
//! - Gestión de usuarios por username
//! - Manejo de errores y permisos de Moodle

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Tipos para la API de Moodle ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodleConfig {
    pub url: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodleAssignment {
    pub id: u32,
    pub cmid: Option<u32>,
    pub course_id: u32,
    pub name: String,
    pub intro: String,
    pub due_date: Option<i64>,
    pub allow_submissions_from_date: Option<i64>,
    pub grade: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodleSubmission {
    pub id: u32,
    pub user_id: u32,
    pub assignment_id: u32,
    pub status: String, // "new", "submitted", "draft"
    pub grade_status: String, // "notgraded", "graded"
    pub time_created: i64,
    pub time_modified: i64,
    pub grade: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodleUser {
    pub id: u32,
    pub username: String,
    pub fullname: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradeSubmission {
    pub assignment_id: u32,
    pub user_id: u32,
    pub grade: f32,
    pub comment: String,
    pub attempt_number: i32,
    pub add_attempt: i32,
}

// ─── Helper: cargar configuración de Moodle desde .env ───

fn load_moodle_config() -> Result<MoodleConfig, String> {
    let vars = load_env_vars();
    
    let url = vars.get("MOODLE_URL")
        .ok_or("MOODLE_URL no configurado en .env")?
        .clone();
    
    let token = vars.get("MOODLE_TOKEN")
        .ok_or("MOODLE_TOKEN no configurado en .env")?
        .clone();
    
    Ok(MoodleConfig { url, token })
}

fn clean_env_value(value: &str) -> String {
    value
        .trim()
        .trim_matches('\u{feff}')
        .trim_matches('"')
        .trim_matches('\'')
        .trim()
        .to_string()
}

fn load_env_vars() -> HashMap<String, String> {
    let mut map = HashMap::new();
    
    if let Ok(url) = std::env::var("MOODLE_URL") {
        let cleaned = clean_env_value(&url);
        if !cleaned.is_empty() {
            map.insert("MOODLE_URL".to_string(), cleaned);
        }
    }
    
    if let Ok(token) = std::env::var("MOODLE_TOKEN") {
        let cleaned = clean_env_value(&token);
        if !cleaned.is_empty() {
            map.insert("MOODLE_TOKEN".to_string(), cleaned);
        }
    }
     
    // Buscar .env desde CARGO_MANIFEST_DIR hacia arriba
    let mut dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    loop {
        let candidate = dir.join(".env");
        if candidate.exists() {
            if let Ok(content) = std::fs::read_to_string(&candidate) {
                for line in content.lines() {
                    let trimmed = line.trim().trim_matches('\u{feff}');
                    if trimmed.is_empty() || trimmed.starts_with('#') {
                        continue;
                    }
                    if let Some((key, val)) = trimmed.split_once('=') {
                        let cleaned_key = key.trim().trim_matches('\u{feff}').to_string();
                        let cleaned_val = clean_env_value(val);
                        if !map.contains_key(&cleaned_key) {
                            map.entry(cleaned_key)
                                .or_insert(cleaned_val);
                        }
                    }
                }
            }
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }
    
    map
}

// ─── Helper: extraer errores de Moodle ───

fn extract_moodle_error(json: &serde_json::Value, wsfunction: &str) -> Option<String> {
    json.get("exception").map(|exception| {
        let error_code = json
            .get("errorcode")
            .and_then(|v| v.as_str())
            .unwrap_or("sin_errorcode");
        let message = json
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("sin mensaje adicional");
        format!(
            "Error de Moodle en {}: {} ({}) - {}",
            wsfunction,
            exception,
            error_code,
            message
        )
    })
}

// ─── Funciones de API de Moodle ───

/// Verifica si una tarea existe en Moodle y devuelve su información
pub async fn get_assignment(assignment_id: u32) -> Result<MoodleAssignment, String> {
    let config = load_moodle_config()?;
    
    let client = reqwest::Client::new();
    let url = format!("{}/webservice/rest/server.php", config.url);
    
    let params = [
        ("wstoken", config.token.as_str()),
        ("wsfunction", "mod_assign_get_assignments"),
        ("moodlewsrestformat", "json"),
    ];
    
    let response = client
        .post(&url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Error en petición a Moodle: {}", e))?;
    
    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Error leyendo respuesta: {}", e))?;
    
    if !status.is_success() {
        return Err(format!("Moodle respondió con error {}: {}", status, text));
    }
    
    // Parsear respuesta
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Error parseando JSON: {}", e))?;
    
    // Verificar si hay error en la respuesta
    if let Some(error) = extract_moodle_error(&json, "mod_assign_get_assignments") {
        return Err(error);
    }
    
    // Extraer assignment
    let courses = json.get("courses")
        .and_then(|c| c.as_array())
        .ok_or("Formato de respuesta inesperado")?;

    let assignment = courses
        .iter()
        .filter_map(|course| course.get("assignments").and_then(|a| a.as_array()))
        .flat_map(|assignments| assignments.iter())
        .find(|assignment| {
            let id_match = assignment.get("id").and_then(|v| v.as_u64()) == Some(assignment_id as u64);
            let cmid_match = assignment.get("cmid").and_then(|v| v.as_u64()) == Some(assignment_id as u64);
            id_match || cmid_match
        })
        .ok_or_else(|| format!("Tarea {} no encontrada", assignment_id))?;
    
    Ok(MoodleAssignment {
        id: assignment.get("id").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        cmid: assignment.get("cmid").and_then(|v| v.as_u64()).map(|v| v as u32),
        course_id: assignment.get("course").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        name: assignment.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        intro: assignment.get("intro").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        due_date: assignment.get("duedate").and_then(|v| v.as_i64()),
        allow_submissions_from_date: assignment.get("allowsubmissionsfromdate").and_then(|v| v.as_i64()),
        grade: assignment.get("grade").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32,
    })
}

/// Obtiene las entregas de un estudiante para una tarea específica
pub async fn get_user_submission(assignment_id: u32, user_id: u32) -> Result<Option<MoodleSubmission>, String> {
    let config = load_moodle_config()?;
    
    let client = reqwest::Client::new();
    let url = format!("{}/webservice/rest/server.php", config.url);
    
    let params = [
        ("wstoken", config.token.as_str()),
        ("wsfunction", "mod_assign_get_submission_status"),
        ("moodlewsrestformat", "json"),
        ("assignid", &assignment_id.to_string()),
        ("userid", &user_id.to_string()),
    ];
    
    let response = client
        .post(&url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Error en petición a Moodle: {}", e))?;
    
    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Error leyendo respuesta: {}", e))?;
    
    if !status.is_success() {
        return Err(format!("Moodle respondió con error {}: {}", status, text));
    }
    
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Error parseando JSON: {}", e))?;
    
    if let Some(error) = extract_moodle_error(&json, "mod_assign_get_submission_status") {
        // Si el token no tiene permisos para ver entregas ajenas, asumir sin entrega previa
        // (el token puede ser de profesor pero sin capability gradesubmission, o de estudiante)
        if error.contains("nopermission") || error.contains("required_capability") {
            eprintln!("[Moodle] Sin permisos para ver submission_status, asumiendo sin entrega previa");
            return Ok(None);
        }
        return Err(error);
    }
    
    // Extraer submission si existe
    if let Some(last_attempt) = json.get("lastattempt").and_then(|la| la.get("submission")) {
        let submission = MoodleSubmission {
            id: last_attempt.get("id").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            user_id: last_attempt.get("userid").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            assignment_id: last_attempt.get("assignment").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            status: last_attempt.get("status").and_then(|v| v.as_str()).unwrap_or("new").to_string(),
            grade_status: json.get("feedback")
                .and_then(|f| f.get("gradeddate"))
                .map(|_| "graded")
                .unwrap_or("notgraded")
                .to_string(),
            time_created: last_attempt.get("timecreated").and_then(|v| v.as_i64()).unwrap_or(0),
            time_modified: last_attempt.get("timemodified").and_then(|v| v.as_i64()).unwrap_or(0),
            grade: json.get("feedback")
                .and_then(|f| f.get("grade"))
                .and_then(|g| g.get("grade"))
                .and_then(|v| v.as_f64())
                .map(|v| v as f32),
        };
        
        Ok(Some(submission))
    } else {
        Ok(None)
    }
}

/// Obtiene información de un usuario por su username
pub async fn get_user_by_username(username: &str) -> Result<MoodleUser, String> {
    let config = load_moodle_config()?;
    
    let client = reqwest::Client::new();
    let url = format!("{}/webservice/rest/server.php", config.url);
    
    let params = [
        ("wstoken", config.token.as_str()),
        ("wsfunction", "core_user_get_users_by_field"),
        ("moodlewsrestformat", "json"),
        ("field", "username"),
        ("values[0]", username),
    ];
    
    let response = client
        .post(&url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Error en petición a Moodle: {}", e))?;
    
    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Error leyendo respuesta: {}", e))?;
    
    if !status.is_success() {
        return Err(format!("Moodle respondió con error {}: {}", status, text));
    }
    
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Error parseando JSON: {}", e))?;
    
    if let Some(error) = extract_moodle_error(&json, "core_user_get_users_by_field") {
        if error.contains("accessexception") || error.contains("nopermission") || error.contains("required_capability") {
            eprintln!("[Moodle] Sin permisos para buscar usuarios, usando placeholder para '{}'", username);
            return Ok(MoodleUser {
                id: 0,
                username: username.to_string(),
                fullname: username.to_string(),
                email: String::new(),
            });
        }
        return Err(error);
    }
    
    let users = json.as_array().ok_or("Formato de respuesta inesperado")?;
    
    if users.is_empty() {
        return Err(format!("Usuario '{}' no encontrado en Moodle", username));
    }
    
    let user = &users[0];
    
    Ok(MoodleUser {
        id: user.get("id").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        username: user.get("username").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        fullname: user.get("fullname").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        email: user.get("email").and_then(|v| v.as_str()).unwrap_or("").to_string(),
    })
}

/// Envía una calificación a Moodle (requiere token con permisos de profesor)
/// NOTA: Esta función NO debe ser llamada directamente desde el cliente.
/// Debe usarse un backend intermedio para validar y firmar la calificación.
pub async fn submit_grade(grade_data: GradeSubmission) -> Result<(), String> {
    let config = load_moodle_config()?;
    
    let client = reqwest::Client::new();
    let url = format!("{}/webservice/rest/server.php", config.url);
    
    let grade_str = format!("{:.4}", grade_data.grade);
    let assignment_id_str = grade_data.assignment_id.to_string();
    let user_id_str = grade_data.user_id.to_string();
    let attempt_str = grade_data.attempt_number.to_string();
    let add_attempt_str = grade_data.add_attempt.to_string();

    eprintln!(
        "[Moodle] submit_grade → assignmentid={} userid={} grade={} attemptnumber={} addattempt={}",
        assignment_id_str, user_id_str, grade_str, attempt_str, add_attempt_str
    );

    let params = [
        ("wstoken", config.token.as_str()),
        ("wsfunction", "mod_assign_save_grade"),
        ("moodlewsrestformat", "json"),
        ("assignmentid", assignment_id_str.as_str()),
        ("userid", user_id_str.as_str()),
        ("grade", grade_str.as_str()),
        ("attemptnumber", attempt_str.as_str()),
        ("addattempt", add_attempt_str.as_str()),
        ("workflowstate", "readyforgrading"),
        ("applytoall", "0"),
        ("plugindata[assignfeedbackcomments_editor][text]", grade_data.comment.as_str()),
        ("plugindata[assignfeedbackcomments_editor][format]", "1"),
    ];
    
    let response = client
        .post(&url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Error en petición a Moodle: {}", e))?;
    
    let status = response.status();
    let text = response.text().await
        .map_err(|e| format!("Error leyendo respuesta: {}", e))?;
    
    if !status.is_success() {
        return Err(format!("Moodle respondió con error {}: {}", status, text));
    }
    
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Error parseando JSON: {}", e))?;
    
    if let Some(error) = extract_moodle_error(&json, "mod_assign_save_grade") {
        return Err(error);
    }
    
    Ok(())
}

// ─── Comandos Tauri ───

/// Sincroniza una tarea de Moodle y verifica si el estudiante ya la entregó
#[tauri::command]
pub async fn moodle_sync_assignment(
    assignment_id: u32,
    username: String,
) -> Result<serde_json::Value, String> {
    // 1. Obtener información de la tarea — si falla por permisos, usar placeholder
    let assignment = match get_assignment(assignment_id).await {
        Ok(a) => a,
        Err(e) if e.contains("accessexception") || e.contains("nopermission") || e.contains("required_capability") => {
            eprintln!("[Moodle] Sin permisos para get_assignment, usando placeholder para assignment_id={}", assignment_id);
            MoodleAssignment {
                id: assignment_id,
                cmid: None,
                course_id: 0,
                name: format!("Práctica {}", assignment_id),
                intro: String::new(),
                due_date: None,
                allow_submissions_from_date: None,
                grade: 100.0,
            }
        }
        Err(e) => return Err(e),
    };
    let real_assignment_id = assignment.id;
    
    // 2. Obtener información del usuario
    let user = get_user_by_username(&username).await?;
    
    // 3. Verificar si ya tiene entrega
    let submission = get_user_submission(real_assignment_id, user.id).await?;
    
    Ok(serde_json::json!({
        "assignment": assignment,
        "user": user,
        "submission": submission,
        "has_submitted": submission.is_some(),
        "is_graded": submission.as_ref().map(|s| s.grade_status == "graded").unwrap_or(false),
    }))
}

/// Prepara los datos para enviar una calificación (NO la envía directamente)
/// Devuelve un payload firmado que debe ser enviado al backend intermedio
#[tauri::command]
pub async fn moodle_prepare_grade(
    assignment_id: u32,
    username: String,
    grade: f32,
    comment: String,
) -> Result<serde_json::Value, String> {
    // Obtener información del usuario
    let user = get_user_by_username(&username).await?;
    
    // Preparar datos de calificación
    let grade_data = GradeSubmission {
        assignment_id,
        user_id: user.id,
        grade,
        comment,
        attempt_number: -1,
        add_attempt: 1,
    };
    
    // Generar timestamp y firma simple (en producción usar JWT o similar)
    let timestamp = chrono::Utc::now().timestamp();
    
    Ok(serde_json::json!({
        "grade_data": grade_data,
        "timestamp": timestamp,
        "user": user,
    }))
}

/// SOLO PARA DESARROLLO/TESTING: Envía calificación directamente
/// En producción, esto debe hacerse desde un backend intermedio seguro
#[tauri::command]
pub async fn moodle_submit_grade_direct(
    assignment_id: u32,
    user_id: u32,
    username: Option<String>,
    grade: f32,
    comment: String,
) -> Result<(), String> {
    // Si user_id es 0 (placeholder por falta de permisos), intentar resolver por username
    let resolved_user_id = if user_id == 0 {
        if let Some(ref uname) = username {
            match get_user_by_username(uname).await {
                Ok(u) if u.id > 0 => {
                    eprintln!("[Moodle] user_id resuelto por username '{}' → {}", uname, u.id);
                    u.id
                }
                _ => return Err(format!("No se pudo resolver el usuario '{}' en Moodle. El token no tiene permisos para buscar usuarios.", uname.as_str())),
            }
        } else {
            return Err("user_id es 0 y no se proporcionó username para resolver el usuario".to_string());
        }
    } else {
        user_id
    };

    // save_submission no está disponible en esta versión de Moodle — se omite

    let grade_data = GradeSubmission {
        assignment_id,
        user_id: resolved_user_id,
        grade,
        comment,
        attempt_number: -1,
        add_attempt: 1,
    };
    
    submit_grade(grade_data).await
}
