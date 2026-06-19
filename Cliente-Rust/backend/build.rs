fn main() {
  // 1. Intentar cargar .env de la raíz (común en este proyecto) o de la carpeta actual
  println!("cargo:rerun-if-changed=.env");
  println!("cargo:rerun-if-changed=../.env");
  
  // Variables que gatillan recompilación si cambian en el entorno
  println!("cargo:rerun-if-env-changed=OPENAI_API_KEY");
  println!("cargo:rerun-if-env-changed=CLAUDE_API_KEY");
  println!("cargo:rerun-if-env-changed=OPENROUTER_API_KEY");
  println!("cargo:rerun-if-env-changed=MOODLE_TOKEN");
  println!("cargo:rerun-if-env-changed=OPENAI_MODEL");

  // Cargar .env (dotenvy camina hacia arriba automáticamente)
  let _ = dotenvy::dotenv();
  
  // Si no se encontró arriba, intentar específicamente en la raíz
  if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
      let root = std::path::Path::new(&manifest_dir).parent();
      if let Some(path) = root {
          let _ = dotenvy::from_path(path.join(".env"));
          let _ = dotenvy::from_path(path.join(".env.practicas"));
      }
  }

  // --- Exportar variables para "embeberlas" en el binario ---

  // OpenAI
  if let Ok(val) = std::env::var("OPENAI_API_KEY") {
    println!("cargo:rustc-env=COMPILED_OPENAI_KEY={}", val);
  } else if let Ok(val) = std::env::var("OPENAI_API_KEY3P") {
    println!("cargo:rustc-env=COMPILED_OPENAI_KEY={}", val);
  }
  
  // Claude / Anthropic
  if let Ok(val) = std::env::var("CLAUDE_API_KEY") {
    println!("cargo:rustc-env=COMPILED_CLAUDE_KEY={}", val);
  } else if let Ok(val) = std::env::var("CLAUDE_CODE_API_KEY") {
    println!("cargo:rustc-env=COMPILED_CLAUDE_KEY={}", val);
  } else if let Ok(val) = std::env::var("ANTHROPIC_API_KEY") {
    println!("cargo:rustc-env=COMPILED_CLAUDE_KEY={}", val);
  }
  
  // OpenRouter
  if let Ok(val) = std::env::var("OPENROUTER_API_KEY") {
    println!("cargo:rustc-env=COMPILED_OPENROUTER_KEY={}", val);
  }

  // Moodle
  if let Ok(val) = std::env::var("MOODLE_URL") {
    println!("cargo:rustc-env=COMPILED_MOODLE_URL={}", val);
  }
  if let Ok(val) = std::env::var("MOODLE_TOKEN") {
    println!("cargo:rustc-env=COMPILED_MOODLE_TOKEN={}", val);
  }

  // Modelo (Opcional, por si se quiere fijar en el binario)
  if let Ok(val) = std::env::var("OPENAI_MODEL") {
    println!("cargo:rustc-env=COMPILED_OPENAI_MODEL={}", val);
  }

  tauri_build::build()
}
