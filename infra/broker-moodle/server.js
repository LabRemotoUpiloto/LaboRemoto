#!/usr/bin/env node
// broker-moodle — cursos y prácticas desde Moodle. Ver moodle.js y README.md.
// Puerto: PORT (8094 por defecto). Escucha en HOST (127.0.0.1 por defecto); si corre en otra máquina que el gateway,
// poner HOST a su dirección de red (cada petición exige un JWT de Keycloak válido, así que no es un servicio abierto).
// La puerta de entrada (broker-gateway) lo publica como /nvr/moodle/… (UPSTREAM_MOODLE apunta a donde corra).
// Solo necesita alcanzar a Moodle y al JWKS de Keycloak.
const { crearServidor } = require('../broker-comun/servidor');
const { configDesdeEnv, crearVerificador } = require('../broker-comun/auth');
const moodle = require('./moodle');

const verifyJwt = crearVerificador(configDesdeEnv());

crearServidor({
  nombre: 'moodle',
  puerto: Number(process.env.PORT) || 8094,
  host: process.env.HOST || '127.0.0.1',
  manejar: (req, res, url, parts) => moodle.handle(req, res, url, parts, verifyJwt),
});
