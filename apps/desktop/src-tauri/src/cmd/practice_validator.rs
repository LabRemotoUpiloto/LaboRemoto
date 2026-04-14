// cmd/practice_validator.rs — Validador automático de prácticas de laboratorio
// Analiza el historial de comandos SSH para determinar si se cumplieron los objetivos

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

// ─── Tipos para validación ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRule {
    pub rule_type: String, // "command_executed", "file_exists", "file_contains", "service_running"
    pub description: String,
    pub target: String, // comando, archivo, servicio, etc.
    pub required: bool,
    pub points: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub rule_description: String,
    pub passed: bool,
    pub points_earned: f32,
    pub details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PracticeValidation {
    pub practice_id: String,
    pub total_points: f32,
    pub earned_points: f32,
    pub percentage: f32,
    pub passed: bool,
    pub results: Vec<ValidationResult>,
    pub feedback: String,
}

// ─── Reglas de validación por práctica ───

fn get_validation_rules(practice_id: &str) -> Vec<ValidationRule> {
    match practice_id {
        "eve3-p1" => vec![
            ValidationRule {
                rule_type: "command_executed".to_string(),
                description: "Ejecutó el comando 'ls' para listar archivos".to_string(),
                target: "ls".to_string(),
                required: true,
                points: 2.0,
            },
            ValidationRule {
                rule_type: "command_executed".to_string(),
                description: "Ejecutó el script 'python flechas.py' para controlar el robot".to_string(),
                target: "python flechas.py".to_string(),
                required: true,
                points: 3.0,
            },
        ],
        "eve3-p2" => vec![
            ValidationRule {
                rule_type: "command_executed".to_string(),
                description: "Usó el editor nano para crear un archivo".to_string(),
                target: "nano".to_string(),
                required: true,
                points: 1.5,
            },
            ValidationRule {
                rule_type: "file_created".to_string(),
                description: "Creó un archivo Python (mi_script.py u otro)".to_string(),
                target: ".py".to_string(),
                required: true,
                points: 2.0,
            },
            ValidationRule {
                rule_type: "command_executed".to_string(),
                description: "Ejecutó su script con python3".to_string(),
                target: "python3".to_string(),
                required: true,
                points: 1.5,
            },
        ],
        _ => vec![],
    }
}

// ─── Funciones de validación ───

/// Valida si un comando fue ejecutado en el historial
fn validate_command_executed(
    command_history: &[String],
    target: &str,
) -> bool {
    command_history.iter().any(|cmd| {
        let normalized = cmd.trim().to_lowercase();
        let target_normalized = target.trim().to_lowercase();
        
        // Coincidencia exacta, como prefijo o contenido
        normalized == target_normalized
            || normalized.starts_with(&target_normalized)
            || normalized.contains(&target_normalized)
    })
}

/// Valida si se creó un archivo con cierta extensión
fn validate_file_created(
    command_history: &[String],
    extension: &str,
) -> bool {
    command_history.iter().any(|cmd| {
        let normalized = cmd.trim().to_lowercase();
        
        // Buscar comandos que crean archivos: nano, touch, vim, etc.
        if normalized.starts_with("nano ") || 
           normalized.starts_with("touch ") || 
           normalized.starts_with("vim ") ||
           normalized.starts_with("vi ") {
            // Verificar si el nombre del archivo contiene la extensión
            normalized.contains(extension)
        } else {
            false
        }
    })
}

/// Valida una práctica completa basándose en el historial de comandos
pub fn validate_practice(
    practice_id: &str,
    command_history: &[String],
) -> PracticeValidation {
    let rules = get_validation_rules(practice_id);
    
    if rules.is_empty() {
        return PracticeValidation {
            practice_id: practice_id.to_string(),
            total_points: 0.0,
            earned_points: 0.0,
            percentage: 0.0,
            passed: false,
            results: vec![],
            feedback: "No hay reglas de validación configuradas para esta práctica.".to_string(),
        };
    }
    
    let mut results = Vec::new();
    let mut total_points = 0.0;
    let mut earned_points = 0.0;
    
    for rule in &rules {
        total_points += rule.points;
        
        let passed = match rule.rule_type.as_str() {
            "command_executed" => validate_command_executed(command_history, &rule.target),
            "file_created" => validate_file_created(command_history, &rule.target),
            _ => false,
        };
        
        let points = if passed { rule.points } else { 0.0 };
        earned_points += points;
        
        let details = if passed {
            format!("✅ Completado correctamente")
        } else {
            format!("❌ No completado")
        };
        
        results.push(ValidationResult {
            rule_description: rule.description.clone(),
            passed,
            points_earned: points,
            details,
        });
    }
    
    let percentage = if total_points > 0.0 {
        (earned_points / total_points) * 100.0
    } else {
        0.0
    };
    
    // Considerar aprobado si cumple al menos 60% de los objetivos
    let passed = percentage >= 60.0;
    
    let feedback = generate_feedback(practice_id, &results, percentage, passed);
    
    PracticeValidation {
        practice_id: practice_id.to_string(),
        total_points,
        earned_points,
        percentage,
        passed,
        results,
        feedback,
    }
}

/// Genera feedback personalizado basado en los resultados
fn generate_feedback(
    practice_id: &str,
    results: &[ValidationResult],
    percentage: f32,
    passed: bool,
) -> String {
    let mut feedback = String::new();
    
    if passed {
        feedback.push_str(&format!("🎉 ¡Felicitaciones! Has completado la práctica exitosamente con un {:.1}% de los objetivos cumplidos.\n\n", percentage));
    } else {
        feedback.push_str(&format!("⚠️ Práctica incompleta. Has cumplido el {:.1}% de los objetivos. Necesitas al menos 60% para aprobar.\n\n", percentage));
    }
    
    // Listar objetivos cumplidos
    let completed: Vec<_> = results.iter().filter(|r| r.passed).collect();
    if !completed.is_empty() {
        feedback.push_str("**Objetivos cumplidos:**\n");
        for result in completed {
            feedback.push_str(&format!("- {} (+{:.1} puntos)\n", result.rule_description, result.points_earned));
        }
        feedback.push('\n');
    }
    
    // Listar objetivos pendientes
    let pending: Vec<_> = results.iter().filter(|r| !r.passed).collect();
    if !pending.is_empty() {
        feedback.push_str("**Objetivos pendientes:**\n");
        for result in pending {
            feedback.push_str(&format!("- {}\n", result.rule_description));
        }
        feedback.push('\n');
    }
    
    // Sugerencias específicas por práctica
    if !passed {
        match practice_id {
            "eve3-p1" => {
                feedback.push_str("**Sugerencias:**\n");
                feedback.push_str("- Recuerda ejecutar 'ls' para ver los archivos disponibles\n");
                feedback.push_str("- Ejecuta 'python flechas.py' para iniciar el control del robot\n");
                feedback.push_str("- Usa las teclas de dirección para mover el robot\n");
            }
            "eve3-p2" => {
                feedback.push_str("**Sugerencias:**\n");
                feedback.push_str("- Usa 'nano mi_script.py' para crear tu archivo Python\n");
                feedback.push_str("- Escribe tu código para controlar el robot\n");
                feedback.push_str("- Guarda con Ctrl+O y sal con Ctrl+X\n");
                feedback.push_str("- Ejecuta tu script con 'python3 mi_script.py'\n");
            }
            _ => {}
        }
    }
    
    feedback
}

/// Calcula la calificación numérica basada en el porcentaje
pub fn calculate_grade(percentage: f32, max_grade: f32) -> f32 {
    let grade = (percentage / 100.0) * max_grade;
    
    // Redondear a 1 decimal
    (grade * 10.0).round() / 10.0
}

// ─── Comandos Tauri ───

/// Valida una práctica basándose en el historial de comandos
#[tauri::command]
pub fn validate_practice_progress(
    practice_id: String,
    command_history: Vec<String>,
) -> Result<PracticeValidation, String> {
    Ok(validate_practice(&practice_id, &command_history))
}

/// Calcula la calificación final para Moodle
#[tauri::command]
pub fn calculate_practice_grade(
    practice_id: String,
    command_history: Vec<String>,
    max_grade: f32,
) -> Result<serde_json::Value, String> {
    let validation = validate_practice(&practice_id, &command_history);
    let grade = calculate_grade(validation.percentage, max_grade);
    
    Ok(serde_json::json!({
        "validation": validation,
        "grade": grade,
        "max_grade": max_grade,
    }))
}

// ─── Tests ───

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_validate_eve3_p1_complete() {
        let history = vec![
            "ls".to_string(),
            "python flechas.py".to_string(),
        ];
        
        let result = validate_practice("eve3-p1", &history);
        
        assert!(result.passed);
        assert_eq!(result.earned_points, 5.0);
        assert_eq!(result.percentage, 100.0);
    }
    
    #[test]
    fn test_validate_eve3_p1_incomplete() {
        let history = vec![
            "ls".to_string(),
        ];
        
        let result = validate_practice("eve3-p1", &history);
        
        assert!(!result.passed);
        assert_eq!(result.earned_points, 2.0);
        assert_eq!(result.percentage, 40.0);
    }
    
    #[test]
    fn test_validate_eve3_p2_complete() {
        let history = vec![
            "nano mi_script.py".to_string(),
            "python3 mi_script.py".to_string(),
        ];
        
        let result = validate_practice("eve3-p2", &history);
        
        assert!(result.passed);
        assert_eq!(result.earned_points, 5.0);
        assert_eq!(result.percentage, 100.0);
    }
    
    #[test]
    fn test_calculate_grade() {
        let grade = calculate_grade(100.0, 5.0);
        assert_eq!(grade, 5.0);
        
        let grade = calculate_grade(80.0, 5.0);
        assert_eq!(grade, 4.0);
        
        let grade = calculate_grade(60.0, 10.0);
        assert_eq!(grade, 6.0);
    }
}
