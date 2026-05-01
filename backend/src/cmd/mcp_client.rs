// cmd/mcp_client.rs — Cliente MCP (Model Context Protocol) vía stdio
// ────────────────────────────────────────────────────────────────────
// Implementa JSON-RPC 2.0 sobre stdin/stdout de subprocesos MCP externos.
//
// Flujo por llamada:
//   1. spawn(command + args)
//   2. initialize handshake
//   3. tools/list  o  tools/call
//   4. child termina (drop)
//
// Comandos Tauri expuestos:
//   mcp_register_server  — registra un servidor, cachea sus tools en disco
//   mcp_list_servers     — lista servidores registrados con tools cacheadas
//   mcp_remove_server    — elimina un servidor del registro
//   mcp_refresh_tools    — reconecta y actualiza el caché de tools
//
// API interna (usada por tools.rs):
//   load_mcp_tool_defs() → Vec<serde_json::Value>  (esquemas Claude-format)
//   exec_mcp_call(name, input) → Option<(String, bool)>

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};

// ─── Tipos públicos ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpServerConfig {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Schemas de tools cacheados al momento de registrar / refrescar.
    #[serde(default)]
    pub tools: Vec<McpToolDef>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpToolDef {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub input_schema: serde_json::Value,
}

// ─── Persistencia (~/AppData/Roaming/ssh-client/mcp_servers.json) ────────────

fn config_path() -> Option<std::path::PathBuf> {
    ProjectDirs::from("com", "upiloto", "ssh-client")
        .map(|dirs| dirs.config_dir().join("mcp_servers.json"))
}

fn load_configs() -> Vec<McpServerConfig> {
    let path = match config_path() {
        Some(p) => p,
        None => return vec![],
    };
    match std::fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => vec![],
    }
}

fn save_configs(configs: &[McpServerConfig]) -> Result<(), String> {
    let path = config_path().ok_or("No se puede determinar el directorio de configuración")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(configs).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Sesión MCP ───────────────────────────────────────────────────────────────
// Wrapper sobre un subproceso. Se crea, usa, y destruye por petición.

struct McpSession {
    _child: Child,
    stdin: ChildStdin,
    reader: BufReader<std::process::ChildStdout>,
    next_id: u32,
}

impl McpSession {
    fn start(cfg: &McpServerConfig) -> Result<Self, String> {
        let mut cmd = Command::new(&cfg.command);
        cmd.args(&cfg.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        for (k, v) in &cfg.env {
            cmd.env(k, v);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("No se pudo iniciar '{}': {}", cfg.command, e))?;
        let stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        Ok(McpSession {
            _child: child,
            stdin,
            reader: BufReader::new(stdout),
            next_id: 1,
        })
    }

    fn send(&mut self, msg: &serde_json::Value) -> Result<(), String> {
        let line = serde_json::to_string(msg).map_err(|e| e.to_string())?;
        writeln!(self.stdin, "{}", line).map_err(|e| e.to_string())?;
        self.stdin.flush().map_err(|e| e.to_string())?;
        Ok(())
    }

    fn recv(&mut self) -> Result<serde_json::Value, String> {
        let mut line = String::new();
        self.reader.read_line(&mut line).map_err(|e| e.to_string())?;
        if line.is_empty() {
            return Err("El servidor MCP cerró la conexión inesperadamente".into());
        }
        serde_json::from_str(line.trim())
            .map_err(|e| format!("JSON inválido del servidor MCP: {e} → {}", line.trim()))
    }

    /// Devuelve el primer mensaje con este id (salta notificaciones sin id).
    fn recv_for_id(&mut self, id: u32) -> Result<serde_json::Value, String> {
        for _ in 0..20 {
            let msg = self.recv()?;
            if msg.get("id").and_then(|v| v.as_u64()) == Some(id as u64) {
                return Ok(msg);
            }
            // Notificación (sin id) → ignorar
        }
        Err("Tiempo de espera agotado esperando respuesta del servidor MCP".into())
    }

    fn initialize(&mut self) -> Result<(), String> {
        let id = self.next_id;
        self.next_id += 1;
        self.send(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "ssh-client", "version": "0.1.6" }
            }
        }))?;
        let resp = self.recv_for_id(id)?;
        if resp.get("error").is_some() {
            return Err(format!("initialize falló: {}", resp["error"]));
        }
        // Notificación: sin id, sin respuesta esperada
        self.send(&serde_json::json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }))?;
        Ok(())
    }

    fn list_tools(&mut self) -> Result<Vec<McpToolDef>, String> {
        let id = self.next_id;
        self.next_id += 1;
        self.send(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "tools/list"
        }))?;
        let resp = self.recv_for_id(id)?;
        if resp.get("error").is_some() {
            return Err(format!("tools/list falló: {}", resp["error"]));
        }
        let raw = resp["result"]["tools"].as_array().cloned().unwrap_or_default();
        Ok(raw.iter().map(|t| McpToolDef {
            name: t["name"].as_str().unwrap_or("").to_string(),
            description: t["description"].as_str().map(|s| s.to_string()),
            input_schema: t.get("inputSchema").cloned().unwrap_or_else(|| {
                serde_json::json!({"type": "object", "properties": {}, "required": []})
            }),
        }).collect())
    }

    fn call_tool(&mut self, tool_name: &str, arguments: &serde_json::Value) -> Result<String, String> {
        let id = self.next_id;
        self.next_id += 1;
        self.send(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "tools/call",
            "params": { "name": tool_name, "arguments": arguments }
        }))?;
        let resp = self.recv_for_id(id)?;
        if resp.get("error").is_some() {
            return Err(format!("tools/call falló: {}", resp["error"]));
        }
        let is_error = resp["result"]["isError"].as_bool().unwrap_or(false);
        let content = &resp["result"]["content"];
        let text = if let Some(arr) = content.as_array() {
            arr.iter()
                .filter(|c| c["type"].as_str() == Some("text"))
                .map(|c| c["text"].as_str().unwrap_or(""))
                .collect::<Vec<_>>()
                .join("\n")
        } else {
            content.to_string()
        };
        if is_error { Err(text) } else { Ok(text) }
    }
}

// ─── API interna para tools.rs ────────────────────────────────────────────────

/// Devuelve los esquemas de tools MCP en formato Claude (input_schema).
/// Usa el caché en disco — sin conexión de red.
pub fn load_mcp_tool_defs() -> Vec<serde_json::Value> {
    load_configs()
        .into_iter()
        .flat_map(|cfg| {
            cfg.tools.into_iter().map(|t| serde_json::json!({
                "name": t.name,
                "description": t.description.unwrap_or_default(),
                "input_schema": t.input_schema
            }))
        })
        .collect()
}

/// Intenta ejecutar `tool_name` en el servidor MCP que lo registró.
/// Devuelve `None` si ningún servidor conoce esa tool.
pub fn exec_mcp_call(tool_name: &str, input: &serde_json::Value) -> Option<(String, bool)> {
    let cfg = load_configs()
        .into_iter()
        .find(|c| c.tools.iter().any(|t| t.name == tool_name))?;
    let mut sess = match McpSession::start(&cfg) {
        Ok(s) => s,
        Err(e) => return Some((e, false)),
    };
    if let Err(e) = sess.initialize() {
        return Some((e, false));
    }
    match sess.call_tool(tool_name, input) {
        Ok(out) => Some((out, true)),
        Err(e) => Some((e, false)),
    }
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// Registra (o actualiza) un servidor MCP: lo inicia, lista sus tools,
/// cachea los schemas en disco y devuelve la config actualizada.
#[tauri::command]
pub async fn mcp_register_server(
    name: String,
    command: String,
    args: Vec<String>,
    env: Option<HashMap<String, String>>,
) -> Result<McpServerConfig, String> {
    // Validar nombre: solo alfanumérico + guiones + guiones bajos
    if name.is_empty() || !name.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("El nombre debe ser alfanumérico (se permiten - y _)".into());
    }
    let cfg_base = McpServerConfig {
        name: name.clone(),
        command,
        args,
        env: env.unwrap_or_default(),
        tools: vec![],
    };
    // Conectar y listar tools en hilo bloqueante
    let tools = tokio::task::spawn_blocking({
        let cfg = cfg_base.clone();
        move || -> Result<Vec<McpToolDef>, String> {
            let mut sess = McpSession::start(&cfg)?;
            sess.initialize()?;
            sess.list_tools()
        }
    })
    .await
    .map_err(|e| format!("Error interno: {e}"))??;

    let cfg = McpServerConfig { tools, ..cfg_base };
    let mut configs = load_configs();
    configs.retain(|c| c.name != name);
    configs.push(cfg.clone());
    save_configs(&configs)?;
    Ok(cfg)
}

/// Lista todos los servidores MCP registrados (con tools cacheadas).
#[tauri::command]
pub fn mcp_list_servers() -> Vec<McpServerConfig> {
    load_configs()
}

/// Elimina un servidor MCP del registro.
#[tauri::command]
pub fn mcp_remove_server(name: String) -> Result<(), String> {
    let mut configs = load_configs();
    let before = configs.len();
    configs.retain(|c| c.name != name);
    if configs.len() == before {
        return Err(format!("Servidor '{}' no encontrado", name));
    }
    save_configs(&configs)
}

/// Reconecta al servidor y actualiza el caché de tools.
#[tauri::command]
pub async fn mcp_refresh_tools(name: String) -> Result<McpServerConfig, String> {
    let mut configs = load_configs();
    let cfg = configs.iter()
        .find(|c| c.name == name)
        .ok_or_else(|| format!("Servidor '{}' no encontrado", name))?
        .clone();
    let tools = tokio::task::spawn_blocking({
        let cfg = cfg.clone();
        move || -> Result<Vec<McpToolDef>, String> {
            let mut sess = McpSession::start(&cfg)?;
            sess.initialize()?;
            sess.list_tools()
        }
    })
    .await
    .map_err(|e| format!("Error interno: {e}"))??;

    let updated = McpServerConfig { tools, ..cfg };
    for c in &mut configs {
        if c.name == name {
            *c = updated.clone();
        }
    }
    save_configs(&configs)?;
    Ok(updated)
}
