
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
pub use ssh2::{Session as Ssh2Session, Sftp as Ssh2Sftp, FileStat};

#[derive(Debug, Clone)]
pub struct SftpEntry {
  pub name: String,
  pub path: String,
  pub kind: String,
  pub size: Option<u64>,
  pub perms: Option<String>,
  pub mtime: Option<u64>,
}

pub fn connect_password(host: &str, port: u16, user: &str, pass: &str) -> anyhow::Result<(TcpStream, Ssh2Session)> {
  let addr = format!("{}:{}", host, port);
  let tcp = TcpStream::connect(addr)?;
  tcp.set_nodelay(true).ok();
  let mut sess = Ssh2Session::new()?;
  sess.set_tcp_stream(tcp.try_clone()?) ;
  sess.handshake()?;
  sess.userauth_password(user, pass)?;
  if !sess.authenticated() { anyhow::bail!("auth failed"); }
  Ok((tcp, sess))
}

pub fn open_sftp(sess: &Ssh2Session) -> anyhow::Result<Ssh2Sftp> { Ok(sess.sftp()?) }

pub fn list_dir(sftp: &Ssh2Sftp, path: &str) -> anyhow::Result<Vec<SftpEntry>> {
  let mut out = Vec::new();
  for f in sftp.readdir(Path::new(path))? {
    let (pbuf, stat) = f;
    let name = pbuf.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
    if name == "." || name == ".." { continue; }
    let path_str = pbuf.to_string_lossy().to_string();
  // ssh2::FileStat no expone is_symlink; intentamos lstat si name disponible
  let kind = if stat.is_dir() { "dir" } else { "file" }.to_string();
    let size = stat.size;
    let perms = stat.perm.map(|p| format!("{:o}", p));
    let mtime = stat.mtime.map(|t| t as u64);
    out.push(SftpEntry { name, path: path_str, kind, size, perms, mtime });
  }
  out.sort_by(|a,b| if a.kind!=b.kind { if a.kind=="dir" { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater } } else { a.name.to_lowercase().cmp(&b.name.to_lowercase()) });
  Ok(out)
}

pub fn mkdir(sftp: &Ssh2Sftp, path: &str) -> anyhow::Result<()> { sftp.mkdir(Path::new(path), 0o755)?; Ok(()) }
pub fn rename(sftp: &Ssh2Sftp, from: &str, to: &str) -> anyhow::Result<()> { sftp.rename(Path::new(from), Path::new(to), None)?; Ok(()) }
pub fn remove_file(sftp: &Ssh2Sftp, path: &str) -> anyhow::Result<()> { sftp.unlink(Path::new(path))?; Ok(()) }
pub fn remove_dir(sftp: &Ssh2Sftp, path: &str) -> anyhow::Result<()> { sftp.rmdir(Path::new(path))?; Ok(()) }

pub fn stat(sftp: &Ssh2Sftp, path: &str) -> anyhow::Result<FileStat> { Ok(sftp.stat(Path::new(path))?) }

/// Lee hasta `max_bytes` de un archivo remoto. Devuelve el contenido leído,
/// si se truncó (había más datos que `max_bytes`) y el tamaño total reportado
/// por `stat` (si estaba disponible).
pub fn read_text(sftp: &Ssh2Sftp, path: &str, max_bytes: u64) -> anyhow::Result<(Vec<u8>, bool, Option<u64>)> {
  let size = stat(sftp, path).ok().and_then(|s| s.size);
  let mut f = sftp.open(Path::new(path))?;
  let cap = max_bytes.min(usize::MAX as u64) as usize;
  let mut buf = vec![0u8; cap];
  let mut done: usize = 0;
  loop {
    if done >= cap { break; }
    let n = f.read(&mut buf[done..])?;
    if n == 0 { break; }
    done += n;
  }
  buf.truncate(done);
  let truncated = match size {
    Some(s) => s > done as u64,
    None => {
      // Sin size confiable: intenta leer un byte más para detectar si hay más datos.
      let mut probe = [0u8; 1];
      f.read(&mut probe).map(|n| n > 0).unwrap_or(false)
    }
  };
  Ok((buf, truncated, size))
}

pub fn download(sftp: &Ssh2Sftp, remote: &str, local: &str, cancel: &std::sync::atomic::AtomicBool) -> anyhow::Result<(u64, bool)> {
  let mut f = sftp.open(Path::new(remote))?;
  let mut out = std::fs::File::create(local)?;
  let mut buf = vec![0u8; 64*1024];
  let mut done: u64 = 0;
  loop {
    if cancel.load(std::sync::atomic::Ordering::Relaxed) { return Ok((done, true)); }
    let n = f.read(&mut buf)?;
    if n == 0 { break; }
    out.write_all(&buf[..n])?;
    done += n as u64;
  }
  out.flush()?;
  Ok((done, false))
}

pub fn upload(sftp: &Ssh2Sftp, local: &str, remote: &str, cancel: &std::sync::atomic::AtomicBool) -> anyhow::Result<(u64, bool)> {
  let mut f = sftp.create(Path::new(remote))?;
  let mut inp = std::fs::File::open(local)?;
  let mut buf = vec![0u8; 64*1024];
  let mut done: u64 = 0;
  loop {
    if cancel.load(std::sync::atomic::Ordering::Relaxed) { return Ok((done, true)); }
    let n = inp.read(&mut buf)?;
    if n == 0 { break; }
    f.write_all(&buf[..n])?;
    done += n as u64;
  }
  f.flush()?;
  Ok((done, false))
}
