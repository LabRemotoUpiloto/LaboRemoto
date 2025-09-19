use serde::{Deserialize, Serialize};
use reqwest::Client;
use dotenvy::dotenv;
use std::{env, fs};
use std::path::PathBuf;

// Mensajes canónicos
const MENSAJE_IDENTIDAD: &str = "Soy un cliente SSH de la Universidad Piloto de Colombia que te ayudará con tus dudas de Linux y de la terminal en general.";
const MENSAJE_FUERA_DE_ALCANCE: &str = "No tengo contenido para esa solicitud. Puedo ayudarte con temas de Linux por terminal (comandos, scripts, configuración). Intenta con una pregunta relacionada o escribe de nuevo tu solicitud.";
const MENSAJE_CAPACIDADES: &str = "Puedo ayudarte con temas de Linux por terminal:\n\n- Explicar comandos, rutas, permisos y procesos.\n- Sugerir y componer comandos seguros para tu objetivo.\n- Crear guías paso a paso para principiantes (usando nano).\n- Generar scripts sencillos (bash/python) y explicar cómo usarlos.\n- Resolver errores de la terminal y configurar servicios comunes (systemctl, apt/yum/pacman, etc.).\n\nDime qué quieres lograr y te doy los pasos o el comando adecuado.";

/// Tipo de modo del chat
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub enum ChatMode {
  #[default]
  #[serde(alias = "ASK", alias = "Ask", alias = "consulta", alias = "CONSULTA", alias = "Consulta")]
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
  let identidad_regla = format!(r#"REGLA DE IDENTIDAD:
Si, y SOLO SI, la pregunta del usuario es explícitamente sobre tu identidad (por ejemplo: '¿quién eres?', 'qué eres', 'cuál es tu identidad', 'quién es el agente'), responde EXACTAMENTE:
"{ident_msg}"
No añadas texto adicional, disculpas ni explicaciones cuando apliques esta regla.
"#, ident_msg = MENSAJE_IDENTIDAD);

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
MODO CONSULTA (ASK) — GENERAL

Eres un asistente de terminal Linux. Usa la memoria de sesión (cwd, archivos creados, últimos resultados) para decidir contexto, PERO no imprimas historial previo a menos que el usuario lo pida.

0) Detecta intención del usuario
- Si la petición es explicativa/teórica ("explica…", "qué es…", "por qué…", "diferencias…", "cómo funciona…", "mejores prácticas…")
  → Usa FORMATO INFORMATIVO (sin comandos ni código ejecutable; solo mini-ejemplos no ejecutables si ayudan).
- Si la petición implica crear/hacer algo ("crea…", "configura…", "instala…", "genera un script…", "edita…", "prepara…", "paso a paso…")
  → Usa FORMATO PASO A PASO (principiantes) con nano (interactivo).
- Si explícitamente pide "solo el comando" o "un script listo"
  → Entrega SOLO lo pedido al final, pero antecede un Resumen breve.

1) FORMATO INFORMATIVO (cuando NO toca crear código)
Estructura obligatoria:
1) Resumen (1–2 líneas)
   - Qué es y para qué sirve, sin jerga.
2) Idea clave
   - Síntesis conceptual en 1–3 bullets.
3) Cómo funciona (conceptos)
   - Bullets cortos: componentes, flujo, cuándo usarlo/cuándo no.
4) Ejemplos conceptuales (opcionales, NO ejecutables)
   - Pseudocaso o salida de ejemplo como texto (no `bash`).
5) Buenas prácticas y errores comunes
   - 3–6 bullets accionables.
6) FAQ rápida (opcional)
   - 2–4 preguntas y respuestas cortas.
7) Siguiente paso (opcional)
   - Si luego quieren hacerlo, indica: "Dime y te muestro los pasos con comandos."

Reglas del formato informativo:
- No incluyas bloques `bash` ni editores; si necesitas mostrar algo, usa bloque sin sintaxis (o `text`).
- Mantén lenguaje claro, para principiantes.
- Si el usuario luego pide acción, cambia a PASO A PASO.

2) FORMATO PASO A PASO (principiantes, cuando SÍ hay que crear/hacer)
Estructura obligatoria:
0) Prerrequisitos (solo si faltan)
   - Paquetes mínimos y cómo instalarlos (1 línea por distro).
1) Paso 1 — Abrir/crear archivo con nano (si aplica)
   - "Escribe este comando y presiona Enter:"
   ```bash
   nano <NOMBRE_DEL_ARCHIVO>
   ```
   - "Copia y pega ESTE código dentro de nano:" (bloque completo del código)
   - "Guarda y cierra: Ctrl+O, Enter; Ctrl+X."
2) Paso 2 — Permisos (si aplica)
   ```bash
   chmod +x <NOMBRE_DEL_ARCHIVO>
   ```
3) Paso 3 — Ejecutar/usar
   ```bash
   ./<NOMBRE_DEL_ARCHIVO> <argumentos_si_aplican>
   ```

¿Qué deberías ver?
- 1–3 líneas con salida esperada (texto literal simple).

Verificación rápida (opcional)
- 1–2 comandos simples extra (otro ejemplo de uso).

Errores comunes y solución
- 2–4 bullets con correcciones directas.

(Opcional) Alternativa sin nano (avanzado)
- Solo si el usuario lo pide: here-doc en bloque aparte.

Reglas del formato paso a paso:
- Un comando por bloque (no encadenes con && ni ;).
- Evita here-doc y banderas avanzadas en el flujo principal.
- No uses ls/history/cd .. salvo que el usuario lo pida.
- Usa español claro: "Escribe… Presiona Enter… Copia y pega…".
- No imprimas historial; usa la memoria solo para decidir rutas o nombres.
- Mantén consistencia de nombres de archivo (por ejemplo, "calculadora.sh" en todos los pasos).

3) EXCEPCIONES DE RENDER
- Si el usuario dice "solo el comando": entrega una sola línea en bash + una línea de contexto.
- Si dice "un script listo": entrega un bloque bash con shebang y `set -euo pipefail`.
- Si pide ver el historial: muestra una sección "Historial de sesión" fuera de los bloques de pasos.

4) TONO Y ESTILO
- Didáctico, directo, para principiantes. Primero el "qué es/por qué", luego el "cómo".
- Respuestas compactas; si el tema es amplio, prioriza claridad y bullets.
- Responde en español.
"#, identidad = identidad_regla);
  }

  // Mover campos del request a variables locales para evitar clones innecesarios
  let AiChatRequest { user_input, mode, history, state } = req;

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
  fn is_noise_or_out_of_domain(s: &str) -> bool {
    let t = s.trim();
    if t.is_empty() { return true; }
    let simple_noise = ["?","??","???","/","//","////","...","….","…","asdf","asdfasdf","aaaa","aaaaa","jeje","jaja"]; // casos típicos
    if simple_noise.iter().any(|n| t.eq_ignore_ascii_case(n)) { return true; }
    // Relación alfanuméricos vs otros
    let mut alnum = 0usize; let mut other = 0usize; let mut max_run = 1usize; let mut cur_run = 1usize; let mut prev: Option<char> = None;
    for ch in t.chars() {
      if ch.is_alphanumeric() { alnum += 1; } else if !ch.is_whitespace() { other += 1; }
      if let Some(p) = prev { if p == ch { cur_run += 1; if cur_run > max_run { max_run = cur_run; } } else { cur_run = 1; } } else { cur_run = 1; }
      prev = Some(ch);
    }
    let total = alnum + other;
    if total > 0 {
      let ratio = (alnum as f32) / (total as f32);
      if ratio < 0.3 || max_run >= 5 { return true; }
    }
    // Fuera de dominio: deportes, farándula, recetas, clima, etc., sin términos de Linux
    let n = normalize_for_checks(t);
    let ood = [
      "partido","marcador","gol","futbol","nba","premier","tenis","receta","cocina","novela","fara ndula","farándula","chisme","actor","pelicula","cine","clima","horoscopo","salud","medicina","doct or","medico","medico","enfermedad"
    ];
    let domain = [
      "linux","bash","terminal","comando","comandos","script","shell","ubuntu","debian","fedora","arch","centos","red hat","systemctl","apt","yum","pacman","ssh","sftp","scp","servidor","proceso","servicio","archivo","carpeta","directorio"
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

  // Detección simple: el usuario pide CREAR algo (archivo/script/TXT)
  fn looks_like_creation_request(s: &str) -> bool {
    let n = normalize_for_checks(s);
    let keys = [
      "crea", "crear", "creame", "créame", "cree", "creeme",
      "genera", "generar", "construye", "construir",
      "haz", "has", "hazme", "hasme",
      "archivo", "fichero", "script", "txt",
      "guardar", "guarda", "escribe", "exporta", "exportar",
      "imprime", "imprimir", "imprima"
    ];
    keys.iter().any(|k| n.contains(k))
  }

  fn looks_like_explanatory_query(s: &str) -> bool {
    let t = s.to_lowercase();
    let q = [
      "que significa", "qué significa", "que es", "qué es", "por que", "por qué",
      "explica", "explicame", "explícame", "significado", "que hace", "qué hace",
      "me sale", "me aparece", "error:", "unable to", "permission denied", "no such file or directory"
    ];
    let imperative = [
      "instala", "crea", "genera", "ejecuta", "descarga", "inicia", "configura", "borra", "elimina", "mueve", "copia",
      "compila", "construye", "mkdir ", "cd ", "chmod", "curl", "wget", "git "
    ];
    let likely_q = q.iter().any(|k| t.contains(k)) || t.contains('?') || t.contains('¿');
    let has_imp = imperative.iter().any(|k| t.contains(k));
    likely_q && !has_imp
  }

  // Reglas deterministas para instrucción única (COMMAND vs SCRIPT)
  #[derive(Debug, Clone, PartialEq, Eq)]
  enum SingleKind { Command, Script }
  fn is_single_instruction(s: &str) -> Option<(String, String, SingleKind)> {
    let t = s.to_lowercase();
    let n = normalize_for_checks(&t);
    // Conectores prohibidos
    let connectors = ["&&", "||", ";", "|", " entonces ", " then ", " y luego ", " luego ", " despues ", " después ", " primero ", " segundo ", " tercero ", " 1) ", " 2) ", " 3) "];
    for c in connectors.iter() { if n.contains(c) { return None; } }
    // Lista blanca de verbos imperativos
    let verbs = [
      "mostrar","listar","ver","imprimir","ejecutar","correr","abrir","crear","generar",
      "compilar","instalar","desinstalar","iniciar","detener","comprobar","verificar","descargar",
      "mover","copiar","borrar","eliminar","editar","reemplazar"
    ];
    let mut found_verb: Option<&str> = None;
    for v in verbs.iter() {
      if n.contains(&format!(" {} ", v)) || n.starts_with(v) || n.ends_with(v) { // aproximación simple
        if found_verb.is_some() { return None; } // más de un verbo
        found_verb = Some(v);
      }
    }
    let verb = match found_verb { Some(v) => v.to_string(), None => return None };
    // Clasificación SCRIPT vs COMMAND
    let mut kind = SingleKind::Command;
    let script_hints = ["script","programa","código","codigo","funcion","clase",".py",".js",".sh","#!/bin/bash","#!/usr/bin/env python"]; 
    if script_hints.iter().any(|k| t.contains(k)) { kind = SingleKind::Script; }
    let fence_count = t.matches("```").count();
    if fence_count >= 2 { kind = SingleKind::Script; }
    // Objeto aproximado: resto del texto sin el verbo principal
    let obj = n.replace(&verb, "").trim().to_string();
    let object = if obj.is_empty() { "instrucción".to_string() } else { obj };
    Some((verb, object, kind))
  }

  // Orden de evaluación previo a cualquier flujo ASK/AGENT/SUPER
  if is_identity_query_strict(&user_input) {
    return Ok(AiChatResponse {
      user_input,
      ai_response: MENSAJE_IDENTIDAD.to_string(),
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
      ai_response: MENSAJE_FUERA_DE_ALCANCE.to_string(),
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
      ai_response: MENSAJE_CAPACIDADES.to_string(),
      code_output: None,
      explanation: None,
      summary: None,
      backup_path: None,
      requires_confirmation: false,
      state: state,
    });
  }

  let system_prompt = get_system_prompt(&mode);

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
    // API sin estado: el cliente controla y envía todo el historial
    for item in hist.iter() {
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

  // Si en modo AGENT detectamos una instrucción única, pedimos al modelo un JSON v1 estandarizado
  if matches!(mode, ChatMode::Agent) {
    if let Some((verb, object, kind)) = is_single_instruction(&user_input) {
      let schema_hint = r#"Devuelve SOLO un JSON con este esquema exacto (sin texto fuera del JSON):
{
  "version": "v1",
  "kind": "single_instruction",
  "classification": "COMMAND | SCRIPT | UNKNOWN",
  "intent": {"verb": "...", "object": "..."},
  "explanation": "...",
  "payload": {
    "shell": "bash | powershell | cmd",
    "command": "...",
    "language": "python | bash | node | ...",
    "filename": "main.py",
    "code": "..."
  },
  "recommendation": "...",
  "placeholders": [{"name":"<ruta>","description":"...","example":"..."}],
  "preconditions": ["..."],
  "privilege": {"requires_sudo": false, "risk_level": "low | medium | high"},
  "actions": [{"type":"RUN","target":"terminal | editor","label":"Ejecutar"}]
}"#;
      let classification = match kind { SingleKind::Command => "COMMAND", SingleKind::Script => "SCRIPT" };
      let user_directive = if matches!(kind, SingleKind::Command) {
        format!("Tarea: Genera JSON v1. Caso: SINGLE INSTRUCTION = TRUE; CLASSIFICATION = COMMAND. Shell objetivo: bash. Comando objetivo (uno solo, sin &&, ;, |). Redacta explanation (<140 chars). Incluye recommendation si aplica. No agregues texto fuera del JSON. Entrada del usuario: {}", user_input)
      } else {
        format!("Tarea: Genera JSON v1. Caso: SINGLE INSTRUCTION = TRUE; CLASSIFICATION = SCRIPT. Lenguaje destino: el más obvio (python/bash). Nombre de archivo sugerido opcional. El bloque code debe ser mínimo y ejecutable si es posible. Explanation (<140 chars). No agregues texto fuera del JSON. Entrada del usuario: {}", user_input)
      };
      let sys_rules = format!(
        "Sigue reglas deterministas. Verb principal: {verb}. Objeto: {object}. Clasificación: {classification}. Validaciones duras: para COMMAND, rechaza conectores (&&, ||, ;, |). Marca requires_sudo=true si detectas operaciones peligrosas (rm -rf, mkfs, dd, chmod -R 777, chown -R, shutdown, reboot, escribir en /etc). Normaliza shell 'bash'. {schema}",
        verb=verb, object=object, classification=classification, schema=schema_hint
      );

      let payload_si = serde_json::json!({
        "model": model_id,
        "messages": [
          {"role":"system","content": sys_rules},
          {"role":"user","content": user_directive}
        ],
        "max_tokens": 600,
        "temperature": 0.1
      });

  // Construir URL del endpoint (aún no hemos definido base_url en este flujo)
  let target_url = proxy_url.clone().unwrap_or_else(|| "https://api.openai.com/v1/chat/completions".to_string());
  let mut req_si = client.post(&target_url).json(&payload_si);
      if let Some(ref token) = proxy_auth { req_si = req_si.bearer_auth(token); }
      else if let Some(ref key) = api_key { req_si = req_si.bearer_auth(key); }
      if let Ok(resp_si) = req_si.send().await {
        if resp_si.status().is_success() {
          if let Ok(val) = resp_si.json::<serde_json::Value>().await {
            if let Some(content) = val.get("choices").and_then(|c| c.get(0)).and_then(|c0| c0.get("message")).and_then(|m| m.get("content")).and_then(|v| v.as_str()) {
              let txt = content.trim();
              let extracted = if txt.contains("```") {
                let after = txt.splitn(2, "```").nth(1).unwrap_or("").to_string();
                if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after }
              } else { txt.to_string() };
              if let Ok(v) = serde_json::from_str::<serde_json::Value>(&extracted) {
                if v.get("version").and_then(|x| x.as_str()) == Some("v1") && v.get("kind").and_then(|x| x.as_str()).map(|s| s.eq_ignore_ascii_case("single_instruction")).unwrap_or(false) {
                  let explanation = v.get("explanation").and_then(|x| x.as_str()).map(|s| s.to_string());
                  let summary = explanation.clone();
                  return Ok(AiChatResponse{
                    user_input,
                    ai_response: v.to_string(),
                    code_output: None,
                    explanation,
                    summary,
                    backup_path: None,
                    requires_confirmation: false,
                    state: state,
                  });
                }
              }
            }
          }
        }
      }
      // Si falla, continuamos con el flujo normal
    }
  }

  // Build the request payload for OpenAI Chat completions
  let payload = serde_json::json!({
    "model": model_id,
    "messages": messages,
    "max_tokens": 800,
    "temperature": if matches!(mode, ChatMode::Agent) { 0.1 } else { 0.1 }
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

  // Bandera global: instrucción única de creación (script/archivo) → forzar ejecución en UN SOLO paso
  let single_inst_creation: bool = matches!(mode, ChatMode::Agent)
    && is_single_instruction(&user_input).is_some()
    && looks_like_creation_request(&user_input);

  // (Heurísticas desactivadas por pedido: no se hará clasificación difusa de identidad)

  // Evitar identidad redundante en ASK: eliminar la frase exacta si vino pegada accidentalmente
  if matches!(mode, ChatMode::Ask) && !is_identity_query_strict(&user_input) {
    let mut cleaned = assistant_text.replace(MENSAJE_IDENTIDAD, "");
    // Variante con espacio antes del punto
    let ident_spaced = MENSAJE_IDENTIDAD.replace(".", " .");
    cleaned = cleaned.replace(&ident_spaced, "");
    // Variante sin punto final
    let ident_nopunct = MENSAJE_IDENTIDAD.trim_end_matches('.');
    cleaned = cleaned.replace(ident_nopunct, "");
    assistant_text = cleaned.trim().to_string();
  }

  // Si en ASK la salida quedó vacía o parece solo identidad, reintenta una vez con instrucción más estricta (API genera el contenido)
  if matches!(mode, ChatMode::Ask) && !is_identity_query_strict(&user_input) {
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
  let ident_norm = strip_diacritics(MENSAJE_IDENTIDAD).to_lowercase();
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
        for item in hist {
          let role = match item.role.as_str() {"assistant"|"user"|"system"=>item.role.clone(), "ai"|"bot"=>"assistant".to_string(), _=>"user".to_string()};
          retry_messages.push(serde_json::json!({"role": role, "content": item.content}));
        }
      }
      retry_messages.push(serde_json::json!({"role":"user","content": user_input.clone()}));

      let retry_payload = serde_json::json!({
        "model": model_id,
        "messages": retry_messages,
        "max_tokens": 900,
        "temperature": 0.1
      });
      let mut retry_req = client.post(base_url.clone()).json(&retry_payload);
      if let Some(ref token) = proxy_auth { retry_req = retry_req.bearer_auth(token); }
      else if let Some(ref key) = api_key { retry_req = retry_req.bearer_auth(key); }
      if let Ok(retry_resp) = retry_req.send().await {
        if retry_resp.status().is_success() {
          if let Ok(v) = retry_resp.json::<serde_json::Value>().await {
            if let Some(text) = v.get("choices").and_then(|c| c.get(0)).and_then(|c0| c0.get("message")).and_then(|m| m.get("content")).and_then(|v| v.as_str()) {
              let txt = text.trim();
              if !txt.is_empty() { assistant_text = txt.to_string(); }
            }
          }
        }
      }
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

  

  // Variables de salida que iremos completando según el flujo
  let mut ai_response = String::new();
  let mut code_output: Option<String> = None;
  let mut explanation: Option<String> = None;
  let mut summary: Option<String> = None;

  // Solo en modo AGENT extraer/propagar code_output; ASK/CONSULTA no deben emitir código
  // If the assistant returned a fenced code block, extract it for later use (AGENT solo)
  let mut extracted_code_block: Option<String> = None;
  if matches!(mode, ChatMode::Agent) {
    if assistant_text.contains("```") {
      let after = assistant_text.splitn(2, "```").nth(1).unwrap_or("").to_string();
      let raw = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };
      let code_inner = strip_leading_lang_tag(&raw);
      if !code_inner.trim().is_empty() {
        extracted_code_block = Some(code_inner.clone());
        // Expose normalized commands/content to the frontend explicitly
        code_output = Some(code_inner);
      }
    } else {
      // Sin fences: si parece shell, expónlo como code_output para que el frontend muestre confirmación
      if looks_like_shell(&assistant_text) {
        code_output = Some(assistant_text.trim().to_string());
      }
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
            let raw = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };
            let code_inner = strip_leading_lang_tag(&raw);
            if !code_inner.trim().is_empty() {
              extracted_code_block = Some(code_inner.clone());
              let sanitized = if matches!(mode, ChatMode::Agent) { sanitize_agent_commands(&code_inner) } else { code_inner };
              if looks_like_explanatory_query(&user_input) && sanitized.trim_start().starts_with("echo ") {
                ai_response = assistant_text.clone();
              } else {
                code_output = Some(sanitized);
              }
            }
          } else if looks_like_shell(content) {
            // Reparación devolvió texto sin fences
            let sanitized = if matches!(mode, ChatMode::Agent) { sanitize_agent_commands(content) } else { content.to_string() }.trim().to_string();
            if looks_like_explanatory_query(&user_input) && sanitized.trim_start().starts_with("echo ") {
              ai_response = assistant_text.clone();
            } else {
              code_output = Some(sanitized);
            }
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
          let raw = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };
          let code_inner = strip_leading_lang_tag(&raw);
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
          let raw = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };
          let code_inner = strip_leading_lang_tag(&raw);
          if !code_inner.trim().is_empty() { extracted_code_block = Some(code_inner); }
        }
      } else {
        // Solo establecer explicación de texto si aún NO tenemos comandos/código para ejecutar
        if code_output.is_none() { explanation = Some(assistant_text.clone()); }
      }
    }
  }

  // If explanation exists but is only a fenced code block and we're in AGENT mode, synthesize explanation
  // Additionally in AGENT: if we detect MULTIPLE commands, FORCE asking the model for a structured plan JSON with per-step 'explain'
  if matches!(mode, ChatMode::Agent) {
    // Always consider asking for a plan when multiple commands are present
    // Fuente de comandos para generar plan: primero code_output (si no es JSON), luego bloque extraído, luego fences de ai_response o assistant_text
    let code_inner = if let Some(ref co) = code_output {
      let t = co.trim();
      if !(t.starts_with('{') || t.starts_with('[')) { t.to_string() } else {
        if let Some(cb) = extracted_code_block.clone() { strip_leading_lang_tag(&cb) } else {
          let code_source = if !ai_response.is_empty() { ai_response.clone() } else { assistant_text.clone() };
          if let Some(start) = code_source.find("```") {
            let after = &code_source[start + 3..];
            let raw = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };
            strip_leading_lang_tag(&raw)
          } else { code_source.clone() }
        }
      }
    } else if let Some(cb) = extracted_code_block.clone() {
      strip_leading_lang_tag(&cb)
    } else {
      let code_source = if !ai_response.is_empty() { ai_response.clone() } else { assistant_text.clone() };
      if let Some(start) = code_source.find("```") {
        let after = &code_source[start + 3..];
        let raw = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };
        strip_leading_lang_tag(&raw)
      } else { code_source.clone() }
    };
    if !code_inner.trim().is_empty() {
      let trimmed_code = code_inner.trim();
      let looks_json_plan = trimmed_code.starts_with('{') || trimmed_code.starts_with('[');
      // quick split to estimate if there are multiple commands (respect heredoc sections)
      let mut in_heredoc = false;
      let mut step_count = 0usize;
      for line in trimmed_code.lines() {
        let l = line.trim();
        if l.is_empty() { continue; }
        if l.contains("<<EOF") || l.contains("<<'EOF'") || l.contains("<<\"EOF\"") { in_heredoc = true; step_count += 1; continue; }
        if in_heredoc {
          if l == "EOF" { in_heredoc = false; }
          continue;
        }
        // Count each non-empty line as a potential separate command
        step_count += 1;
      }
      let multiple_cmds = step_count >= 2;
      // Para instrucción única de creación, NO pedimos plan multi-paso al modelo
      if multiple_cmds && !looks_json_plan && !single_inst_creation {
        let sys = "Devuelve SOLO JSON válido. Nada de Markdown, nada de comentarios. Idioma: español.";
        let user = format!(
          "Convierte los comandos siguientes en un plan estructurado con explicación por paso. Requisitos estrictos:\n- Formato JSON exacto:\n{{\n  \"plan\": {{\n    \"title\": string,\n    \"steps\": [{{\"desc\": string, \"cmd\": string, \"explain\": string}}...]\n  }}\n}}\n- 'explain' debe ser 1–2 frases en lenguaje sencillo que expliquen PARA QUÉ sirve el comando y QUÉ hará aquí.\n- No agregues claves extra. No uses Markdown.\n- Mantén los comandos tal cual, uno por paso (divide si hay varias líneas).\nContexto del usuario: {}\nComandos/archivo:\n{}",
          user_input,
          code_inner
        );
        let payload_plan = serde_json::json!({
          "model": model_id,
          "messages": [
            {"role": "system", "content": sys},
            {"role": "user", "content": user}
          ],
          "max_tokens": 600,
          "temperature": 0.2
        });
        let mut reqp = client.post(&base_url).json(&payload_plan);
        if let Some(ref token) = proxy_auth { reqp = reqp.bearer_auth(token); }
        else if let Some(ref key) = api_key { reqp = reqp.bearer_auth(key); }
        if let Ok(rp) = reqp.send().await {
          if rp.status().is_success() {
            if let Ok(vp) = rp.json::<serde_json::Value>().await {
              if let Some(content) = vp.get("choices").and_then(|c| c.get(0)).and_then(|c0| c0.get("message")).and_then(|m| m.get("content")).and_then(|v| v.as_str()) {
                let txt = content.trim();
                // Try to parse as JSON to ensure it's valid and contains plan.steps
                if let Ok(j) = serde_json::from_str::<serde_json::Value>(txt) {
                  // Normalize step explanation field name to 'explain' using aliases
                  let mut j = j;
                  if let Some(plan_obj) = j.get_mut("plan") {
                    if let Some(steps) = plan_obj.get_mut("steps").and_then(|s| s.as_array_mut()) {
                      for step in steps.iter_mut() {
                        let has_explain = step.get("explain").and_then(|v| v.as_str()).map(|s| !s.trim().is_empty()).unwrap_or(false);
                        if !has_explain {
                          let alias = step.get("explanation").or(step.get("why")).or(step.get("note")).and_then(|v| v.as_str()).map(|s| s.to_string());
                          if let Some(val) = alias {
                            if let Some(obj) = step.as_object_mut() { obj.insert("explain".to_string(), serde_json::Value::String(val)); }
                          }
                        }
                      }
                    }
                  }
                  let has_steps = j.get("plan").and_then(|p| p.get("steps")).and_then(|s| s.as_array()).map(|a| !a.is_empty()).unwrap_or(false);
                  if has_steps {
                    let json_txt = j.to_string();
                    // Duplicar el plan JSON en varios campos para que el frontend siempre lo encuentre
                    explanation = Some(json_txt.clone());
                    ai_response = json_txt.clone();
                    code_output = Some(json_txt.clone());
                  }
                }
              }
            }
          }
        }
      }
    }
    if let Some(ref expl_text) = explanation {
      let t = expl_text.trim();
      if t.starts_with("```") {
        let after = t.splitn(2, "```").nth(1).unwrap_or("").to_string();
        let raw = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };
        let code_inner = strip_leading_lang_tag(&raw);

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

  if matches!(mode, ChatMode::Agent) && explanation.is_none() {
    let code_inner = if let Some(cb) = extracted_code_block.clone() {
      strip_leading_lang_tag(&cb)
    } else {
      let code_source = if !ai_response.is_empty() { ai_response.clone() } else { assistant_text.clone() };
      if let Some(start) = code_source.find("```") {
        let after = &code_source[start + 3..];
        let raw = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after.to_string() };
        strip_leading_lang_tag(&raw)
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
          let mut cleaned2 = assistant2.replace(MENSAJE_IDENTIDAD, "").trim().to_string();
          if cleaned2 == assistant2 {
            let ident_spaced = MENSAJE_IDENTIDAD.replace(".", " .");
            cleaned2 = cleaned2.replace(&ident_spaced, "").trim().to_string();
          }
          if cleaned2.is_empty() { cleaned2 = assistant2.clone(); }
          let at_lower = cleaned2.trim().to_lowercase();
          // Si quedó vacío o sigue siendo identidad, omitir explicación
          if cleaned2.trim().is_empty() || at_lower == MENSAJE_IDENTIDAD.to_lowercase() || at_lower.contains("universidad piloto de colombia") {
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

  // En modo ASK/CONSULTA: no devolver comandos shell ejecutables, pero permitir JSON (plan/acciones)
  if matches!(mode, ChatMode::Ask) {
    if let Some(ref code) = code_output {
      let t = code.trim();
      let looks_json = t.starts_with('{') || t.starts_with('[');
      if !looks_json {
        code_output = None; // era shell/texto, no exponer ejecutable
      }
    }
  }

  // Si el usuario en modo ASK pide explícitamente CREAR un archivo/script/TXT,
  // y no tenemos JSON de acciones, pedimos al modelo un JSON 'ui-v1' estructurado.
  if matches!(mode, ChatMode::Ask) && looks_like_creation_request(&user_input) {
    let mut already_has_actions = false;
    let ai = ai_response.trim();
    if !ai.is_empty() {
      if let Ok(v) = serde_json::from_str::<serde_json::Value>(ai) {
        already_has_actions = v.get("actions").is_some();
      }
    }
    if !already_has_actions {
      let req_prompt = format!(
        "Genera SOLO un JSON (sin texto adicional) con 'version':'ui-v1', 'mode':'agent', 'intent':'create', 'summary', 'explanation', y 'actions' para crear lo pedido. Incluye create_file con 'path' relativo, 'mode' si aplica y 'content' completo; y comandos de ejecución opcionales. NO devuelvas fences ni bloque de código. Petición: {}",
        user_input
      );
      let payload_json = serde_json::json!({
        "model": model_id,
        "messages": [
          {"role":"system", "content": get_system_prompt(&ChatMode::Agent)},
          {"role":"user", "content": req_prompt}
        ],
        "max_tokens": 900,
        "temperature": 0.2
      });
      let mut req_j = client.post(&base_url).json(&payload_json);
      if let Some(ref token) = proxy_auth { req_j = req_j.bearer_auth(token); }
      else if let Some(ref key) = api_key { req_j = req_j.bearer_auth(key); }
      if let Ok(resp_j) = req_j.send().await { if resp_j.status().is_success() {
        if let Ok(body_j) = resp_j.json::<serde_json::Value>().await {
          if let Some(content) = body_j.get("choices").and_then(|c| c.get(0)).and_then(|c0| c0.get("message")).and_then(|m| m.get("content")).and_then(|v| v.as_str()) {
            // El modelo puede envolver el JSON en fences; extraer el interior si aplica
            let txt = content.trim();
            let extracted = if txt.contains("```") {
              let after = txt.splitn(2, "```").nth(1).unwrap_or("").to_string();
              let raw = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after };
              raw
            } else { txt.to_string() };
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&extracted) {
              if v.get("actions").is_some() || v.get("version").is_some() {
                // Colocar el JSON completo en ai_response; no es código ejecutable
                ai_response = v.to_string();
                // Asegurar summary/explanation si vienen
                if explanation.is_none() { explanation = v.get("explanation").and_then(|x| x.as_str()).map(|s| s.to_string()); }
                if summary.is_none() { summary = v.get("summary").and_then(|x| x.as_str()).map(|s| s.to_string()); }
                // No establecer code_output en ASK para evitar ejecución; el frontend renderiza acciones/plan
                code_output = None;
              }
            }
          }
        }
      }}
    }
  }

  // NUEVO: En modo AGENT, si no obtuvimos bloque de comandos ni plan y la intención es CREAR (archivo/script),
  // solicita al modelo un JSON 'ui-v1' de acciones (create_file + command) para que el frontend lo convierta a script.
  if matches!(mode, ChatMode::Agent) && code_output.is_none() && extracted_code_block.is_none() && looks_like_creation_request(&user_input) {
    let req_prompt = format!(
      "Genera SOLO un JSON (sin texto adicional) con 'version':'ui-v1', 'mode':'agent', 'intent':'create', 'summary', 'explanation', y 'actions' para crear lo pedido. Incluye create_file con 'path' relativo y 'content' completo; y comandos de ejecución opcionales. NO devuelvas fences ni bloque de código. Petición: {}",
      user_input
    );
    let payload_json = serde_json::json!({
      "model": model_id,
      "messages": [
        {"role":"system", "content": get_system_prompt(&ChatMode::Agent)},
        {"role":"user", "content": req_prompt}
      ],
      "max_tokens": 900,
      "temperature": 0.2
    });
    let mut req_j = client.post(&base_url).json(&payload_json);
    if let Some(ref token) = proxy_auth { req_j = req_j.bearer_auth(token); }
    else if let Some(ref key) = api_key { req_j = req_j.bearer_auth(key); }
    if let Ok(resp_j) = req_j.send().await { if resp_j.status().is_success() {
      if let Ok(body_j) = resp_j.json::<serde_json::Value>().await {
        if let Some(content) = body_j.get("choices").and_then(|c| c.get(0)).and_then(|c0| c0.get("message")).and_then(|m| m.get("content")).and_then(|v| v.as_str()) {
          let txt = content.trim();
          let extracted = if txt.contains("```") {
            let after = txt.splitn(2, "```").nth(1).unwrap_or("").to_string();
            let raw = if let Some(end_rel) = after.find("```") { after[..end_rel].to_string() } else { after };
            raw
          } else { txt.to_string() };
          let mut accepted = false;
          if let Ok(v) = serde_json::from_str::<serde_json::Value>(&extracted) {
            let has_actions = v.get("actions").and_then(|a| a.as_array()).map(|arr| !arr.is_empty()).unwrap_or(false);
            if has_actions {
              // Devolver JSON completo; el frontend lo convertirá a script y mostrará el botón
              ai_response = v.to_string();
              if explanation.is_none() { explanation = v.get("explanation").and_then(|x| x.as_str()).map(|s| s.to_string()); }
              if summary.is_none() { summary = v.get("summary").and_then(|x| x.as_str()).map(|s| s.to_string()); }
              accepted = true;
            }
          }
          // Si no aceptamos (no hay acciones), reintentar una vez con prompt más estricto
          if !accepted {
            let req_prompt2 = format!(
              "Reintento estricto: DEVUELVE SOLO JSON válido sin Markdown. Es obligatorio incluir 'version':'ui-v1' y un arreglo 'actions' con al menos 1 elemento 'create_file' con 'path' y 'content' completo. Puedes añadir luego una acción 'command' para ejecutarlo. Petición: {}",
              user_input
            );
            let payload_json2 = serde_json::json!({
              "model": model_id,
              "messages": [
                {"role":"system", "content": get_system_prompt(&ChatMode::Agent)},
                {"role":"user", "content": req_prompt2}
              ],
              "max_tokens": 900,
              "temperature": 0.1
            });
            let mut req_j2 = client.post(&base_url).json(&payload_json2);
            if let Some(ref token) = proxy_auth { req_j2 = req_j2.bearer_auth(token); }
            else if let Some(ref key) = api_key { req_j2 = req_j2.bearer_auth(key); }
            if let Ok(resp_j2) = req_j2.send().await { if resp_j2.status().is_success() {
              if let Ok(body_j2) = resp_j2.json::<serde_json::Value>().await {
                if let Some(content2) = body_j2.get("choices").and_then(|c| c.get(0)).and_then(|c0| c0.get("message")).and_then(|m| m.get("content")).and_then(|v| v.as_str()) {
                  let txt2 = content2.trim();
                  let extracted2 = if txt2.contains("```") {
                    let after2 = txt2.splitn(2, "```").nth(1).unwrap_or("").to_string();
                    let raw2 = if let Some(end_rel2) = after2.find("```") { after2[..end_rel2].to_string() } else { after2 };
                    raw2
                  } else { txt2.to_string() };
                  if let Ok(v2) = serde_json::from_str::<serde_json::Value>(&extracted2) {
                    let has_actions2 = v2.get("actions").and_then(|a| a.as_array()).map(|arr| !arr.is_empty()).unwrap_or(false);
                    if has_actions2 {
                      ai_response = v2.to_string();
                      if explanation.is_none() { explanation = v2.get("explanation").and_then(|x| x.as_str()).map(|s| s.to_string()); }
                      if summary.is_none() { summary = v2.get("summary").and_then(|x| x.as_str()).map(|s| s.to_string()); }
                    }
                  }
                }
              }
            }}
          }
        }
      }
    }}
  }

  // En modo AGENT: si hay code_output con comandos, también devolvemos un plan estructurado
  if matches!(mode, ChatMode::Agent) {
    if let Some(ref code) = code_output {
      // No generar un plan local si code_output ya contiene JSON (plan/acciones) del modelo
      let trimmed = code.trim();
      let looks_json = trimmed.starts_with('{') || trimmed.starts_with('[');
      if looks_json { }
      else {
      // Dividir en pasos simples respetando here-doc (<<EOF ... EOF), y evitando partir pipelines
      fn split_line_ops(line: &str) -> Vec<String> {
        let mut parts: Vec<String> = Vec::new();
        let mut cur = String::new();
        let mut q: Option<char> = None;
        let bytes: Vec<char> = line.chars().collect();
        let mut i = 0;
        while i < bytes.len() {
          let ch = bytes[i];
          let next = if i + 1 < bytes.len() { Some(bytes[i+1]) } else { None };
          if let Some(qq) = q {
            cur.push(ch);
            if ch == qq { q = None; }
            i += 1; continue;
          }
          if ch == '\'' || ch == '"' || ch == '`' { q = Some(ch); cur.push(ch); i += 1; continue; }
          // cortar en &&, ||, ; pero no en una sola |
          if (ch == '&' && next == Some('&')) || (ch == '|' && next == Some('|')) || ch == ';' {
            if !cur.trim().is_empty() { parts.push(cur.trim().to_string()); }
            if (ch == '&' && next == Some('&')) || (ch == '|' && next == Some('|')) { i += 2; } else { i += 1; }
            cur.clear();
            continue;
          }
          if ch == '#' { break; } // comentario
          cur.push(ch); i += 1;
        }
        if !cur.trim().is_empty() { parts.push(cur.trim().to_string()); }
        parts
      }
      fn split_into_steps(code: &str) -> Vec<String> {
        let mut steps: Vec<String> = Vec::new();
        let mut lines = code.lines().peekable();
        while let Some(raw) = lines.next() {
          let line = raw.trim();
          if line.is_empty() { continue; }
          // here-doc bloque
          if line.contains("<<EOF") || line.contains("<<'EOF'") || line.contains("<<\"EOF\"") {
            let mut chunk = String::new();
            chunk.push_str(line);
            while let Some(nl) = lines.next() {
              chunk.push('\n');
              chunk.push_str(nl);
              if nl.trim() == "EOF" { break; }
            }
            steps.push(chunk.trim().to_string());
            continue;
          }
          // dividir por operadores manteniendo pipelines
          for part in split_line_ops(line) { if !part.is_empty() { steps.push(part); } }
        }
        steps
      }
      fn describe_cmd(cmd: &str) -> String {
        let s = cmd.trim();
        if s.is_empty() { return String::from(""); }
        let lower = s.to_lowercase();
        if let Some(rest) = s.strip_prefix("mkdir ") { return format!("Crear el directorio {}.", rest.trim()); }
        if let Some(rest) = s.strip_prefix("cd ") { return format!("Entrar al directorio {}.", rest.trim()); }
        if let Some(rest) = s.strip_prefix("touch ") { return format!("Crear el archivo vacío {}.", rest.trim()); }
        if lower.starts_with("git clone ") {
          let parts: Vec<&str> = s.split_whitespace().collect();
          if parts.len() >= 3 { return format!("Clonar el repositorio {} en la carpeta {}.", parts[2], parts.get(3).unwrap_or(&".")); }
          if parts.len() >= 2 { return format!("Clonar el repositorio {}.", parts[2]); }
        }
        if lower.starts_with("npm install") || lower.starts_with("yarn install") || lower.starts_with("pnpm install") {
          return "Instalar dependencias del proyecto.".to_string();
        }
        if lower.starts_with("cargo build") { return "Compilar el proyecto Rust (cargo build).".to_string(); }
        if lower.starts_with("cargo run") { return "Ejecutar el binario del proyecto Rust (cargo run).".to_string(); }
        if lower.starts_with("chmod +x") { return "Dar permisos de ejecución al archivo.".to_string(); }
        if lower.starts_with("mv ") { return "Mover o renombrar archivos/directorios.".to_string(); }
        if lower.starts_with("cp ") { return "Copiar archivos o directorios.".to_string(); }
        if lower.contains("cat >") && lower.contains("<<") { return "Crear un archivo con contenido (here-doc).".to_string(); }
        if lower.contains(">>") || lower.contains(">") { return "Escribir/añadir contenido a un archivo.".to_string(); }
        "Ejecutar el comando indicado.".to_string()
      }

      let steps_raw = split_into_steps(code);
      if single_inst_creation {
        // Colapsar todo en un solo paso: ejecutar todo el bloque como una única acción
        let single_step = serde_json::json!({
          "plan": {
            "title": "Ejecución única",
            "steps": [
              {"desc": "Crear y preparar el archivo/ejecutar el script solicitado.", "cmd": code.trim(), "explain": "Un solo paso que crea el archivo, ajusta permisos y muestra su contenido si aplica."}
            ]
          }
        });
        code_output = Some(single_step.to_string());
      } else if steps_raw.len() >= 2 {
        let steps_json: Vec<serde_json::Value> = steps_raw.iter()
          .map(|cmd| serde_json::json!({ "desc": describe_cmd(cmd), "cmd": cmd }))
          .collect();
        let plan = serde_json::json!({ "plan": { "title": "Plan de ejecución", "steps": steps_json } });
        code_output = Some(plan.to_string());
      } else if steps_raw.len() == 1 {
        // Un solo paso: preservar el comando original en code_output (sin plan)
        if let Some(first) = steps_raw.into_iter().next() { code_output = Some(first); }
      }
      }
    }
  }

  // Refuerzo final: para instrucción única de creación, si existe un PLAN con múltiples pasos
  // (posiblemente devuelto por el modelo en JSON), colapsarlo a un solo paso concatenando comandos.
  if single_inst_creation {
    // Intenta en code_output primero
    let mut collapsed: Option<String> = None;
    if let Some(ref co) = code_output {
      let t = co.trim();
      if t.starts_with('{') {
        if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(t) {
          let steps_opt = v.get("plan").and_then(|p| p.get("steps")).and_then(|s| s.as_array());
          if let Some(steps) = steps_opt {
            if steps.len() >= 2 {
              let mut cmds: Vec<String> = Vec::new();
              for st in steps {
                if let Some(cmd) = st.get("cmd").and_then(|c| c.as_str()) {
                  if !cmd.trim().is_empty() { cmds.push(cmd.trim().to_string()); }
                }
              }
              if !cmds.is_empty() {
                let merged = cmds.join("\n");
                let one = serde_json::json!({
                  "plan": {
                    "title": "Ejecución única",
                    "steps": [ {"desc": "Crear y ejecutar lo solicitado en un solo paso.", "cmd": merged, "explain": "Se ejecutará todo el bloque como una sola acción."} ]
                  }
                });
                collapsed = Some(one.to_string());
              }
            }
          }
        }
      }
    }
    // Si no, intenta colapsar plan en ai_response/explanation
    if collapsed.is_none() {
      let candidates: Vec<&String> = [
        if !ai_response.trim().is_empty() { Some(&ai_response) } else { None },
        explanation.as_ref()
      ].into_iter().flatten().collect();
      for cand in candidates {
        let t = cand.trim();
        if t.starts_with('{') {
          if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(t) {
            let steps_opt = v.get("plan").and_then(|p| p.get("steps")).and_then(|s| s.as_array());
            if let Some(steps) = steps_opt {
              if steps.len() >= 2 {
                let mut cmds: Vec<String> = Vec::new();
                for st in steps {
                  if let Some(cmd) = st.get("cmd").and_then(|c| c.as_str()) {
                    if !cmd.trim().is_empty() { cmds.push(cmd.trim().to_string()); }
                  }
                }
                if !cmds.is_empty() {
                  let merged = cmds.join("\n");
                  let one = serde_json::json!({
                    "plan": {
                      "title": "Ejecución única",
                      "steps": [ {"desc": "Crear y ejecutar lo solicitado en un solo paso.", "cmd": merged, "explain": "Se ejecutará todo el bloque como una sola acción."} ]
                    }
                  });
                  collapsed = Some(one.to_string());
                  break;
                }
              }
            }
          }
        }
      }
    }
    if let Some(one) = collapsed {
      code_output = Some(one.clone());
      // Mantener duplicación ligera para robustez de frontend
      ai_response = one.clone();
      explanation = Some(one);
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
