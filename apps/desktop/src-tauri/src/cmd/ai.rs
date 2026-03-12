use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::{env, fs};
use std::path::{Path, PathBuf};
use once_cell::sync::Lazy;

#[derive(Deserialize, Clone, Default)]
struct PromptsConfig {
    identidad: String,
    fuera_de_alcance: String,
    capacidades: String,
    sistema_base: String,
}

fn default_prompts() -> PromptsConfig {
    PromptsConfig {
        identidad: "Soy un cliente SSH de la Universidad Piloto de Colombia que te ayudará con tus dudas de Linux y de la terminal en general.".to_string(),
        fuera_de_alcance: "No tengo contenido para esa solicitud. Puedo ayudarte con temas de Linux por terminal (comandos, scripts, configuración). Intenta con una pregunta relacionada o escribe de nuevo tu solicitud.".to_string(),
        capacidades: "Puedo ayudarte con temas de Linux por terminal:\n\n- Explicar comandos, rutas, permisos y procesos.\n- Sugerir y componer comandos seguros para tu objetivo.\n- Crear guías paso a paso y scripts listos sin editores interactivos (usando here-doc).\n- Generar scripts sencillos (bash/python) y explicar cómo usarlos.\n- Resolver errores de la terminal y configurar servicios comunes (systemctl, apt/yum/pacman, etc.).\n\nDime qué quieres lograr y te doy los pasos o el comando adecuado.".to_string(),
        sistema_base: r#"<instructions>
<persona>
Eres 'Kernel', un asistente experto en Linux, microcontroladores (Arduino, ESP32) y scripting.
</persona>

<critical_rules>
<rule id="identity">
Si preguntan quién eres: "{{IDENTIDAD}}"
</rule>

<rule id="single_solution">
CRÍTICO: Una única solución, NUNCA múltiples opciones.
Prohibido: "Opción 1/2/3", "Versión básica/avanzada/intermedia", "Con/Sin funciones", "Con/Sin bucle".
Entrega DIRECTAMENTE la mejor implementación.
</rule>

<rule id="here_document">
Scripts multi-línea (Python/Bash): OBLIGATORIO usar here-document.

FORMATO OBLIGATORIO - 3 bloques separados:

1. Crear archivo:
```bash
cat > script.sh <<'EOF'
(código)
EOF
```

2. Dar permisos (explicar para qué):
```bash
chmod +x script.sh
```

3. Ejecutar (explicar qué hace):
```bash
./script.sh
```

O para Python:
```bash
python3 script.py
```

CRÍTICO: NUNCA juntes chmod y ejecución. SIEMPRE 3 bloques de código separados.
Usa el MISMO nombre completo con extensión en los 3 bloques.


<rule id="output_format">
Formato OBLIGATORIO:

### Explicación
(descripción breve del objetivo - si necesitas mostrar EJEMPLOS de comandos, usa lista markdown sin bloques de código)

### Comandos

**1. Crear el archivo:**
```bash
cat > archivo.ext <<'EOF'
(código)
EOF
```

**2. Dar permisos de ejecución:**
Breve explicación de qué hace chmod +x
```bash
chmod +x archivo.ext
```

**3. Ejecutar:**
Breve explicación de qué hace ./ o python3
```bash
./archivo.ext
```
(o `python3 archivo.py` para Python)

IMPORTANTE: Cada comando en su PROPIO bloque de código separado.
</rule>

<rule id="examples_format">
Para mostrar EJEMPLOS ilustrativos de un comando (ej: variantes de 'cd' o 'ls'):
- Usa lista markdown en la sección Explicación
- NO uses bloques de código para ejemplos
- Formato: "- `comando` - descripción"
Ejemplo correcto:
### Explicación
El comando `cd` cambia de directorio:
- `cd /home/usuario` - ir a un directorio específico
- `cd ~` - ir al home del usuario
- `cd ..` - subir un nivel

### Comandos
```bash
cd /ruta/deseada
```
</rule>
</critical_rules>
</instructions>"#.to_string(),
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

static PROMPTS: Lazy<PromptsConfig> = Lazy::new(|| load_prompts_or_default());

/// Tipo de modo del chat canónico.
/// Se unifica a un solo modo 'ask' para mantener FE y BE sincronizados.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub enum ChatMode {
  #[default]
  Ask,
}

/// Estado de memoria del agente
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AgentState {
    pub cwd: String,
    pub last_exit_code: Option<i32>,
    pub last_stdout_tail: Option<String>,
    pub last_file: Option<String>,
}

/// Modelos disponibles para el chat
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum ModelSelection {
    #[serde(alias = "gpt-3.5-turbo", alias = "gpt35", alias = "chatgpt")]
    Gpt35Turbo,
    #[serde(alias = "claude-sonnet-4-6", alias = "claude-sonnet-4-6", alias = "claude", alias = "anthropic")]
    ClaudeSonnet,
}

impl Default for ModelSelection {
    fn default() -> Self {
        // Intentar obtener el modelo predeterminado de tiempo de compilación
        if let Some(baked_model) = option_env!("COMPILED_OPENAI_MODEL") {
            match baked_model.to_lowercase().as_str() {
                "gpt-3.5-turbo" | "gpt35" => return ModelSelection::Gpt35Turbo,
                "claude-sonnet-4-6" | "claude" => return ModelSelection::ClaudeSonnet,
                _ => {}
            }
        }
        ModelSelection::ClaudeSonnet
    }
}

impl ModelSelection {
    pub fn to_model_id(&self) -> &'static str {
        match self {
            ModelSelection::Gpt35Turbo => "gpt-3.5-turbo",
            ModelSelection::ClaudeSonnet => "claude-sonnet-4-6",
        }
    }
    
    pub fn is_claude(&self) -> bool {
        matches!(self, ModelSelection::ClaudeSonnet)
    }
}

/// Petición para el chat con IA
#[derive(Serialize, Deserialize)]
pub struct ChatHistoryItem {
    pub role: String,    // "user" | "assistant" | "system"
    pub content: String,
    pub timestamp: Option<i64>,
}

#[derive(Serialize, Deserialize)]
pub struct AiChatRequest {
    pub user_input: String,
    pub mode: ChatMode,
    pub history: Option<Vec<ChatHistoryItem>>,
    pub state: Option<AgentState>,
    pub model_selection: Option<ModelSelection>,
}

/// Respuesta del chat con IA
#[derive(Serialize, Deserialize)]
pub struct AiChatResponse {
    pub user_input: String,
    pub ai_response: String,
    pub code_output: Option<String>,
    pub explanation: Option<String>,
    pub summary: Option<String>,
    pub state: Option<AgentState>,
    pub requires_confirmation: bool,
    pub backup_path: Option<String>,
}

#[tauri::command]
pub async fn ai_chat(req: AiChatRequest) -> Result<AiChatResponse, String> {
  use crate::security::SecurityManager;

  
  // Cargar siempre y forzar override desde apps/.env únicamente
  force_load_single_env();
  let _security = SecurityManager::new();

  // Load proxy settings (URL and optional bearer token) from env or config files
  fn load_proxy_settings() -> (Option<String>, Option<String>) {
    let env_url = env::var("AI_PROXY_URL").ok();
    let env_auth = env::var("AI_PROXY_AUTH").ok();
    if env_url.is_some() || env_auth.is_some() {
      return (env_url, env_auth);
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(appdata) = env::var("APPDATA") {
      candidates.push(PathBuf::from(appdata).join("ssh-ai-client").join("config.json"));
    }
    if let Ok(home) = env::var("HOME") {
      candidates.push(PathBuf::from(home).join(".config").join("ssh-ai-client").join("config.json"));
    }
    if let Ok(exe) = env::current_exe() {
      let base = exe.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."));
      candidates.push(base.join("config.json"));
    }
    for path in candidates {
      if let Ok(meta) = fs::metadata(&path) {
        if meta.is_file() {
          if let Ok(txt) = fs::read_to_string(&path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&txt) {
              let url = json.get("AI_PROXY_URL").or_else(|| json.get("ai_proxy_url")).or_else(|| json.get("apiProxyUrl"))
                .and_then(|v| v.as_str()).map(|s| s.to_string());
              let auth = json.get("AI_PROXY_AUTH").or_else(|| json.get("ai_proxy_auth")).or_else(|| json.get("apiProxyAuth"))
                .and_then(|v| v.as_str()).map(|s| s.to_string());
              if url.is_some() || auth.is_some() { return (url, auth); }
            }
          }
        }
      }
    }
    (None, None)
  }

  let (cfg_proxy_url, cfg_proxy_auth) = load_proxy_settings();
  let proxy_url = cfg_proxy_url.or_else(|| env::var("AI_PROXY_URL").ok());
  let proxy_auth = cfg_proxy_auth.or_else(|| env::var("AI_PROXY_AUTH").ok());

  fn get_system_prompt(_agent_mode: &ChatMode) -> String {
    let mut s = PROMPTS.sistema_base.clone();
    s = s.replace("{{IDENTIDAD}}", &PROMPTS.identidad.replace('"', "\\\""));
    s
  }

  // Mover campos del request a variables locales para evitar clones innecesarios
  // Desestructuramos pero ignoramos el modo recibido: todos los alias se tratan como Ask.
  let AiChatRequest { user_input, mode: _incoming_mode, history, state, model_selection: req_model_selection } = req;

  // Usar modelo seleccionado por el usuario o fallback a variable de entorno
  let model_selection = req_model_selection.unwrap_or_default();
  let model_id = model_selection.to_model_id().to_string();
  
  // Determinar qué API key usar según el modelo seleccionado
  let api_key = if proxy_url.is_none() {
    if model_selection.is_claude() {
      crate::cmd::ai_utils::get_claude_api_key()
    } else {
      crate::cmd::ai_utils::get_openai_api_key()
    }
  } else { 
    None 
  };
  
  if proxy_url.is_none() && api_key.is_none() {
    let key_type = if model_selection.is_claude() { "CLAUDE_API_KEY" } else { "OPENAI_API_KEY" };
    return Err(format!("{} not set", key_type));
  }

  // Utilidades ligeras para normalización/detección
  fn strip_diacritics_basic(input: &str) -> String {
    input.chars().map(|ch| match ch {
      'á' | 'Á' => 'a',
      'é' | 'É' => 'e',
      'í' | 'Í' => 'i',
      'ó' | 'Ó' => 'o',
      'ú' | 'Ú' => 'u',
      'ñ' | 'Ñ' => 'n',
      _ => ch,
    }).collect()
  }
  fn normalize_for_checks(s: &str) -> String {
    let no_diac = strip_diacritics_basic(&s.to_lowercase());
    no_diac
      .chars()
      .map(|c| if c.is_alphanumeric() || c.is_whitespace() { c } else { ' ' })
      .collect::<String>()
      .split_whitespace()
      .collect::<Vec<_>>()
      .join(" ")
  }
  fn is_identity_query_strict(s: &str) -> bool {
    // Solo dispara con la frase literal "quien eres" (insensible a tildes, mayúsculas y puntuación final)
    let mut n = normalize_for_checks(s).trim().to_string(); // e.g., "¿Quién eres?" -> "quien eres ?"
    // Elimina signos de interrogación/exclamación al final
    if n.ends_with(" ?") { n = n.trim_end_matches(" ?").to_string(); }
    if n.ends_with('?') { n.pop(); }
    if n.ends_with('!') { n.pop(); }
    n = n.trim().to_string();
    n == "quien eres"
  }
  fn looks_like_code(s: &str) -> bool {
    let lower = s.to_lowercase();
    // Indicadores comunes de bloques de código o snippets (C/C++, Arduino, bash, Python, JS, Rust)
    lower.contains("```")
      || lower.contains("#include")
      || lower.contains("void ")
      || lower.contains("int ")
      || lower.contains("class ")
      || lower.contains("fn ")
      || lower.contains("def ")
      || lower.contains("function ")
      || lower.contains(";\n")
      || (s.contains('{') && s.contains('}'))
  }
  fn is_noise_or_out_of_domain(s: &str) -> bool {
    let t = s.trim();
    if t.is_empty() { return true; }
    // Si parece código o es multilínea, NO lo tratamos como ruido
    let line_count = t.lines().count();
    if line_count >= 3 || looks_like_code(t) { return false; }
    let simple_noise = ["?","??","???","/","//","////","...","….","…","asdf","asdfasdf","aaaa","aaaaa","jeje","jaja"]; // casos típicos
    if simple_noise.iter().any(|n| t.eq_ignore_ascii_case(n)) { return true; }
    // Relación alfanuméricos vs otros (solo para entradas cortas de 2 líneas máx.)
    if line_count <= 2 && t.len() < 80 {
      let mut alnum = 0usize; let mut other = 0usize; let mut max_run = 1usize; let mut cur_run = 1usize; let mut prev: Option<char> = None;
      for ch in t.chars() {
        if ch.is_alphanumeric() { alnum += 1; } else if !ch.is_whitespace() { other += 1; }
        if let Some(p) = prev { if p == ch { cur_run += 1; if cur_run > max_run { max_run = cur_run; } } else { cur_run = 1; } } else { cur_run = 1; }
        prev = Some(ch);
      }
      let total = alnum + other;
      if total > 0 {
        let ratio = (alnum as f32) / (total as f32);
        if ratio < 0.25 || max_run >= 6 { return true; }
      }
    }
    // Fuera de dominio: deportes, farándula, etc. (permitimos Arduino/embedded como tema técnico)
    let n = normalize_for_checks(t);
    let ood = [
      "partido","marcador","gol","futbol","nba","premier","tenis","receta","cocina","novela","fara ndula","farándula","chisme","actor","pelicula","cine","clima","horoscopo","salud","medicina","doct or","medico","medico","enfermedad"
    ];
    let domain = [
      "linux","bash","terminal","comando","comandos","script","shell","ubuntu","debian","fedora","arch","centos","red hat","systemctl","apt","yum","pacman","ssh","sftp","scp","servidor","proceso","servicio","archivo","carpeta","directorio",
      // Extensiones técnicas adicionales
      "arduino","servo","serial","ino","c++","codigo","programa","code"
    ];
    if ood.iter().any(|k| n.contains(k)) && !domain.iter().any(|k| n.contains(k)) {
      return true;
    }
    false
  }
  fn is_capabilities_query(s: &str) -> bool {
    let n = normalize_for_checks(s);
    let patterns = [
      "que puedes hacer",
      "que sabes hacer",
      "como puedes ayudar",
      "en que me puedes ayudar",
      "cuales son tus funciones",
      "que funciones tienes",
      "tus capacidades",
      "que haces",
    ];
    patterns.iter().any(|p| n.contains(p))
  }

  // Orden de evaluación previo a cualquier flujo ASK/AGENT/SUPER
  if is_identity_query_strict(&user_input) {
    return Ok(AiChatResponse {
      user_input,
      ai_response: PROMPTS.identidad.clone(),
      code_output: None,
      explanation: None,
      summary: None,
      backup_path: None,
      requires_confirmation: false,
      state: state,
    });
  }
  if is_noise_or_out_of_domain(&user_input) {
    return Ok(AiChatResponse {
      user_input,
      ai_response: PROMPTS.fuera_de_alcance.clone(),
      code_output: None,
      explanation: None,
      summary: None,
      backup_path: None,
      requires_confirmation: false,
      state: state,
    });
  }

  // Preguntas sobre capacidades/funciones del asistente
  if is_capabilities_query(&user_input) {
    return Ok(AiChatResponse {
      user_input,
      ai_response: PROMPTS.capacidades.clone(),
      code_output: None,
      explanation: None,
      summary: None,
      backup_path: None,
      requires_confirmation: false,
      state: state,
    });
  }

  let system_prompt = get_system_prompt(&ChatMode::Ask);

  // Construir historial de mensajes para OpenAI: system + historial completo del cliente + user actual
  let client = Client::builder().build().map_err(|e| e.to_string())?;
  let mut messages: Vec<serde_json::Value> = vec![serde_json::json!({"role":"system","content": system_prompt})];
  // Inyectar pista de sesión como mensaje de sistema (NO imprimir)
  if let Some(ref st) = state {
    let mut hints: Vec<String> = Vec::new();
    if !st.cwd.is_empty() { hints.push(format!("cwd={}", st.cwd)); }
    if let Some(ref f) = st.last_file { hints.push(format!("last_file={}", f)); }
    if let Some(code) = st.last_exit_code { hints.push(format!("last_exit_code={}", code)); }
    if let Some(ref tail) = st.last_stdout_tail {
      let short: String = tail.split('\n').rev().take(5).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
      if !short.trim().is_empty() { hints.push(format!("last_stdout_tail=<<\n{}\n>>", short)); }
    }
    if !hints.is_empty() {
      messages.push(serde_json::json!({"role":"system","content": format!("Contexto de sesión (NO imprimir): {}", hints.join(", "))}));
    }
  }
  if let Some(ref hist) = history {
    // OPTIMIZACIÓN: Limitar historial a los últimos N mensajes para reducir tokens
    // Mantener solo los últimos 10 mensajes (5 pares pregunta-respuesta aproximadamente)
    const MAX_HISTORY_MESSAGES: usize = 10;
    
    let start_idx = if hist.len() > MAX_HISTORY_MESSAGES {
      hist.len() - MAX_HISTORY_MESSAGES
    } else {
      0
    };
    
    let recent_history = &hist[start_idx..];
    
    if env::var("AI_HISTORY_DEBUG").unwrap_or_default() == "1" {
      eprintln!("[HISTORY] Total mensajes: {}, Enviando: {}", hist.len(), recent_history.len());
    }
    
    // API sin estado: el cliente controla y envía el historial (limitado)
    for item in recent_history.iter() {
      let role = match item.role.as_str() {
        "assistant" | "user" | "system" => item.role.clone(),
        // Fallbacks comunes
        "ai" | "bot" => "assistant".to_string(),
        _ => "user".to_string(),
      };
      messages.push(serde_json::json!({"role": role, "content": item.content.clone()}));
    }
  }
  messages.push(serde_json::json!({"role":"user","content": user_input.clone()}));

  // Build the request payload - format differs between OpenAI and Claude
  let (payload, base_url) = if model_selection.is_claude() {
    // Claude API format - extract system message and put it in separate parameter
    let mut claude_messages = Vec::new();
    let mut system_parts = Vec::new(); // Concatenar TODOS los mensajes de sistema
    
    for msg in &messages {
      if let Some(role) = msg.get("role").and_then(|v| v.as_str()) {
        if role == "system" {
          if let Some(content) = msg.get("content").and_then(|v| v.as_str()) {
            system_parts.push(content.to_string()); // Agregar en lugar de sobrescribir
          }
        } else {
          claude_messages.push(msg.clone());
        }
      }
    }
    
    // Unir todos los mensajes de sistema con doble salto de línea
    let system_content = system_parts.join("\n\n");
    
    let claude_payload = serde_json::json!({
      "model": model_id,
      "max_tokens": 800,
      "temperature": 0.1,
      "system": system_content,
      "messages": claude_messages
    });
    let claude_url = proxy_url.unwrap_or_else(|| "https://api.anthropic.com/v1/messages".to_string());
    (claude_payload, claude_url)
  } else {
    // OpenAI API format
    let openai_payload = serde_json::json!({
      "model": model_id,
      "messages": messages,
      "max_tokens": 800,
      "temperature": 0.1
    });
    let openai_url = proxy_url.unwrap_or_else(|| "https://api.openai.com/v1/chat/completions".to_string());
    (openai_payload, openai_url)
  };

  let mut req_builder = client.post(&base_url).json(&payload);
  
  // Set appropriate headers for each API
  if model_selection.is_claude() {
    req_builder = req_builder.header("anthropic-version", "2023-06-01");
    if let Some(ref token) = proxy_auth { req_builder = req_builder.header("x-api-key", token); }
    else if let Some(ref key) = api_key { req_builder = req_builder.header("x-api-key", key); }
  } else {
    if let Some(ref token) = proxy_auth { req_builder = req_builder.bearer_auth(token); }
    else if let Some(ref key) = api_key { req_builder = req_builder.bearer_auth(key); }
  }
  let resp = req_builder.send().await.map_err(|e| e.to_string())?;

  if !resp.status().is_success() {
    let status = resp.status();
    let txt = resp.text().await.unwrap_or_default();
    let api_name = if model_selection.is_claude() { "Claude API" } else { "OpenAI API" };
    return Err(format!("{} error {}: {}", api_name, status, txt));
  }

  let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

  // Extract the assistant message text based on API format
  let mut assistant_text = if model_selection.is_claude() {
    // Claude API response format
    body
      .get("content")
      .and_then(|c| c.get(0))
      .and_then(|c0| c0.get("text"))
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .to_string()
  } else {
    // OpenAI API response format
    body
      .get("choices")
      .and_then(|c| c.get(0))
      .and_then(|c0| c0.get("message"))
      .and_then(|m| m.get("content"))
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .to_string()
  };

  // (Heurísticas desactivadas por pedido: no se hará clasificación difusa de identidad)

  // Evitar identidad redundante en ASK: eliminar la frase exacta si vino pegada accidentalmente
  if !is_identity_query_strict(&user_input) {
    let mut cleaned = assistant_text.replace(&PROMPTS.identidad, "");
    // Variante con espacio antes del punto
    let ident_spaced = PROMPTS.identidad.replace(".", " .");
    cleaned = cleaned.replace(&ident_spaced, "");
    // Variante sin punto final
    let ident_nopunct = PROMPTS.identidad.trim_end_matches('.');
    cleaned = cleaned.replace(ident_nopunct, "");
    assistant_text = cleaned.trim().to_string();
  }

  // ============================================================================
  // CORRECCIONES DE TEXTO - Aplicar ANTES de cualquier validación o parseo
  // ============================================================================
  
  // Función para corregir shebangs incompletos en scripts Bash
  fn fix_incomplete_shebang(text: &str) -> String {
    use regex::Regex;
    
    let debug = env::var("AI_SHEBANG_DEBUG").unwrap_or_default() == "1";
    
    // Patrón para detectar shebangs incompletos o incorrectos
    let patterns = vec![
      (r"(?m)^#!/bin/$", "#!/bin/bash"),           // Caso exacto: #!/bin/ solo
      (r"(?m)^#!/bin$", "#!/bin/bash"),            // Sin / final
      (r"(?m)^#!bin/bash", "#!/bin/bash"),         // Falta el primer /
      (r"(?m)^#! /bin/bash", "#!/bin/bash"),       // Espacio después de #!
      (r"(?m)^#!/usr/bin/env\s*$", "#!/usr/bin/env bash"),  // env sin bash
    ];
    
    let mut result = text.to_string();
    let mut any_fix = false;
    
    for (pattern, replacement) in patterns {
      if let Ok(re) = Regex::new(pattern) {
        if re.is_match(&result) {
          if debug {
            eprintln!("[SHEBANG] ✓ Corrigiendo '{}' -> '{}'", pattern, replacement);
          }
          result = re.replace_all(&result, replacement).to_string();
          any_fix = true;
        }
      } else if debug {
         eprintln!("[SHEBANG] ⚠ Invalid regex pattern: '{}'", pattern);
      }
    }
    
    if debug && !any_fix {
      eprintln!("[SHEBANG] ℹ No se encontraron shebangs incompletos");
    }
    
    result
  }
  
  // Función para corregir nombres de archivos incompletos en comandos
  fn fix_incomplete_filenames(text: &str) -> String {
    use regex::Regex;
    
    let debug = env::var("AI_CORRECTION_DEBUG").unwrap_or_default() == "1";
    
    // Patrón para detectar comandos con nombres de archivo incompletos
    // Ejemplo: "chmod +x calculadora." → "chmod +x calculadora.sh"
    let patterns = vec![
      // chmod +x nombre. → chmod +x nombre.sh (asumimos Bash si termina en punto)
      (r"chmod\s+\+x\s+([a-zA-Z0-9_-]+)\.\s*$", "chmod +x $1.sh"),
      // ./nombre. → ./nombre.sh
      (r"\./([a-zA-Z0-9_-]+)\.\s*$", "./$1.sh"),
      // python nombre. → python nombre.py
      (r"python3?\s+([a-zA-Z0-9_-]+)\.\s*$", "python3 $1.py"),
    ];
    
    let lines: Vec<String> = text.lines().map(|line| {
      let mut corrected = line.to_string();
      let mut fixed = false;
      
      for (pattern, replacement) in &patterns {
        if let Ok(re) = Regex::new(pattern) {
          if re.is_match(&corrected) {
            if debug {
              eprintln!("[FILENAME] ✓ Corrigiendo línea: '{}'", corrected);
            }
            corrected = re.replace(&corrected, *replacement).to_string();
            fixed = true;
            if debug {
              eprintln!("[FILENAME] ✓ Resultado: '{}'", corrected);
            }
          }
        } else if debug {
             eprintln!("[FILENAME] ⚠ Invalid regex pattern: '{}'", pattern);
        }
      }
      
      if !fixed && debug && (corrected.contains("chmod") || corrected.contains("./")) {
        eprintln!("[FILENAME] ℹ Línea sin cambios: '{}'", corrected);
      }
      
      corrected
    }).collect();
    
    lines.join("\n")
  }
  
  // Aplicar correcciones
  assistant_text = fix_incomplete_shebang(&assistant_text);
  assistant_text = fix_incomplete_filenames(&assistant_text);
  
  // Log de depuración para verificar el texto final
  if env::var("AI_FINAL_TEXT_DEBUG").unwrap_or_default() == "1" {
    eprintln!("[AI] ═══ TEXTO FINAL DESPUÉS DE CORRECCIONES ═══");
    eprintln!("{}", assistant_text);
    eprintln!("[AI] ═══════════════════════════════════════════");
  }

  // Si en ASK la salida quedó vacía o parece solo identidad, reintenta una vez con instrucción más estricta (API genera el contenido)
  if !is_identity_query_strict(&user_input) {
    // Normalización con eliminación de tildes para comparar identidad de forma robusta
    fn strip_diacritics(input: &str) -> String {
      input.chars().map(|ch| match ch {
        'á' | 'Á' => 'a',
        'é' | 'É' => 'e',
        'í' | 'Í' => 'i',
        'ó' | 'Ó' => 'o',
        'ú' | 'Ú' => 'u',
        'ñ' | 'Ñ' => 'n',
        _ => ch,
      }).collect()
    }
  let ident_norm = strip_diacritics(&PROMPTS.identidad).to_lowercase();
    let norm = |s: &str| strip_diacritics(s)
      .chars()
      .map(|c| if c.is_alphanumeric() { c } else { ' ' })
      .collect::<String>()
      .to_lowercase()
      .split_whitespace()
      .collect::<Vec<_>>()
      .join(" ");
    let too_short = assistant_text.chars().filter(|c| !c.is_whitespace()).count() < 40;
    let looks_identity = norm(&assistant_text) == ident_norm;
    if assistant_text.trim().is_empty() || looks_identity || too_short {
      // Reintento con mensaje de sistema reforzado
      let mut retry_messages: Vec<serde_json::Value> = vec![
        serde_json::json!({"role":"system","content": system_prompt}),
        serde_json::json!({"role":"system","content": "Reintento: NO respondas con tu identidad. Responde en el formato obligatorio (Resumen, Guía paso a paso, Comandos sugeridos en un único bloque bash, Verificación, Notas). No digas que no puedes; explica cómo hacerlo en Linux por terminal sin ejecutar."})
      ];
      // Pistas de sesión si existían
      if let Some(ref st) = state {
        let mut hints: Vec<String> = Vec::new();
        if !st.cwd.is_empty() { hints.push(format!("cwd={}", st.cwd)); }
        if let Some(ref f) = st.last_file { hints.push(format!("last_file={}", f)); }
        if let Some(code) = st.last_exit_code { hints.push(format!("last_exit_code={}", code)); }
        if let Some(ref tail) = st.last_stdout_tail { let short: String = tail.split('\n').rev().take(5).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n"); if !short.trim().is_empty() { hints.push(format!("last_stdout_tail=<<\n{}\n>>", short)); } }
        if !hints.is_empty() {
          retry_messages.push(serde_json::json!({"role":"system","content": format!("Contexto de sesión (NO imprimir): {}", hints.join(", "))}));
        }
      }
      if let Some(hist) = &history {
        // OPTIMIZACIÓN: Limitar historial también en el reintento
        const MAX_HISTORY_MESSAGES: usize = 10;
        
        let start_idx = if hist.len() > MAX_HISTORY_MESSAGES {
          hist.len() - MAX_HISTORY_MESSAGES
        } else {
          0
        };
        
        let recent_history = &hist[start_idx..];
        
        for item in recent_history {
          let role = match item.role.as_str() {"assistant"|"user"|"system"=>item.role.clone(), "ai"|"bot"=>"assistant".to_string(), _=>"user".to_string()};
          retry_messages.push(serde_json::json!({"role": role, "content": item.content}));
        }
      }
      retry_messages.push(serde_json::json!({"role":"user","content": user_input.clone()}));

      // Build retry payload with correct format for each API
      let (retry_payload, retry_url) = if model_selection.is_claude() {
        // Claude API format - extract system message and put it in separate parameter
        let mut claude_retry_messages = Vec::new();
        let mut retry_system_content = String::new();
        
        for msg in &retry_messages {
          if let Some(role) = msg.get("role").and_then(|v| v.as_str()) {
            if role == "system" {
              if let Some(content) = msg.get("content").and_then(|v| v.as_str()) {
                retry_system_content = content.to_string();
              }
            } else {
              claude_retry_messages.push(msg.clone());
            }
          }
        }
        
        let claude_retry = serde_json::json!({
          "model": model_id,
          "max_tokens": 900,
          "temperature": 0.1,
          "system": retry_system_content,
          "messages": claude_retry_messages
        });
        (claude_retry, base_url.clone())
      } else {
        let openai_retry = serde_json::json!({
          "model": model_id,
          "messages": retry_messages,
          "max_tokens": 900,
          "temperature": 0.1
        });
        (openai_retry, base_url.clone())
      };
      
      let mut retry_req = client.post(&retry_url).json(&retry_payload);
      
      // Set headers for retry request
      if model_selection.is_claude() {
        retry_req = retry_req.header("anthropic-version", "2023-06-01");
        if let Some(ref token ) = proxy_auth { retry_req = retry_req.header("x-api-key", token); }
        else if let Some(ref key) = api_key { retry_req = retry_req.header("x-api-key", key); }
      } else {
        if let Some(ref token) = proxy_auth { retry_req = retry_req.bearer_auth(token); }
        else if let Some(ref key) = api_key { retry_req = retry_req.bearer_auth(key); }
      }
      
      if let Ok(retry_resp) = retry_req.send().await {
        if retry_resp.status().is_success() {
          if let Ok(v) = retry_resp.json::<serde_json::Value>().await {
            let text = if model_selection.is_claude() {
              // Claude response format
              v.get("content")
                .and_then(|c| c.get(0))
                .and_then(|c0| c0.get("text"))
                .and_then(|v| v.as_str())
            } else {
              // OpenAI response format
              v.get("choices")
                .and_then(|c| c.get(0))
                .and_then(|c0| c0.get("message"))
                .and_then(|m| m.get("content"))
                .and_then(|v| v.as_str())
            };
            
            if let Some(text) = text {
              let txt = text.trim();
              if !txt.is_empty() { assistant_text = txt.to_string(); }
            }
          }
        }
      }
    }
  }


  // Si un bloque de código tiene una primera línea que es solo una etiqueta de lenguaje (p. ej. "bash"), elimínala
  fn strip_leading_lang_tag(code: &str) -> String {
    let mut it = code.lines();
    if let Some(first) = it.next() {
      let t = first.trim().to_lowercase();
      let tags = [
        "bash", "sh", "shell", "zsh", "powershell", "ps1",
        "json", "yaml", "yml", "toml", "ini", "txt", "text",
        "javascript", "typescript", "ts", "js", "python", "py"
      ];
      if tags.contains(&t.as_str()) {
        return it.collect::<Vec<_>>().join("\n");
      }
    }
    code.to_string()
  }

  // En modo ASK/CONSULTA se permiten bloques de código como "Comandos sugeridos"; no ejecutar

  

  // Variables de salida (sin soporte de ejecución automática / agente)
  let mut ai_response = String::new();
  #[allow(unused_assignments)]
  let mut code_output: Option<String> = None; // Siempre None en modo consulta, se mantiene por compatibilidad JSON
  let mut explanation: Option<String> = None;
  let mut summary: Option<String> = None;

  // Attempt to parse assistant_text as JSON; if fails, use heuristics

  if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&assistant_text) {
    ai_response = parsed.get("ai_response").and_then(|v| v.as_str()).unwrap_or(&ai_response).to_string();
    #[allow(unused_assignments)]
    { code_output = parsed.get("code_output").and_then(|v| v.as_str()).map(|s| s.to_string()); }
    explanation = parsed.get("explanation").and_then(|v| v.as_str()).map(|s| s.to_string());
    summary = parsed.get("summary").and_then(|v| v.as_str()).map(|s| s.to_string());
    if let Some(ref mut s) = summary {
      let mut cleaned = s.replace("```", "").replace('`', "").trim().to_string();
      cleaned = cleaned.trim().to_string();
      if cleaned.is_empty() || cleaned.chars().all(|c| c == '.' || c == ',' || c == '!' || c == '?' ) {
        summary = None;
      } else {
        *s = cleaned;
      }
    }
  } else {
    if assistant_text.contains("RUN_CMD:") {
      ai_response = assistant_text.clone();
    } else {
      if assistant_text.trim_start().starts_with("```") {
        // Mantenemos el bloque completo como respuesta textual sin extracción especial.
        ai_response = assistant_text.clone();
      } else {
        explanation = Some(assistant_text.clone());
      }
    }
  }

  // If explanation exists but is only a fenced code block and we're in AGENT mode, synthesize explanation
  // (Se eliminó la expansión de explicaciones especiales para modo agente)

  // Synthesize short summary if missing
  if summary.is_none() {
    if let Some(ref expl) = explanation {
      if expl.contains("```") {
        let after = expl.splitn(2, "```").nth(1).unwrap_or("").to_string();
        let raw = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };
        let code_inner = strip_leading_lang_tag(&raw);
        if let Some(first_line) = code_inner.lines().find(|l| !l.trim().is_empty()) {
          let fl = first_line.trim();
          summary = Some(format!("Ejecuta: {}.", fl));
        }
      } else {
        let candidate = expl.split(|c| c == '.' || c == '\n')
          .find(|s| {
            let t = s.trim();
            if t.is_empty() { return false; }
            if t.chars().all(|ch| ch == '`' || ch == '.' || ch == ',' || ch == '!' || ch == '?') { return false; }
            true
          })
          .map(|s| s.trim().to_string());
        if let Some(mut s) = candidate {
          if !s.ends_with('.') { s.push('.'); }
          summary = Some(s);
        }
      }
    } else if !ai_response.is_empty() {
      let first = ai_response.lines().find(|l| !l.trim().is_empty()).map(|s| s.trim().to_string());
      if let Some(f) = first {
        summary = Some(format!("Comando sugerido: {}", f));
      }
    }
  }

  // (El bloque de explicación derivada de comandos se eliminó con el modo agente)


  // Sin normalización automática - contenido libre tal como viene de la API

  // En modo ASK/CONSULTA nunca devolver comandos ejecutables
  code_output = None; // garantía consistente: no devolvemos comandos ejecutables

  Ok(AiChatResponse {
    user_input,
    ai_response,
    code_output,
    explanation,
    summary,
    backup_path: None,
    requires_confirmation: false,
    state: state,
  })
}

// Carga forzada única desde apps/.env (raíz relativa: subir dos niveles desde src-tauri)
fn force_load_single_env() {
  let debug = std::env::var("AI_ENV_DEBUG").ok().map(|v| v == "1" || v.eq_ignore_ascii_case("true" )).unwrap_or(false);
  // Intentar localizar apps/.env partiendo de current_exe o current_dir
  let mut candidate_paths: Vec<String> = Vec::new();
  if let Ok(exe) = std::env::current_exe() {
    if let Some(parent) = exe.parent() { // .../src-tauri/target/debug
      // subir hasta encontrar "apps" y luego .env
      let apps_env = parent
        .ancestors()
        .find(|p| p.file_name().map(|n| n == "apps").unwrap_or(false))
        .map(|apps_dir| apps_dir.join(".env"));
      if let Some(p) = apps_env { candidate_paths.push(p.display().to_string()); }
    }
  }
  if let Ok(cwd) = std::env::current_dir() {
    // Caso desarrollo: normalmente cwd = .../apps/desktop/src-tauri
    // 1. Probar en el directorio actual (.env local)
    let local_env = cwd.join(".env");
    candidate_paths.push(local_env.display().to_string());

    // 2. Probar en el directorio "apps" si existe en la jerarquía
    let apps_candidate = cwd
      .ancestors()
      .find(|p| p.file_name().map(|n| n == "apps").unwrap_or(false))
      .map(|a| a.join(".env"));
    if let Some(p) = apps_candidate { let disp = p.display().to_string(); if !candidate_paths.contains(&disp) { candidate_paths.push(disp); } }
  }
  // Si no encontramos nada, intentar relativo: ../../.env respecto a src-tauri (desarrollo)
  if candidate_paths.is_empty() {
    if let Ok(cwd) = std::env::current_dir() {
      let fallback = cwd.join("..").join("..").join(".env");
      candidate_paths.push(fallback.display().to_string());
    }
  }
  for path_str in candidate_paths {
    let p = Path::new(&path_str);
    if p.exists() {
      if debug { eprintln!("[env] Cargando único apps/.env: {}", p.display()); }
      // En lugar de confiar únicamente en dotenv (que puede dejar el antiguo si ya estaba seteado
      // dependiendo de ciertas variantes), parseamos manualmente y sobreescribimos.
      if let Ok(content) = std::fs::read_to_string(p) {
        for line in content.lines() {
          let line = line.trim();
            if line.is_empty() || line.starts_with('#') { continue; }
            if let Some(eq_idx) = line.find('=') {
              let (k, v_raw) = line.split_at(eq_idx);
              let key = k.trim();
              let val = v_raw[1..].trim();
              // Buscar múltiples variantes de la API key de OpenAI
              if ["OPENAI_API_KEY", "OPENAI_API_KEY1", "OPENAI_API_KEY2", "OPENAI_API_KEY3P"].contains(&key) {
                std::env::set_var("OPENAI_API_KEY", val);
                if debug { eprintln!("[env] Forzado override {} -> OPENAI_API_KEY desde {}", key, p.display()); }
              } else if key == "CLAUDE_CODE_API_KEY" || key == "CLAUDE_API_KEY" {
                std::env::set_var("CLAUDE_API_KEY", val);
                if debug { eprintln!("[env] Forzado override {} -> CLAUDE_API_KEY desde {}", key, p.display()); }
              }
            }
        }
      } else if debug { eprintln!("[env] No se pudo leer el archivo: {}", p.display()); }
      break; // solo el primero válido
    } else if debug { eprintln!("[env] No existe: {}", p.display()); }
  }
  // Si aún no está set, intentar dotenv() (por si ejecutan desde raíz y .env ya está ahí)
  if std::env::var("OPENAI_API_KEY").ok().map(|v| v.trim().is_empty()).unwrap_or(true) {
    let _ = dotenvy::dotenv();
  }
  if debug {
    match std::env::var("OPENAI_API_KEY") {
      Ok(v) => eprintln!("[env] OPENAI_API_KEY cargada (long={}): {}...", v.len(), &v.chars().take(6).collect::<String>()),
      Err(_) => eprintln!("[env] OPENAI_API_KEY NO encontrada"),
    }
  }
}
