use std::path::Path;
use std::fs;
use chrono::Utc;
use serde::{Serialize, Deserialize};

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

pub struct SecurityManager;

impl SecurityManager {
    pub fn new() -> Self {
        Self
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

        // --- sedValidation: sed -i sin backup puede sobreescribir archivos críticos ---
        if norm.starts_with("sed") && norm.contains("-i") && !norm.contains("-i.bak") && !norm.contains("-i '.bak'") {
            return SecurityValidation {
                requires_confirmation: true,
                reason: "sed -i sin sufijo de backup modifica archivos en el lugar. Considera usar -i.bak".to_string(),
                risk_level: RiskLevel::Medium,
                backup_path: None,
            };
        }

        // --- modeValidation: comandos que cambian modo del sistema ---
        let mode_patterns = ["init 0", "init 6", "systemctl isolate", "telinit 0", "telinit 6", "shutdown", "reboot", "halt", "poweroff"];
        for pat in &mode_patterns {
            if norm.contains(pat) {
                return SecurityValidation {
                    requires_confirmation: true,
                    reason: format!("Comando que afecta el estado del sistema: {}", pat),
                    risk_level: RiskLevel::Critical,
                    backup_path: None,
                };
            }
        }

        // --- destructiveCommandWarning: comandos de sobreescritura masiva ---
        let destructive = ["> /etc/", "> /boot/", "> /usr/", "truncate -s 0 /", "shred /dev/", "dd of=/dev/sd"];
        for pat in &destructive {
            if norm.contains(&Self::normalize(pat)) {
                return SecurityValidation {
                    requires_confirmation: true,
                    reason: format!("Escritura destructiva detectada en ruta crítica: {}", pat.trim()),
                    risk_level: RiskLevel::Critical,
                    backup_path: None,
                };
            }
        }

        // --- pathValidation: escritura directa en rutas del sistema ---
        let sys_write_patterns = ["cp ", "mv ", "install ", "tee "];
        let sys_paths = ["/etc/", "/boot/", "/usr/bin/", "/usr/sbin/", "/sbin/", "/bin/"];
        for cmd in &sys_write_patterns {
            if norm.starts_with(cmd) {
                for path in &sys_paths {
                    if norm.contains(path) {
                        return SecurityValidation {
                            requires_confirmation: true,
                            reason: format!("Escritura en ruta del sistema protegida: {}", path),
                            risk_level: RiskLevel::High,
                            backup_path: None,
                        };
                    }
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

// ─── PermissionMode — modos de operación del agente (inspirado en claw-code) ───

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum PermissionMode {
    /// Solo puede leer archivos y ejecutar comandos no destructivos.
    ReadOnly,
    /// Puede leer y escribir dentro del workspace del proyecto (home del usuario SSH).
    #[default]
    WorkspaceWrite,
    /// Sin restricciones — requiere confirmación explícita del usuario para activarse.
    DangerFullAccess,
}

impl PermissionMode {
    /// Devuelve true si el modo permite escribir archivos.
    pub fn allows_write(&self) -> bool {
        matches!(self, PermissionMode::WorkspaceWrite | PermissionMode::DangerFullAccess)
    }

    /// Devuelve true si el modo requiere confirmación para comandos mutantes (bash).
    pub fn requires_bash_confirmation(&self) -> bool {
        matches!(self, PermissionMode::ReadOnly)
    }

    /// Valida si un comando bash es permitido en este modo.
    /// En ReadOnly se bloquean comandos que modifican el sistema de archivos.
    pub fn check_bash(&self, command: &str) -> Result<(), String> {
        if !self.requires_bash_confirmation() {
            return Ok(());
        }
        let norm = command.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase();
        let mutating = ["rm ", "mv ", "cp ", "mkdir ", "touch ", "chmod ", "chown ",
                        "dd ", "mkfs", "tee ", "cat >", "echo >", "> /", ">>",
                        "sed -i", "apt ", "apt-get ", "yum ", "pip ", "npm ", "cargo "];
        for m in &mutating {
            if norm.contains(m) {
                return Err(format!("Modo read-only: '{}' no está permitido sin confirmar", m.trim()));
            }
        }
        Ok(())
    }

    pub fn label(&self) -> &'static str {
        match self {
            PermissionMode::ReadOnly => "read-only",
            PermissionMode::WorkspaceWrite => "workspace-write",
            PermissionMode::DangerFullAccess => "danger-full-access",
        }
    }
}