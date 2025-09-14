use serde::{Deserialize, Serialize};
use reqwest::Client;
use dotenvy::dotenv;
use std::{env, fs};
use std::path::PathBuf;

/// Tipo de modo del chat
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub enum ChatMode {
  #[default]
  #[serde(alias = "ASK", alias = "Ask")]
  Ask,    // Modo consulta
  #[serde(alias = "AGENT", alias = "Agent")]
  Agent,  // Modo agente
  #[serde(alias = "SUPER", alias = "Super")]
  Super   // Modo súper-agente
}

/// Estado de memoria del agente
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AgentState {
    pub cwd: String,
    pub last_exit_code: Option<i32>,
    pub last_stdout_tail: Option<String>,
    pub last_file: Option<String>,
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

  
  // Load .env to pick up OPENAI_API_KEY (dotenvy is safe on desktop)
  let _ = dotenv();
  
  // Inicializar el gestor de seguridad (actualmente no usado directamente)
  let _security = SecurityManager::new();
  // Try multiple sources for the API key so packaged apps work for end users
  fn load_api_key_multi() -> Option<String> {
    // 1) Environment variable
    if let Ok(v) = env::var("OPENAI_API_KEY") { if !v.trim().is_empty() { return Some(v); } }

    // 2) %APPDATA%/ssh-ai-client/config.json (Windows) or ~/.config/ssh-ai-client/config.json (others)
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(appdata) = env::var("APPDATA") { // Windows
      candidates.push(PathBuf::from(appdata).join("ssh-ai-client").join("config.json"));
    }
    if let Ok(home) = env::var("HOME") { // Unix-like fallback
      candidates.push(PathBuf::from(home).join(".config").join("ssh-ai-client").join("config.json"));
    }
    // 3) Next to the executable (portable distribution)
    if let Ok(exe) = env::current_exe() {
      let base = exe.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."));
      candidates.push(base.join("config.json"));
      candidates.push(base.join("openai_api_key.txt"));
    }

    for path in candidates {
      if let Ok(meta) = fs::metadata(&path) {
        if meta.is_file() {
          // Try JSON with several key names first
          if path.extension().and_then(|s| s.to_str()).map(|s| s.eq_ignore_ascii_case("json")).unwrap_or(false) {
            if let Ok(txt) = fs::read_to_string(&path) {
              if let Ok(json) = serde_json::from_str::<serde_json::Value>(&txt) {
                let k = json.get("OPENAI_API_KEY").or_else(|| json.get("openai_api_key")).or_else(|| json.get("apiKey"));
                if let Some(val) = k.and_then(|v| v.as_str()) { if !val.trim().is_empty() { return Some(val.to_string()); } }
              }
            }
          } else {
            // Plain text file: first non-empty line is the key
            if let Ok(txt) = fs::read_to_string(&path) {
              if let Some(line) = txt.lines().map(|l| l.trim()).find(|l| !l.is_empty()) {
                return Some(line.to_string());
              }
            }
          }
        }
      }
    }
    None
  }

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
  let mut api_key = if proxy_url.is_none() { load_api_key_multi() } else { None };
  // Last-resort: embed key at compile time if provided during build
  if proxy_url.is_none() && api_key.is_none() {
    if let Some(k) = option_env!("APP_EMBED_OPENAI_API_KEY") {
      if !k.trim().is_empty() { api_key = Some(k.to_string()); }
    }
  }
  if proxy_url.is_none() && api_key.as_ref().map(|s| s.is_empty()).unwrap_or(true) {
    return Err("OPENAI_API_KEY not set".to_string());
  }
  let model_id = env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-3.5-turbo".to_string());

  fn get_system_prompt(agent_mode: &ChatMode) -> String {
  let identidad_regla = r#"REGLA DE IDENTIDAD:
Si, y SOLO SI, la pregunta del usuario es explícitamente sobre tu identidad (por ejemplo: '¿quién eres?', 'qué eres', 'cuál es tu identidad', 'quién es el agente'), responde EXACTAMENTE:
"Soy un cliente SSH de la Universidad Piloto de Colombia que te ayudará con tus dudas de Linux y de la terminal en general."
No añadas texto adicional, disculpas ni explicaciones cuando apliques esta regla.
"#;

    if matches!(agent_mode, ChatMode::Agent) {
      return format!(r##"{identidad}
MODO AGENT — EJECUCIÓN DIRECTA

Objetivo:
Transformar la intención del usuario en comandos Bash seguros y ejecutables.
Nunca expliques ni añadas texto fuera del bloque.

Formato de salida (OBLIGATORIO):
1. Devuelve SOLO un bloque de código con triple backticks.
2. La PRIMERA línea debe ser el primer comando a ejecutar.
3. SIN prefijos como $ o #, SIN comentarios, SIN texto fuera del bloque.
4. Si son varios comandos, cada uno en su propia línea.
5. No uses etiquetas de lenguaje en el bloque (sin 'bash').
6. Nunca uses editores interactivos (nano, vim, etc.).
7. Si creas archivo(s) con here-doc o redirecciones, DESPUÉS añade una línea `cat <ruta>` para mostrar su contenido en la terminal.

Memoria de sesión ≠ Salida (IMPORTANTE):
- Usa el estado de la sesión (cwd, archivos recientes, etc.) para decidir QUÉ hacer.
- NO imprimas el historial ni pasos previos. Emite SOLO el DELTA mínimo necesario para cumplir la petición actual.
- Evita comandos de sondeo (ls, pwd) o navegación innecesaria; asume el cwd indicado por el sistema.
- Evita secuencias redundantes como `cd ..` seguido de `cd dir`.

Reglas de comportamiento:
- Si el usuario pide crear un archivo o programa, SIEMPRE usa here-doc con cat > archivo <<'EOF' … EOF.
- Añade chmod +x si aplica para scripts.
- Evita comandos destructivos sin salvaguardas (valida rutas distintas de / o $HOME).

Si el usuario pide crear archivo(s), devuelve preferentemente un JSON con acciones:
{{
  "version":"ui-v1",
  "mode":"agent",
  "intent":"create",
  "summary":"...",
  "explanation":"...",
  "actions":[
    {{"type":"create_file","id":"file1","path":"./archivo.ext","mode":"0755","content":"<contenido completo>"}},
    {{"type":"command","id":"run1","command":"bash ./archivo.ext","cwd":".","shell":"bash","sudo":false}}
  ],
  "requires_confirmation":true,
  "ui":{{
    "variant":"confirm_card",
    "code_preview":{{"language":"bash","lines":["cat > ./archivo.ext <<'EOF'","# contenido embebido","EOF"]}}
  }},
  "next_action":"await_user_confirmation"
}}

Si no usas JSON, respeta el bloque de código único con el here-doc completo.

Ejemplo válido (no JSON):

cat > script.sh <<'EOF'
#!/usr/bin/env bash
echo "hola"
EOF
chmod +x script.sh
cat script.sh

"##, identidad = identidad_regla);
    }

    return format!(r#"{identidad}
MODO ASK — ENSEÑANZA Y GUÍA

Objetivo:
Responder con claridad, paso a paso y de forma pedagógica.
Prioriza el qué/por qué/cómo antes que el comando.

Reglas de salida:
- Responde en texto normal (explicación clara y breve).
- SOLO si el usuario pide pasos o un comando ayudaría, incluye al FINAL un bloque fenced con triple backticks y etiqueta bash.
- Si la pregunta es conceptual, NO incluyas ningún bloque de código.
- Nunca asumas credenciales ni ejecutes nada: el código es solo sugerencia.

Ejemplo válido:
Para listar archivos ocultos puedes usar la opción -a de ls, que muestra también los que empiezan con punto.
bash
ls -la

"#, identidad = identidad_regla);
  }

  // Mover campos del request a variables locales para evitar clones innecesarios
  let AiChatRequest { user_input, mode, history, state } = req;
  let system_prompt = get_system_prompt(&mode);

  // Atajo: si el usuario pregunta por la identidad, responder de forma canónica sin llamar al modelo
  fn is_identity_query(s: &str) -> bool {
    let lc = s.to_lowercase();
    // contemplar variantes con/ sin tilde y redacción común
    lc.contains("quien eres") || lc.contains("quién eres") || lc.contains("quien es el agente") || lc.contains("identidad") || lc.contains("who are you")
  }
  if is_identity_query(&user_input) {
    return Ok(AiChatResponse {
      user_input,
      ai_response: "Soy un cliente SSH de la Universidad Piloto de Colombia que te ayudará con tus dudas de Linux y de la terminal en general.".to_string(),
      code_output: None,
      explanation: None,
      summary: None,
      backup_path: None,
      requires_confirmation: false,
      state: state,
    });
  }

  // Construir historial de mensajes para OpenAI: system + (historial opcional) + user actual
  let client = Client::builder().build().map_err(|e| e.to_string())?;
  let mut messages: Vec<serde_json::Value> = vec![serde_json::json!({"role":"system","content": system_prompt})];
  // Inyectar memoria de sesión como mensaje de sistema adicional (NO imprimir en salida)
  if let Some(ref st) = state {
    let mut mem_lines: Vec<String> = Vec::new();
    if !st.cwd.is_empty() { mem_lines.push(format!("cwd={}", st.cwd)); }
    if let Some(code) = st.last_exit_code { mem_lines.push(format!("last_exit_code={}", code)); }
    if let Some(ref f) = st.last_file { mem_lines.push(format!("last_file={}", f)); }
    if !mem_lines.is_empty() {
      messages.push(serde_json::json!({
        "role": "system",
        "content": format!(
          "Contexto de sesión (NO imprimir en salida): {}",
          mem_lines.join(", ")
        )
      }));
    }
  }
  if let Some(mut hist) = history {
    // Limitar a los últimos 12 turnos para no crecer demasiado
    let take_from = if hist.len() > 12 { hist.len() - 12 } else { 0 };
    hist = hist.into_iter().skip(take_from).collect();
    for item in hist {
      let role = match item.role.as_str() {
        "assistant" | "user" | "system" => item.role,
        // Fallbacks comunes
        "ai" | "bot" => "assistant".to_string(),
        _ => "user".to_string(),
      };
      messages.push(serde_json::json!({"role": role, "content": item.content}));
    }
  }
  messages.push(serde_json::json!({"role":"user","content": user_input.clone()}));

  // Build the request payload for OpenAI Chat completions
  let payload = serde_json::json!({
    "model": model_id,
    "messages": messages,
    "max_tokens": 800,
    "temperature": if matches!(mode, ChatMode::Agent) { 0.1 } else { 0.2 }
  });

  let base_url = proxy_url.unwrap_or_else(|| "https://api.openai.com/v1/chat/completions".to_string());
  let mut req_builder = client.post(&base_url).json(&payload);
  if let Some(ref token) = proxy_auth { req_builder = req_builder.bearer_auth(token); }
  else if let Some(ref key) = api_key { req_builder = req_builder.bearer_auth(key); }
  let resp = req_builder.send().await.map_err(|e| e.to_string())?;

  if !resp.status().is_success() {
    let status = resp.status();
    let txt = resp.text().await.unwrap_or_default();
    return Err(format!("OpenAI API error {}: {}", status, txt));
  }

  let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

  // Try to extract the assistant message text
  let mut assistant_text = body
    .get("choices")
    .and_then(|c| c.get(0))
    .and_then(|c0| c0.get("message"))
    .and_then(|m| m.get("content"))
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_string();

  // Evitar que el modelo devuelva la identidad cuando NO se preguntó por ella en modo ASK
  if matches!(mode, ChatMode::Ask) && !is_identity_query(&user_input) {
    let ident = "Soy un cliente SSH de la Universidad Piloto de Colombia que te ayudará con tus dudas de Linux y de la terminal en general.";
    if assistant_text.contains(ident) {
      let cleaned = assistant_text.replace(ident, "").trim().to_string();
      if !cleaned.is_empty() { assistant_text = cleaned; }
    }
    // Si quedó vacío o sigue siendo una variante de identidad, devuelve una respuesta corta de capacidades
    let at_lower = assistant_text.trim().to_lowercase();
    if assistant_text.trim().is_empty() || at_lower == ident.to_lowercase() || at_lower.contains("universidad piloto de colombia") {
      assistant_text = "Puedo ayudarte con Linux y la terminal: explicar comandos y opciones, resolver errores, crear y revisar scripts (bash, python), navegar archivos y permisos, instalar herramientas y automatizar tareas paso a paso.".to_string();
    }
  }

  // Heurística simple para detectar comandos de shell o here-docs
  fn looks_like_shell(s: &str) -> bool {
    let t = s.trim();
    if t.is_empty() { return false; }
    let first_line = t.lines().next().unwrap_or("").trim();
    let starters = [
      "cd ", "ls", "mkdir ", "rm ", "touch ", "echo ", "printf ", "cat ", "tee ",
      "bash ", "sh ", "python", "python3", "pip ", "chmod ", "curl ", "wget ", "grep ", "sed ",
      "awk ", "tar ", "zip ", "unzip ", "git ", "#!/usr/bin/env",
    ];
    if starters.iter().any(|p| first_line.starts_with(p)) { return true; }
    if t.contains("cat >") || t.contains("<<EOF") || t.contains("<<'EOF'") { return true; }
    if t.contains("&&") || t.contains('|') || t.contains('>') || t.contains("chmod +x") { return true; }
    false
  }

  

  // Variables de salida que iremos completando según el flujo
  let mut ai_response = String::new();
  let mut code_output: Option<String> = None;
  let mut explanation: Option<String> = None;
  let mut summary: Option<String> = None;

  // If the assistant returned a fenced code block, extract it for later use
  let mut extracted_code_block: Option<String> = None;
  if assistant_text.contains("```") {
    let after = assistant_text.splitn(2, "```").nth(1).unwrap_or("").to_string();
    let code_inner = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };
    if !code_inner.trim().is_empty() {
      extracted_code_block = Some(code_inner.clone());
      // Expose normalized commands/content to the frontend explicitly
      code_output = Some(code_inner);
    }
  } else if matches!(mode, ChatMode::Agent) {
    // Sin fences: si parece shell, expónlo como code_output para que el frontend muestre confirmación
    if looks_like_shell(&assistant_text) {
      code_output = Some(assistant_text.trim().to_string());
    }
  }

  // Sanitizador: elimina comandos de historial/sondeo del bloque en modo AGENT (ls/pwd, cd ..)
  fn sanitize_agent_commands(s: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut in_heredoc = false;
    for raw in s.lines() {
      let line = raw.trim_end();
      let trimmed = line.trim();
      // Detectar inicio/fin de heredoc
      if trimmed.contains("<<'EOF'") || trimmed.contains("<<EOF") { in_heredoc = true; out.push(line.to_string()); continue; }
      if in_heredoc {
        out.push(line.to_string());
        if trimmed == "EOF" { in_heredoc = false; }
        continue;
      }
      // Filtrar comandos de sondeo/historial
      let lower = trimmed.to_lowercase();
      if lower == "ls" || lower.starts_with("ls ") || lower == "pwd" { continue; }
      if lower == "cd .." { continue; }
      if trimmed.is_empty() || trimmed.starts_with('#') { continue; }
      out.push(line.to_string());
    }
    let result = out.join("\n").trim().to_string();
    if result.is_empty() { s.trim().to_string() } else { result }
  }

  // Fallback de coerción: en modo AGENT, si no hay bloque de código ni JSON, pedir al modelo que lo genere siguiendo las reglas
  if matches!(mode, ChatMode::Agent) && extracted_code_block.is_none() {
    let trimmed = assistant_text.trim();
    let looks_json = trimmed.starts_with('{') && trimmed.ends_with('}');
    if !looks_json {
      let repair_prompt = format!(
        "Convierte la intención en comandos válidos siguiendo MODO AGENT. Reglas: SOLO un bloque de código (sin comentarios ni texto), DELTA mínimo (no imprimas historial), asume CWD dado, evita 'ls'/'pwd' y 'cd' redundantes, usa here-doc seguro y termina con 'cat <ruta>' si aplica. Intención:\n\n{}",
        user_input
      );
      let payload_fix = serde_json::json!({
        "model": model_id,
        "messages": [
          {"role": "system", "content": get_system_prompt(&ChatMode::Agent)},
          {"role": "user", "content": repair_prompt}
        ],
        "max_tokens": 700,
        "temperature": 0.2
      });
      let mut req_fix = client.post(&base_url).json(&payload_fix);
      if let Some(ref token) = proxy_auth { req_fix = req_fix.bearer_auth(token); }
      else if let Some(ref key) = api_key { req_fix = req_fix.bearer_auth(key); }
      let resp_fix = req_fix.send().await.map_err(|e| e.to_string())?;
      if resp_fix.status().is_success() {
        let body_fix: serde_json::Value = resp_fix.json().await.map_err(|e| e.to_string())?;
        if let Some(content) = body_fix.get("choices").and_then(|c| c.get(0)).and_then(|c0| c0.get("message")).and_then(|m| m.get("content")).and_then(|v| v.as_str()) {
          if content.contains("```") {
            let after = content.splitn(2, "```").nth(1).unwrap_or("").to_string();
            let code_inner = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };
            if !code_inner.trim().is_empty() {
              extracted_code_block = Some(code_inner.clone());
              code_output = Some(if matches!(mode, ChatMode::Agent) { sanitize_agent_commands(&code_inner) } else { code_inner });
            }
          } else if looks_like_shell(content) {
            // Reparación devolvió texto sin fences pero con comandos válidos
            code_output = Some(if matches!(mode, ChatMode::Agent) { sanitize_agent_commands(content) } else { content.to_string() }.trim().to_string());
          }
        }
      }
    }
  }

  // Segundo intento estricto: aún sin bloque ni code_output en modo AGENT
  if matches!(mode, ChatMode::Agent) && extracted_code_block.is_none() && code_output.is_none() {
    let force_prompt = format!(
      "Devuelve SOLO un bloque de código (sin etiqueta de lenguaje) con el DELTA mínimo para cumplir la petición. No imprimas historial ni pasos previos. Evita 'ls'/'pwd' y 'cd' innecesarios; asume CWD del sistema. Para archivos, usa here-doc con cat > archivo <<'EOF' ... EOF y finaliza con cat <archivo> si corresponde. Intención:\n\n{}",
      user_input
    );
    let payload_force = serde_json::json!({
      "model": model_id,
      "messages": [
        {"role": "system", "content": get_system_prompt(&ChatMode::Agent)},
        {"role": "user", "content": force_prompt}
      ],
      "max_tokens": 700,
      "temperature": 0.1
    });
    let mut req_force = client.post(&base_url).json(&payload_force);
    if let Some(ref token) = proxy_auth { req_force = req_force.bearer_auth(token); }
    else if let Some(ref key) = api_key { req_force = req_force.bearer_auth(key); }
    let resp_force = req_force.send().await.map_err(|e| e.to_string())?;
    if resp_force.status().is_success() {
      let body_force: serde_json::Value = resp_force.json().await.map_err(|e| e.to_string())?;
      if let Some(content) = body_force.get("choices").and_then(|c| c.get(0)).and_then(|c0| c0.get("message")).and_then(|m| m.get("content")).and_then(|v| v.as_str()) {
        if content.contains("```") {
          let after = content.splitn(2, "```").nth(1).unwrap_or("").to_string();
          let code_inner = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };
          if !code_inner.trim().is_empty() {
            extracted_code_block = Some(code_inner.clone());
            code_output = Some(if matches!(mode, ChatMode::Agent) { sanitize_agent_commands(&code_inner) } else { code_inner });
          }
        } else if looks_like_shell(content) {
          code_output = Some(if matches!(mode, ChatMode::Agent) { sanitize_agent_commands(content) } else { content.to_string() }.trim().to_string());
        }
      }
    }
  }

  // Attempt to parse assistant_text as JSON; if fails, use heuristics

  if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&assistant_text) {
    ai_response = parsed.get("ai_response").and_then(|v| v.as_str()).unwrap_or(&ai_response).to_string();
    code_output = parsed.get("code_output").and_then(|v| v.as_str()).map(|s| s.to_string());
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
        ai_response = assistant_text.clone();
        if extracted_code_block.is_none() {
          let after = assistant_text.splitn(2, "```").nth(1).unwrap_or("").to_string();
          let code_inner = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };
          if !code_inner.trim().is_empty() { extracted_code_block = Some(code_inner); }
        }
      } else {
        explanation = Some(assistant_text.clone());
      }
    }
  }

  // If explanation exists but is only a fenced code block and we're in AGENT mode, synthesize explanation
  if matches!(mode, ChatMode::Agent) {
    if let Some(ref expl_text) = explanation {
      let t = expl_text.trim();
      if t.starts_with("```") {
        let after = t.splitn(2, "```").nth(1).unwrap_or("").to_string();
        let code_inner = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };

        let mut parts: Vec<String> = Vec::new();
        if let Some(idx) = code_inner.find("cat >") {
          let rest = &code_inner[idx + "cat >".len()..];
          let filename = rest.split_whitespace().next().map(|s| s.trim().to_string());
          let mut file_content = String::new();
          if let Some(start_doc) = code_inner.find("<<'EOF'") {
            let after_doc = &code_inner[start_doc + "<<'EOF'".len()..];
            if let Some(end_doc) = after_doc.find("EOF") {
              file_content = after_doc[..end_doc].to_string();
            } else {
              file_content = after_doc.to_string();
            }
          } else if let Some(start_doc2) = code_inner.find("<<EOF") {
            let after_doc = &code_inner[start_doc2 + "<<EOF".len()..];
            if let Some(end_doc) = after_doc.find("EOF") {
              file_content = after_doc[..end_doc].to_string();
            } else {
              file_content = after_doc.to_string();
            }
          }

          if let Some(fname) = filename {
            let mut desc = format!("Se creó el archivo '{}' usando un here-doc.", fname);
            let fc = file_content.trim();
            if !fc.is_empty() {
              if fc.lines().next().map(|l| l.contains("#!")).unwrap_or(false) {
                let first = fc.lines().next().unwrap_or("").trim();
                if first.contains("python") {
                  desc.push_str(" Contiene un shebang para Python.");
                } else {
                  desc.push_str(&format!(" Contiene un shebang ({}).", first));
                }
              }
              if fc.contains("print(") {
                desc.push_str(" Incluye una llamada a print() que imprimirá texto en la consola.");
              }
              if let Some(line) = fc.lines().find(|l| !l.trim().is_empty()) {
                let preview = line.trim();
                desc.push_str(&format!(" El primer contenido significativo es: '{}'", preview));
              }
            }
            parts.push(desc);
          }
        }

        if parts.is_empty() {
          if let Some(first_line) = code_inner.lines().find(|l| !l.trim().is_empty()) {
            parts.push(format!("Ejecuta: {}", first_line.trim()));
          } else {
            parts.push("Ejecuta varios comandos proporcionados por el asistente.".to_string());
          }
        }

        let mut expl = parts.join(" ");
        if !expl.ends_with('.') { expl.push('.'); }
        explanation = Some(expl.clone());
        if summary.is_none() {
          let first_sentence = expl.split(|c| c == '.' || c == '\n').find(|s| !s.trim().is_empty()).map(|s| s.trim().to_string());
          if let Some(mut s) = first_sentence {
            if !s.ends_with('.') { s.push('.'); }
            summary = Some(s);
          }
        }
      }
    }
  }

  // Synthesize short summary if missing
  if summary.is_none() {
    if let Some(ref expl) = explanation {
      if expl.contains("```") {
        let after = expl.splitn(2, "```").nth(1).unwrap_or("").to_string();
        let code_inner = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };
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

  if matches!(mode, ChatMode::Agent) && explanation.is_none() {
    let code_inner = if let Some(cb) = extracted_code_block.clone() {
      cb
    } else {
      let code_source = if !ai_response.is_empty() { ai_response.clone() } else { assistant_text.clone() };
      if let Some(start) = code_source.find("```") {
        let after = &code_source[start + 3..];
        if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() }
      } else { code_source.clone() }
    };

    if !code_inner.trim().is_empty() {
      let ask_system = get_system_prompt(&ChatMode::Ask);
      let ask_user = format!("Por favor, explica EN ESPAÑOL a un usuario sin conocimientos técnicos qué hará el siguiente bloque de comandos/archivo y cómo se creó. No repitas el código, explica en lenguaje sencillo paso a paso lo que se hizo y qué resultado produce. Código:\n\n{}\n", code_inner);
      let payload2 = serde_json::json!({
        "model": model_id,
        "messages": [
          {"role": "system", "content": ask_system},
          {"role": "user", "content": ask_user}
        ],
        "max_tokens": 300,
        "temperature": 0.2
      });

      let mut req2 = client.post(&base_url).json(&payload2);
      if let Some(ref token) = proxy_auth { req2 = req2.bearer_auth(token); }
      else if let Some(ref key) = api_key { req2 = req2.bearer_auth(key); }
      let resp2 = req2
        .send()
        .await
        .map_err(|e| e.to_string())?;

      if resp2.status().is_success() {
        let body2: serde_json::Value = resp2.json().await.map_err(|e| e.to_string())?;
        let assistant2 = body2
          .get("choices")
          .and_then(|c| c.get(0))
          .and_then(|c0| c0.get("message"))
          .and_then(|m| m.get("content"))
          .and_then(|v| v.as_str())
          .unwrap_or("")
          .to_string();
        if !assistant2.trim().is_empty() {
          // Sanear: nunca mostrar mensaje de identidad como explicación si no fue pedido
          let ident = "Soy un cliente SSH de la Universidad Piloto de Colombia que te ayudará con tus dudas de Linux y de la terminal en general.";
          let mut cleaned2 = assistant2.replace(ident, "").trim().to_string();
          if cleaned2.is_empty() { cleaned2 = assistant2.clone(); }
          let at_lower = cleaned2.trim().to_lowercase();
          // Si quedó vacío o sigue siendo identidad, omitir explicación
          if cleaned2.trim().is_empty() || at_lower == ident.to_lowercase() || at_lower.contains("universidad piloto de colombia") {
            // no establecer explanation
          } else {
            explanation = Some(cleaned2.clone());
          }
          if summary.is_none() {
            let first_sentence = cleaned2.split(|c| c == '.' || c == '\n').find(|s| !s.trim().is_empty()).map(|s| s.trim().to_string());
            if let Some(mut s) = first_sentence {
              if !s.ends_with('.') { s.push('.'); }
              summary = Some(s);
            }
          }
        }
      }
    }

    let mut parts: Vec<String> = Vec::new();

    if let Some(idx) = code_inner.find("cat >") {
      let rest = &code_inner[idx + "cat >".len()..];
      let filename = rest.split_whitespace().next().map(|s| s.trim().to_string());
      let mut file_content = String::new();
      if let Some(start_doc) = code_inner.find("<<'EOF'") {
        let after = &code_inner[start_doc + "<<'EOF'".len()..];
        if let Some(end_doc) = after.find("EOF") {
          file_content = after[..end_doc].to_string();
        } else {
          file_content = after.to_string();
        }
      } else if let Some(start_doc2) = code_inner.find("<<EOF") {
        let after = &code_inner[start_doc2 + "<<EOF".len()..];
        if let Some(end_doc) = after.find("EOF") {
          file_content = after[..end_doc].to_string();
        } else {
          file_content = after.to_string();
        }
      }

      if let Some(fname) = filename {
        let mut desc = format!("Se creó el archivo '{}' usando un here-doc.", fname);
        let fc = file_content.trim();
        if !fc.is_empty() {
          if fc.lines().next().map(|l| l.contains("#!")).unwrap_or(false) {
            let first = fc.lines().next().unwrap_or("").trim();
            if first.contains("python") {
              desc.push_str(" Contiene un shebang para Python.");
            } else {
              desc.push_str(&format!(" Contiene un shebang ({}).", first));
            }
          }
          if fc.contains("print(") {
            desc.push_str(" Incluye una llamada a print() que imprimirá texto en la consola.");
          }
          if let Some(line) = fc.lines().find(|l| !l.trim().is_empty()) {
            let preview = line.trim();
            if preview.len() > 120 {
              desc.push_str(&format!(" El primer contenido significativo comienza con: '{}...'", &preview[..120]));
            } else {
              desc.push_str(&format!(" El primer contenido significativo es: '{}'", preview));
            }
          }
        }
        parts.push(desc);
      } else {
        parts.push("Crea un archivo usando here-doc".to_string());
      }
    }

    if code_inner.contains("chmod +x") { parts.push("Marca el/los archivo(s) como ejecutable(s) usando chmod +x".to_string()); }
    if code_inner.contains("#!/usr/bin/env python") || code_inner.contains("python3") || code_inner.contains("python") { parts.push("Escribe un script en Python y/o establece el shebang para ejecutarlo con python".to_string()); }
    if code_inner.contains("ls ") || code_inner.trim_start().starts_with("ls") { parts.push("Lista archivos/directorios (ls)".to_string()); }
    if code_inner.contains("mkdir ") { parts.push("Crea un directorio (mkdir)".to_string()); }
    if code_inner.contains("rm ") { parts.push("Elimina archivos (rm). Atención: operación destructiva".to_string()); }
    if code_inner.contains("echo ") { parts.push("Imprime texto en consola o redirige contenido".to_string()); }

    if parts.is_empty() {
      if let Some(first_line) = code_inner.lines().find(|l| !l.trim().is_empty()) {
        parts.push(format!("Ejecuta: {}", first_line.trim()));
      } else {
        parts.push("Ejecuta varios comandos proporcionados por el asistente.".to_string());
      }
    }

    let mut expl_text = parts.join(" ");
    if !expl_text.ends_with('.') { expl_text.push('.'); }
    if explanation.is_none() {
      explanation = Some(expl_text.clone());
      if summary.is_none() {
        let first_sentence = expl_text.split(|c| c == '.' || c == '\n').find(|s| !s.trim().is_empty()).map(|s| s.trim().to_string());
        if let Some(mut s) = first_sentence { if !s.ends_with('.') { s.push('.'); } summary = Some(s); }
      }
    }
  }

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
