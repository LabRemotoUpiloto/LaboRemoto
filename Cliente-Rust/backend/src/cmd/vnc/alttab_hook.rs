//! cmd/vnc/alttab_hook.rs — Hook de teclado de bajo nivel (Windows) para
//! capturar Alt+Tab físico mientras el canvas del escritorio remoto tiene
//! foco, y reenviarlo a la sesión VNC en vez de dejar que Windows abra su
//! propio selector de tareas (que se traga la tecla antes de que el WebView2
//! la vea — por eso Alt+Tab nunca llegaba al escritorio remoto).
//!
//! Seguridad: WH_KEYBOARD_LL es un hook GLOBAL — ve las teclas de todas las
//! apps del sistema, no solo las nuestras. Por eso solo suprimimos Tab+Alt
//! cuando SE CUMPLEN LAS DOS:
//!   1) `set_focused_session` marcó una sesión como "se está mirando la vista
//!      de escritorio remoto ahora mismo" (lo llama el frontend), Y
//!   2) la ventana en primer plano del SO pertenece a NUESTRO proceso
//!      (comparamos PID via GetWindowThreadProcessId, no el HWND exacto —
//!      WebView2 puede tener su propia superficie/HWND para el contenido que
//!      no coincide bit a bit con el HWND del frame nativo de Tauri, así que
//!      comparar por proceso es más robusto que comparar por HWND).
//! Si cualquiera de las dos falla, la tecla sigue su curso normal — Alt+Tab
//! funciona como siempre en cualquier otra ventana, y también en la nuestra
//! si el usuario no tiene el foco puesto en el escritorio remoto.
//!
//! El hilo que instala el hook vive todo el ciclo de vida de la app (no se
//! desinstala hasta cerrar el proceso); lo que se activa/desactiva por
//! sesión es únicamente el flag `FOCUSED_SESSION`, así que no hay carreras
//! de instalar/desinstalar el hook en cada cambio de foco.

#![cfg(target_os = "windows")]

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::VK_TAB;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId,
    SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, KBDLLHOOKSTRUCT, LLKHF_ALTDOWN, MSG,
    WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static FOCUSED_SESSION: Mutex<Option<String>> = Mutex::new(None);

// Contadores de diagnóstico — se incrementan en el camino caliente del hook
// (solo un fetch_add atómico, sin I/O) y se vuelcan a consola desde
// `set_focused_session` (que NO es camino caliente), para no repetir el
// problema de logging síncrono dentro del hook mismo.
static CNT_SUPRIMIDO: AtomicU32 = AtomicU32::new(0);
static CNT_SIN_SESION: AtomicU32 = AtomicU32::new(0);
static CNT_OTRA_VENTANA: AtomicU32 = AtomicU32::new(0);

/// Arranca el hilo del hook. Idempotente (llamar más de una vez no crea
/// hilos duplicados) — se invoca una sola vez desde `setup()` en lib.rs.
pub fn init(app: AppHandle) {
    if APP_HANDLE.set(app).is_err() {
        return; // ya inicializado
    }
    if let Err(e) = std::thread::Builder::new()
        .name("vnc-alttab-hook".into())
        .spawn(hook_thread_main)
    {
        eprintln!("[vnc] no se pudo lanzar el hilo del hook Alt+Tab: {e}");
    }
}

/// Marca (o desmarca) qué sesión VNC tiene el foco del canvas ahora mismo.
/// `None` desactiva la captura nativa por completo.
pub fn set_focused_session(session_id: Option<String>) {
    eprintln!(
        "[vnc] set_focused_session({session_id:?}) — contadores hasta ahora: suprimido={} sin_sesion={} otra_ventana={}",
        CNT_SUPRIMIDO.load(Ordering::Relaxed),
        CNT_SIN_SESION.load(Ordering::Relaxed),
        CNT_OTRA_VENTANA.load(Ordering::Relaxed),
    );
    if let Ok(mut guard) = FOCUSED_SESSION.lock() {
        *guard = session_id;
    }
}

/// `true` si la ventana en primer plano del SO pertenece a este proceso.
/// Sin logging — este chequeo vive en el camino caliente del hook, que debe
/// responder en microsegundos; cualquier I/O (incluido escribir a stderr)
/// puede ser suficiente para que Windows procese la tecla antes de que
/// nuestro LRESULT(1) de supresión llegue a tiempo.
unsafe fn foreground_is_ours() -> bool {
    let fg = GetForegroundWindow();
    if fg.0.is_null() {
        return false;
    }
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(fg, Some(&mut pid));
    pid == std::process::id()
}

fn hook_thread_main() {
    unsafe {
        let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), None, 0) {
            Ok(h) => h,
            // No se pudo instalar el hook (raro, pero no debe tumbar la app):
            // Alt+Tab seguirá sin funcionar dentro del escritorio remoto,
            // pero todo lo demás sigue operando normal.
            Err(e) => {
                eprintln!("[vnc] SetWindowsHookExW falló: {e}");
                return;
            }
        };
        eprintln!("[vnc] hook Alt+Tab instalado correctamente");

        // WH_KEYBOARD_LL requiere una bomba de mensajes activa en el hilo
        // que instaló el hook para que Windows siga entregando eventos.
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        let _ = UnhookWindowsHookEx(hook);
    }
}

unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        if let Some(result) = try_intercept(wparam, lparam) {
            return result;
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

/// `Some(LRESULT(1))` = suprimir la tecla (ya la reenviamos nosotros al
/// escritorio remoto vía evento). `None` = dejarla seguir su curso normal.
/// Sin logging en este camino — ver nota en `foreground_is_ours`.
unsafe fn try_intercept(wparam: WPARAM, lparam: LPARAM) -> Option<LRESULT> {
    let info = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
    if info.vkCode != VK_TAB.0 as u32 {
        return None;
    }
    let alt_down = (info.flags.0 & LLKHF_ALTDOWN.0) != 0;
    if !alt_down {
        return None; // Tab suelto (sin Alt) — lo maneja el flujo normal en JS
    }

    let app = APP_HANDLE.get()?;
    let session_id = match FOCUSED_SESSION.lock().ok().and_then(|g| g.clone()) {
        Some(id) => id,
        None => {
            CNT_SIN_SESION.fetch_add(1, Ordering::Relaxed);
            return None;
        }
    };
    if !foreground_is_ours() {
        CNT_OTRA_VENTANA.fetch_add(1, Ordering::Relaxed);
        return None;
    }

    let msg = wparam.0 as u32;
    let down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    let up = msg == WM_KEYUP || msg == WM_SYSKEYUP;
    if !down && !up {
        return None;
    }
    CNT_SUPRIMIDO.fetch_add(1, Ordering::Relaxed);

    // Shift no hace falta reenviarlo aquí: si estaba físicamente presionado
    // (Alt+Shift+Tab, para ciclar en reversa), Windows no lo intercepta como
    // Alt+Tab sí — ya llegó al DOM por el camino normal y el listener de
    // teclado de DesktopPane.tsx ya se lo mandó al VNC antes de que el
    // usuario pudiera físicamente presionar Tab.
    let _ = app.emit(
        &format!("vnc-alttab-key-{session_id}"),
        serde_json::json!({ "down": down }),
    );

    Some(LRESULT(1))
}
