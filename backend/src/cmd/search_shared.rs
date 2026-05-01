use serde::{Serialize, Deserialize};
use std::time::{Instant, Duration};
use crate::cmd::state::SESSIONS;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteMatch { pub path: String, pub file_name: String, pub is_dir: bool, pub score: i32 }

fn sanitize_term(term: &str) -> String {
  let t = term.trim();
  if t.chars().all(|c| c.is_ascii_alphanumeric() || c=='.' || c=='_' || c=='-' ) { t.to_string() }
  else { t.chars().filter(|c| c.is_ascii_alphanumeric() || ".-_".contains(*c)).collect() }
}

fn sanitize_cd(path: &str) -> String {
  if path.is_empty() { return ".".into(); }
  if path.chars().all(|c| c.is_ascii_alphanumeric()||c=='/'||c=='_'||c=='-'||c=='.'||c=='~') { path.to_string() } else { format!("'{}'", path.replace("'","'\\''")) }
}

fn get_or_connect_ssh2(id: &str) -> Result<std::sync::Arc<std::sync::Mutex<crate::cmd::state::CachedSsh2>>, String> {
  use crate::ssh::ssh2_sftp; use std::sync::{Arc,Mutex};
  let mut map = SESSIONS.lock().map_err(|_| "lock sessions".to_string())?;
  if let Some(existing)=map.get(id).and_then(|s| s.sftp_cached.clone()) { return Ok(existing); }
  let (host,port,user,password) = { let s = map.get(id).ok_or("Sesión no encontrada")?; (s.host.clone(), s.port, s.user.clone(), s.password.clone()) };
  let (tcp,sess) = ssh2_sftp::connect_password(&host,port,&user,&password).map_err(|e| e.to_string())?;
  let arc = Arc::new(Mutex::new(crate::cmd::state::CachedSsh2{ tcp, sess }));
  if let Some(s)=map.get_mut(id){ s.sftp_cached=Some(arc.clone()); }
  Ok(arc)
}

fn session_base_dir(session_id: &str, sess: &mut ssh2::Session) -> String {
  if let Some(cd) = { 
    match SESSIONS.lock() {
        Ok(map) => map.get(session_id).and_then(|s| s.current_dir.clone()),
        Err(_) => None,
    }
  } { return cd; }
  if let Ok(mut ch)=sess.channel_session(){ if ch.exec("echo $HOME 2>/dev/null").is_ok(){ use std::io::Read; let mut b=String::new(); let _=ch.read_to_string(&mut b); let _=ch.wait_close(); if let Some(l)=b.lines().next(){ let p=l.trim(); if !p.is_empty(){ return p.to_string(); } } } }
  if let Ok(mut ch)=sess.channel_session(){ if ch.exec("pwd 2>/dev/null").is_ok(){ use std::io::Read; let mut b=String::new(); let _=ch.read_to_string(&mut b); let _=ch.wait_close(); if let Some(l)=b.lines().next(){ let p=l.trim(); if !p.is_empty(){ return p.to_string(); } } } }
  ".".into()
}

fn exec_capture(sess: &mut ssh2::Session, cmd: &str, timeout_ms: u64) -> Result<String,String> {
  use std::io::Read; let mut ch = sess.channel_session().map_err(|e| e.to_string())?; ch.exec(cmd).map_err(|e| e.to_string())?; let start=Instant::now(); let mut buf=Vec::new(); let mut tmp=[0u8;16*1024]; while !ch.eof(){ if start.elapsed()>Duration::from_millis(timeout_ms){ break; } match ch.read(&mut tmp){ Ok(0)=>break, Ok(n)=>buf.extend_from_slice(&tmp[..n]), Err(e)=>{ let es=e.to_string(); if es.contains("WouldBlock"){ std::thread::sleep(std::time::Duration::from_millis(10)); continue; } break; } } } let _=ch.wait_close(); Ok(String::from_utf8_lossy(&buf).to_string()) }

pub fn remote_search_ranked(session_id: &str, raw_term: &str, limit: usize) -> Result<Vec<RemoteMatch>, String> {
  if raw_term.trim().is_empty() { return Ok(vec![]); }
  let mut term = sanitize_term(raw_term);
  if term.is_empty() { term = raw_term.to_ascii_lowercase(); }
  let arc = get_or_connect_ssh2(session_id)?; let mut guard = arc.lock().map_err(|_|"lock".to_string())?; let sess = &mut guard.sess;
  let base = session_base_dir(session_id, sess);
  let roots_global = ["$HOME","/home","/usr/local","/opt","/var/www"]; // alineado
  let filters = "-not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/coverage/*' -not -path '*/.git/*'";
  let pat_exact = format!("{}", term);
  let pat_sub = format!("*{}*", term);
  let build_cmd = |roots: &[String], pat: &str| -> String {
    let r = roots.join(" ");
    format!("(find {r} -maxdepth 12 {filters} -type f -iname '{pat}' -printf '%p\tf\n' 2>/dev/null; find {r} -maxdepth 12 {filters} -type d -iname '{pat}' -printf '%p\td\n' 2>/dev/null) | head -n {limit}", r=r, filters=filters, pat=pat, limit=limit)
  };
  let ctx_cmd_exact = format!("cd {} && {}", sanitize_cd(&base), build_cmd(&vec![".".into()], &pat_exact));
  let mut rows = Vec::new();
  let append_global = std::env::var("FILE_ANALYSIS_APPEND_GLOBAL").ok().map(|v| v=="1"||v.eq_ignore_ascii_case("true")).unwrap_or(true);
  for (cmd,score) in [(ctx_cmd_exact.clone(),100),(format!("cd {} && {}", sanitize_cd(&base), build_cmd(&vec![".".into()], &pat_sub)),70)] {
    if rows.len()>=limit { break; }
    if let Ok(out)=exec_capture(sess,&cmd,6000){ for line in out.lines(){ let raw=line.trim(); if raw.is_empty(){ continue; } let (p,t)= if let Some(i)=raw.rfind('\t'){ (&raw[..i], &raw[i+1..]) } else { (raw,"f") }; let abs = if p.starts_with('/') { p.to_string() } else { format!("{}/{}", base, p.trim_start_matches("./")) }; let fname = abs.rsplit('/').next().unwrap_or(&abs).to_string(); if !rows.iter().any(|m: &RemoteMatch| m.path==abs){ rows.push(RemoteMatch{ path: abs, file_name: fname, is_dir: t.starts_with('d'), score }); if rows.len()>=limit { break; } } } }
  }
  // Antes solo buscábamos global si no había resultados locales. Ahora, si append_global=true, también añadimos una pasada global extra (sin duplicar) hasta llenar el límite.
  if rows.is_empty() || append_global {
    let roots: Vec<String> = roots_global.iter().map(|s| s.to_string()).collect();
    for (pat,score) in [(&pat_exact,80),(&pat_sub,50)] { if rows.len()>=limit { break; } let cmd = build_cmd(&roots, pat); if let Ok(out)=exec_capture(sess,&cmd,7000){ for line in out.lines(){ let raw=line.trim(); if raw.is_empty(){ continue; } let (p,t)= if let Some(i)=raw.rfind('\t'){ (&raw[..i], &raw[i+1..]) } else { (raw,"f") }; let fname = p.rsplit('/').next().unwrap_or(p).to_string(); if !rows.iter().any(|m: &RemoteMatch| m.path==p){ rows.push(RemoteMatch { path: p.to_string(), file_name: fname, is_dir: t.starts_with('d'), score }); if rows.len()>=limit { break; } } } } }
  }
  rows.sort_by(|a,b| b.score.cmp(&a.score).then(a.file_name.to_ascii_lowercase().cmp(&b.file_name.to_ascii_lowercase())));
  if rows.len()>limit { rows.truncate(limit); }
  Ok(rows)
}
