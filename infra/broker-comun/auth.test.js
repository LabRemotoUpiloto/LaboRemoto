// Pruebas de auth.js con una llave RSA generada y un JWKS local. Ejecutar: node --test infra/broker-comun/auth.test.js
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const { crearVerificador, exigirJwt, tokenDeBearer } = require('./auth');

const ISSUER = 'http://kc.test/realms/lab';

function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }

function firmar(privateKey, { kid = 'k1', alg = 'RS256', payload }) {
  const h = b64u(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey);
  return `${h}.${p}.${b64u(sig)}`;
}

async function conJwks(fn) {
  const par = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const otra = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...par.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  let pedidos = 0;
  const srv = http.createServer((req, res) => { pedidos++; res.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const jwksUrl = `http://127.0.0.1:${srv.address().port}/certs`;
  try { await fn({ jwksUrl, priv: par.privateKey, privOtra: otra.privateKey, pedidos: () => pedidos }); }
  finally { await new Promise((r) => srv.close(r)); }
}

const en = (s) => Math.floor(Date.now() / 1000) + s;

test('acepta un token válido y devuelve los claims', async () => {
  await conJwks(async ({ jwksUrl, priv }) => {
    const v = crearVerificador({ jwksUrl, issuer: ISSUER });
    const c = await v(firmar(priv, { payload: { iss: ISSUER, exp: en(300), preferred_username: 'ana@x' } }));
    assert.strictEqual(c.preferred_username, 'ana@x');
  });
});

test('rechaza: expirado, issuer ajeno, firma de otra llave, alg distinto, kid desconocido y mal formado', async () => {
  await conJwks(async ({ jwksUrl, priv, privOtra }) => {
    const v = crearVerificador({ jwksUrl, issuer: ISSUER });
    const malo = async (tok, patron) => assert.rejects(() => v(tok), patron);
    await malo(firmar(priv, { payload: { iss: ISSUER, exp: en(-10) } }), /expirado/);
    await malo(firmar(priv, { payload: { iss: 'http://otro', exp: en(300) } }), /issuer/);
    await malo(firmar(privOtra, { payload: { iss: ISSUER, exp: en(300) } }), /firma/);
    await malo(firmar(priv, { alg: 'HS256', payload: { iss: ISSUER, exp: en(300) } }), /alg no soportado/);
    await malo(firmar(priv, { kid: 'otro', payload: { iss: ISSUER, exp: en(300) } }), /kid/);
    await malo('abc.def', /mal formado/);
    await malo(firmar(priv, { payload: { iss: ISSUER } }), /expirado/); // sin exp
  });
});

test('el JWKS se cachea 5 minutos', async () => {
  await conJwks(async ({ jwksUrl, priv, pedidos }) => {
    let t = 1_000_000_000_000;
    const v = crearVerificador({ jwksUrl, issuer: ISSUER, ahora: () => t });
    const tok = () => firmar(priv, { payload: { iss: ISSUER, exp: Math.floor(t / 1000) + 3600 } });
    await v(tok()); await v(tok());
    assert.strictEqual(pedidos(), 1);
    t += 6 * 60_000;
    await v(tok());
    assert.strictEqual(pedidos(), 2);
  });
});

test('tokenDeBearer y exigirJwt: 401 sin token o inválido, claims si es válido', async () => {
  const res = () => { const r = { status: null, body: null, writeHead(s) { r.status = s; }, end(b) { r.body = b; } }; return r; };
  assert.strictEqual(tokenDeBearer({ headers: {} }), null);
  assert.strictEqual(tokenDeBearer({ headers: { authorization: 'Bearer abc' } }), 'abc');
  const r1 = res();
  assert.strictEqual(await exigirJwt({ headers: {} }, r1, async () => ({})), null);
  assert.strictEqual(r1.status, 401);
  assert.match(r1.body, /missing_bearer_token/);
  const r2 = res();
  assert.strictEqual(await exigirJwt({ headers: { authorization: 'Bearer x' } }, r2, async () => { throw new Error('firma invalida'); }), null);
  assert.match(r2.body, /invalid_jwt/);
  const r3 = res();
  assert.deepStrictEqual(await exigirJwt({ headers: { authorization: 'Bearer x' } }, r3, async () => ({ sub: 's' })), { sub: 's' });
  assert.strictEqual(r3.status, null);
});
