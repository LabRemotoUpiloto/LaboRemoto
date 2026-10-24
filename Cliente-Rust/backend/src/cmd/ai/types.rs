//! Tipos del chat de IA (modos, estado del agente, petición/respuesta y eventos).

use serde::{Deserialize, Serialize};

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
pub(super) struct AiChunkEvent {
  pub(super) request_id: String,
  pub(super) delta: String,
}

#[derive(Serialize, Clone)]
pub(super) struct AiUsageEvent {
  pub(super) request_id: String,
  pub(super) input_tokens: u64,
  pub(super) output_tokens: u64,
  pub(super) model: String,
}

/// Extrae el delta de texto de un chunk SSE (OpenAI o Claude).
pub(super) fn sse_extract_delta(data: &str, is_claude: bool) -> Option<String> {
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
