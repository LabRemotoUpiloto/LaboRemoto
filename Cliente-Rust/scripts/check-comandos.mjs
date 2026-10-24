#!/usr/bin/env node
// Cruza los comandos de Tauri registrados en el backend con los que el frontend invoca.
//
//   node Cliente-Rust/scripts/check-comandos.mjs
//
// Falla (exit 1) si:
//   1. el frontend hace invoke('x') de un comando que NO está en generate_handler! (falla en ejecución);
//   2. hay un comando registrado que el frontend no usa y que no está en comandos-sin-uso.txt
//      (código que se añadió y nadie llama: o se conecta a la interfaz, o se quita, o se justifica en la lista);
//   3. comandos-sin-uso.txt tiene una entrada vieja (el comando ya no se registra o ahora sí se usa).
//
// Es análisis por texto: no ve nombres armados dinámicamente, pero el frontend no los usa (ver la comprobación 1).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aquí = dirname(fileURLToPath(import.meta.url));
const raíz = resolve(aquí, '..');
const libRs = join(raíz, 'backend', 'src', 'lib.rs');
const srcFrontend = join(raíz, 'frontend', 'src');
const listaPermitida = join(aquí, 'comandos-sin-uso.txt');

function archivos(dir, extensiones, salida = []) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre !== 'node_modules') archivos(ruta, extensiones, salida);
    } else if (extensiones.some((e) => nombre.endsWith(e))) {
      salida.push(ruta);
    }
  }
  return salida;
}

// ── comandos registrados ──────────────────────────────────────────────────────
const lib = readFileSync(libRs, 'utf8');
const inicio = lib.indexOf('generate_handler!');
if (inicio < 0) {
  console.error('No se encontró generate_handler! en backend/src/lib.rs');
  process.exit(2);
}
const registrados = new Set();
for (const m of lib.slice(inicio).matchAll(/\b(?:\w+::)+(\w+)\s*,/g)) registrados.add(m[1]);

// ── uso desde el frontend ─────────────────────────────────────────────────────
const textoFrontend = archivos(srcFrontend, ['.ts', '.tsx', '.js', '.jsx'])
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const usado = (nombre) => new RegExp(`['"\`]${escapar(nombre)}['"\`]`).test(textoFrontend);

// invoke('x') / invoke<T>('x') con el nombre literal (los plugins de Tauri llevan ':' o '|': se ignoran)
const invocados = new Set();
for (const m of textoFrontend.matchAll(/invoke(?:<[^>()]*(?:<[^>]*>)?[^>()]*>)?\(\s*['"`]([\w:|-]+)['"`]/g)) {
  if (!m[1].includes(':') && !m[1].includes('|')) invocados.add(m[1]);
}

// ── lista de comandos conservados a propósito ─────────────────────────────────
const permitidos = new Set(
  readFileSync(listaPermitida, 'utf8')
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean),
);

const errores = [];
for (const n of [...invocados].sort()) {
  if (!registrados.has(n)) {
    errores.push(`El frontend invoca «${n}» pero no está registrado en generate_handler! (lib.rs): fallará en ejecución.`);
  }
}
for (const n of [...registrados].sort()) {
  if (!usado(n) && !permitidos.has(n)) {
    errores.push(`«${n}» está registrado pero el frontend no lo usa. Conéctalo, quítalo, o añádelo a scripts/comandos-sin-uso.txt con el motivo.`);
  }
}
for (const n of [...permitidos].sort()) {
  if (!registrados.has(n)) errores.push(`comandos-sin-uso.txt: «${n}» ya no se registra; quítalo de la lista.`);
  else if (usado(n)) errores.push(`comandos-sin-uso.txt: «${n}» ahora sí lo usa el frontend; quítalo de la lista.`);
}

console.log(`${registrados.size} comandos registrados, ${invocados.size} invocados con nombre literal, ${permitidos.size} conservados sin uso.`);
if (errores.length) {
  console.error('\n' + errores.map((e) => '✗ ' + e).join('\n'));
  process.exit(1);
}
console.log('✓ Comandos de Tauri y frontend coherentes.');
