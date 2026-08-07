// Almacenamiento cifrado de hosts: guarda/lee entradas usando claves derivadas.
use anyhow::{Context, anyhow};
use argon2::{password_hash::SaltString, Params};
use keyring::Entry;
use hkdf::Hkdf;
use sha2::Sha256 as Sha256Hkdf;
use directories::ProjectDirs;
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Nonce, Key};
use rand::rngs::OsRng;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;

const STORAGE_SUBDIR: &str = "hosts"; // subdirectorio dentro del data_dir de la app

/// Directorio de almacenamiento de la app (por usuario/SO). Crea si no existe.
fn storage_dir() -> anyhow::Result<PathBuf> {
  let proj = ProjectDirs::from("com", "example", "ssh-ai-client")
    .context("cannot determine project dir")?;
  let dir = proj.data_dir().join(STORAGE_SUBDIR);
  fs::create_dir_all(&dir).context("create storage dir")?;
  Ok(dir)
}

/// Deriva una clave simétrica a partir de passphrase + salt usando Argon2id.
fn derive_key_from_pass(passphrase: &str, salt: &[u8]) -> anyhow::Result<Key> {
  // Argon2id con parámetros conservadores
  let params = Params::new(15000, 2, 1, None).unwrap_or_default();
  let mut out = [0u8; 32];
  let argon = argon2::Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
  argon
    .hash_password_into(passphrase.as_bytes(), salt, &mut out)
    .map_err(|e| anyhow!(format!("KDF failed: {}", e)))?;
  Ok(Key::from_slice(&out).clone())
}

/// Obtiene o crea una clave maestra (32 bytes) desde el llavero del sistema.
fn get_or_create_master_key() -> anyhow::Result<[u8; 32]> {
  // Usa keyring para almacenar/recuperar clave maestra
  let service = "ssh-ai-client";
  let user = whoami::username();
  let kr = Entry::new(service, &user);
  if let Ok(stored) = kr.get_password() {
    let b = STANDARD.decode(stored.as_bytes())?;
    let mut key = [0u8; 32];
    key.copy_from_slice(&b[..32]);
    return Ok(key);
  }
  // generar si no existe
  let mut key = [0u8; 32];
  OsRng.fill_bytes(&mut key);
  let encoded = STANDARD.encode(&key);
  kr.set_password(&encoded)?;
  Ok(key)
}

/// Resuelve un nombre de archivo estable a partir de un id lógico (hash SHA-256 truncado).
fn file_for_id(id: &str) -> anyhow::Result<PathBuf> {
  let mut path = storage_dir()?;
  // sanitize id for filename
  let mut hasher = Sha256::new();
  hasher.update(id.as_bytes());
  let hex = hex::encode(hasher.finalize());
  path.push(format!("{}.json.enc", &hex[..16]));
  Ok(path)
}

/// Lista archivos .json.enc almacenados.
pub fn list_hosts() -> anyhow::Result<Vec<String>> {
  let dir = storage_dir()?;
  let mut out = vec![];
  for entry in fs::read_dir(dir)? {
    let e = entry?;
    if let Some(name) = e.path().file_name().and_then(|n| n.to_str()) {
      if name.ends_with(".json.enc") {
        out.push(name.to_string());
      }
    }
  }
  Ok(out)
}

/// Elimina una entrada por filename directo o por id lógico.
pub fn delete_host(id: &str) -> anyhow::Result<()> {
  // Si recibe un nombre de archivo ("abcd1234.json.enc"), borrar directamente
  if id.ends_with(".json.enc") {
    let mut path = storage_dir()?;
    // ensure we only join a basename
    let filename = std::path::Path::new(id)
      .file_name()
      .and_then(|n| n.to_str())
      .ok_or_else(|| anyhow!("invalid filename"))?;
    path.push(filename);
    if path.exists() {
      fs::remove_file(path)?;
    }
    return Ok(());
  }

  // Si no, tratar `id` como lógico y resolver filename
  let f = file_for_id(id)?;
  if f.exists() {
    fs::remove_file(f)?;
  }
  Ok(())
}

/// Guarda un host cifrado con clave derivada de passphrase.
pub fn save_host_with_pass(passphrase: &str, id: &str, json_payload: &str) -> anyhow::Result<()> {
  let salt = SaltString::generate(&mut OsRng).as_ref().as_bytes().to_vec();
  let key = derive_key_from_pass(passphrase, &salt)?;
  let cipher = ChaCha20Poly1305::new(&key);
  let mut nonce_bytes = [0u8; 12];
  OsRng.fill_bytes(&mut nonce_bytes);
  let nonce = Nonce::from_slice(&nonce_bytes);
  let ciphertext = cipher.encrypt(nonce, json_payload.as_bytes()).map_err(|e| anyhow!(format!("encrypt failed: {}", e)))?;

  // Almacenar: salt + nonce + ciphertext (todos en base64) dentro de un JSON
  let blob = serde_json::json!({
    "salt": STANDARD.encode(&salt),
    "nonce": STANDARD.encode(&nonce_bytes),
    "payload": STANDARD.encode(&ciphertext),
  });

  let path = file_for_id(id)?;
  fs::write(path, serde_json::to_vec(&blob)?)?;
  Ok(())
}

/// Guarda un host cifrado con clave derivada de la clave maestra mediante HKDF.
pub fn save_host_with_master(id: &str, json_payload: &str) -> anyhow::Result<()> {
  let master = get_or_create_master_key()?;
  // derivar clave por archivo con HKDF
  let salt = SaltString::generate(&mut OsRng).as_ref().as_bytes().to_vec();
  let hk = Hkdf::<Sha256Hkdf>::new(Some(&salt), &master);
  let mut out = [0u8; 32];
  hk.expand(&[], &mut out).map_err(|e| anyhow!(format!("hkdf expand: {}", e)))?;
  let key = Key::from_slice(&out).clone();
  let cipher = ChaCha20Poly1305::new(&key);
  let mut nonce_bytes = [0u8; 12];
  OsRng.fill_bytes(&mut nonce_bytes);
  let nonce = Nonce::from_slice(&nonce_bytes);
  let ciphertext = cipher.encrypt(nonce, json_payload.as_bytes()).map_err(|e| anyhow!(format!("encrypt failed: {}", e)))?;
  let blob = serde_json::json!({
    "salt": STANDARD.encode(&salt),
    "nonce": STANDARD.encode(&nonce_bytes),
    "payload": STANDARD.encode(&ciphertext),
  });
  let path = file_for_id(id)?;
  fs::write(path, serde_json::to_vec(&blob)?)?;
  Ok(())
}

/// Cifra un payload arbitrario con la clave maestra (HKDF por-blob + ChaCha20-Poly1305).
/// Reutilizado por `auth::token_store` para persistir el refresh_token de sesión
/// con el mismo modelo de amenaza ya aceptado para los hosts guardados.
pub(crate) fn encrypt_with_master(plaintext: &[u8]) -> anyhow::Result<serde_json::Value> {
  let master = get_or_create_master_key()?;
  let salt = SaltString::generate(&mut OsRng).as_ref().as_bytes().to_vec();
  let hk = Hkdf::<Sha256Hkdf>::new(Some(&salt), &master);
  let mut out = [0u8; 32];
  hk.expand(&[], &mut out).map_err(|e| anyhow!(format!("hkdf expand: {}", e)))?;
  let key = Key::from_slice(&out).clone();
  let cipher = ChaCha20Poly1305::new(&key);
  let mut nonce_bytes = [0u8; 12];
  OsRng.fill_bytes(&mut nonce_bytes);
  let nonce = Nonce::from_slice(&nonce_bytes);
  let ciphertext = cipher.encrypt(nonce, plaintext).map_err(|e| anyhow!(format!("encrypt failed: {}", e)))?;
  Ok(serde_json::json!({
    "salt": STANDARD.encode(&salt),
    "nonce": STANDARD.encode(&nonce_bytes),
    "payload": STANDARD.encode(&ciphertext),
  }))
}

/// Descifra un blob producido por [`encrypt_with_master`].
pub(crate) fn decrypt_with_master(blob: &serde_json::Value) -> anyhow::Result<Vec<u8>> {
  let salt_b64 = blob.get("salt").and_then(|s| s.as_str()).context("missing salt")?;
  let nonce_b64 = blob.get("nonce").and_then(|s| s.as_str()).context("missing nonce")?;
  let payload_b64 = blob.get("payload").and_then(|s| s.as_str()).context("missing payload")?;
  let salt = STANDARD.decode(salt_b64.as_bytes())?;
  let nonce_bytes = STANDARD.decode(nonce_b64.as_bytes())?;
  let payload = STANDARD.decode(payload_b64.as_bytes())?;
  let master = get_or_create_master_key()?;
  let hk = Hkdf::<Sha256Hkdf>::new(Some(&salt), &master);
  let mut out = [0u8; 32];
  hk.expand(&[], &mut out).map_err(|e| anyhow!(format!("hkdf expand: {}", e)))?;
  let key = Key::from_slice(&out).clone();
  let cipher = ChaCha20Poly1305::new(&key);
  let nonce = Nonce::from_slice(&nonce_bytes);
  let plain = cipher.decrypt(nonce, payload.as_ref()).map_err(|e| anyhow!(format!("decrypt failed: {}", e)))?;
  Ok(plain)
}

/// Carga y descifra una entrada usando la clave maestra.
pub fn load_host_with_master(id: &str) -> anyhow::Result<String> {
  let path = file_for_id(id)?;
  let data = fs::read_to_string(path)?;
  let v: serde_json::Value = serde_json::from_str(&data)?;
  let salt_b64 = v.get("salt").and_then(|s| s.as_str()).context("missing salt")?;
  let nonce_b64 = v.get("nonce").and_then(|s| s.as_str()).context("missing nonce")?;
  let payload_b64 = v.get("payload").and_then(|s| s.as_str()).context("missing payload")?;
  let salt = STANDARD.decode(salt_b64.as_bytes())?;
  let nonce_bytes = STANDARD.decode(nonce_b64.as_bytes())?;
  let payload = STANDARD.decode(payload_b64.as_bytes())?;
  let master = get_or_create_master_key()?;
  let hk = Hkdf::<Sha256Hkdf>::new(Some(&salt), &master);
  let mut out = [0u8; 32];
  hk.expand(&[], &mut out).map_err(|e| anyhow!(format!("hkdf expand: {}", e)))?;
  let key = Key::from_slice(&out).clone();
  let cipher = ChaCha20Poly1305::new(&key);
  let nonce = Nonce::from_slice(&nonce_bytes);
  let plain = cipher.decrypt(nonce, payload.as_ref()).map_err(|e| anyhow!(format!("decrypt failed: {}", e)))?;
  let s = String::from_utf8(plain)?;
  Ok(s)
}

/// Carga y descifra una entrada usando passphrase.
pub fn load_host_with_pass(passphrase: &str, id: &str) -> anyhow::Result<String> {
  let path = file_for_id(id)?;
  let data = fs::read_to_string(path)?;
  let v: serde_json::Value = serde_json::from_str(&data)?;
  let salt_b64 = v.get("salt").and_then(|s| s.as_str()).context("missing salt")?;
  let nonce_b64 = v.get("nonce").and_then(|s| s.as_str()).context("missing nonce")?;
  let payload_b64 = v.get("payload").and_then(|s| s.as_str()).context("missing payload")?;
  let salt = STANDARD.decode(salt_b64.as_bytes())?;
  let nonce_bytes = STANDARD.decode(nonce_b64.as_bytes())?;
  let payload = STANDARD.decode(payload_b64.as_bytes())?;
  let key = derive_key_from_pass(passphrase, &salt)?;
  let cipher = ChaCha20Poly1305::new(&key);
  let nonce = Nonce::from_slice(&nonce_bytes);
  let plain = cipher.decrypt(nonce, payload.as_ref()).map_err(|e| anyhow!(format!("decrypt failed: {}", e)))?;
  let s = String::from_utf8(plain)?;
  Ok(s)
}

/// Lista todas las entradas devolviendo (archivo + payload descifrado) para mostrarlas en UI.
pub fn list_hosts_entries() -> anyhow::Result<Vec<serde_json::Value>> {
  let dir = storage_dir()?;
  let mut out = vec![];
  for entry in fs::read_dir(dir)? {
    let e = entry?;
    if let Some(name) = e.path().file_name().and_then(|n| n.to_str()) {
      if name.ends_with(".json.enc") {
        let data = fs::read_to_string(e.path())?;
        let v: serde_json::Value = serde_json::from_str(&data)?;
        let salt_b64 = v.get("salt").and_then(|s| s.as_str()).context("missing salt")?;
        let nonce_b64 = v.get("nonce").and_then(|s| s.as_str()).context("missing nonce")?;
        let payload_b64 = v.get("payload").and_then(|s| s.as_str()).context("missing payload")?;
        let salt = STANDARD.decode(salt_b64.as_bytes())?;
        let nonce_bytes = STANDARD.decode(nonce_b64.as_bytes())?;
        let payload = STANDARD.decode(payload_b64.as_bytes())?;
        let master = get_or_create_master_key()?;
        let hk = Hkdf::<Sha256Hkdf>::new(Some(&salt), &master);
        let mut outk = [0u8; 32];
        hk.expand(&[], &mut outk).map_err(|e| anyhow!(format!("hkdf expand: {}", e)))?;
        let key = Key::from_slice(&outk).clone();
        let cipher = ChaCha20Poly1305::new(&key);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let plain = cipher.decrypt(nonce, payload.as_ref()).map_err(|e| anyhow!(format!("decrypt failed: {}", e)))?;
        let payload_val: serde_json::Value = serde_json::from_slice(&plain)?;
        let item = serde_json::json!({"file": name, "payload": payload_val});
        out.push(item);
      }
    }
  }
  Ok(out)
}

/// Carga y descifra un host por su filename dentro del directorio de storage (p.ej. "abcd1234.json.enc").
pub fn load_host_from_file(filename: &str) -> anyhow::Result<String> {
  let mut path = storage_dir()?;
  path.push(filename);
  if !path.exists() {
    return Err(anyhow!(format!("file not found: {}", path.display())));
  }
  let data = fs::read_to_string(path)?;
  let v: serde_json::Value = serde_json::from_str(&data)?;
  let salt_b64 = v.get("salt").and_then(|s| s.as_str()).context("missing salt")?;
  let nonce_b64 = v.get("nonce").and_then(|s| s.as_str()).context("missing nonce")?;
  let payload_b64 = v.get("payload").and_then(|s| s.as_str()).context("missing payload")?;
  let salt = STANDARD.decode(salt_b64.as_bytes())?;
  let nonce_bytes = STANDARD.decode(nonce_b64.as_bytes())?;
  let payload = STANDARD.decode(payload_b64.as_bytes())?;
  let master = get_or_create_master_key()?;
  let hk = Hkdf::<Sha256Hkdf>::new(Some(&salt), &master);
  let mut out = [0u8; 32];
  hk.expand(&[], &mut out).map_err(|e| anyhow!(format!("hkdf expand: {}", e)))?;
  let key = Key::from_slice(&out).clone();
  let cipher = ChaCha20Poly1305::new(&key);
  let nonce = Nonce::from_slice(&nonce_bytes);
  let plain = cipher.decrypt(nonce, payload.as_ref()).map_err(|e| anyhow!(format!("decrypt failed: {}", e)))?;
  let s = String::from_utf8(plain)?;
  Ok(s)
}
