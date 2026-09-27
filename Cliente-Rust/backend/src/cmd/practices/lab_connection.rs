//! cmd/practices/lab_connection — Binding local entre una práctica del
//! catálogo externo (`cmd::integration::lab_practices::ExternalLabPractice`,
//! contenido pedagógico no confiable) y un entorno de laboratorio real
//! (host/credenciales/setup, 100% local).
//!
//! Esta es la "fase siguiente" que ya anunciaba el docstring de
//! `lab_practices.rs`: hoy la única forma de ejecutar una práctica es que
//! esté hardcodeada en `.env.practicas` (ver `practicas.rs`, categoría
//! Eve3). Este módulo generaliza esa idea sin tocar las prácticas que ya
//! están en producción (P1/P2 de Eve3 siguen funcionando exactamente igual):
//! cualquier práctica nueva puede volverse ejecutable con solo dos piezas,
//! sin escribir código Rust nuevo:
//!
//! 1. Una entrada en el catálogo (`ExternalLabPractice`, real vía
//!    `LAB_PRACTICES_API_URL` o en el `mock_catalog()` mientras no exista un
//!    proveedor real) — el texto pedagógico.
//! 2. Un archivo `config/lab_connections/<id>.json` local (gitignored, nunca
//!    sale de esta máquina) con el mismo shape que ya usa `practicas.rs`
//!    (`PracticeConnection` + `TerminalConfig` + `PanelConfig`) — la
//!    conexión real.
//!
//! Si el archivo no existe, la práctica sigue viéndose en el catálogo pero
//! como contenido de solo lectura (`runnable: false`) — igual que hoy.

use std::path::Path;

use serde::Deserialize;

use crate::cmd::integration::lab_practices::{lab_practices_get, lab_practices_list, ExternalLabPractice};
use crate::cmd::practices::practicas::{run_setup_commands, PanelConfig, Practice, PracticeConnection, TerminalConfig};
use crate::cmd::protocol::CommandError;

// ─── Carga del perfil de conexión local ───

/// Mismo shape que la práctica local de `practicas.rs`, pero deserializado
/// desde un archivo JSON en vez de construido leyendo variables de entorno.
/// Reutiliza los tipos ya existentes (`PracticeConnection`, `TerminalConfig`,
/// `PanelConfig` ya derivan `Deserialize`) para no duplicar el contrato.
#[derive(Debug, Clone, Deserialize)]
struct LabConnectionProfile {
    connection: PracticeConnection,
    terminal: TerminalConfig,
    panels: PanelConfig,
}

/// Busca `config/lab_connections/<practice_id>.json` subiendo desde
/// `CARGO_MANIFEST_DIR` — mismo patrón que `load_practice_json` en
/// `practicas.rs`.
fn load_connection_profile(practice_id: &str) -> Option<LabConnectionProfile> {
    let mut dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    loop {
        let candidate = dir.join("config").join("lab_connections").join(format!("{}.json", practice_id));
        if candidate.exists() {
            if let Ok(content) = std::fs::read_to_string(&candidate) {
                if let Ok(profile) = serde_json::from_str::<LabConnectionProfile>(&content) {
                    return Some(profile);
                }
            }
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }
    None
}

fn build_runnable_practice(ext: ExternalLabPractice, profile: LabConnectionProfile) -> Practice {
    Practice {
        id: ext.id,
        name: ext.title,
        description: ext.description,
        difficulty: ext.level,
        moodle_assignment_id: None,
        connection: profile.connection,
        terminal: profile.terminal,
        panels: profile.panels,
    }
}

// ─── Comandos Tauri ───

#[derive(Debug, Clone, serde::Serialize)]
pub struct RunnableLabPractice {
    #[serde(flatten)]
    pub practice: ExternalLabPractice,
    /// true si existe un `LabConnectionProfile` local para esta práctica
    /// (o sea, si el botón "Iniciar" debe mostrarse en este equipo).
    pub runnable: bool,
}

/// Catálogo externo con el flag `runnable` resuelto localmente. El
/// frontend ya no necesita distinguir "mis prácticas" vs "catálogo externo":
/// todo sale de aquí, y lo único que cambia por práctica es si hay un
/// entorno de laboratorio vinculado en este equipo.
#[tauri::command]
pub async fn lab_practices_list_runnable() -> Result<Vec<RunnableLabPractice>, CommandError> {
    let practices = lab_practices_list().await?;
    Ok(practices
        .into_iter()
        .map(|p| {
            let runnable = load_connection_profile(&p.id).is_some();
            RunnableLabPractice { practice: p, runnable }
        })
        .collect())
}

/// Arma la práctica completa (con credenciales) para iniciar sesión —
/// equivalente a `practicas_get_config` pero para prácticas del catálogo
/// externo con binding local.
#[tauri::command]
pub async fn lab_practices_get_runnable(id: String) -> Result<Practice, CommandError> {
    let ext = lab_practices_get(id.clone()).await?;
    let profile = load_connection_profile(&id).ok_or_else(|| {
        CommandError::permanent(
            "NOT_RUNNABLE",
            format!("La práctica '{id}' no tiene un entorno de laboratorio vinculado en este equipo"),
        )
        .with_context("lab_practices_get_runnable", &id)
    })?;
    Ok(build_runnable_practice(ext, profile))
}

/// Ejecuta los `setup_commands` del binding local antes de abrir la sesión
/// SSH — mismo evento `practice:log` que ya escucha `PracticesPage.tsx`.
#[tauri::command]
pub async fn lab_practices_run_setup(app: tauri::AppHandle, id: String) -> Result<Vec<String>, CommandError> {
    let ext = lab_practices_get(id.clone()).await?;
    let profile = load_connection_profile(&id).ok_or_else(|| {
        CommandError::permanent(
            "NOT_RUNNABLE",
            format!("La práctica '{id}' no tiene un entorno de laboratorio vinculado en este equipo"),
        )
        .with_context("lab_practices_run_setup", &id)
    })?;
    run_setup_commands(app, id, ext.title, profile.connection.setup_commands).await
}
