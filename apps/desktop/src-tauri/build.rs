fn main() {
  // Cargar .env si existe para obtener las keys durante la compilación
  let _ = dotenvy::dotenv();
  
  // Si existe OPENAI_API_KEY en el entorno de build, la exponemos como COMPILED_OPENAI_KEY.
  if let Ok(val) = std::env::var("OPENAI_API_KEY") {
    println!("cargo:rustc-env=COMPILED_OPENAI_KEY={}", val);
  } else if let Ok(val) = std::env::var("OPENAI_API_KEY3P") {
    println!("cargo:rustc-env=COMPILED_OPENAI_KEY={}", val);
  }
  
  // Si existe CLAUDE_API_KEY en el entorno de build, la exponemos como COMPILED_CLAUDE_KEY.
  if let Ok(val) = std::env::var("CLAUDE_API_KEY") {
    println!("cargo:rustc-env=COMPILED_CLAUDE_KEY={}", val);
  } else if let Ok(val) = std::env::var("CLAUDE_CODE_API_KEY") {
    println!("cargo:rustc-env=COMPILED_CLAUDE_KEY={}", val);
  }
  
  tauri_build::build()
}
