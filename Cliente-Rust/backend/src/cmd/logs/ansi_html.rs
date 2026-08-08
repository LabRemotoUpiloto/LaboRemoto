//! Conversión de buffer de terminal (ANSI crudo, serializado por xterm vía
//! `SerializeAddon`) a HTML para los logs de sesión guardados.
//!
//! Puerto 1:1 de lo que antes hacía `frontend/src/services/session.service.ts`
//! (que a su vez delegaba en el paquete npm `ansi-to-html`) — se movió a
//! Rust para que la conversión no tenga que pasar por el hilo de JS del
//! WebView antes de guardarse, y para no reimplementar la misma lógica dos
//! veces (frontend + backend).

use std::collections::HashMap;
use once_cell::sync::Lazy;
use regex::Regex;

// ── 1. Limpieza de secuencias de control ANSI que no son de color/formato ──
//
// Puerto de `cleanAnsiControlSequences` (session.service.ts). Nota: el
// último patrón (rango de control chars) incluye \x08 y \x7F, por lo que el
// manejo de backspace de `processTerminalStream` en el JS original nunca
// llegaba a ejecutarse — ya estaban eliminados en este paso. No se replica
// ese paso muerto aquí.

struct CleanupRule {
  pattern: Regex,
  replacement: &'static str,
}

static CLEANUP_RULES: Lazy<Vec<CleanupRule>> = Lazy::new(|| {
  const CLEAR: &str = "\n\n──────────── CLEAR ────────────\n\n";
  vec![
    CleanupRule { pattern: Regex::new(r"\x1b\[H\x1b\[2J").unwrap(), replacement: CLEAR },
    CleanupRule { pattern: Regex::new(r"\x1b\[2J\x1b\[H").unwrap(), replacement: CLEAR },
    CleanupRule { pattern: Regex::new(r"\x1b\[3J").unwrap(), replacement: CLEAR },
    CleanupRule { pattern: Regex::new(r"\x1b\[\?[0-9;]+[hl]").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[200~|\x1b\[201~").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[s|\x1b\[u").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b7|\x1b8").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\([AB0]").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9]*A").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9]*B").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9]*C").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9]*D").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9]*E").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9]*F").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9]*G").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9;]*H").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9;]*f").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9]*J").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9]*K").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9;]*r").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9]*L").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9]*M").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9]*@").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"\x1b\[[0-9]*P").unwrap(), replacement: "" },
    CleanupRule { pattern: Regex::new(r"[\x00-\x08\x0B-\x0C\x0E-\x1A\x1C-\x1F\x7F]").unwrap(), replacement: "" },
  ]
});

fn clean_ansi_control_sequences(text: &str) -> String {
  let mut out = text.to_string();
  for rule in CLEANUP_RULES.iter() {
    out = rule.pattern.replace_all(&out, rule.replacement).into_owned();
  }
  out
}

// ── 2. Paleta de colores (16 base institucional + cubo 216 + 24 grises) ──
//
// Puerto de la paleta pasada a `new AnsiToHtml({ colors: {...} })` en
// session.service.ts (0-15) fusionada con la paleta por defecto de
// `ansi-to-html` para los códigos 256-color (16-255).

fn default_palette() -> HashMap<u32, String> {
  let mut colors = HashMap::new();
  for red in 0u32..=5 {
    for green in 0u32..=5 {
      for blue in 0u32..=5 {
        let c = 16 + red * 36 + green * 6 + blue;
        let r = if red > 0 { red * 40 + 55 } else { 0 };
        let g = if green > 0 { green * 40 + 55 } else { 0 };
        let b = if blue > 0 { blue * 40 + 55 } else { 0 };
        colors.insert(c, format!("#{:02x}{:02x}{:02x}", r, g, b));
      }
    }
  }
  for gray in 0u32..=23 {
    let c = gray + 232;
    let l = (gray * 10 + 8) as u8;
    colors.insert(c, format!("#{:02x}{:02x}{:02x}", l, l, l));
  }
  let base16: [(u32, &str); 16] = [
    (0, "#1e1e1e"), (1, "#cd3131"), (2, "#0dbc79"), (3, "#e5e510"),
    (4, "#2472c8"), (5, "#bc3fbc"), (6, "#11a8cd"), (7, "#e5e5e5"),
    (8, "#666666"), (9, "#f14c4c"), (10, "#23d18b"), (11, "#f5f543"),
    (12, "#3b8eea"), (13, "#d670d6"), (14, "#29b8db"), (15, "#e5e5e5"),
  ];
  for (i, c) in base16 { colors.insert(i, c.to_string()); }
  colors
}

static PALETTE: Lazy<HashMap<u32, String>> = Lazy::new(default_palette);

const DEFAULT_FG: &str = "#d4d4d4";
const DEFAULT_BG: &str = "#1e1e1e";

/// Equivalente a `entities.encodeXML` (usado por `ansi-to-html` con
/// `escapeXML: true`): escapa los 5 caracteres especiales XML.
fn escape_xml(text: &str) -> String {
  let mut out = String::with_capacity(text.len());
  for ch in text.chars() {
    match ch {
      '&' => out.push_str("&amp;"),
      '<' => out.push_str("&lt;"),
      '>' => out.push_str("&gt;"),
      '"' => out.push_str("&quot;"),
      '\'' => out.push_str("&apos;"),
      _ => out.push(ch),
    }
  }
  out
}

// ── 3. Tokenizer ──
//
// Puerto de la función `tokenize` interna de `ansi-to-html`: en cada
// posición se prueban los patrones en el mismo orden de prioridad que el
// original y se consume el primero que matchee al inicio del texto
// restante.

enum Token {
  Text(String),
  Display(i32),
  Xterm256Fg(u32),
  Xterm256Bg(u32),
  Rgb { foreground: bool, r: u8, g: u8, b: u8 },
}

struct TokenPatterns {
  el: Regex,
  csi_b: Regex,
  truecolor: Regex,
  xterm_fg: Regex,
  xterm_bg: Regex,
  newline_crlf: Regex,
  newline_lf: Regex,
  newline_cr: Regex,
  sgr: Regex,
  erase_display: Regex,
  hvp: Regex,
  csi_catchall: Regex,
  text: Regex,
}

static PATTERNS: Lazy<TokenPatterns> = Lazy::new(|| TokenPatterns {
  el: Regex::new(r"^\x1b\[[012]?K").unwrap(),
  csi_b: Regex::new(r"^\x1b\[\(B").unwrap(),
  truecolor: Regex::new(r"^\x1b\[(3|4)8;2;(\d+);(\d+);(\d+)m").unwrap(),
  xterm_fg: Regex::new(r"^\x1b\[38;5;(\d+)m").unwrap(),
  xterm_bg: Regex::new(r"^\x1b\[48;5;(\d+)m").unwrap(),
  // El orden importa: \r+\n antes que \n y \r sueltos (mismo orden que el JS original).
  newline_crlf: Regex::new(r"^\r+\n").unwrap(),
  newline_lf: Regex::new(r"^\n").unwrap(),
  newline_cr: Regex::new(r"^\r").unwrap(),
  sgr: Regex::new(r"^\x1b\[((?:\d{1,3};?)+|)m").unwrap(),
  erase_display: Regex::new(r"^\x1b\[\d?J").unwrap(),
  hvp: Regex::new(r"^\x1b\[\d{0,3};\d{0,3}f").unwrap(),
  csi_catchall: Regex::new(r"^\x1b\[?[\d;]{0,3}").unwrap(),
  text: Regex::new(r"^[^\x1b\x08\r\n]+").unwrap(),
});

fn strip_leading_backspaces(s: &str) -> Option<usize> {
  let mut end = 0;
  for ch in s.chars() {
    if ch == '\x08' { end += ch.len_utf8(); } else { break; }
  }
  if end > 0 { Some(end) } else { None }
}

fn tokenize(input: &str) -> Vec<Token> {
  let mut tokens = Vec::new();
  let mut rest = input;
  let p = &*PATTERNS;

  while !rest.is_empty() {
    if let Some(n) = strip_leading_backspaces(rest) { rest = &rest[n..]; continue; }
    if let Some(m) = p.el.find(rest) { rest = &rest[m.end()..]; continue; }
    if let Some(m) = p.csi_b.find(rest) { rest = &rest[m.end()..]; continue; }
    if let Some(c) = p.truecolor.captures(rest) {
      let whole_end = c.get(0).unwrap().end();
      let foreground = &c[1] == "3";
      let r: u8 = c[2].parse().unwrap_or(0);
      let g: u8 = c[3].parse().unwrap_or(0);
      let b: u8 = c[4].parse().unwrap_or(0);
      tokens.push(Token::Rgb { foreground, r, g, b });
      rest = &rest[whole_end..];
      continue;
    }
    if let Some(c) = p.xterm_fg.captures(rest) {
      let whole_end = c.get(0).unwrap().end();
      tokens.push(Token::Xterm256Fg(c[1].parse().unwrap_or(0)));
      rest = &rest[whole_end..];
      continue;
    }
    if let Some(c) = p.xterm_bg.captures(rest) {
      let whole_end = c.get(0).unwrap().end();
      tokens.push(Token::Xterm256Bg(c[1].parse().unwrap_or(0)));
      rest = &rest[whole_end..];
      continue;
    }
    if let Some(m) = p.newline_crlf.find(rest) { tokens.push(Token::Display(-1)); rest = &rest[m.end()..]; continue; }
    if let Some(m) = p.newline_lf.find(rest) { tokens.push(Token::Display(-1)); rest = &rest[m.end()..]; continue; }
    if let Some(m) = p.newline_cr.find(rest) { tokens.push(Token::Display(-1)); rest = &rest[m.end()..]; continue; }
    if let Some(c) = p.sgr.captures(rest) {
      let whole_end = c.get(0).unwrap().end();
      let raw = c.get(1).map(|m| m.as_str()).unwrap_or("");
      if raw.trim().is_empty() {
        tokens.push(Token::Display(0));
      } else {
        for code in raw.trim_end_matches(';').split(';') {
          if let Ok(n) = code.parse::<i32>() { tokens.push(Token::Display(n)); }
        }
      }
      rest = &rest[whole_end..];
      continue;
    }
    if let Some(m) = p.erase_display.find(rest) { rest = &rest[m.end()..]; continue; }
    if let Some(m) = p.hvp.find(rest) { rest = &rest[m.end()..]; continue; }
    if let Some(m) = p.csi_catchall.find(rest) { rest = &rest[m.end()..]; continue; }
    if let Some(m) = p.text.find(rest) {
      tokens.push(Token::Text(m.as_str().to_string()));
      rest = &rest[m.end()..];
      continue;
    }
    // Ningún patrón matcheó (no debería pasar salvo entrada patológica):
    // se corta acá, igual que el `break` de la implementación JS original
    // ante texto que no pudo tokenizarse.
    break;
  }
  tokens
}

// ── 4. Generación de HTML a partir de los tokens (stack de tags abiertos) ──
//
// Puerto de `handleDisplay`/`pushTag`/`closeTag`/`resetStyles` de
// ansi-to-html. El stack guarda nombres de tag (no estilos) — todos los
// spans de color/estilo se apilan como "span" y se cierran en bloque con
// código SGR 0 (reset), igual que el original.

struct HtmlBuilder {
  stack: Vec<&'static str>,
  buf: String,
}

impl HtmlBuilder {
  fn new() -> Self { Self { stack: Vec::new(), buf: String::new() } }

  fn push_tag(&mut self, tag: &'static str, style: Option<&str>) {
    self.stack.push(tag);
    self.buf.push('<');
    self.buf.push_str(tag);
    if let Some(s) = style {
      self.buf.push_str(" style=\"");
      self.buf.push_str(s);
      self.buf.push('"');
    }
    self.buf.push('>');
  }

  fn push_style(&mut self, style: &str) { self.push_tag("span", Some(style)); }
  fn push_fg(&mut self, color: &str) { self.push_style(&format!("color:{}", color)); }
  fn push_bg(&mut self, color: &str) { self.push_style(&format!("background-color:{}", color)); }

  fn close_tag(&mut self, tag: &str) {
    if self.stack.last().map_or(false, |t| *t == tag) {
      self.stack.pop();
      self.buf.push_str("</");
      self.buf.push_str(tag);
      self.buf.push('>');
    }
  }

  fn reset_styles(&mut self) {
    while let Some(tag) = self.stack.pop() {
      self.buf.push_str("</");
      self.buf.push_str(tag);
      self.buf.push('>');
    }
  }

  fn handle_display(&mut self, code: i32) {
    match code {
      -1 => self.buf.push_str("<br/>"),
      0 => { if !self.stack.is_empty() { self.reset_styles(); } }
      1 => self.push_tag("b", None),
      3 => self.push_tag("i", None),
      4 => self.push_tag("u", None),
      8 => self.push_style("display:none"),
      9 => self.push_tag("strike", None),
      22 => self.push_style("font-weight:normal;text-decoration:none;font-style:normal"),
      23 => self.close_tag("i"),
      24 => self.close_tag("u"),
      39 => self.push_fg(DEFAULT_FG),
      49 => self.push_bg(DEFAULT_BG),
      53 => self.push_style("text-decoration:overline"),
      c if c > 4 && c < 7 => self.push_tag("blink", None),
      c if c > 29 && c < 38 => { if let Some(col) = PALETTE.get(&((c - 30) as u32)) { self.push_fg(&col.clone()); } }
      c if c > 39 && c < 48 => { if let Some(col) = PALETTE.get(&((c - 40) as u32)) { self.push_bg(&col.clone()); } }
      c if c > 89 && c < 98 => { if let Some(col) = PALETTE.get(&(8 + (c - 90) as u32)) { self.push_fg(&col.clone()); } }
      c if c > 99 && c < 108 => { if let Some(col) = PALETTE.get(&(8 + (c - 100) as u32)) { self.push_bg(&col.clone()); } }
      _ => {}
    }
  }
}

/// Convierte un buffer de terminal serializado por xterm (ANSI crudo) a
/// HTML, con colores y estilos preservados. Equivalente a
/// `convertAnsiToHtml` en `session.service.ts`.
pub fn convert_ansi_to_html(raw: &str) -> String {
  let cleaned = clean_ansi_control_sequences(raw);
  let tokens = tokenize(&cleaned);
  let mut b = HtmlBuilder::new();
  for tok in tokens {
    match tok {
      Token::Text(t) => { let escaped = escape_xml(&t); b.buf.push_str(&escaped); }
      Token::Display(code) => b.handle_display(code),
      Token::Xterm256Fg(idx) => { if let Some(c) = PALETTE.get(&idx) { let c = c.clone(); b.push_fg(&c); } }
      Token::Xterm256Bg(idx) => { if let Some(c) = PALETTE.get(&idx) { let c = c.clone(); b.push_bg(&c); } }
      Token::Rgb { foreground, r, g, b: bl } => {
        let hex = format!("#{:02x}{:02x}{:02x}", r, g, bl);
        if foreground { b.push_fg(&hex); } else { b.push_bg(&hex); }
      }
    }
  }
  if !b.stack.is_empty() { b.reset_styles(); }
  b.buf
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn plain_text_is_escaped() {
    let out = convert_ansi_to_html("a < b && c > d");
    assert_eq!(out, "a &lt; b &amp;&amp; c &gt; d");
  }

  #[test]
  fn sgr_color_wraps_in_span_and_resets() {
    let out = convert_ansi_to_html("\x1b[31mhola\x1b[0m");
    assert_eq!(out, "<span style=\"color:#cd3131\">hola</span>");
  }

  #[test]
  fn bold_and_reset() {
    let out = convert_ansi_to_html("\x1b[1mnegrita\x1b[0m normal");
    assert_eq!(out, "<b>negrita</b> normal");
  }

  #[test]
  fn newline_becomes_br() {
    let out = convert_ansi_to_html("linea1\nlinea2");
    assert_eq!(out, "linea1<br/>linea2");
  }

  #[test]
  fn cursor_movement_is_stripped_before_conversion() {
    // \x1b[2K (erase line) y \x1b[10;5H (cursor position) no deben aparecer
    // ni como texto ni romper el resto de la conversión.
    let out = convert_ansi_to_html("\x1b[2Khola\x1b[10;5Hmundo");
    assert_eq!(out, "holamundo");
  }

  #[test]
  fn unclosed_style_is_closed_at_end() {
    let out = convert_ansi_to_html("\x1b[1mnegrita sin cerrar");
    assert_eq!(out, "<b>negrita sin cerrar</b>");
  }
}
