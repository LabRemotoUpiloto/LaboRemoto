use std::path::Path;
use std::fs;
use chrono::Utc;
use serde::{Serialize, Deserialize};
use std::collections::HashSet;

#[derive(Debug, Serialize, Deserialize)]
pub struct SecurityValidation {
    pub requires_confirmation: bool,
    pub reason: String,
    pub risk_level: RiskLevel,
    pub backup_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

pub struct SecurityManager {
    dangerous_patterns: HashSet<String>,
}

impl SecurityManager {
    pub fn new() -> Self {
        let mut dangerous_patterns = HashSet::new();
        dangerous_patterns.insert("rm -rf /".to_string());
        dangerous_patterns.insert(":(){ :|:& };:".to_string());
        dangerous_patterns.insert("chmod -r 777".to_string());
        dangerous_patterns.insert("> /dev/sda".to_string());
        dangerous_patterns.insert("mkfs".to_string());
        dangerous_patterns.insert("dd if=/dev/zero".to_string());
        Self { dangerous_patterns }
    }

    /// Normaliza un comando: colapsa espacios múltiples, convierte a minúsculas.
    /// Esto evita eludir el filtro con espacios extra (ej: "rm  -rf  /").
    fn normalize(s: &str) -> String {
        s.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
    }

    pub fn validate_command(&self, command: &str) -> SecurityValidation {
        let norm = Self::normalize(command);

        // --- Patrones críticos (evaluados sobre forma normalizada) ---
        let critical = [
            "rm -rf /", "rm -fr /", "rm -f -r /", "rm -r -f /",
            ":(){ :|:& };:",
            "chmod -r 777", "chmod -r a+rwx",
            "> /dev/sda", ">/dev/sda",
            "mkfs",
            "dd if=/dev/zero",
        ];
        for pat in &critical {
            if norm.contains(&Self::normalize(pat)) {
                return SecurityValidation {
                    requires_confirmation: true,
                    reason: format!("Comando destructivo detectado: {}", pat),
                    risk_level: RiskLevel::Critical,
                    backup_path: None,
                };
            }
        }

        // --- Path traversal ---
        if command.contains("../") || command.contains("..\\") {
            return SecurityValidation {
                requires_confirmation: true,
                reason: "Posible path traversal detectado (../)".to_string(),
                risk_level: RiskLevel::High,
                backup_path: None,
            };
        }

        // --- rm recursivo (variantes normalizadas) ---
        let rm_recursive = [
            "rm -r", "rm -rf", "rm -fr", "rm -f -r", "rm -r -f", "rm --recursive",
        ];
        for pat in &rm_recursive {
            if norm.contains(&Self::normalize(pat)) {
                return SecurityValidation {
                    requires_confirmation: true,
                    reason: "Eliminación recursiva detectada".to_string(),
                    risk_level: RiskLevel::High,
                    backup_path: None,
                };
            }
        }

        // --- chmod inseguro ---
        if norm.contains("chmod") && (norm.contains("777") || norm.contains("a+rwx") || norm.contains("+rwx")) {
            return SecurityValidation {
                requires_confirmation: true,
                reason: "Cambio de permisos inseguro (777 / a+rwx)".to_string(),
                risk_level: RiskLevel::High,
                backup_path: None,
            };
        }

        // --- Inyección de comando peligroso vía pipe/chain ---
        let has_chain = command.contains('|') || command.contains(';') || command.contains("&&");
        if has_chain {
            let injection_targets = ["dd ", "mkfs", "rm -r", "rm -f", "shred", "wipe ", ":(){" ];
            for target in &injection_targets {
                if norm.contains(&Self::normalize(target)) {
                    return SecurityValidation {
                        requires_confirmation: true,
                        reason: format!("Posible inyección de comando peligroso en cadena: {}", target.trim()),
                        risk_level: RiskLevel::High,
                        backup_path: None,
                    };
                }
            }
        }

        SecurityValidation {
            requires_confirmation: false,
            reason: "Comando seguro".to_string(),
            risk_level: RiskLevel::Low,
            backup_path: None,
        }
    }

    pub fn create_backup(&self, file_path: &Path) -> std::io::Result<String> {
        if !file_path.exists() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "File does not exist",
            ));
        }

        let timestamp = Utc::now().format("%Y%m%d-%H%M%S").to_string();
        let backup_path = file_path.with_extension(format!("bak.{}", timestamp));
        
        fs::copy(file_path, &backup_path)?;
        
        Ok(backup_path.to_string_lossy().into_owned())
    }

    pub fn restore_backup(&self, backup_path: &Path) -> std::io::Result<()> {
        if !backup_path.exists() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Backup file does not exist",
            ));
        }

        let original_path = if let Some(stem) = backup_path.file_stem() {
            if let Some(stem_str) = stem.to_str() {
                if let Some(last_dot) = stem_str.rfind('.') {
                    let original_name = &stem_str[..last_dot];
                    backup_path.with_file_name(original_name)
                } else {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        "Invalid backup file name format",
                    ));
                }
            } else {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "Invalid backup file name",
                ));
            }
        } else {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Invalid backup file path",
            ));
        };

        fs::copy(backup_path, &original_path)?;
        Ok(())
    }

    pub fn validate_file_operation(&self, path: &Path, content_size: usize) -> SecurityValidation {
        let mut validation = SecurityValidation {
            requires_confirmation: false,
            reason: String::new(),
            risk_level: RiskLevel::Low,
            backup_path: None,
        };

        // Verificar tamaño
        if content_size > 256 * 1024 {  // 256KB
            validation.requires_confirmation = true;
            validation.reason = format!("Archivo grande ({:.2}MB)", content_size as f64 / 1024.0 / 1024.0);
            validation.risk_level = RiskLevel::Medium;
        }

        // Verificar rutas sensibles
        let path_str = path.to_string_lossy();
        let sensitive_paths = [
            "/etc/passwd",
            "/etc/shadow",
            "/etc/sudoers",
            "/etc/ssh",
            "/boot",
            "/var/log",
        ];

        for sensitive in &sensitive_paths {
            if path_str.contains(sensitive) {
                validation.requires_confirmation = true;
                validation.reason = format!("Ruta sensible detectada: {}", sensitive);
                validation.risk_level = RiskLevel::High;
                break;
            }
        }

        if path.exists() {
            // Si el archivo existe, crear backup
            if let Ok(backup_path) = self.create_backup(path) {
                validation.backup_path = Some(backup_path);
            }
        }

        validation
    }
}