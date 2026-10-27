//! cmd/practices/circuitos_api.rs — prácticas de circuitos.
//!
//! Las sirve el simulador de circuitos del laboratorio (fork de Velxio, servicio aparte), no la Raspberry: por
//! eso van por su propio camino y cargan aunque la Pi no responda. Mientras pasan a la API de prácticas de la Pi,
//! el simulador expone `GET /api/laboremoto/practicas` y `GET /api/laboremoto/practicas/{id}`.
//!
//! El contenido se pasa tal cual al frontend (`features/circuitos/practicas.ts` tiene los tipos).

use std::time::Duration;

use once_cell::sync::Lazy;

use crate::cmd::protocol::CommandError;

static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
});

/// Dónde corre el simulador: `SIMULADOR_CIRCUITOS_URL` en el .env; por defecto, el contenedor local.
fn url_base() -> String {
    std::env::var("SIMULADOR_CIRCUITOS_URL")
        .ok()
        .filter(|u| !u.trim().is_empty())
        .unwrap_or_else(|| "http://localhost:3080".into())
        .trim_end_matches('/')
        .to_string()
}

/// El id viaja en la URL: solo se aceptan los de la forma `circ-…`.
fn id_valido(id: &str) -> bool {
    id.starts_with("circ-")
        && id.len() <= 45
        && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

async fn pedir(ruta: &str) -> Result<serde_json::Value, CommandError> {
    let url = format!("{}{}", url_base(), ruta);
    let respuesta = HTTP_CLIENT.get(&url).send().await.map_err(|e| {
        CommandError::transient("CIRCUITOS_SIN_SERVICIO", format!("No responde el simulador de circuitos ({}): {}", url_base(), e))
    })?;
    if respuesta.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(CommandError::permanent("CIRCUITOS_NO_ENCONTRADA", "Esa práctica de circuitos no existe"));
    }
    if !respuesta.status().is_success() {
        return Err(CommandError::transient(
            "CIRCUITOS_ERROR",
            format!("El simulador de circuitos respondió {}", respuesta.status()),
        ));
    }
    respuesta
        .json::<serde_json::Value>()
        .await
        .map_err(|e| CommandError::permanent("CIRCUITOS_RESPUESTA", format!("Respuesta inválida del simulador: {}", e)))
}

/// Resumen de cada práctica de circuitos, en orden (id, título, objetivo, minutos…).
#[tauri::command]
pub async fn circuitos_practicas() -> Result<serde_json::Value, CommandError> {
    pedir("/api/laboremoto/practicas").await
}

/// Una práctica completa: pasos, circuito inicial, comprobaciones y contexto para el tutor.
#[tauri::command]
pub async fn circuitos_practica(id: String) -> Result<serde_json::Value, CommandError> {
    if !id_valido(&id) {
        return Err(CommandError::permanent("CIRCUITOS_NO_ENCONTRADA", "Esa práctica de circuitos no existe"));
    }
    pedir(&format!("/api/laboremoto/practicas/{}", id)).await
}

#[cfg(test)]
mod tests {
    use super::id_valido;

    #[test]
    fn solo_ids_de_circuitos() {
        assert!(id_valido("circ-m1"));
        assert!(id_valido("circ-ley-de-ohm-2"));
        assert!(!id_valido("linux-m1"));
        assert!(!id_valido("circ-../../etc"));
        assert!(!id_valido("circ-M1"));
        assert!(!id_valido(&format!("circ-{}", "a".repeat(60))));
    }
}
