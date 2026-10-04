#!/usr/bin/env node
// verify_jwt.js — valida un JWT de Keycloak contra el JWKS institucional.
// Uso: node verify_jwt.js <jwt> <jwks_url> <expected_issuer>
// Exit 0 + imprime el "preferred_username" del claim si es valido.
// Exit 1 + mensaje en stderr si no.
//
// Reimplementa en Node (ya instalado en la Pi para Shinobi) la misma
// validacion que ya hace el cliente Rust en auth::jwt — firma RS256 contra
// JWKS, expiracion, issuer. No reutiliza codigo Rust porque este script
// corre en la Pi via ForceCommand, no dentro del cliente Tauri.

const crypto = require('crypto');
const https = require('https');
const http = require('http');

const [, , jwt, jwksUrl, expectedIssuer] = process.argv;

if (!jwt || !jwksUrl || !expectedIssuer) {
  console.error('uso: verify_jwt.js <jwt> <jwks_url> <expected_issuer>');
  process.exit(1);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('timeout consultando JWKS')));
  });
}

function b64urlToBuf(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

async function main() {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('JWT mal formado');
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(b64urlToBuf(headerB64).toString('utf8'));
  const payload = JSON.parse(b64urlToBuf(payloadB64).toString('utf8'));

  if (header.alg !== 'RS256') throw new Error(`alg no soportado: ${header.alg}`);

  const jwks = await fetchJson(jwksUrl);
  const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`kid '${header.kid}' no encontrado en JWKS`);

  const pubKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signature = b64urlToBuf(sigB64);
  const signedData = `${headerB64}.${payloadB64}`;

  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(signedData),
    { key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    signature,
  );
  if (!ok) throw new Error('firma invalida');

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    throw new Error('token expirado');
  }
  if (payload.iss !== expectedIssuer) {
    throw new Error(`issuer inesperado: ${payload.iss}`);
  }

  const username = payload.preferred_username || payload.sub;
  if (!username) throw new Error('token sin preferred_username/sub');

  console.log(username);
  process.exit(0);
}

main().catch((e) => {
  console.error(`JWT invalido: ${e.message}`);
  process.exit(1);
});
