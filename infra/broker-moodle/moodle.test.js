// Pruebas de moodle.js con un Moodle simulado (sin red). Ejecutar: node --test infra/broker-moodle/moodle.test.js
const test = require('node:test');
const assert = require('node:assert');
const { Readable } = require('node:stream');
const zlib = require('node:zlib');
const { crearModulo, aplanar, crearZip, conPolitica, paginaAbrir } = require('./moodle');

// ── Moodle falso: un curso (id 2) con 3 tareas, un docente (3) y dos estudiantes (4, 5) ──
function moodleFalso(over = {}) {
  const llamadas = [];
  const estado = { 4: 'notgraded', 5: 'readyforreview', ...(over.estados || {}) };
  const tareas = over.tareas || [
    { id: 1, cmid: 2, name: 'Práctica m1', markingworkflow: 0, grade: 100 },
    { id: 2, cmid: 3, name: 'Práctica m3', markingworkflow: 1, grade: 50 },
    { id: 3, cmid: 4, name: 'Tarea suelta', markingworkflow: 1, grade: 100 },
  ];
  const idnumber = { 2: 'labo:ev3-m1', 3: 'labo:ev3-m3', 4: '' };
  const usuarios = { 'docente@x': 3, 'est1@x': 4, 'est2@x': 5, 'otro@x': 9 };
  const cursosDe = { 3: [2], 4: [2], 5: [2], 9: [] };
  const rol = { 3: 'editingteacher', 4: 'student', 5: 'student' };
  async function llamar(fn, p) {
    llamadas.push([fn, p]);
    switch (fn) {
      case 'core_user_get_users_by_field': return usuarios[p.values[0]] ? [{ id: usuarios[p.values[0]] }] : [];
      case 'core_enrol_get_users_courses':
        return (cursosDe[p.userid] || []).map((id) => ({ id, fullname: 'Robótica', shortname: 'ROBO', visible: over.cursoVisible ?? 1 }));
      case 'core_user_get_course_user_profiles': return [{ id: p.userlist[0].userid, roles: [{ shortname: rol[p.userlist[0].userid] }] }];
      case 'core_course_get_contents':
        return [{ modules: [{ id: 1, modname: 'forum', name: 'Avisos' }, ...tareas.map((t) => ({ id: t.cmid, instance: t.id, modname: 'assign', name: t.name, visible: 1 }))] }];
      case 'mod_assign_get_assignments': return { courses: [{ id: 2, assignments: tareas }] };
      case 'core_course_get_course_module': {
        const t = tareas.find((x) => x.cmid === p.cmid);
        return t ? { cm: { id: t.cmid, course: 2, modname: 'assign', instance: t.id, idnumber: idnumber[t.cmid], visible: 1 } } : { cm: null };
      }
      case 'mod_assign_get_submission_status': return { lastattempt: { gradingstatus: estado[p.userid] } };
      case 'mod_assign_save_grade': return null;
      default: throw new Error('función no simulada: ' + fn);
    }
  }
  return { llamar, llamadas };
}

const verificar = (usuario) => async (jwt) => {
  if (jwt === 'malo') throw new Error('firma invalida');
  return { preferred_username: usuario };
};

async function pedir(mod, { metodo = 'GET', ruta, jwt = 'ok', usuario = 'est1@x', cuerpo }) {
  const url = new URL('http://x' + ruta);
  const partes = url.pathname.split('/').filter(Boolean);
  const req = Readable.from(cuerpo === undefined ? [] : [Buffer.from(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo))]);
  req.method = metodo;
  req.headers = jwt ? { authorization: 'Bearer ' + jwt } : {};
  let status; let texto = '';
  const res = { writeHead(s) { status = s; }, end(t) { texto = t || ''; }, setHeader() {} };
  const manejado = await mod.handle(req, res, url, partes, verificar(usuario));
  return { manejado, status, json: texto ? JSON.parse(texto) : null };
}

test('aplanar usa el estilo de parámetros de Moodle', () => {
  assert.deepStrictEqual(aplanar({ a: 1, b: [{ c: 2 }, 3], d: { e: 'x' } }),
    [['a', '1'], ['b[0][c]', '2'], ['b[1]', '3'], ['d[e]', 'x']]);
});

test('ignora rutas que no son de Moodle', async () => {
  const m = moodleFalso();
  const r = await pedir(crearModulo({ llamar: m.llamar }), { ruta: '/nvr/monitor/x' });
  assert.strictEqual(r.manejado, false);
});

test('sin token o con token inválido: 401; sin configurar: 503', async () => {
  const mod = crearModulo({ llamar: moodleFalso().llamar });
  assert.strictEqual((await pedir(mod, { ruta: '/nvr/moodle/cursos', jwt: null })).status, 401);
  assert.strictEqual((await pedir(mod, { ruta: '/nvr/moodle/cursos', jwt: 'malo' })).status, 401);
  const sin = crearModulo({ llamar: moodleFalso().llamar, configurado: false });
  assert.strictEqual((await pedir(sin, { ruta: '/nvr/moodle/cursos' })).status, 503);
});

test('cursos: rol docente y estudiante; usuario ausente en Moodle da lista vacía', async () => {
  const mod = crearModulo({ llamar: moodleFalso().llamar });
  const d = await pedir(mod, { ruta: '/nvr/moodle/cursos', usuario: 'docente@x' });
  assert.deepStrictEqual(d.json, { enMoodle: true, cursos: [{ id: 2, nombre: 'Robótica', corto: 'ROBO', rol: 'docente' }] });
  assert.strictEqual((await pedir(mod, { ruta: '/nvr/moodle/cursos', usuario: 'est1@x' })).json.cursos[0].rol, 'estudiante');
  assert.deepStrictEqual((await pedir(mod, { ruta: '/nvr/moodle/cursos', usuario: 'nadie@x' })).json, { enMoodle: false, cursos: [] });
});

test('cursos: un curso oculto no se muestra al estudiante pero sí al docente', async () => {
  const mod = crearModulo({ llamar: moodleFalso({ cursoVisible: 0 }).llamar });
  assert.strictEqual((await pedir(mod, { ruta: '/nvr/moodle/cursos', usuario: 'est1@x' })).json.cursos.length, 0);
  assert.strictEqual((await pedir(mod, { ruta: '/nvr/moodle/cursos', usuario: 'docente@x' })).json.cursos.length, 1);
});

test('prácticas: solo tareas con idnumber labo:, y el estudiante ve su estado', async () => {
  const mod = crearModulo({ llamar: moodleFalso().llamar });
  const e = await pedir(mod, { ruta: '/nvr/moodle/cursos/2/practicas', usuario: 'est2@x' });
  assert.deepStrictEqual(e.json.practicas.map((p) => [p.practica, p.flujoRevision, p.notaMaxima, p.estado]),
    [['ev3-m1', false, 100, 'readyforreview'], ['ev3-m3', true, 50, 'readyforreview']]);
  const d = await pedir(mod, { ruta: '/nvr/moodle/cursos/2/practicas', usuario: 'docente@x' });
  // La app (Rust) exige estos 4 campos en `curso`: si falta uno, la pantalla de prácticas falla al leer la respuesta.
  assert.deepStrictEqual(d.json.curso, { id: 2, nombre: 'Robótica', corto: 'ROBO', rol: 'docente' });
  assert.strictEqual(d.json.practicas.length, 2);
  assert.strictEqual('estado' in d.json.practicas[0], false);
});

test('prácticas: 403 si no está matriculado y 400 si el id es inválido', async () => {
  const mod = crearModulo({ llamar: moodleFalso().llamar });
  assert.strictEqual((await pedir(mod, { ruta: '/nvr/moodle/cursos/2/practicas', usuario: 'otro@x' })).status, 403);
  assert.strictEqual((await pedir(mod, { ruta: '/nvr/moodle/cursos/abc/practicas' })).status, 400);
});

test('resultado: deja nota provisional escalada y lista para revisión, con el comentario escapado', async () => {
  const m = moodleFalso();
  const r = await pedir(crearModulo({ llamar: m.llamar }), {
    metodo: 'POST', ruta: '/nvr/moodle/resultado', usuario: 'est1@x',
    cuerpo: { cmid: 3, nota: 80, resumen: '5/6 pasos <script>' },
  });
  assert.strictEqual(r.status, 200);
  const g = m.llamadas.find(([f]) => f === 'mod_assign_save_grade')[1];
  assert.strictEqual(g.userid, 4);
  assert.strictEqual(g.assignmentid, 2);
  assert.strictEqual(g.grade, 40);                       // 80 % de una tarea sobre 50
  assert.strictEqual(g.workflowstate, 'readyforreview');
  assert.match(g.plugindata.assignfeedbackcomments_editor.text, /&lt;script&gt;/);
  assert.doesNotMatch(g.plugindata.assignfeedbackcomments_editor.text, /<script>/);
});

test('resultado: no se envía a una tarea sin flujo de revisión (la nota quedaría final)', async () => {
  const m = moodleFalso();
  const r = await pedir(crearModulo({ llamar: m.llamar }), { metodo: 'POST', ruta: '/nvr/moodle/resultado', cuerpo: { cmid: 2, nota: 90 } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.json.error, 'tarea_sin_flujo_de_revision');
  assert.strictEqual(m.llamadas.some(([f]) => f === 'mod_assign_save_grade'), false);
});

test('resultado: no pisa lo que el docente ya revisó o calificó', async () => {
  for (const estado of ['inreview', 'readyforrelease', 'released', 'graded']) {
    const m = moodleFalso({ estados: { 4: estado } });
    const r = await pedir(crearModulo({ llamar: m.llamar }), { metodo: 'POST', ruta: '/nvr/moodle/resultado', cuerpo: { cmid: 3, nota: 90 } });
    assert.strictEqual(r.status, 409, estado);
    assert.strictEqual(m.llamadas.some(([f]) => f === 'mod_assign_save_grade'), false, estado);
  }
});

test('resultado: rechaza docente, actividades que no son prácticas y datos inválidos', async () => {
  const mod = crearModulo({ llamar: moodleFalso().llamar });
  const post = (cuerpo, usuario) => pedir(mod, { metodo: 'POST', ruta: '/nvr/moodle/resultado', usuario, cuerpo });
  assert.strictEqual((await post({ cmid: 3, nota: 50 }, 'docente@x')).status, 403);   // un docente no envía resultados
  assert.strictEqual((await post({ cmid: 4, nota: 50 }, 'est1@x')).status, 404);      // tarea sin prefijo labo:
  assert.strictEqual((await post({ cmid: 3, nota: 101 }, 'est1@x')).status, 400);
  assert.strictEqual((await post({ cmid: 3, nota: -1 }, 'est1@x')).status, 400);
  assert.strictEqual((await post({ cmid: 'x', nota: 5 }, 'est1@x')).status, 400);
  assert.strictEqual((await post('no es json', 'est1@x')).status, 400);
  assert.strictEqual((await post({ cmid: 3, nota: 50 }, 'otro@x')).status, 403);      // sin matrícula
});

test('un error de Moodle responde 502 sin filtrar detalles', async () => {
  const mod = crearModulo({ llamar: async () => { const e = new Error('detalle interno'); e.codigo = 'invalidtoken'; throw e; } });
  const r = await pedir(mod, { ruta: '/nvr/moodle/cursos' });
  assert.strictEqual(r.status, 502);
  assert.doesNotMatch(JSON.stringify(r.json), /detalle interno/);
});

// ── Registro completo de la sesión como archivo de comentarios ──
const comprimido = (html) => zlib.gzipSync(Buffer.from(html, 'utf8')).toString('base64');

test('resultado con registro: sube el HTML completo y lo adjunta a la calificación', async () => {
  const m = moodleFalso();
  const subidas = [];
  const subir = async (nombre, contenido) => { subidas.push([nombre, contenido.toString('utf8')]); return 777; };
  const html = '<html><body>$ pwd /home/ana</body></html>';
  const r = await pedir(crearModulo({ llamar: m.llamar, subir, ahora: () => Date.parse('2026-10-04T18:30:00Z') }), {
    metodo: 'POST', ruta: '/nvr/moodle/resultado', cuerpo: { cmid: 3, nota: 80, resumen: 'ok', log: { gzipBase64: comprimido(html) } },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.registro, 'adjuntado');
  assert.strictEqual(subidas.length, 1);
  assert.strictEqual(subidas[0][0], 'registro-ev3-m3-202610041830.zip');   // se entrega en .zip, nunca como .html suelto
  assert.ok(subidas[0][1].startsWith('PK'), 'es un zip');
  const grade = m.llamadas.find(([f]) => f === 'mod_assign_save_grade')[1];
  assert.strictEqual(grade.plugindata.files_filemanager, 777);
});

test('resultado con registro: si la subida falla, la nota se envía igual y se avisa', async () => {
  const m = moodleFalso();
  const subir = async () => { throw new Error('sin permiso'); };
  const r = await pedir(crearModulo({ llamar: m.llamar, subir }), {
    metodo: 'POST', ruta: '/nvr/moodle/resultado', cuerpo: { cmid: 3, nota: 80, log: { gzipBase64: comprimido('<p>x</p>') } },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.registro, 'fallo_la_subida');
  const grade = m.llamadas.find(([f]) => f === 'mod_assign_save_grade')[1];
  assert.strictEqual(grade.plugindata.files_filemanager, undefined);
});

test('resultado con registro: un registro dañado no impide enviar la nota ni se sube', async () => {
  const m = moodleFalso();
  let subio = false;
  const subir = async () => { subio = true; return 1; };
  const r = await pedir(crearModulo({ llamar: m.llamar, subir }), {
    metodo: 'POST', ruta: '/nvr/moodle/resultado', cuerpo: { cmid: 3, nota: 80, log: { gzipBase64: 'no-es-gzip' } },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.registro, 'no_valido');
  assert.strictEqual(subio, false);
});

test('resultado sin registro: responde que no se envió y no intenta subir nada', async () => {
  const m = moodleFalso();
  const r = await pedir(crearModulo({ llamar: m.llamar, subir: async () => { throw new Error('no debía llamarse'); } }), {
    metodo: 'POST', ruta: '/nvr/moodle/resultado', cuerpo: { cmid: 3, nota: 80 },
  });
  assert.strictEqual(r.json.registro, 'no_enviado');
});

test('conPolitica antepone una política que bloquea scripts, también si el HTML ya trae doctype', () => {
  const a = conPolitica(Buffer.from('<p onclick="x()">hola</p><script>alert(1)</script>')).toString();
  assert.ok(a.startsWith('<meta http-equiv="Content-Security-Policy"') && a.includes("default-src 'none'"));
  const b = conPolitica(Buffer.from('<!DOCTYPE html><html></html>')).toString();
  assert.ok(b.startsWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy"'));
});

test('crearZip produce un zip válido con el HTML dentro (se verifica con el lector zip de Python)', () => {
  const { spawnSync } = require('node:child_process');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
  const html = Buffer.from('<html><body>' + 'línea de registro ñ\n'.repeat(200) + '</body></html>', 'utf8');
  fs.writeFileSync(path.join(dir, 'a.zip'), crearZip('registro.html', html, new Date('2026-10-04T18:30:00Z')));
  const py = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c',
    "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip(), z.namelist()[0], len(z.read('registro.html')))", path.join(dir, 'a.zip')], { encoding: 'utf8' });
  if (py.error) return; // sin Python en este equipo: las demás pruebas cubren el resto
  assert.strictEqual(py.stdout.trim(), `None registro.html ${html.length}`);
});

test('abrir: página pública (sin JWT) que lanza laboremoto://practica/<id>, solo para ids válidos', async () => {
  const mod = crearModulo({ llamar: async () => { throw new Error('no debe llamar a Moodle'); } });
  let status; let cabeceras = {}; let texto = '';
  const url = new URL('http://x/nvr/moodle/abrir/linux-m3');
  const req = Readable.from([]);
  req.method = 'GET'; req.headers = {};
  const res = { writeHead(s, h) { status = s; cabeceras = h || {}; }, end(t) { texto = t || ''; }, setHeader() {} };
  assert.strictEqual(await mod.handle(req, res, url, url.pathname.split('/').filter(Boolean), async () => { throw new Error('sin JWT'); }), true);
  assert.strictEqual(status, 200);
  assert.match(cabeceras['Content-Type'], /text\/html/);
  assert.ok(texto.includes('href="laboremoto://practica/linux-m3"'));
  assert.match(cabeceras['Content-Security-Policy'], /default-src 'none'/);
});

test('abrir: un id con caracteres raros no se refleja en la página (404)', async () => {
  const mod = crearModulo({ llamar: async () => null });
  for (const malo of ['a%22%3E%3Cscript%3E', 'a b', '..%2Fx', '<b>']) {
    const url = new URL('http://x/nvr/moodle/abrir/' + malo);
    const req = Readable.from([]);
    req.method = 'GET'; req.headers = {};
    let status; let texto = '';
    const res = { writeHead(s) { status = s; }, end(t) { texto = t || ''; }, setHeader() {} };
    await mod.handle(req, res, url, url.pathname.split('/').filter(Boolean), async () => ({}));
    assert.strictEqual(status, 404, malo);
    assert.doesNotMatch(texto, /script/i);
  }
  assert.doesNotMatch(paginaAbrir('ev3-m3'), /undefined/);
});
