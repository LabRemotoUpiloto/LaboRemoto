#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Punto de entrada de la app Tauri en Windows/macOS/Linux.
// Nota: en release en Windows ocultamos la consola con el atributo anterior.
fn main() {
  // En Linux, WebKitGTK necesita un contexto GL/EGL funcionando para su
  // compositor acelerado (lo que usa para pintar <video>/MSE en pantalla).
  // En VMs sin passthrough 3D (VMware sin "Accelerate 3D graphics", algunas
  // config de VirtualBox/QEMU) o con drivers de GPU rotos, ese contexto
  // falla en silencio y el video de las camaras (HLS) simplemente no carga
  // -- sin que el resto de la UI se vea afectado, porque esa parte no
  // depende de GL. Forzar compositing sin aceleracion evita ese fallo a
  // costa de un poco de rendimiento visual, que para esta app (no es un
  // dashboard grafico pesado) es un cambio seguro. Debe fijarse ANTES de
  // que se inicialice el webview, por eso va aqui y no dentro de app::run().
  #[cfg(target_os = "linux")]
  {
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
      std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
  }

  // El nombre del crate (package) en Cargo.toml es "app"; aquí invocamos su inicialización.
  app::run();
}
