//! cmd/ssh/carpeta.rs — texto de la terminal sin códigos de color, y en qué carpeta está la terminal de una sesión según su
//! prompt («pi@raspberrypi:~/proyecto $»). No hay otra forma confiable de saberlo sin escribir en la terminal de la persona;
//! si el prompt no muestra la ruta, se responde que no se sabe en lugar de adivinar.

use once_cell::sync::Lazy;
use regex::Regex;

static ANSI: Lazy<Regex> = Lazy::new(|| Regex::new(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\r").unwrap());
// usuario@equipo:ruta $   (también «#» de root y el «(venv) » de Python delante)
static PROMPT: Lazy<Regex> = Lazy::new(|| Regex::new(r"[\w.-]+@[\w.-]+:(~[^\s$#]*|/[^\s$#]*)\s*[$#]").unwrap());

/// El texto de la terminal sin colores ni retornos de carro (lo usan el agente y la carpeta de la terminal).
pub fn limpiar_ansi(texto: &str) -> String {
  ANSI.replace_all(texto, "").into_owned()
}

/// La ruta del último prompt que aparece en `texto` (con `~` si así la muestra).
pub fn carpeta_del_prompt(texto: &str) -> Option<String> {
  let limpio = limpiar_ansi(texto);
  PROMPT.captures_iter(&limpio).last().map(|c| c[1].to_string())
}

/// `~` y `~/x` con la carpeta personal en el servidor.
pub fn expandir_home(ruta: &str, home: &str) -> String {
  let home = home.trim_end_matches('/');
  if ruta == "~" {
    home.to_string()
  } else if let Some(resto) = ruta.strip_prefix("~/") {
    format!("{home}/{resto}")
  } else {
    ruta.to_string()
  }
}

/// La carpeta absoluta en la que está la terminal de la sesión, o `None` si el prompt no la muestra.
#[tauri::command]
pub async fn ssh_carpeta_terminal(id: String) -> Result<Option<String>, String> {
  let texto = crate::cmd::tools::tools::get_terminal_context(id.clone(), Some(60))?;
  let Some(ruta) = carpeta_del_prompt(&texto) else { return Ok(None) };
  if !ruta.starts_with('~') {
    return Ok(Some(ruta));
  }
  let home = crate::cmd::sftp::operations::sftp_home(id).await.map_err(|e| e.message)?;
  Ok(Some(expandir_home(&ruta, &home)))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn toma_la_ruta_del_ultimo_prompt_aunque_traiga_colores() {
    let salida = "pi@raspberrypi:~ $ cd proyecto\r\n\x1b[01;32mpi@raspberrypi\x1b[00m:\x1b[01;34m~/proyecto \x1b[00m$ ls\r\nleds.py\r\n";
    assert_eq!(carpeta_del_prompt(salida).as_deref(), Some("~/proyecto"));
  }

  #[test]
  fn reconoce_rutas_absolutas_root_y_entornos_de_python() {
    assert_eq!(carpeta_del_prompt("(venv) labiot@jetson:/opt/app # ").as_deref(), Some("/opt/app"));
  }

  #[test]
  fn si_el_prompt_no_muestra_la_ruta_no_adivina() {
    assert_eq!(carpeta_del_prompt("bash-5.1$ ls\r\n$ "), None);
  }

  #[test]
  fn expande_home() {
    assert_eq!(expandir_home("~", "/home/pi"), "/home/pi");
    assert_eq!(expandir_home("~/proyecto", "/home/pi/"), "/home/pi/proyecto");
    assert_eq!(expandir_home("/etc", "/home/pi"), "/etc");
  }

  #[test]
  fn limpia_colores_titulos_y_retornos() {
    assert_eq!(limpiar_ansi("\x1b]0;pi@raspberrypi: ~\x07\x1b[1mhola\x1b[0m\r\n"), "hola\n");
  }
}
