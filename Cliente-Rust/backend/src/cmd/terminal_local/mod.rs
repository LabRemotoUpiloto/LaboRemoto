//! cmd/terminal_local — Terminal local embebida (PTY nativa)
//!
//! Comandos Tauri que exponen una terminal local (no SSH) mediante
//! `portable-pty`: cada panel del frontend (ver `LocalTerminalGroup.tsx`)
//! es una sesión PTY independiente aquí — el multiplexado/splits en varios
//! paneles es un concern de layout del frontend, no de este backend.

use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::cmd::protocol::{CommandError, CommandRequest, CommandResponse};
use crate::cmd::state::local_terminal::LocalTermSession;
use crate::cmd::state::LOCAL_TERM_SESSIONS;

// ── Payloads/responses (mismo estilo que cmd::ssh::terminal) ────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalTermSpawnPayload {
  pub id: Option<String>,
  pub cols: u32,
  pub rows: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalTermSpawnResponse {
  pub session_id: String,
  pub shell: String,
  pub user: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalTermStdinPayload {
  pub id: String,
  pub data: String,
  pub encoding: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LocalTermStdinResponse {
  pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalTermResizePayload {
  pub id: String,
  pub cols: u32,
  pub rows: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LocalTermResizeResponse {
  pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalTermClosePayload {
  pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LocalTermCloseResponse {
  pub ok: bool,
}

// ── Resolución de shell/cwd (sin crates nuevos) ──────────────────────────────

fn command_exists_on_path(cmd: &str) -> bool {
  let Some(path_var) = std::env::var_os("PATH") else { return false; };
  let exts: Vec<String> = if cfg!(windows) {
    std::env::var("PATHEXT")
      .unwrap_or_else(|_| ".EXE;.CMD;.BAT".to_string())
      .split(';')
      .map(|s| s.to_string())
      .collect()
  } else {
    vec![String::new()]
  };
  std::env::split_paths(&path_var).any(|dir| {
    exts.iter().any(|ext| dir.join(format!("{cmd}{ext}")).is_file())
  })
}

/// Windows: prefiere `pwsh` (PowerShell 7) si está en PATH, si no cae a
/// `powershell.exe`. Linux/macOS: usa la `$SHELL` del usuario, fallback `bash`.
fn resolve_shell() -> String {
  if cfg!(target_os = "windows") {
    if command_exists_on_path("pwsh") { "pwsh".to_string() } else { "powershell.exe".to_string() }
  } else {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
  }
}

fn home_dir() -> Option<std::path::PathBuf> {
  if cfg!(target_os = "windows") {
    std::env::var_os("USERPROFILE").map(std::path::PathBuf::from)
  } else {
    std::env::var_os("HOME").map(std::path::PathBuf::from)
  }
}

// ── Hilos lector + emisor de la PTY ─────────────────────────────────────────

/// Reenvía la salida de la PTY al frontend, bufferizando lo emitido antes de
/// que la UI esté lista (mismo patrón que la sesión SSH). Dos hilos dedicados
/// (viven toda la sesión, como `VncSessionState::bridge_thread`):
///
/// - **Lector**: solo hace `read()` bloqueante y encola los bytes crudos.
/// - **Emisor**: coalesce lo que ya esté encolado (`try_recv` sin dormir —
///   cero latencia añadida para tipeo interactivo, pero durante salida
///   pesada agrupa muchos reads pequeños en un solo evento Tauri en vez de
///   miles de eventos IPC), separa cualquier sufijo UTF-8 incompleto para
///   el siguiente lote (un `read()` de 8 KB puede partir un carácter
///   multibyte → antes salían `�` con tildes/ñ) y emite.
fn spawn_reader_thread(
  app: AppHandle,
  id: String,
  mut reader: Box<dyn Read + Send>,
  out_buffer: Arc<Mutex<Option<String>>>,
  ui_ready: Arc<AtomicBool>,
) {
  let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();

  std::thread::spawn(move || {
    let mut buf = [0u8; 8192];
    loop {
      match reader.read(&mut buf) {
        Ok(0) => break,
        Ok(n) => {
          if tx.send(buf[..n].to_vec()).is_err() {
            break;
          }
        }
        Err(_) => break,
      }
    }
    // Al soltar `tx`, el emisor sale de su loop y emite el evento de exit.
  });

  std::thread::spawn(move || {
    const MAX_BATCH: usize = 64 * 1024;
    let mut carry: Vec<u8> = Vec::new();

    let emit_str = |s: String| {
      if s.is_empty() {
        return;
      }
      if ui_ready.load(Ordering::SeqCst) {
        let _ = app.emit(&format!("local_term_out_{}", id), Some(s));
      } else if let Ok(mut opt) = out_buffer.lock() {
        let bufref = opt.get_or_insert_with(String::new);
        bufref.push_str(&s);
      }
    };

    while let Ok(first) = rx.recv() {
      let mut chunk = std::mem::take(&mut carry);
      chunk.extend_from_slice(&first);
      while chunk.len() < MAX_BATCH {
        match rx.try_recv() {
          Ok(more) => chunk.extend_from_slice(&more),
          Err(_) => break,
        }
      }

      let s = match std::str::from_utf8(&chunk) {
        Ok(v) => v.to_string(),
        Err(e) if e.error_len().is_none() => {
          // Sufijo multibyte incompleto: emitir la parte válida y acarrear
          // los bytes finales (máx. 3) al siguiente lote.
          let valid = e.valid_up_to();
          carry = chunk[valid..].to_vec();
          String::from_utf8_lossy(&chunk[..valid]).into_owned()
        }
        Err(_) => String::from_utf8_lossy(&chunk).into_owned(),
      };
      emit_str(s);
    }

    if !carry.is_empty() {
      emit_str(String::from_utf8_lossy(&carry).into_owned());
    }
    let _ = app.emit(&format!("local_term_exit_{}", id), Some(()));
  });
}

// ── Comandos ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn local_term_spawn(
  app: AppHandle,
  req: CommandRequest<LocalTermSpawnPayload>,
) -> Result<CommandResponse<LocalTermSpawnResponse>, CommandError> {
  let started = std::time::Instant::now();
  let LocalTermSpawnPayload { id, cols, rows } = req.payload;
  let result = local_term_spawn_impl(app, id, cols, rows).await;
  let elapsed_ms = started.elapsed().as_millis() as i64;
  match result {
    Ok(data) => Ok(CommandResponse::success(req.id, req.version, data, elapsed_ms)),
    Err(e) => Ok(CommandResponse::error(req.id, req.version, e, None)),
  }
}

async fn local_term_spawn_impl(app: AppHandle, requested_id: Option<String>, cols: u32, rows: u32) -> Result<LocalTermSpawnResponse, CommandError> {
  let shell = resolve_shell();
  let id = requested_id.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| Uuid::new_v4().to_string());
  let user = whoami::username();

  let shell_for_thread = shell.clone();
  let id_for_thread = id.clone();
  let safe_cols = cols.max(10);
  let safe_rows = rows.max(5);

  tokio::task::spawn_blocking(move || -> Result<(), String> {
    // Si ya existe una sesión con este id (ej. doble montaje de React
    // StrictMode en dev, o remount del panel), matar la anterior antes de
    // crear la nueva: `map.insert` con el mismo id la pisaría dejando una
    // shell zombie cuyo hilo lector seguiría emitiendo al mismo canal
    // (salida duplicada en pantalla).
    let previous = {
      let mut map = LOCAL_TERM_SESSIONS.lock().map_err(|e| e.to_string())?;
      map.remove(&id_for_thread)
    };
    if let Some(mut old) = previous {
      let _ = old.child.kill();
      let _ = old.child.wait();
    }

    let pty_system = native_pty_system();
    let pair = pty_system
      .openpty(PtySize { rows: safe_rows as u16, cols: safe_cols as u16, pixel_width: 0, pixel_height: 0 })
      .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(&shell_for_thread);
    if let Some(home) = home_dir() {
      cmd.cwd(home);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    // En Unix, un fd del lado slave abierto en el proceso padre impide que
    // el reader vea EOF cuando la shell termina — soltarlo apenas se spawnea.
    drop(pair.slave);

    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let out_buffer: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(Some(String::new())));
    let ui_ready = Arc::new(AtomicBool::new(false));

    {
      let mut map = LOCAL_TERM_SESSIONS.lock().map_err(|e| e.to_string())?;
      map.insert(id_for_thread.clone(), LocalTermSession {
        master: pair.master,
        writer: Arc::new(Mutex::new(writer)),
        child,
        ui_ready: ui_ready.clone(),
        out_buffer: out_buffer.clone(),
        shell_label: shell_for_thread.clone(),
      });
    }

    spawn_reader_thread(app.clone(), id_for_thread, reader, out_buffer, ui_ready);

    Ok(())
  })
  .await
  .map_err(|e| CommandError::internal("JOIN_ERROR", e.to_string()))?
  .map_err(|e| CommandError::permanent("LOCAL_TERM_SPAWN_FAILED", e))?;

  Ok(LocalTermSpawnResponse { session_id: id, shell, user })
}

#[tauri::command]
pub async fn local_term_ui_ready(app: AppHandle, id: String) -> Result<(), String> {
  let (out_buffer, ui_ready) = {
    let map = LOCAL_TERM_SESSIONS.lock().map_err(|e| e.to_string())?;
    let sess = map.get(&id).ok_or_else(|| "Terminal local no encontrada".to_string())?;
    (sess.out_buffer.clone(), sess.ui_ready.clone())
  };

  ui_ready.store(true, Ordering::SeqCst);
  if let Ok(mut opt) = out_buffer.lock() {
    if let Some(pending) = opt.take() {
      if !pending.is_empty() {
        let _ = app.emit(&format!("local_term_out_{}", id), Some(pending));
      }
    }
  }
  Ok(())
}

#[tauri::command]
pub async fn local_term_stdin(
  req: CommandRequest<LocalTermStdinPayload>,
) -> Result<CommandResponse<LocalTermStdinResponse>, CommandError> {
  let started = std::time::Instant::now();
  let LocalTermStdinPayload { id, data, encoding } = req.payload;
  let result = local_term_stdin_impl(id, data, encoding).await;
  let elapsed_ms = started.elapsed().as_millis() as i64;
  match result {
    Ok(_) => Ok(CommandResponse::success(req.id, req.version, LocalTermStdinResponse { ok: true }, elapsed_ms)),
    Err(e) => Ok(CommandResponse::error(req.id, req.version, e, None)),
  }
}

async fn local_term_stdin_impl(id: String, data: String, encoding: Option<String>) -> Result<(), CommandError> {
  let bytes = if encoding.as_deref() == Some("base64") {
    STANDARD.decode(&data).map_err(|_| CommandError::permanent("BASE64_DECODE_ERROR", "Error decodificando base64"))?
  } else {
    data.into_bytes()
  };

  let writer = {
    let map = LOCAL_TERM_SESSIONS.lock().map_err(|e| CommandError::internal("LOCK_ERROR", e.to_string()))?;
    let sess = map.get(&id).ok_or_else(|| CommandError::permanent("LOCAL_TERM_NOT_FOUND", "Terminal local no encontrada"))?;
    sess.writer.clone()
  };

  tokio::task::spawn_blocking(move || -> Result<(), String> {
    let mut w = writer.lock().map_err(|e| e.to_string())?;
    w.write_all(&bytes).map_err(|e| e.to_string())?;
    w.flush().map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| CommandError::internal("JOIN_ERROR", e.to_string()))?
  .map_err(|e| CommandError::internal("PTY_WRITE_ERROR", e))?;

  Ok(())
}

#[tauri::command]
pub async fn local_term_resize(
  req: CommandRequest<LocalTermResizePayload>,
) -> Result<CommandResponse<LocalTermResizeResponse>, CommandError> {
  let started = std::time::Instant::now();
  let LocalTermResizePayload { id, cols, rows } = req.payload;
  let result = local_term_resize_impl(id, cols, rows);
  let elapsed_ms = started.elapsed().as_millis() as i64;
  match result {
    Ok(_) => Ok(CommandResponse::success(req.id, req.version, LocalTermResizeResponse { ok: true }, elapsed_ms)),
    Err(e) => Ok(CommandResponse::error(req.id, req.version, e, None)),
  }
}

fn local_term_resize_impl(id: String, cols: u32, rows: u32) -> Result<(), CommandError> {
  let map = LOCAL_TERM_SESSIONS.lock().map_err(|e| CommandError::internal("LOCK_ERROR", e.to_string()))?;
  let sess = map.get(&id).ok_or_else(|| CommandError::permanent("LOCAL_TERM_NOT_FOUND", "Terminal local no encontrada"))?;
  sess.master
    .resize(PtySize { rows: rows as u16, cols: cols as u16, pixel_width: 0, pixel_height: 0 })
    .map_err(|e| CommandError::internal("PTY_RESIZE_ERROR", e.to_string()))?;
  Ok(())
}

#[tauri::command]
pub async fn local_term_close(
  req: CommandRequest<LocalTermClosePayload>,
) -> Result<CommandResponse<LocalTermCloseResponse>, CommandError> {
  let started = std::time::Instant::now();
  let LocalTermClosePayload { id } = req.payload;
  let result = local_term_close_impl(id).await;
  let elapsed_ms = started.elapsed().as_millis() as i64;
  match result {
    Ok(_) => Ok(CommandResponse::success(req.id, req.version, LocalTermCloseResponse { ok: true }, elapsed_ms)),
    Err(e) => Ok(CommandResponse::error(req.id, req.version, e, None)),
  }
}

async fn local_term_close_impl(id: String) -> Result<(), CommandError> {
  let mut session = {
    let mut map = LOCAL_TERM_SESSIONS.lock().map_err(|e| CommandError::internal("LOCK_ERROR", e.to_string()))?;
    map.remove(&id).ok_or_else(|| CommandError::permanent("LOCAL_TERM_NOT_FOUND", "Terminal local no encontrada"))?
  };

  tokio::task::spawn_blocking(move || {
    let _ = session.child.kill();
    let _ = session.child.wait();
  })
  .await
  .map_err(|e| CommandError::internal("JOIN_ERROR", e.to_string()))?;

  Ok(())
}

/// Mata todas las sesiones PTY locales vivas. Llamado desde `on_window_event`
/// (`lib.rs`) al cerrar la ventana — en Windows los procesos hijos NO mueren
/// automáticamente con el padre, así que sin esto quedarían shells huérfanas.
pub fn cleanup_all_local_term_sessions() {
  let sessions: Vec<LocalTermSession> = match LOCAL_TERM_SESSIONS.lock() {
    Ok(mut map) => map.drain().map(|(_, s)| s).collect(),
    Err(_) => return,
  };
  for mut s in sessions {
    let _ = s.child.kill();
  }
}

// ── Portapapeles nativo ──────────────────────────────────────────────────────
//
// El webview NO tiene `navigator.clipboard`: en Windows la app corre en
// http://tauri.localhost, que no es un contexto seguro, así que la API async
// de clipboard del navegador directamente no existe. Todo el copiar/pegar del
// menú contextual y los atajos pasa por estos comandos (arboard).

/// Resultado de leer el portapapeles nativo.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ClipboardContent {
  /// Había una imagen: se guardó como PNG temporal y esta es su ruta absoluta.
  Image { path: String },
  /// Había texto.
  Text { text: String },
  /// Portapapeles vacío o con un formato no soportado.
  Empty,
}

fn paste_images_dir() -> Result<std::path::PathBuf, String> {
  let dir = std::env::temp_dir().join("laboremoto-pegados");
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir)
}

fn paste_image_path() -> Result<std::path::PathBuf, String> {
  let ts = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0);
  Ok(paste_images_dir()?.join(format!("imagen-{}.png", ts)))
}

fn save_rgba_as_png(width: usize, height: usize, rgba: &[u8]) -> Result<String, String> {
  let path = paste_image_path()?;
  let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
  let w = std::io::BufWriter::new(file);
  let mut encoder = png::Encoder::new(w, width as u32, height as u32);
  encoder.set_color(png::ColorType::Rgba);
  encoder.set_depth(png::BitDepth::Eight);
  let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
  writer.write_image_data(rgba).map_err(|e| e.to_string())?;
  writer.finish().map_err(|e| e.to_string())?;
  Ok(path.to_string_lossy().into_owned())
}

/// Lee el portapapeles nativo: si hay imagen la guarda como PNG temporal
/// (pegado estilo Warp: el frontend inserta la ruta en la terminal); si hay
/// texto lo devuelve tal cual.
#[tauri::command]
pub async fn local_term_read_clipboard() -> Result<ClipboardContent, String> {
  tokio::task::spawn_blocking(|| -> Result<ClipboardContent, String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    if let Ok(img) = cb.get_image() {
      let path = save_rgba_as_png(img.width, img.height, &img.bytes)?;
      return Ok(ClipboardContent::Image { path });
    }
    if let Ok(text) = cb.get_text() {
      if !text.is_empty() {
        return Ok(ClipboardContent::Text { text });
      }
    }
    Ok(ClipboardContent::Empty)
  })
  .await
  .map_err(|e| e.to_string())?
}

/// Escribe texto al portapapeles nativo (acción "Copiar" del menú/atajo).
#[tauri::command]
pub async fn local_term_write_clipboard(text: String) -> Result<(), String> {
  tokio::task::spawn_blocking(move || -> Result<(), String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| e.to_string())?
}

/// Guarda una imagen (base64) en un archivo temporal y devuelve la ruta —
/// fallback para pegados que llegan como evento DOM `paste` con la imagen
/// en `clipboardData` (ej. Shift+Insert), donde no hace falta arboard.
#[tauri::command]
pub async fn local_term_save_paste_image(data_base64: String) -> Result<String, String> {
  const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
  let bytes = STANDARD
    .decode(data_base64.as_bytes())
    .map_err(|_| "Imagen inválida (base64)".to_string())?;
  if bytes.is_empty() {
    return Err("Imagen vacía".to_string());
  }
  if bytes.len() > MAX_IMAGE_BYTES {
    return Err("Imagen demasiado grande (máx. 20 MB)".to_string());
  }

  tokio::task::spawn_blocking(move || -> Result<String, String> {
    let path = paste_image_path()?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
  })
  .await
  .map_err(|e| e.to_string())?
}
