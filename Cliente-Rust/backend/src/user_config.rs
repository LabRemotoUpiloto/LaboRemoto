//! Configuración por máquina de la app instalada.
//!
//! El instalador no trae `.env` (se descarga de GitHub y no puede llevar claves), y la ruta que
//! `load_dotenv()` busca está congelada al compilar y apunta al runner de CI. Sin esto, la versión
//! publicada no tiene la clave del modelo de IA (`GROQ_API_KEY`) ni los datos del servicio de
//! prácticas (`PRACTICE_LINUX_*`).
//!
//! Solución: la app lee un archivo `.env` de su carpeta de configuración, que se reparte a los
//! alumnos por un canal privado (no va en el instalador ni en el repositorio):
//!
//!   - Windows: `%APPDATA%\co.unipiloto.sshclient\.env`
//!   - Linux:   `~/.config/co.unipiloto.sshclient/.env`
//!   - macOS:   `~/Library/Application Support/co.unipiloto.sshclient/.env`
//!   - (también se acepta un `.env` junto al ejecutable)
//!
//! Una variable ya definida en el entorno del proceso (o en el `.env` de desarrollo, que se carga
//! antes) NO se pisa: este archivo solo rellena lo que falta.
//!
//! TEMPORAL: las claves siguen estando en cada equipo. El reemplazo correcto es un servidor
//! intermedio autenticado con Keycloak que las guarde (como el broker de cámaras).

use std::path::{Path, PathBuf};

/// Mismo identificador que `tauri.conf.json` -> `identifier`; es el nombre de la carpeta de
/// configuración que usa Tauri (`app_config_dir`).
pub const APP_ID: &str = "co.unipiloto.sshclient";

/// Carpeta donde el alumno debe dejar el archivo `.env`.
pub fn carpeta_config() -> Option<PathBuf> {
    directories::BaseDirs::new().map(|d| d.config_dir().join(APP_ID))
}

/// Archivos `.env` que se leen, en orden de prioridad (el primero que defina una variable gana).
pub fn archivos_env() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(c) = carpeta_config() {
        v.push(c.join(".env"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            v.push(dir.join(".env"));
        }
    }
    v
}

/// Bytes del archivo como UTF-8 limpio. Un `.env` repartido a alumnos suele pasar por el Bloc de
/// notas o por PowerShell (`>` guarda en UTF-16 con BOM): sin esto el lector lo ignoraría sin
/// avisar, o perdería la primera variable por el BOM.
fn normalizar(bytes: &[u8]) -> Vec<u8> {
    let utf16 = |datos: &[u8], le: bool| -> Vec<u8> {
        let unidades: Vec<u16> = datos
            .chunks_exact(2)
            .map(|c| if le { u16::from_le_bytes([c[0], c[1]]) } else { u16::from_be_bytes([c[0], c[1]]) })
            .collect();
        String::from_utf16_lossy(&unidades).into_bytes()
    };
    match bytes {
        [0xFF, 0xFE, resto @ ..] => utf16(resto, true),
        [0xFE, 0xFF, resto @ ..] => utf16(resto, false),
        [0xEF, 0xBB, 0xBF, resto @ ..] => resto.to_vec(),
        _ => bytes.to_vec(),
    }
}

/// Carga los archivos existentes de `archivos`. Devuelve cuáles se cargaron.
pub fn cargar_desde(archivos: &[PathBuf]) -> Vec<PathBuf> {
    let mut cargados = Vec::new();
    for p in archivos {
        if !Path::new(p).is_file() {
            continue;
        }
        let Ok(bytes) = std::fs::read(p) else { continue };
        if dotenvy::from_read(normalizar(&bytes).as_slice()).is_ok() {
            cargados.push(p.clone());
        }
    }
    cargados
}

/// Se llama al arrancar, después del `.env` de desarrollo.
pub fn cargar() {
    cargar_desde(&archivos_env());
}

/// Texto para los mensajes de error: dónde debe estar el archivo.
pub fn donde_ponerlo() -> String {
    match carpeta_config() {
        Some(c) => format!("{}{}.env", c.display(), std::path::MAIN_SEPARATOR),
        None => format!("la carpeta de configuración de la app ({APP_ID})"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporal(nombre: &str, contenido: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("user_config_test_{}_{}", std::process::id(), nombre));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join(".env");
        std::fs::write(&p, contenido).unwrap();
        p
    }

    #[test]
    fn rellena_las_variables_que_faltan() {
        let p = temporal("a", "UC_TEST_FALTANTE=desde-archivo\n");
        std::env::remove_var("UC_TEST_FALTANTE");
        assert_eq!(cargar_desde(&[p.clone()]), vec![p]);
        assert_eq!(std::env::var("UC_TEST_FALTANTE").unwrap(), "desde-archivo");
    }

    #[test]
    fn no_pisa_lo_que_ya_estaba_definido() {
        let p = temporal("b", "UC_TEST_EXISTENTE=del-archivo\n");
        std::env::set_var("UC_TEST_EXISTENTE", "del-entorno");
        cargar_desde(&[p]);
        assert_eq!(std::env::var("UC_TEST_EXISTENTE").unwrap(), "del-entorno");
    }

    #[test]
    fn el_primer_archivo_gana_y_los_que_no_existen_se_ignoran() {
        let primero = temporal("c1", "UC_TEST_ORDEN=primero\n");
        let segundo = temporal("c2", "UC_TEST_ORDEN=segundo\nUC_TEST_SOLO_SEGUNDO=ok\n");
        let no_existe = std::env::temp_dir().join("user_config_test_no_existe").join(".env");
        std::env::remove_var("UC_TEST_ORDEN");
        std::env::remove_var("UC_TEST_SOLO_SEGUNDO");
        let cargados = cargar_desde(&[no_existe, primero.clone(), segundo.clone()]);
        assert_eq!(cargados, vec![primero, segundo]);
        assert_eq!(std::env::var("UC_TEST_ORDEN").unwrap(), "primero");
        assert_eq!(std::env::var("UC_TEST_SOLO_SEGUNDO").unwrap(), "ok");
    }

    fn temporal_bytes(nombre: &str, contenido: &[u8]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("user_config_test_{}_{}", std::process::id(), nombre));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join(".env");
        std::fs::write(&p, contenido).unwrap();
        p
    }

    #[test]
    fn acepta_utf8_con_bom_y_saltos_de_windows() {
        let mut datos = vec![0xEF, 0xBB, 0xBF];
        datos.extend_from_slice(b"UC_TEST_BOM=primera
UC_TEST_BOM2=segunda
");
        let p = temporal_bytes("bom", &datos);
        std::env::remove_var("UC_TEST_BOM");
        std::env::remove_var("UC_TEST_BOM2");
        assert_eq!(cargar_desde(&[p.clone()]), vec![p]);
        assert_eq!(std::env::var("UC_TEST_BOM").unwrap(), "primera");
        assert_eq!(std::env::var("UC_TEST_BOM2").unwrap(), "segunda");
    }

    #[test]
    fn acepta_utf16_como_lo_guarda_powershell() {
        let texto = "UC_TEST_U16=desde-utf16
UC_TEST_U16B=ñandú
";
        let mut datos = vec![0xFF, 0xFE];
        for u in texto.encode_utf16() {
            datos.extend_from_slice(&u.to_le_bytes());
        }
        let p = temporal_bytes("u16", &datos);
        std::env::remove_var("UC_TEST_U16");
        std::env::remove_var("UC_TEST_U16B");
        assert_eq!(cargar_desde(&[p.clone()]), vec![p]);
        assert_eq!(std::env::var("UC_TEST_U16").unwrap(), "desde-utf16");
        assert_eq!(std::env::var("UC_TEST_U16B").unwrap(), "ñandú");
    }

    #[test]
    fn la_carpeta_usa_el_identificador_de_la_app() {
        let esperado = std::path::Path::new(APP_ID).join(".env");
        let ruta = donde_ponerlo();
        assert!(ruta.ends_with(esperado.to_str().unwrap()), "{ruta}");
        assert!(archivos_env().iter().any(|p| p.ends_with(esperado.as_path())));
    }
}
