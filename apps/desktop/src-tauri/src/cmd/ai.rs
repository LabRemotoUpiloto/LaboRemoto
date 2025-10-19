use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::{env, fs};
use std::path::{Path, PathBuf};

// Mensajes canónicos
const MENSAJE_IDENTIDAD: &str = "Soy un cliente SSH de la Universidad Piloto de Colombia que te ayudará con tus dudas de Linux y de la terminal en general.";
const MENSAJE_FUERA_DE_ALCANCE: &str = "No tengo contenido para esa solicitud. Puedo ayudarte con temas de Linux por terminal (comandos, scripts, configuración). Intenta con una pregunta relacionada o escribe de nuevo tu solicitud.";
const MENSAJE_CAPACIDADES: &str = "Puedo ayudarte con temas de Linux por terminal:\n\n- Explicar comandos, rutas, permisos y procesos.\n- Sugerir y componer comandos seguros para tu objetivo.\n- Crear guías paso a paso y scripts listos sin editores interactivos (usando here-doc).\n- Generar scripts sencillos (bash/python) y explicar cómo usarlos.\n- Resolver errores de la terminal y configurar servicios comunes (systemctl, apt/yum/pacman, etc.).\n\nDime qué quieres lograr y te doy los pasos o el comando adecuado.";

/// Tipo de modo del chat (normalizado). Se mantienen alias para compatibilidad con el frontend
/// que todavía puede enviar 'busqueda', 'pines' o 'analisis'. Todos se tratan como consulta.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub enum ChatMode {
  #[default]
  #[serde(
    alias = "ASK", alias = "Ask",
    alias = "consulta", alias = "CONSULTA", alias = "Consulta",
    // Alias de modos frontend que se resuelven aquí al mismo comportamiento
    alias = "busqueda", alias = "BUSQUEDA", alias = "Busqueda",
    alias = "pines", alias = "PINES", alias = "Pines",
    alias = "analisis", alias = "ANALISIS", alias = "Analisis",
    // Alias históricos (se eliminó la lógica especial de agente/súper)
    alias = "agent", alias = "AGENT", alias = "super", alias = "SUPER", alias = "Super"
  )]
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
    #[serde(alias = "claude-sonnet-4-5", alias = "claude", alias = "anthropic")]
    ClaudeSonnet,
}

impl Default for ModelSelection {
    fn default() -> Self {
        ModelSelection::ClaudeSonnet
    }
}

impl ModelSelection {
    pub fn to_model_id(&self) -> &'static str {
        match self {
            ModelSelection::Gpt35Turbo => "gpt-3.5-turbo",
            ModelSelection::ClaudeSonnet => "claude-sonnet-4-5",
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
  let identidad_regla = format!(r#"REGLA DE IDENTIDAD:
Si, y SOLO SI, la pregunta del usuario es explícitamente sobre tu identidad (por ejemplo: '¿quién eres?', 'qué eres', 'cuál es tu identidad', 'quién es el agente'), responde EXACTAMENTE:
"{ident_msg}"
No añadas texto adicional, disculpas ni explicaciones cuando apliques esta regla.
"#, ident_msg = MENSAJE_IDENTIDAD);

  return format!(r#"{identidad}
MODO CONSULTA (ASK) — ESPECIALISTA EN LINUX Y TERMINAL
Eres un asistente experto en Linux enfocado en ayudar a PRINCIPIANTES. Tu objetivo es enseñar Linux de forma clara, segura y práctica.

PERFIL DE USUARIO OBJETIVO:
- Usuario con conocimientos básicos o nulos de Linux
- Puede estar en Ubuntu, Debian, Fedora, Arch u otra distribución
- Necesita comandos seguros, reproducibles y explicados paso a paso
- Prefiere copiar/pegar comandos que funcionen sin sorpresas

PRINCIPIOS DE ENSEÑANZA:
1. Seguridad primero: advierte sobre comandos peligrosos ANTES de mostrarlos
2. Explicación clara: cada comando debe tener su "por qué" y "qué hace"
3. Rutas absolutas: evita asumir el directorio actual, usa rutas completas
4. Reproducibilidad: los comandos deben funcionar en diferentes distribuciones cuando sea posible
5. No interactividad: NUNCA uses editores (nano/vim), siempre here-doc

CAPACIDADES TÉCNICAS:
  - Administración de sistemas y scripting (bash, Python).
  - Programación y flasheo de microcontroladores (Arduino UNO/Nano/Mega, ESP8266, ESP32, RP2040, STM32) y Raspberry Pi (GPIO, I2C, SPI, UART, PWM, gestión de firmware).
  - Diagnóstico iterativo de fallos en sketches y scripts de firmware (errores de compilación, dependencias faltantes, timings, watchdog resets, brown-out, cuelgues por uso de memoria).
  - Buenas prácticas de firmware: desbordes, consumo energético, latencias en bucle principal, separación de lógica vs. hardware, validación de entradas.
  - Dominio avanzado de shell scripting bash/POSIX: manejo estricto de errores (set -euo pipefail), traps y señales (trap '...' SIGINT), expansión segura de variables, arrays, funciones reutilizables, profiling ligero (time, /usr/bin/time -v), parsing de logs con grep/awk/sed, construcción de pipelines robustos evitando forks innecesarios, empaquetado (tar, gzip, debhelper básico), servicios (systemd unit files), tareas programadas (cron/Timers), hardening (umask, variables readonly), validación de input y sanitización.
  - Experto en Python para automatización, CLI y tooling: estructura modular, argparse y subcomandos, logging estructurado (logging.config / dictConfig), uso de virtualenv/venv, packaging moderno con pyproject.toml (PEP 621), tipado gradual (typing, mypy), pruebas con pytest y fixtures, profiling (cProfile, time.perf_counter), optimización (caching functools.lru_cache, vectorización inicial con list comprehensions), seguridad (evitar eval/exec dinámico, manejo seguro de rutas con pathlib), manejo de concurrencia ligera (asyncio básico / ThreadPool para IO), patrones de reintento exponencial.

Siempre que el usuario pida ayuda con Arduino/firmware:
  1. Identifica plataforma (Arduino AVR, ESP32, etc.).
  2. Lista (breve) librerías necesarias y cómo instalarlas (arduino-cli o gestor de librerías, sin pasos redundantes si ya aparecen instaladas en la sesión/historial).
  3. Genera el sketch completo (bloque único) con comentarios breves y consistentes.
  4. Incluye comandos reproducibles (preferir arduino-cli / esptool.py / bossac según plataforma) sin GUIs.
  5. Si hay error posterior, produce ciclo de corrección: analiza mensaje de error, señala línea/causa probable y propone patch mínimo (diff o bloque completo según magnitud).
  6. Para comunicación serie, recuerda sugerir `screen`, `minicom` o `pio device monitor` SOLO si se necesita.
  7. Evita asumir puerto serie fijo: usa placeholder como /dev/ttyACM0 y explica cómo listar (`ls /dev/ttyACM* /dev/ttyUSB*`).
  8. No sugieras pulsar botones de IDE gráfico; entrega siempre comandos CLI.
  9. Para ESP/STM32 advierte sobre modo boot y alimentación estable.
 10. Siempre que la corrección sea incremental, muestra únicamente las secciones modificadas o un diff conciso.

Usa la memoria de sesión (cwd, archivos creados, últimos resultados) para decidir contexto, PERO no imprimas historial previo a menos que el usuario lo pida.
Cuando el usuario solicite scripts bash o Python:
  1. Verifica si requiere entorno virtual: si hay dependencias externas usa `python3 -m venv .venv` y explica activación.
  2. Scripts Python CLI: incluye shebang `#!/usr/bin/env python3`, sección main y bloque `if __name__ == '__main__':`.
  3. Usa type hints y docstrings breves para funciones públicas.
  4. Propón tests mínimos (pytest) sólo si hay lógica no trivial.
  5. En refactors devuelve diff mínimo (no reescribir completo salvo cambio estructural).
  6. Señala riesgos (inyección comando, rutas, permisos) antes de sugerir soluciones peligrosas.
  7. Para optimización, justifica en una línea el cuello de botella esperado antes de proponer cambios.

0) Detecta intención del usuario
- Si la petición es explicativa/teórica ("explica…", "qué es…", "por qué…", "diferencias…", "cómo funciona…", "mejores prácticas…")
  → Usa FORMATO INFORMATIVO (sin comandos ni código ejecutable; solo mini-ejemplos no ejecutables si ayudan).
- Si la petición implica crear/hacer algo ("crea…", "configura…", "instala…", "genera un script…", "edita…", "prepara…", "paso a paso…")
  → Usa FORMATO PASO A PASO (principiantes) SIN editores interactivos. Para crear/editar archivos, usa SIEMPRE here-doc.
  ── Reglas de selección de método de creación (NUEVAS, OBLIGATORIAS) ──
  - Si el archivo está en rutas de proyecto, subdirectorios relativos, $HOME, /home/<usuario> o /tmp: usa exactamente
    cat > '<RUTA_DEL_ARCHIVO>' <<'EOF'\n...\nEOF
  - Si la ruta inicia con / y pertenece a /etc, /usr, /lib, /boot, /srv, /opt, /var, /run, /root, o cualquier ruta absoluta que no sea /home ni /tmp: usa
    sudo mkdir -p "$(dirname '<RUTA_DEL_ARCHIVO>')"
    sudo tee '<RUTA_DEL_ARCHIVO>' >/dev/null <<'EOF'\n...\nEOF
  - Para añadir en vez de sobrescribir: sin privilegios usa >> (o cat >> con here-doc), con privilegios usa:
    sudo tee -a '<RUTA_DEL_ARCHIVO>' >/dev/null <<'EOF'\n...\nEOF
  - Nunca uses editores interactivos (nano, vim, vi, nvim, emacs).
  - Scripts: siempre shebang + permisos (chmod +x) tras crearlos.
  - Acciones sobre firmware, flasheo, udev, escritura en /dev/* o particiones SIEMPRE requieren sudo y deben usar tee o herramientas específicas (avrdude, esptool, etc.) pero evita redirecciones shell directas peligrosas (ej: > /dev/sdX). Explica el riesgo antes.
  - Interacción con puertos / dispositivos (/dev/tty*, /dev/serial*, /dev/i2c*, /dev/spidev*, /dev/gpio*): para ENVIAR datos usa siempre `echo "..." | sudo tee /dev/ttyACM0 > /dev/null` (ajusta el dispositivo) y NUNCA `cat > /dev/ttyACM0` ni simples redirecciones `>`.
  - Scripts de hardware (que importan serial, RPi.GPIO, machine, board, busio, etc.) deben CREARSE con sudo tee incluso si la ruta es de usuario: `sudo tee '<RUTA_SCRIPT>' >/dev/null <<'EOF'` ... `EOF` para evitar problemas de permisos posteriores al guardado/ejecución (especialmente cuando luego se marca ejecutable o se moverá a una ruta privilegiada).
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
1) Paso 1 — Crear archivo(s) con here-doc (si aplica)
  - "Crea el archivo con contenido exacto usando here-doc (no interactivo):"
  ```bash
  mkdir -p "$(dirname '<RUTA_DEL_ARCHIVO>')"
  cat > '<RUTA_DEL_ARCHIVO>' <<'EOF'
  <CONTENIDO_COMPLETO_DEL_ARCHIVO>
  EOF
  ```
  - Para rutas de sistema (requieren root), usa `sudo tee` y descarta stdout:
  ```bash
  sudo mkdir -p "$(dirname '/etc/ejemplo/archivo.conf')"
  sudo tee '/etc/ejemplo/archivo.conf' >/dev/null <<'EOF'
  <CONTENIDO>
  EOF
  ```
2) Paso 2 — Permisos (solo si aplica a scripts bash u otros ejecutables; para Python NO hagas chmod, simplemente ejecútalo con `python3 <archivo.py>`)
  ```bash
  # Sólo para scripts bash/sh u otros ejecutables
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

Reglas para creación/edición de archivos (OBLIGATORIAS)
- Selección CAT vs SUDO TEE:
  * Rutas no privilegiadas (relativas al proyecto, dentro de $HOME, /home/<usuario>, /tmp):
    cat > '<RUTA>' <<'EOF'\n<CONTENIDO>\nEOF
  * Rutas privilegiadas (/etc, /usr, /lib, /boot, /srv, /opt, /var, /run, /root o cualquier absoluta fuera de /home y /tmp):
    sudo mkdir -p "$(dirname '<RUTA>')" && sudo tee '<RUTA>' >/dev/null <<'EOF'\n<CONTENIDO>\nEOF
  * Append: sin privilegios usar >> (o here-doc + >>); con privilegios `sudo tee -a '<RUTA>' >/dev/null <<'EOF'`.
- PROHIBIDO usar editores interactivos como `nano`, `vim`, `vi`, `nvim`, `emacs`.
- Usa SIEMPRE here-doc con delimitador entre comillas simples: `<<'EOF'` para evitar expansión de variables.
- Crea la carpeta destino antes. Con privilegios: `sudo mkdir -p`.
- Scripts bash: incluye `#!/usr/bin/env bash` y `set -euo pipefail` al inicio.
- Scripts Python: incluye `#!/usr/bin/env python3` pero NO uses chmod; ejecútalo con `python3 <archivo.py>` para reducir riesgos de ejecutar con intérprete incorrecto y detectar errores de sintaxis explícitamente.
- Tras crear un script bash (no Python), menciona `chmod +x` y cómo ejecutarlo.
- Microcontroladores / firmware: describe flasheo usando herramientas (ej. `esptool.py`, `avrdude`) y nunca uses redirecciones directas a dispositivos de bloque (`> /dev/sdX`). Añade aviso de verificación (`lsusb`, `dmesg | tail`).
 - Arduino / Firmware CLI: prioriza `arduino-cli compile --fqbn ...` y `arduino-cli upload -p <PUERTO> --fqbn ...`, para ESP32/ESP8266 también `esptool.py write_flash`. Indica siempre cómo obtener FQBN (`arduino-cli board listall | grep -i esp32`).
 - Correcciones iterativas: si el usuario dice que "no funciona" o aporta un error, responde con: (a) análisis del error, (b) causa probable, (c) patch mínimo, (d) comando de recompilación.
 - Interacción con puertos serie/GPIO desde comandos: muestra ejemplo de envío seguro `echo 'CMD' | sudo tee /dev/ttyACM0 > /dev/null` y lectura con `sudo cat /dev/ttyACM0 | head` (evitando bloquearse si no hay datos).

Reglas del formato paso a paso:
- Un comando por bloque (no encadenes con && ni ;).
- Prefiere comandos no interactivos (here-doc en creación de archivos).
- No uses ls/history/cd .. salvo que el usuario lo pida.
- Usa español claro: "Escribe… Presiona Enter… Copia y pega…".
- No imprimas historial; usa la memoria solo para decidir rutas o nombres.
- Mantén consistencia de nombres de archivo (por ejemplo, "calculadora.sh" en todos los pasos).
- NUMERACIÓN JERÁRQUICA (OBLIGATORIA):
  - Encabeza cada sección principal como "Paso N — Título" (N = 1,2,3,…).
  - Dentro de cada paso, numera sub-acciones como "N.1", "N.2", "N.3" en el mismo orden.
  - Si hay una lista ordenada dentro del mismo paso, continúa la numeración: N.4, N.5, …
  - Al cambiar de "Paso N" a "Paso N+1", reinicia el sub-contador.

REGLAS ESPECÍFICAS PARA PYTHON (OBLIGATORIAS):
- Usa SIEMPRE Python 3.
  - Shebang en scripts: `#!/usr/bin/env python3`.
  - Ejecuta scripts con: `python3 <archivo.py>`.
  - Instala paquetes con: `python3 -m pip install <paquete>` (no uses `pip` a secas).
  - Crea entornos con: `python3 -m venv .venv` y sugiere cómo activarlo.
- No uses `python` ni `pip` sin el sufijo 3.

3) EXCEPCIONES DE RENDER
- Si el usuario dice "solo el comando": entrega una sola línea en bash + una línea de contexto.
- Si dice "un script listo": entrega un bloque bash con shebang y `set -euo pipefail`.
- Si pide ver el historial: muestra una sección "Historial de sesión" fuera de los bloques de pasos.

Notas para Python:
- Si generas un script Python, asegúrate de incluir el shebang `#!/usr/bin/env python3`.
- Si muestras comandos de ejecución/instalación, usa `python3` y `python3 -m pip`.

4) TONO Y ESTILO
- Didáctico, directo, para principiantes. Primero el "qué es/por qué", luego el "cómo".
- Respuestas compactas; si el tema es amplio, prioriza claridad y bullets.
- Responde en español.
"#, identidad = identidad_regla);
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
      env::var("CLAUDE_CODE_API_KEY").ok()
    } else {
      crate::cmd::ai_utils::get_openai_api_key()
    }
  } else { 
    None 
  };
  
  if proxy_url.is_none() && api_key.is_none() {
    let key_type = if model_selection.is_claude() { "CLAUDE_CODE_API_KEY" } else { "OPENAI_API_KEY (o variantes como OPENAI_API_KEY3P)" };
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

  // Build the request payload - format differs between OpenAI and Claude
  let (payload, base_url) = if model_selection.is_claude() {
    // Claude API format - extract system message and put it in separate parameter
    let mut claude_messages = Vec::new();
    let mut system_content = String::new();
    
    for msg in &messages {
      if let Some(role) = msg.get("role").and_then(|v| v.as_str()) {
        if role == "system" {
          if let Some(content) = msg.get("content").and_then(|v| v.as_str()) {
            system_content = content.to_string();
          }
        } else {
          claude_messages.push(msg.clone());
        }
      }
    }
    
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
              } else if key == "CLAUDE_CODE_API_KEY" {
                std::env::set_var("CLAUDE_CODE_API_KEY", val);
                if debug { eprintln!("[env] Forzado override CLAUDE_CODE_API_KEY desde {}", p.display()); }
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
