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

  // Modelo (Opcional, por si se quiere fijar en el binario). Solo si trae valor: en CI un secreto
  // sin definir llega como variable vacía y no debe quedar embebido como "".
  if let Ok(val) = std::env::var("OPENAI_MODEL") {
    if !val.trim().is_empty() {
      println!("cargo:rustc-env=COMPILED_OPENAI_MODEL={}", val.trim());
    }
  }

  // Modelo de IA (Groq) y servicio de prácticas de Linux. El instalador no trae `.env` (se compila en
  // GitHub), así que estos valores se embeben al compilar: desde el `.env` local en desarrollo y desde
  // los secretos de GitHub en el flujo de release (ver release.yml). Sin esto la versión publicada no
  // puede usar el modelo ni las prácticas.
  // DECISIÓN CONSCIENTE (2026-10): lo embebido se puede extraer del binario. Es temporal hasta que las
  // claves vivan en un servidor intermedio autenticado con Keycloak.
  for (var, baked) in [
    ("GROQ_API_KEY", "COMPILED_GROQ_KEY"),
    ("PRACTICE_LINUX_TUNNEL_HOST", "COMPILED_PRACTICE_LINUX_TUNNEL_HOST"),
    ("PRACTICE_LINUX_TUNNEL_PORT", "COMPILED_PRACTICE_LINUX_TUNNEL_PORT"),
    ("PRACTICE_LINUX_TUNNEL_USER", "COMPILED_PRACTICE_LINUX_TUNNEL_USER"),
    ("PRACTICE_LINUX_TUNNEL_PASSWORD", "COMPILED_PRACTICE_LINUX_TUNNEL_PASSWORD"),
    ("PRACTICE_LINUX_API_REMOTE_PORT", "COMPILED_PRACTICE_LINUX_API_REMOTE_PORT"),
    ("PRACTICE_LINUX_API_TOKEN", "COMPILED_PRACTICE_LINUX_API_TOKEN"),
    ("PRACTICE_LINUX_SSH_HOST", "COMPILED_PRACTICE_LINUX_SSH_HOST"),
    ("PRACTICE_LINUX_SSH_PORT", "COMPILED_PRACTICE_LINUX_SSH_PORT"),
  ] {
    println!("cargo:rerun-if-env-changed={}", var);
    if let Ok(val) = std::env::var(var) {
      let val = val.trim();
      if !val.is_empty() {
        println!("cargo:rustc-env={}={}", baked, val);
      }
    }
  }

  tauri_build::build()
}
