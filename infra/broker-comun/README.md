# broker-comun

Librería compartida por los brokers (ver `../broker-gateway/README.md`). No es un servicio.

- `auth.js` — validación del JWT de Keycloak (firma RS256 contra el JWKS con caché de 5 min, expiración e issuer):
  `crearVerificador`, `exigirJwt`, `tokenDeBearer`, `configDesdeEnv`. Cada servicio valida por su cuenta.
- `servidor.js` — servidor HTTP base: CORS para el webview del cliente, `OPTIONS`, registro de peticiones, 404/405 y 500
  si un manejador lanza. `crearServidor({nombre, puerto, manejar})`.
- `verify_jwt.js` — script suelto (CLI) con la misma validación, de cuando el acceso se mediaba por SSH. No lo usa ningún servicio.

Pruebas: `node --test infra/broker-comun/auth.test.js`.
