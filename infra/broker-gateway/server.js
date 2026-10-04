#!/usr/bin/env node
// broker-gateway — puerta de entrada pública (vía túnel a AWS) de los brokers. Ver gateway.js y README.md.
// Puerto: PORT (8091 por defecto: el mismo que usaba el antiguo nvr-broker, así el túnel y nginx no cambian).
const { crearServidor } = require('../broker-comun/servidor');
const { crearManejador } = require('./gateway');

crearServidor({
  nombre: 'gateway',
  puerto: Number(process.env.PORT) || 8091,
  manejar: crearManejador(),
});
