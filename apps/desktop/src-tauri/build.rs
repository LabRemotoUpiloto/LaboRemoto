fn main() {
  // Si existe OPENAI_API_KEY en el entorno de build, la exponemos como COMPILED_OPENAI_KEY.
  if let Ok(val) = std::env::var("OPENAI_API_KEY") {
    // Evita logs en CI pero habilita el fallback en runtime si no hay env/.env.
    println!("cargo:rustc-env=COMPILED_OPENAI_KEY={}", val);
  }
  tauri_build::build()
}
