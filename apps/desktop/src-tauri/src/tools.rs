use std::path::{Path, PathBuf};
use std::{fs, io};
use serde::{Deserialize, Serialize};
use chrono::Utc;
use base64::Engine;

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub exists: bool,
    pub kind: String,  // "file", "dir", "symlink"
    pub perms: String, // "rwx" format
}

pub struct Tools;

impl Tools {
    /// Ejecuta un comando y captura su salida
    pub async fn run(command: &str, cwd: Option<&str>, env: Option<Vec<(String, String)>>) -> io::Result<CommandResult> {
        let mut cmd = if cfg!(target_os = "windows") {
            let mut cmd = std::process::Command::new("cmd");
            cmd.args(["/C", command]);
            cmd
        } else {
            let mut cmd = std::process::Command::new("sh");
            cmd.args(["-c", command]);
            cmd
        };

        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }

        if let Some(env_vars) = env {
            for (key, value) in env_vars {
                cmd.env(key, value);
            }
        }

        let output = cmd.output()?;

        Ok(CommandResult {
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            exit_code: output.status.code().unwrap_or(-1),
        })
    }

    /// Lee un archivo
    pub fn read_file(path: &str, base64: bool) -> io::Result<String> {
        let content = fs::read_to_string(path)?;
        if base64 {
            Ok(base64::engine::general_purpose::STANDARD.encode(content))
        } else {
            Ok(content)
        }
    }

    /// Escribe un archivo con backup opcional
    pub fn write_file(path: &str, content: &str, _mode: Option<u32>, backup: bool) -> io::Result<Option<String>> {
        let path = Path::new(path);
        
        // Crear backup si es necesario
        let backup_path = if backup && path.exists() {
            let timestamp = Utc::now().format("%Y%m%d-%H%M%S").to_string();
            let backup = path.with_extension(format!("bak.{}", timestamp));
            fs::copy(path, &backup)?;
            Some(backup.to_string_lossy().into_owned())
        } else {
            None
        };

        // Crear directorio si no existe
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        fs::write(path, content)?;

        #[cfg(unix)]
        if let Some(mode) = mode {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(mode);
            fs::set_permissions(path, perms)?;
        }

        Ok(backup_path)
    }

    /// Busca archivos por patrón
    pub fn search_files(
        name_pattern: Option<&str>,
        text_pattern: Option<&str>,
        start_dir: Option<&str>,
        max_depth: Option<u32>,
    ) -> io::Result<Vec<PathBuf>> {
        let start = PathBuf::from(start_dir.unwrap_or("."));
        let mut results = Vec::new();
        
        fn visit_dir(
            dir: &Path,
            name_pat: Option<&str>,
            text_pat: Option<&str>,
            max_depth: Option<u32>,
            current_depth: u32,
            results: &mut Vec<PathBuf>,
        ) -> io::Result<()> {
            if let Some(max) = max_depth {
                if current_depth > max {
                    return Ok(());
                }
            }

            if dir.is_dir() {
                for entry in fs::read_dir(dir)? {
                    let entry = entry?;
                    let path = entry.path();

                    if path.is_dir() {
                        visit_dir(&path, name_pat, text_pat, max_depth, current_depth + 1, results)?;
                    } else if path.is_file() {
                        let mut include = true;

                        // Verificar patrón de nombre
                        if let Some(name_pattern) = name_pat {
                            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                                if !wildmatch::WildMatch::new(name_pattern).matches(name) {
                                    include = false;
                                }
                            }
                        }

                        // Verificar patrón de texto
                        if include && text_pat.is_some() {
                            if let Ok(content) = fs::read_to_string(&path) {
                                if !content.contains(text_pat.unwrap()) {
                                    include = false;
                                }
                            } else {
                                include = false;
                            }
                        }

                        if include {
                            results.push(path);
                        }
                    }
                }
            }
            Ok(())
        }

        visit_dir(
            &start,
            name_pattern,
            text_pattern,
            max_depth,
            0,
            &mut results,
        )?;

        Ok(results)
    }

    /// Obtiene información de un archivo
    pub fn stat(path: &str) -> io::Result<FileInfo> {
        let metadata = fs::metadata(path)?;
        
        let kind = if metadata.is_file() {
            "file"
        } else if metadata.is_dir() {
            "dir"
        } else if metadata.is_symlink() {
            "symlink"
        } else {
            "unknown"
        };

        #[cfg(unix)]
        let perms = {
            use std::os::unix::fs::PermissionsExt;
            format!("{:o}", metadata.permissions().mode() & 0o777)
        };

        #[cfg(not(unix))]
        let perms = {
            let p = metadata.permissions();
            format!(
                "{}{}",
                if p.readonly() { "r" } else { "rw" },
                if metadata.is_dir() { "x" } else { "" }
            )
        };

        Ok(FileInfo {
            exists: true,
            kind: kind.to_string(),
            perms,
        })
    }
}