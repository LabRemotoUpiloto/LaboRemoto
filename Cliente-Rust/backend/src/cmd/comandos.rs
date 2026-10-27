//! cmd/comandos.rs — Comandos guardados («Comandos», antes snippets): los que la persona repite seguido y ejecuta en la
//! terminal con un clic. Se guardan en un JSON local en texto plano (no son secretos), en la carpeta de datos de la app.
//!
//! - Escritura segura: se escribe un archivo temporal y se reemplaza el anterior; un cierre a mitad no deja el JSON roto.
//! - El archivo lleva `version` para poder cambiar los campos sin perder lo guardado.
//! - Cada cambio avisa a la interfaz con el evento `comandos:cambio` (el panel se actualiza aunque lo cambie el chat).

use directories::ProjectDirs;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use ts_rs::TS;

const VERSION: u32 = 1;
const MAXIMO: usize = 500;
const LARGO_TITULO: usize = 120;
const LARGO_COMANDO: usize = 10_000;
const LARGO_DESCRIPCION: usize = 300;
pub const EVENTO_CAMBIO: &str = "comandos:cambio";

/// Un comando guardado. `terminal` dice dónde sirve ("linux" o "powershell"); vacío, en cualquiera.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Comando {
  pub id: String,
  pub titulo: String,
  pub comando: String,
  /// Para qué sirve (lo ve la persona debajo del nombre). Los guardados antes no la tienen.
  #[serde(default)]
  pub descripcion: Option<String>,
  #[serde(default)]
  pub categoria: Option<String>,
  #[serde(default)]
  pub terminal: Option<String>,
  /// Milisegundos desde 1970.
  pub creado: f64,
  #[serde(default)]
  pub actualizado: Option<f64>,
}

#[derive(Serialize, Deserialize, Default)]
struct Archivo {
  version: u32,
  comandos: Vec<Comando>,
}

/// Una sola escritura a la vez (el panel y el chat pueden guardar casi al mismo tiempo).
static CANDADO: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

fn ruta() -> Result<PathBuf, String> {
  let proj = ProjectDirs::from("com", "example", "ssh-ai-client").ok_or("No se encontró la carpeta de datos de la app")?;
  let dir = proj.data_dir().to_path_buf();
  fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear la carpeta de datos: {e}"))?;
  Ok(dir.join("comandos.json"))
}

fn leer(ruta: &Path) -> Result<Vec<Comando>, String> {
  match fs::read_to_string(ruta) {
    Ok(texto) => serde_json::from_str::<Archivo>(&texto)
      .map(|a| a.comandos)
      .map_err(|e| format!("El archivo de comandos está dañado: {e}")),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
    Err(e) => Err(format!("No se pudieron leer los comandos: {e}")),
  }
}

fn escribir(ruta: &Path, comandos: &[Comando]) -> Result<(), String> {
  let texto = serde_json::to_string_pretty(&Archivo { version: VERSION, comandos: comandos.to_vec() })
    .map_err(|e| e.to_string())?;
  let temporal = ruta.with_extension("json.tmp");
  fs::write(&temporal, texto).map_err(|e| format!("No se pudieron guardar los comandos: {e}"))?;
  // En Windows y en Unix, rename reemplaza el archivo anterior de una vez.
  fs::rename(&temporal, ruta).map_err(|e| format!("No se pudieron guardar los comandos: {e}"))
}

fn limpiar(mut c: Comando) -> Result<Comando, String> {
  c.titulo = c.titulo.trim().chars().take(LARGO_TITULO).collect();
  c.comando = c.comando.trim_end().to_string();
  if c.comando.trim().is_empty() {
    return Err("El comando está vacío".into());
  }
  if c.comando.chars().count() > LARGO_COMANDO {
    return Err(format!("El comando es demasiado largo (máximo {LARGO_COMANDO} caracteres)"));
  }
  if c.titulo.is_empty() {
    // Sin nombre, la primera línea del comando
    c.titulo = c.comando.lines().next().unwrap_or_default().chars().take(LARGO_TITULO).collect();
  }
  c.descripcion = c.descripcion.map(|s| s.trim().chars().take(LARGO_DESCRIPCION).collect::<String>()).filter(|s| !s.is_empty());
  c.categoria = c.categoria.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
  c.terminal = c.terminal.filter(|t| t == "linux" || t == "powershell");
  if c.id.trim().is_empty() {
    c.id = uuid::Uuid::new_v4().to_string();
  }
  Ok(c)
}

/// Crea o reemplaza (por id). Lo más nuevo queda primero.
fn guardar_en(ruta: &Path, comando: Comando, ahora: f64) -> Result<(Vec<Comando>, Comando), String> {
  let mut c = limpiar(comando)?;
  let mut lista = leer(ruta)?;
  if let Some(i) = lista.iter().position(|x| x.id == c.id) {
    c.creado = lista[i].creado;
    c.actualizado = Some(ahora);
    lista.remove(i);
  } else {
    if lista.len() >= MAXIMO {
      return Err(format!("Ya tienes {MAXIMO} comandos guardados: borra alguno para guardar otro"));
    }
    if c.creado <= 0.0 {
      c.creado = ahora;
    }
  }
  lista.insert(0, c.clone());
  escribir(ruta, &lista)?;
  Ok((lista, c))
}

fn borrar_en(ruta: &Path, id: &str) -> Result<Vec<Comando>, String> {
  let mut lista = leer(ruta)?;
  lista.retain(|c| c.id != id);
  escribir(ruta, &lista)?;
  Ok(lista)
}

/// Trae los que no estén (por id); los que ya están no se tocan. Para pasar los snippets que vivían en el navegador.
fn importar_en(ruta: &Path, nuevos: Vec<Comando>) -> Result<Vec<Comando>, String> {
  let mut lista = leer(ruta)?;
  for c in nuevos {
    if lista.len() >= MAXIMO {
      break;
    }
    if let Ok(c) = limpiar(c) {
      if !lista.iter().any(|x| x.id == c.id) {
        lista.push(c);
      }
    }
  }
  escribir(ruta, &lista)?;
  Ok(lista)
}

fn ahora_ms() -> f64 {
  chrono::Utc::now().timestamp_millis() as f64
}

fn avisar(app: &AppHandle) {
  let _ = app.emit(EVENTO_CAMBIO, ());
}

/// Guarda un comando desde el backend (lo usa la herramienta del chat). Devuelve el comando como quedó.
pub fn guardar(app: &AppHandle, comando: Comando) -> Result<Comando, String> {
  let _candado = CANDADO.lock().map_err(|_| "Comandos ocupados")?;
  let (_, c) = guardar_en(&ruta()?, comando, ahora_ms())?;
  avisar(app);
  Ok(c)
}

/// Lista los comandos guardados (lo más nuevo primero).
pub fn listar() -> Result<Vec<Comando>, String> {
  let _candado = CANDADO.lock().map_err(|_| "Comandos ocupados")?;
  leer(&ruta()?)
}

#[tauri::command]
pub fn comandos_listar() -> Result<Vec<Comando>, String> {
  listar()
}

#[tauri::command]
pub fn comandos_guardar(app: AppHandle, comando: Comando) -> Result<Vec<Comando>, String> {
  let _candado = CANDADO.lock().map_err(|_| "Comandos ocupados")?;
  let (lista, _) = guardar_en(&ruta()?, comando, ahora_ms())?;
  avisar(&app);
  Ok(lista)
}

#[tauri::command]
pub fn comandos_borrar(app: AppHandle, id: String) -> Result<Vec<Comando>, String> {
  let _candado = CANDADO.lock().map_err(|_| "Comandos ocupados")?;
  let lista = borrar_en(&ruta()?, &id)?;
  avisar(&app);
  Ok(lista)
}

#[tauri::command]
pub fn comandos_importar(app: AppHandle, comandos: Vec<Comando>) -> Result<Vec<Comando>, String> {
  let _candado = CANDADO.lock().map_err(|_| "Comandos ocupados")?;
  let lista = importar_en(&ruta()?, comandos)?;
  avisar(&app);
  Ok(lista)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn archivo_de_prueba(nombre: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("laboremoto-comandos-{nombre}-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    dir.join("comandos.json")
  }

  fn cmd(id: &str, titulo: &str, comando: &str) -> Comando {
    Comando { id: id.into(), titulo: titulo.into(), comando: comando.into(), descripcion: None, categoria: None, terminal: None, creado: 0.0, actualizado: None }
  }

  #[test]
  fn guarda_la_descripcion_y_lee_los_viejos_sin_ella() {
    let r = archivo_de_prueba("descripcion");
    let mut c = cmd("a", "Temperatura", "vcgencmd measure_temp");
    c.descripcion = Some("  Muestra la temperatura del procesador de la Pi  ".into());
    let (_, g) = guardar_en(&r, c, 1.0).unwrap();
    assert_eq!(g.descripcion.as_deref(), Some("Muestra la temperatura del procesador de la Pi"));
    // Un archivo de antes, sin descripción, se sigue leyendo
    fs::write(&r, r#"{"version":1,"comandos":[{"id":"v","titulo":"Viejo","comando":"ls","creado":1}]}"#).unwrap();
    assert_eq!(leer(&r).unwrap()[0].descripcion, None);
  }

  #[test]
  fn sin_archivo_no_hay_comandos() {
    assert!(leer(&archivo_de_prueba("vacio")).unwrap().is_empty());
  }

  #[test]
  fn guarda_lo_nuevo_primero_y_reemplaza_por_id() {
    let r = archivo_de_prueba("guardar");
    guardar_en(&r, cmd("a", "Temperatura", "vcgencmd measure_temp"), 1.0).unwrap();
    guardar_en(&r, cmd("b", "Disco", "df -h /"), 2.0).unwrap();
    let (lista, editado) = guardar_en(&r, cmd("a", "Temp", "vcgencmd measure_temp"), 3.0).unwrap();
    assert_eq!(lista.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(), ["a", "b"]);
    assert_eq!(editado.titulo, "Temp");
    assert_eq!(editado.creado, 1.0);
    assert_eq!(editado.actualizado, Some(3.0));
    // Lo que quedó en disco es lo mismo (y no queda el temporal)
    assert_eq!(leer(&r).unwrap(), lista);
    assert!(!r.with_extension("json.tmp").exists());
  }

  #[test]
  fn sin_nombre_usa_la_primera_linea_y_rechaza_vacios() {
    let r = archivo_de_prueba("nombre");
    let (_, c) = guardar_en(&r, cmd("", "  ", "ls -la\npwd"), 1.0).unwrap();
    assert_eq!(c.titulo, "ls -la");
    assert!(!c.id.is_empty());
    assert!(guardar_en(&r, cmd("x", "Nada", "   "), 1.0).is_err());
  }

  #[test]
  fn borra_e_importa_sin_duplicar() {
    let r = archivo_de_prueba("importar");
    guardar_en(&r, cmd("a", "A", "echo a"), 1.0).unwrap();
    let lista = importar_en(&r, vec![cmd("a", "Otro", "echo otro"), cmd("b", "B", "echo b")]).unwrap();
    assert_eq!(lista.len(), 2);
    assert_eq!(lista[0].titulo, "A");
    assert_eq!(borrar_en(&r, "a").unwrap().len(), 1);
  }

  #[test]
  fn un_archivo_danado_no_se_pisa_en_silencio() {
    let r = archivo_de_prueba("danado");
    fs::write(&r, "{ esto no es json").unwrap();
    assert!(leer(&r).is_err());
    assert!(guardar_en(&r, cmd("a", "A", "echo a"), 1.0).is_err());
  }
}
