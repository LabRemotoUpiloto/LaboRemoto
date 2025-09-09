use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use crate::error::AppError;
use crate::ssh::client::{Session, ChanCmd};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use crate::storage;
use serde::{Deserialize, Serialize};
use reqwest::Client;
use dotenvy::dotenv;
use std::env;

#[derive(Serialize, Deserialize)]
pub struct AiChatRequest {
  pub user_input: String,
  pub mode: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct AiChatResponse {
  pub user_input: String,
  pub ai_response: String,
  pub code_output: Option<String>,
  pub explanation: Option<String>,
  pub summary: Option<String>,
}

#[tauri::command]
pub async fn ai_chat(req: AiChatRequest) -> Result<AiChatResponse, String> {
  // Load .env to pick up OPENAI_API_KEY (dotenvy is safe on desktop)
  let _ = dotenv();
  let api_key = env::var("OPENAI_API_KEY").map_err(|_| "OPENAI_API_KEY not set".to_string())?;

  // Build system prompt depending on mode — use the exact rules provided by the user
  fn get_system_prompt(agent_mode: &str) -> String {
    // Use a raw string literal to avoid heavy escaping
    let identidad_regla = r#"REGLA DE IDENTIDAD:
Si, y SOLO SI, la pregunta del usuario es explícitamente sobre tu identidad (por ejemplo: '¿quién eres?', 'qué eres', 'cuál es tu identidad', 'quién es el agente'), responde EXACTAMENTE:
"Soy un agente en consola diseñado para apoyar el aprendizaje en el uso de Linux."
No añadas texto adicional, disculpas ni explicaciones cuando apliques esta regla.
"#;

    if agent_mode == "AGENT" {
      return format!(r#"{identidad}
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

Reglas de comportamiento:
- Si el usuario pide crear un archivo o programa, SIEMPRE usa here-doc con cat > archivo <<'EOF' … EOF.
- Añade chmod +x si aplica para scripts.
- Evita comandos destructivos sin salvaguardas (valida rutas distintas de / o $HOME).

Ejemplo válido:

cat > script.sh <<'EOF'
#!/usr/bin/env bash
echo "hola"
EOF
chmod +x script.sh

"#, identidad = identidad_regla);
    }

    // ASK mode
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

  let mode = req.mode.clone().unwrap_or_else(|| "ASK".to_string());
  let system_prompt = get_system_prompt(&mode);

  // Build the request payload for OpenAI Chat completions (gpt-4o or gpt-4.1 depending on availability)
  let client = Client::builder().build().map_err(|e| e.to_string())?;
  let payload = serde_json::json!({
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "system", "content": system_prompt},
      {"role": "user", "content": req.user_input}
    ],
    "max_tokens": 800,
    "temperature": 0.2
  });

  let resp = client
    .post("https://api.openai.com/v1/chat/completions")
  .bearer_auth(&api_key)
    .json(&payload)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !resp.status().is_success() {
    let status = resp.status();
    let txt = resp.text().await.unwrap_or_default();
    return Err(format!("OpenAI API error {}: {}", status, txt));
  }

  let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

  // Try to extract the assistant message text
  let assistant_text = body
    .get("choices")
    .and_then(|c| c.get(0))
    .and_then(|c0| c0.get("message"))
    .and_then(|m| m.get("content"))
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_string();

  // If the assistant returned a fenced code block, extract it for later use
  let mut extracted_code_block: Option<String> = None;
  if assistant_text.contains("") {
    let after = assistant_text.splitn(2, "").nth(1).unwrap_or("").to_string();
    let code_inner = if let Some(end_rel) = after.find("") { after[..end_rel].to_string() } else { after.to_string() };
    if !code_inner.trim().is_empty() {
      extracted_code_block = Some(code_inner);
    }
  }

  // Attempt to parse assistant_text as JSON; if fails, use heuristics
  // initialize as empty; we'll assign either ai_response or explanation (not both) to avoid duplicate content
  let mut ai_response = String::new();
  let mut code_output: Option<String> = None;
  let mut explanation: Option<String> = None;
  let mut summary: Option<String> = None;

  if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&assistant_text) {
    ai_response = parsed.get("ai_response").and_then(|v| v.as_str()).unwrap_or(&ai_response).to_string();
    code_output = parsed.get("code_output").and_then(|v| v.as_str()).map(|s| s.to_string());
    explanation = parsed.get("explanation").and_then(|v| v.as_str()).map(|s| s.to_string());
    // If the model returned a summary, sanitize it (strip fences and trim). If it's just punctuation/backticks, ignore it.
    summary = parsed.get("summary").and_then(|v| v.as_str()).map(|s| s.to_string());
    if let Some(ref mut s) = summary {
      // remove  fences and surrounding backticks
      let mut cleaned = s.replace("", "").replace('`', "").trim().to_string();
      // trim again
      cleaned = cleaned.trim().to_string();
      if cleaned.is_empty() || cleaned.chars().all(|c| c == '.' || c == ',' || c == '!' || c == '?' ) {
        // ignore meaningless summary
        summary = None;
      } else {
        *s = cleaned;
      }
    }
  } else {
    // If text contains RUN_CMD: prefix, return it as ai_response so UI can detect and offer run
    if assistant_text.contains("RUN_CMD:") {
      ai_response = assistant_text.clone();
    } else {
      // plain text answer -> put in explanation, keep ai_response empty to avoid duplication
      // If the assistant_text looks like a fenced code block, keep it in ai_response so frontend can run it
      if assistant_text.trim_start().starts_with("") {
        // place the raw code in ai_response for detection/sending
        ai_response = assistant_text.clone();
        // also extract inner code if not already
        if extracted_code_block.is_none() {
          let after = assistant_text.splitn(2, "").nth(1).unwrap_or("").to_string();
          let code_inner = if let Some(end_rel) = after.find("") { after[..end_rel].to_string() } else { after.to_string() };
          if !code_inner.trim().is_empty() { extracted_code_block = Some(code_inner); }
        }
      } else {
        explanation = Some(assistant_text.clone());
      }
    }
  }

  // If explanation exists but is only a fenced code block (common when model returned code in explanation),
  // and we're in AGENT mode, synthesize a human-readable explanation from the code block.
  if mode == "AGENT" {
    if let Some(ref expl_text) = explanation {
      let t = expl_text.trim();
      if t.starts_with("") {
        // extract inner code
        let after = t.splitn(2, "").nth(1).unwrap_or("").to_string();
        let code_inner = if let Some(end_rel) = after.find("") { after[..end_rel].to_string() } else { after.to_string() };

        // Build a natural explanation similar to the AGENT heuristic
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

  // If no explicit summary was returned by the model, synthesize a short one.
  if summary.is_none() {
    if let Some(ref expl) = explanation {
      // If the explanation contains a fenced code block, extract its contents and synthesize from it
      if expl.contains("") {
        let after = expl.splitn(2, "").nth(1).unwrap_or("").to_string();
        let code_inner = if let Some(end_rel) = after.find("") { after[..end_rel].to_string() } else { after.to_string() };
        // Take the first meaningful line from the code and make a short summary
        if let Some(first_line) = code_inner.lines().find(|l| !l.trim().is_empty()) {
          let fl = first_line.trim();
          summary = Some(format!("Ejecuta: {}.", fl));
        }
      } else {
        // Use the first non-empty sentence/line from the explanation as a concise summary, but skip code-fence-only tokens
        let candidate = expl.split(|c| c == '.' || c == '\n')
          .find(|s| {
            let t = s.trim();
            if t.is_empty() { return false; }
            // skip if token looks like code fence or only backticks/punctuation
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
      // Fallback: take the first non-empty line of ai_response and label it
      let first = ai_response.lines().find(|l| !l.trim().is_empty()).map(|s| s.trim().to_string());
      if let Some(f) = first {
        summary = Some(format!("Comando sugerido: {}", f));
      }
    }
  }

  // If in AGENT mode and we still lack a helpful explanation, synthesize one from the command(s).
  // This handles cases where the model returned only a code block and no natural-language explanation.
  if mode == "AGENT" && explanation.is_none() {
    // Prefer the code content: either ai_response (if present) or the raw assistant_text
    // Prefer the extracted code block if available
    let code_inner = if let Some(cb) = extracted_code_block.clone() {
      cb
    } else {
      // fallback to ai_response or assistant_text
      let code_source = if !ai_response.is_empty() { ai_response.clone() } else { assistant_text.clone() };
      if let Some(start) = code_source.find("") {
        let after = &code_source[start + 3..];
        if let Some(end_rel) = after.find("") { after[..end_rel].to_string() } else { after.to_string() }
      } else { code_source.clone() }
    };

    // If we have code, call the model again in ASK mode to produce a user-friendly explanation
    if !code_inner.trim().is_empty() {
      // Build an ASK-mode prompt asking to explain for a non-technical user
      let ask_system = get_system_prompt("ASK");
      let ask_user = format!("Por favor, explica EN ESPAÑOL a un usuario sin conocimientos técnicos qué hará el siguiente bloque de comandos/archivo y cómo se creó. No repitas el código, explica en lenguaje sencillo paso a paso lo que se hizo y qué resultado produce. Código:\n\n{}\n", code_inner);
      let payload2 = serde_json::json!({
        "model": "gpt-3.5-turbo",
        "messages": [
          {"role": "system", "content": ask_system},
          {"role": "user", "content": ask_user}
        ],
        "max_tokens": 300,
        "temperature": 0.2
      });

      let resp2 = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(&api_key)
        .json(&payload2)
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
          explanation = Some(assistant2.clone());
          // also set a concise summary from the first sentence
          if summary.is_none() {
            let first_sentence = assistant2.split(|c| c == '.' || c == '\n').find(|s| !s.trim().is_empty()).map(|s| s.trim().to_string());
            if let Some(mut s) = first_sentence {
              if !s.ends_with('.') { s.push('.'); }
              summary = Some(s);
            }
          }
        }
      }
    }

    // Heuristic analysis: build a natural-language explanation from the code
    let mut parts: Vec<String> = Vec::new();

    // Attempt to detect a here-doc that creates a file: cat > filename <<'EOF'
    if let Some(idx) = code_inner.find("cat >") {
      let rest = &code_inner[idx + "cat >".len()..];
      let filename = rest.split_whitespace().next().map(|s| s.trim().to_string());
      // extract the full here-doc content if present
      let mut file_content = String::new();
      if let Some(start_doc) = code_inner.find("<<'EOF'") {
        let after = &code_inner[start_doc + "<<'EOF'".len()..];
        if let Some(end_doc) = after.find("EOF") {
          file_content = after[..end_doc].to_string();
        } else {
          // fallback: take remainder
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
        // Build a rich description about the created file
        let mut desc = format!("Se creó el archivo '{}' usando un here-doc.", fname);
        // analyze file_content
        let fc = file_content.trim();
        if !fc.is_empty() {
          // detect shebang
          if fc.lines().next().map(|l| l.contains("#!")).unwrap_or(false) {
            let first = fc.lines().next().unwrap_or("").trim();
            if first.contains("python") {
              desc.push_str(" Contiene un shebang para Python.");
            } else {
              desc.push_str(&format!(" Contiene un shebang ({}).", first));
            }
          }
          // detect key actions/content
          if fc.contains("print(") {
            desc.push_str(" Incluye una llamada a print() que imprimirá texto en la consola.");
          }
          // include a short preview (first meaningful line)
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

    if code_inner.contains("chmod +x") {
      parts.push("Marca el/los archivo(s) como ejecutable(s) usando chmod +x".to_string());
    }

    if code_inner.contains("#!/usr/bin/env python") || code_inner.contains("python3") || code_inner.contains("python") {
      parts.push("Escribe un script en Python y/o establece el shebang para ejecutarlo con python".to_string());
    }

    if code_inner.contains("ls ") || code_inner.trim_start().starts_with("ls") {
      parts.push("Lista archivos/directorios (ls)".to_string());
    }

    if code_inner.contains("mkdir ") {
      parts.push("Crea un directorio (mkdir)".to_string());
    }

    if code_inner.contains("rm ") {
      parts.push("Elimina archivos (rm). Atención: operación destructiva".to_string());
    }

    if code_inner.contains("echo ") {
      parts.push("Imprime texto en consola o redirige contenido".to_string());
    }

    // If nothing recognized, fall back to a generic description using the first non-empty line
    if parts.is_empty() {
      if let Some(first_line) = code_inner.lines().find(|l| !l.trim().is_empty()) {
        parts.push(format!("Ejecuta: {}", first_line.trim()));
      } else {
        parts.push("Ejecuta varios comandos proporcionados por el asistente.".to_string());
      }
    }

    // Join into an explanation (Spanish), ensure it ends with a period
    let mut expl_text = parts.join(" ");
    if !expl_text.ends_with('.') { expl_text.push('.'); }
    // Only set heuristic explanation if the API did not already provide one
    if explanation.is_none() {
      explanation = Some(expl_text.clone());

      // If summary still empty, set a short summary from the explanation (first sentence)
      if summary.is_none() {
        let first_sentence = expl_text.split(|c| c == '.' || c == '\n').find(|s| !s.trim().is_empty()).map(|s| s.trim().to_string());
        if let Some(mut s) = first_sentence {
          if !s.ends_with('.') { s.push('.'); }
          summary = Some(s);
        }
      }
    }
  }

  Ok(AiChatResponse {
    user_input: req.user_input,
    ai_response,
    code_output,
    explanation,
  summary,
  })
}

static SESSIONS: Lazy<Mutex<HashMap<String, Session>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub async fn ssh_connect(
  app: AppHandle,
  host: String,
  port: u16,
  user: String,
  password: String,
  cols: u32,
  rows: u32,
) -> Result<String, String> {
  let (session, mut rx_out) =
    Session::connect_password(&host, port, &user, &password, cols, rows)
      .await
      .map_err(|e| e.to_string())?;

  let id = Uuid::new_v4().to_string();
  {
    let mut map = SESSIONS.lock().unwrap();
    map.insert(id.clone(), session);
  }

  // Mensaje inicial
  let _ = app.emit(&format!("ssh_out_{}", id), Some(format!("Conectado a {user}@{host}:{port}\r\n")));

  // Reenviar salida a la UI como evento Tauri
  let app2 = app.clone();
  let id_spawn = id.clone();
  tokio::spawn(async move {
    while let Some(buf) = rx_out.recv().await {
      let s = String::from_utf8_lossy(&buf).into_owned();
      let _ = app2.emit(&format!("ssh_out_{}", id_spawn), Some(s));
    }
  });

  Ok(id)
}

#[tauri::command]
pub async fn ssh_stdin(id: String, data: String, encoding: Option<String>) -> Result<(), String> {
  let tx = {
    let map = SESSIONS.lock().unwrap();
    map.get(&id).ok_or_else(|| AppError::NotFound.to_string())?.tx.clone()
  };
  let bytes = if let Some(enc) = encoding {
    if enc == "base64" {
      match STANDARD.decode(&data) {
        Ok(b) => b,
        Err(_) => return Err("base64 decode error".to_string()),
      }
    } else {
      data.into_bytes()
    }
  } else {
    data.into_bytes()
  };
  tx.send(ChanCmd::Send(bytes))
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_resize(id: String, cols: u32, rows: u32) -> Result<(), String> {
  let tx = {
    let map = SESSIONS.lock().unwrap();
    map.get(&id).ok_or_else(|| AppError::NotFound.to_string())?.tx.clone()
  };
  tx.send(ChanCmd::Resize { cols, rows })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_disconnect(id: String) -> Result<(), String> {
  let tx = {
    let mut map = SESSIONS.lock().unwrap();
    let Some(session) = map.remove(&id) else {
      return Err(AppError::NotFound.to_string());
    };
    session.tx.clone()
  };
  let _ = tx.send(ChanCmd::Close);
  Ok(())
}

// --- storage commands (per-host encrypted JSON) ---

#[tauri::command]
pub async fn save_host_encrypted(passphrase: String, id: String, json_payload: String) -> Result<(), String> {
  storage::save_host_with_pass(&passphrase, &id, &json_payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_host_encrypted(passphrase: String, id: String) -> Result<String, String> {
  storage::load_host_with_pass(&passphrase, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_host_master(id: String, json_payload: String) -> Result<(), String> {
  storage::save_host_with_master(&id, &json_payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_host_master(id: String) -> Result<String, String> {
  storage::load_host_with_master(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_hosts_files() -> Result<Vec<String>, String> {
  storage::list_hosts().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_hosts_entries() -> Result<Vec<serde_json::Value>, String> {
  storage::list_hosts_entries().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_connect_stored(
  app: AppHandle,
  id: String,
  cols: u32,
  rows: u32,
) -> Result<String, String> {
  // Load host payload from storage (master-key)
  // If id looks like a filename returned by list_hosts_entries, load by file name, otherwise treat as id
  let payload_json = if id.ends_with(".json.enc") {
    storage::load_host_from_file(&id).map_err(|e| e.to_string())?
  } else {
    storage::load_host_with_master(&id).map_err(|e| e.to_string())?
  };
  let v: serde_json::Value = serde_json::from_str(&payload_json).map_err(|e| e.to_string())?;
  let host = v.get("host").and_then(|s| s.as_str()).ok_or_else(|| "missing host".to_string())?.to_string();
  let port = v.get("port").and_then(|p| p.as_u64()).ok_or_else(|| "missing port".to_string())? as u16;
  let user = v.get("user").and_then(|s| s.as_str()).ok_or_else(|| "missing user".to_string())?.to_string();
  let password = v.get("password").and_then(|s| s.as_str()).ok_or_else(|| "missing password".to_string())?.to_string();

  // Establish session using the same code as ssh_connect
  let (session, mut rx_out) =
    Session::connect_password(&host, port, &user, &password, cols, rows)
      .await
      .map_err(|e| e.to_string())?;

  let id = Uuid::new_v4().to_string();
  {
    let mut map = SESSIONS.lock().unwrap();
    map.insert(id.clone(), session);
  }

  let _ = app.emit(&format!("ssh_out_{}", id), Some(format!("Conectado a {user}@{host}:{port}\r\n")));

  let app2 = app.clone();
  let id_spawn = id.clone();
  tokio::spawn(async move {
    while let Some(buf) = rx_out.recv().await {
      let s = String::from_utf8_lossy(&buf).into_owned();
      let _ = app2.emit(&format!("ssh_out_{}", id_spawn), Some(s));
    }
  });

  Ok(id)
}

#[tauri::command]
pub async fn delete_host_file(id: String) -> Result<(), String> {
  storage::delete_host(&id).map_err(|e| e.to_string())
}