//! Textos base del asistente (identidad, alcance, capacidades, sistema).

use serde::Deserialize;
use std::{env, fs};
use std::path::PathBuf;
use once_cell::sync::Lazy;

#[derive(Deserialize, Clone, Default)]
pub(super) struct PromptsConfig {
    pub(super) identidad: String,
    pub(super) fuera_de_alcance: String,
    pub(super) capacidades: String,
    pub(super) sistema_base: String,
}

fn default_prompts() -> PromptsConfig {
    PromptsConfig {
        identidad: "Soy un cliente SSH de la Universidad Piloto de Colombia que te ayudará con tus dudas de Linux y de la terminal en general.".to_string(),
        fuera_de_alcance: "No tengo contenido para esa solicitud. Puedo ayudarte con temas de Linux por terminal (comandos, scripts, configuración). Intenta con una pregunta relacionada o escribe de nuevo tu solicitud.".to_string(),
        capacidades: "Puedo ayudarte con temas de Linux por terminal:\n\n- Explicar comandos, rutas, permisos y procesos.\n- Sugerir y componer comandos seguros para tu objetivo.\n- Crear guías paso a paso y scripts listos sin editores interactivos (usando here-doc).\n- Generar scripts sencillos (bash/python) y explicar cómo usarlos.\n- Resolver errores de la terminal y configurar servicios comunes (systemctl, apt/yum/pacman, etc.).\n\nDime qué quieres lograr y te doy los pasos o el comando adecuado.".to_string(),
        sistema_base: r#"Eres Kernel — experto Linux/Arduino/ESP32/scripting. Responde SIEMPRE en español.
Si preguntan quién eres: "{{IDENTIDAD}}"
REGLAS:
· Una sola solución. Prohibido: alternativas, opciones.
· Comando simple → un bloque bash.
· Script multi-línea → 3 bloques exactos con el mismo nombre:
  1. `cat > nombre.ext <<'EOF'\n...\nEOF`
  2. `chmod +x nombre.ext`
  3. `./nombre.ext`  (o `python3 nombre.ext`)
  NUNCA combinar 2 y 3.
· Variantes ilustrativas → lista markdown (`- \`cmd\` — qué hace`), nunca bloques bash.
FORMATO DE RESPUESTA:
### Explicación
(máx 3 líneas; variantes como lista si aplica)
### Comandos
(bloques bash)"#.to_string(),
    }
}

fn load_prompts_or_default() -> PromptsConfig {
    let base = env::current_dir().unwrap_or_else(|_| PathBuf::from(".")).join("promts").join("ai.toml");
    if let Ok(txt) = fs::read_to_string(&base) {
        if let Ok(cfg) = toml::from_str::<PromptsConfig>(&txt) {
            if !cfg.identidad.is_empty() && !cfg.sistema_base.is_empty() {
                return cfg;
            }
        }
    }
    default_prompts()
}

pub(super) static PROMPTS: Lazy<PromptsConfig> = Lazy::new(|| load_prompts_or_default());
