fn main() {
  // If EMBED_OPENAI_API_KEY is set at build time, bake it into the binary as a fallback.
  if let Ok(k) = std::env::var("EMBED_OPENAI_API_KEY") {
    println!("cargo:rustc-env=APP_EMBED_OPENAI_API_KEY={}", k);
  }
  tauri_build::build()
}
