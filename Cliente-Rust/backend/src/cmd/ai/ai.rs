use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::{env, fs};
use std::path::{Path, PathBuf};
use once_cell::sync::Lazy;
use futures_util::StreamExt;
use tauri::Emitter;

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

static PROMPTS: Lazy<PromptsConfig> = Lazy::new(|| load_prompts_or_default());

/// Tipo de modo del chat canónico.
/// Se unifica a un solo modo 'ask' para mantener FE y BE sincronizados.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub enum ChatMode {
  #[default]
  Ask,
  Agente,
  Plan,
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
    pub model_selection: Option<String>,
    pub image_base64: Option<String>,
    pub image_media_type: Option<String>,
    pub terminal_context: Option<String>,
    pub request_id: Option<String>,
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

#[derive(Serialize, Clone)]
struct AiChunkEvent {
  request_id: String,
  delta: String,
}

#[derive(Serialize, Clone)]
struct AiUsageEvent {
  request_id: String,
  input_tokens: u64,
  output_tokens: u64,
  model: String,
}

/// Extrae el delta de texto de un chunk SSE (OpenAI o Claude).
fn sse_extract_delta(data: &str, is_claude: bool) -> Option<String> {
  let json: serde_json::Value = serde_json::from_str(data).ok()?;
  if is_claude {
    if json.get("type").and_then(|v| v.as_str()) == Some("content_block_delta") {
      return json.get("delta")
        .and_then(|d| d.get("text"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string());
    }
  } else {
    return json.get("choices")
      .and_then(|c| c.get(0))
      .and_then(|c0| c0.get("delta"))
      .and_then(|d| d.get("content"))
      .and_then(|v| v.as_str())
      .map(|s| s.to_string());
  }
  None
}

/// Comando Tauri versionado (Fase D): envuelve `ai_chat_impl` en el
/// envelope `CommandRequest`/`CommandResponse` del protocolo versionado.
#[tauri::command]
pub async fn ai_chat(
  app: tauri::AppHandle,
  cancel_state: tauri::State<'_, crate::state_core::AiCancelRegistry>,
  req: crate::cmd::protocol::CommandRequest<AiChatRequest>,
) -> Result<crate::cmd::protocol::CommandResponse<AiChatResponse>, crate::cmd::protocol::CommandError> {
  let started = std::time::Instant::now();
  let result = ai_chat_impl(app, cancel_state, req.payload).await;
  let elapsed_ms = started.elapsed().as_millis() as i64;
  Ok(crate::cmd::protocol::wrap_result(req.id, req.version, result, elapsed_ms))
}

async fn ai_chat_impl(
  app: tauri::AppHandle,
  cancel_state: tauri::State<'_, crate::state_core::AiCancelRegistry>,
  req: AiChatRequest,
) -> Result<AiChatResponse, String> {
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

  fn get_system_prompt(agent_mode: &ChatMode) -> String {
    match agent_mode {
      ChatMode::Plan => {
        return r#"<instructions>
<persona>
Eres 'Kernel', un arquitecto de soluciones para servidores Linux y proyectos de software.
</persona>
<task>
Genera SIEMPRE un plan estructurado, numerado y accionable para la tarea que describe el usuario.
Formato obligatorio:
1. Resumen en 1 línea de qué se va a lograr.
2. Fases numeradas (máx 5), cada una con:
   - Objetivo de la fase
   - Pasos concretos (comandos, archivos, configs)
   - Criterio de éxito
3. Advertencias o dependencias importantes.
Sé concreto con comandos reales. No des opciones alternativas, solo el camino óptimo.
</task>
</instructions>"#.to_string();
      }
      _ => {}
    }
    let mut s = PROMPTS.sistema_base.clone();
    s = s.replace("{{IDENTIDAD}}", &PROMPTS.identidad.replace('"', "\\\""));
    s
  }

  let AiChatRequest { user_input, mode: incoming_mode, history, state, model_selection: req_model_selection, image_base64, image_media_type, terminal_context, request_id: raw_req_id } = req;
  let req_id = raw_req_id.filter(|s| !s.is_empty()).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
  let mut cancel_rx = cancel_state.register(&req_id);

  // Usar modelo seleccionado por el usuario o fallback a Claude
  let model_selection = req_model_selection.unwrap_or_else(|| "claude-sonnet-4-6".to_string());
  // Si OPENAI_MODEL del .env contiene "/" es un modelo OpenRouter (ej: "nvidia/nemotron-3-super-120b-a12b:free")
  let env_model = std::env::var("OPENAI_MODEL").unwrap_or_default();
  let model_id = if env_model.contains('/') { env_model } else { model_selection.clone() };
  // Claude si el model_id empieza por "claude" y no es un modelo OpenRouter
  let is_claude = model_id.starts_with("claude") && !model_id.contains('/');

  // Auto-detectar OpenRouter: si el modelo tiene "/" y hay OPENROUTER_API_KEY, enrutar automáticamente
  let or_key = super::ai_utils::get_openrouter_api_key();
  let (proxy_url, proxy_auth) = if proxy_url.is_none() && model_id.contains('/') && or_key.is_some() {
    (Some("https://openrouter.ai/api/v1/chat/completions".to_string()), or_key)
  } else {
    (proxy_url, proxy_auth)
  };

  // Determinar qué API key usar según el modelo seleccionado
  let api_key = if proxy_url.is_none() {
    if is_claude {
      super::ai_utils::get_claude_api_key()
    } else {
      super::ai_utils::get_openai_api_key()
    }
  } else { 
    None 
  };
  
  if proxy_url.is_none() && api_key.is_none() {
    let key_type = if is_claude { "CLAUDE_API_KEY" } else { "OPENAI_API_KEY o OPENROUTER_API_KEY" };
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

  let system_prompt = get_system_prompt(&incoming_mode);

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
  // Inyectar contexto de terminal si está disponible (comprimido para ahorrar tokens)
  if let Some(ref ctx) = terminal_context {
    if !ctx.trim().is_empty() {
      let compressed = super::ai_utils::compress_terminal_context(ctx);
      if !compressed.is_empty() {
        messages.push(serde_json::json!({
          "role": "system",
          "content": format!("Contexto actual de la terminal (NO imprimir, usar como referencia):\n```\n{}\n```", compressed)
        }));
      }
    }
  }
  if let Some(ref hist) = history {
    const MAX_HISTORY_MESSAGES: usize = 6;
    // Truncar contenido largo para ahorrar tokens (máx 600 chars por mensaje)
    const MAX_MSG_CHARS: usize = 600;
    
    let start_idx = if hist.len() > MAX_HISTORY_MESSAGES {
      hist.len() - MAX_HISTORY_MESSAGES
    } else {
      0
    };
    
    let recent_history = &hist[start_idx..];
    
    for item in recent_history.iter() {
      let role = match item.role.as_str() {
        "assistant" | "user" | "system" => item.role.clone(),
        "ai" | "bot" => "assistant".to_string(),
        _ => "user".to_string(),
      };
      // Truncar mensajes muy largos para reducir tokens de contexto
      let content = if item.content.len() > MAX_MSG_CHARS {
        format!("{}…[truncado]", &item.content[..MAX_MSG_CHARS])
      } else {
        item.content.clone()
      };
      messages.push(serde_json::json!({"role": role, "content": content}));
    }
  }
  // Si hay imagen adjunta, construir mensaje multimodal (solo Claude soporta visión aquí)
  if let Some(ref b64) = image_base64 {
    let media = image_media_type.as_deref().unwrap_or("image/jpeg");
    messages.push(serde_json::json!({
      "role": "user",
      "content": [
        { "type": "image", "source": { "type": "base64", "media_type": media, "data": b64 } },
        { "type": "text", "text": user_input.clone() }
      ]
    }));
  } else {
    messages.push(serde_json::json!({"role":"user","content": user_input.clone()}));
  }

  // Build the request payload - format differs between OpenAI and Claude
  let use_stream = proxy_url.is_none(); // Solo streaming para llamadas directas a la API
  let (payload, base_url) = if is_claude {
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
    
    let max_tok = if matches!(incoming_mode, ChatMode::Plan) { 1000u32 } else { 500u32 };
    let claude_payload = serde_json::json!({
      "model": model_id,
      "max_tokens": max_tok,
      "temperature": 0.1,
      "stream": use_stream,
      "system": system_content,
      "messages": claude_messages
    });
    let claude_url = proxy_url.unwrap_or_else(|| "https://api.anthropic.com/v1/messages".to_string());
    (claude_payload, claude_url)
  } else {
    // OpenAI API format
    let max_tok = if matches!(incoming_mode, ChatMode::Plan) { 1000u32 } else { 500u32 };
    let mut openai_payload = serde_json::json!({
      "model": model_id,
      "messages": messages,
      "max_tokens": max_tok,
      "temperature": 0.1,
      "stream": use_stream,
    });
    // stream_options solo cuando se usa streaming; OpenRouter rechaza el campo si es null
    if use_stream {
      openai_payload["stream_options"] = serde_json::json!({"include_usage": true});
    }
    let openai_url = proxy_url.unwrap_or_else(|| "https://api.openai.com/v1/chat/completions".to_string());
    (openai_payload, openai_url)
  };

  let mut req_builder = client.post(&base_url).json(&payload);
  
  // Set appropriate headers for each API
  if is_claude && !base_url.contains("openrouter.ai") {
    req_builder = req_builder.header("anthropic-version", "2023-06-01");
    if let Some(ref token) = proxy_auth { req_builder = req_builder.header("x-api-key", token); }
    else if let Some(ref key) = api_key { req_builder = req_builder.header("x-api-key", key); }
  } else {
    if let Some(ref token) = proxy_auth { req_builder = req_builder.bearer_auth(token); }
    else if let Some(ref key) = api_key { req_builder = req_builder.bearer_auth(key); }
  }
  // Headers adicionales requeridos por OpenRouter
  if base_url.contains("openrouter.ai") {
    req_builder = req_builder
      .header("HTTP-Referer", "https://github.com/ssh-ai-client")
      .header("X-Title", "SSH AI Client");
  }
  let resp = tokio::select! {
    r = req_builder.send() => r.map_err(|e| e.to_string())?,
    _ = cancel_rx.changed() => {
      cancel_state.remove(&req_id);
      return Err("cancelled".to_string());
    }
  };

  if !resp.status().is_success() {
    let status = resp.status();
    let txt = resp.text().await.unwrap_or_default();
    let api_name = if is_claude { "Claude API" } else { "OpenAI API" };
    return Err(format!("{} error {}: {}", api_name, status, txt));
  }

  let mut assistant_text = if use_stream {
    // ── Streaming SSE ──────────────────────────────────────────────────────────
    let mut sse_buffer = String::new();
    let mut accumulated = String::new();
    let mut byte_stream = resp.bytes_stream();
    let mut stream_ended = false;
    let mut tok_input: u64 = 0;
    let mut tok_output: u64 = 0;
    'sse: loop {
      tokio::select! {
        _ = cancel_rx.changed() => {
          cancel_state.remove(&req_id);
          return Err("cancelled".to_string());
        }
        chunk_result = byte_stream.next() => {
          match chunk_result {
            None => break 'sse,
            Some(Err(e)) => return Err(e.to_string()),
            Some(Ok(bytes)) => {
              sse_buffer.push_str(&String::from_utf8_lossy(&bytes));
              loop {
                match sse_buffer.find('\n') {
                  None => break,
                  Some(pos) => {
                    let raw = sse_buffer[..pos].trim_end_matches('\r').to_string();
                    sse_buffer.drain(..pos + 1);
                    if let Some(data) = raw.strip_prefix("data: ") {
                      if data.trim() == "[DONE]" {
                        stream_ended = true;
                        break;
                      }
                      // Extraer uso de tokens del chunk SSE
                      if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if is_claude {
                          // Claude emite input en message_start, output en message_delta
                          match json.get("type").and_then(|v| v.as_str()) {
                            Some("message_start") => {
                              if let Some(u) = json.get("message").and_then(|m| m.get("usage")) {
                                tok_input = u.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(tok_input);
                              }
                            }
                            Some("message_delta") => {
                              if let Some(u) = json.get("usage") {
                                tok_output = u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(tok_output);
                              }
                            }
                            _ => {}
                          }
                        } else {
                          // OpenAI: chunk final (con stream_options.include_usage) trae usage
                          if let Some(u) = json.get("usage") {
                            tok_input = u.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(tok_input);
                            tok_output = u.get("completion_tokens").and_then(|v| v.as_u64()).unwrap_or(tok_output);
                          }
                        }
                      }
                      if let Some(delta) = sse_extract_delta(data, is_claude) {
                        if !delta.is_empty() {
                          accumulated.push_str(&delta);
                          let _ = app.emit("ai:chunk", AiChunkEvent {
                            request_id: req_id.clone(),
                            delta,
                          });
                        }
                      }
                    }
                  }
                }
              }
              if stream_ended { break 'sse; }
            }
          }
        }
      }
    }
    // Log de tokens: consola Rust + evento al frontend (sin afectar UI)
    if tok_input > 0 || tok_output > 0 {
      let _ = app.emit("ai:usage", AiUsageEvent {
        request_id: req_id.clone(),
        input_tokens: tok_input,
        output_tokens: tok_output,
        model: model_id.clone(),
      });
    }
    accumulated
  } else {
    // ── Non-streaming (proxy) ───────────────────────────────────────────────────
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if is_claude {
      body.get("content")
        .and_then(|c| c.get(0))
        .and_then(|c0| c0.get("text"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
    } else {
      body.get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c0| c0.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
    }
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
          result = re.replace_all(&result, replacement).to_string();
          any_fix = true;
        }
      } else if debug {
        let _ = pattern;
      }
    }
    
    if debug && !any_fix {
      let _ = ();
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
            corrected = re.replace(&corrected, *replacement).to_string();
            fixed = true;
          }
        } else if debug {
          let _ = pattern;
        }
      }
      
      if !fixed && debug && (corrected.contains("chmod") || corrected.contains("./")) {
        let _ = &corrected;
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
    let _ = &assistant_text;
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
      let (retry_payload, retry_url) = if is_claude {
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
      if is_claude {
        retry_req = retry_req.header("anthropic-version", "2023-06-01");
        if let Some(ref token ) = proxy_auth { retry_req = retry_req.header("x-api-key", token); }
        else if let Some(ref key) = api_key { retry_req = retry_req.header("x-api-key", key); }
      } else {
        if let Some(ref token) = proxy_auth { retry_req = retry_req.bearer_auth(token); }
        else if let Some(ref key) = api_key { retry_req = retry_req.bearer_auth(key); }
      }
      
      let retry_send = tokio::select! {
        r = retry_req.send() => r,
        _ = cancel_rx.changed() => {
          cancel_state.remove(&req_id);
          return Err("cancelled".to_string());
        }
      };
      if let Ok(retry_resp) = retry_send {
        if retry_resp.status().is_success() {
          if let Ok(v) = retry_resp.json::<serde_json::Value>().await {
            let text = if is_claude {
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
  cancel_state.remove(&req_id);

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
  let debug = std::env::var("FILE_AI_DEBUG").ok().as_deref() == Some("1");
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
      if debug { let _ = p.display(); }
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
                if debug { let _ = (key, p.display()); }
              } else if ["CLAUDE_API_KEY", "CLAUDE_CODE_API_KEY", "ANTHROPIC_API_KEY"].contains(&key) {
                std::env::set_var("CLAUDE_API_KEY", val);
                if debug { let _ = (key, p.display()); }
              }
            }
        }
      } else if debug { let _ = p.display(); }
      break; // solo el primero válido
    } else if debug { let _ = p.display(); }
  }
  // Si aún no está set, intentar dotenv() (por si ejecutan desde raíz y .env ya está ahí)
  if std::env::var("OPENAI_API_KEY").ok().map(|v| v.trim().is_empty()).unwrap_or(true) {
    let _ = dotenvy::dotenv();
  }
  if debug {
    let _ = std::env::var("OPENAI_API_KEY");
  }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct CancelAiChatPayload {
  pub request_id: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
pub struct CancelAiChatResponse {
  pub ok: bool,
}

/// Cancela una petición ai_chat en curso por su request_id.
#[tauri::command]
pub async fn cancel_ai_chat(
  cancel_state: tauri::State<'_, crate::state_core::AiCancelRegistry>,
  req: crate::cmd::protocol::CommandRequest<CancelAiChatPayload>,
) -> Result<crate::cmd::protocol::CommandResponse<CancelAiChatResponse>, crate::cmd::protocol::CommandError> {
  let started = std::time::Instant::now();
  cancel_state.cancel(&req.payload.request_id);
  let elapsed_ms = started.elapsed().as_millis() as i64;
  let result: Result<CancelAiChatResponse, String> = Ok(CancelAiChatResponse { ok: true });
  Ok(crate::cmd::protocol::wrap_result(req.id, req.version, result, elapsed_ms))
}
