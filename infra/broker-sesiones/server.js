#!/usr/bin/env node
// broker-sesiones — registro central de sesiones de práctica (sesiones.js) y de conexiones SSH a los dispositivos
// (dispositivos.js). Ver README.md.
// Puerto: PORT (8093 por defecto), solo loopback; la puerta de entrada (broker-gateway) lo publica como /nvr/sesiones/…
const { crearServidor } = require('../broker-comun/servidor');
const { configDesdeEnv, crearVerificador } = require('../broker-comun/auth');
const sesiones = require('./sesiones');
const dispositivos = require('./dispositivos').porDefecto();

const verifyJwt = crearVerificador(configDesdeEnv());

crearServidor({
  nombre: 'sesiones',
  puerto: Number(process.env.PORT) || 8093,
  manejar: async (req, res, url, parts) => (await dispositivos.handle(req, res, url, parts, verifyJwt)) || sesiones.handle(req, res, url, parts, verifyJwt),
});
