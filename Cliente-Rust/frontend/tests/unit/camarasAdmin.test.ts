import { describe, expect, it } from 'vitest';
import { describirPrueba, etiquetaCamara, soloCambios, textoErrores, type CamaraAdmin, type PruebaCamara } from '@/features/camaras/camarasAdmin.service';

const base: CamaraAdmin = {
  id: 'Camara05', nombre: 'Camara04', host: '172.16.34.13', puerto: 554, usuario: 'admin', tienePassword: true,
  rtspPath: '/h264Preview_01_sub', ptz: true, habilitada: true, ruta: 'cam04', estado: 'active', video: 'transmitiendo',
};

const pruebaOk: PruebaCamara = { ok: true, rtsp: { ok: true, video: { codec: 'h264', ancho: 896, alto: 512 }, codigo: null, mensaje: null }, api: { ok: true, modelo: 'E1 Pro', mensaje: null }, ptz: true };

describe('describirPrueba', () => {
  it('cuenta lo bueno: video, modelo y PTZ', () => {
    const l = describirPrueba(pruebaOk);
    expect(l.map((x) => x.ok)).toEqual([true, true, true]);
    expect(l[0].texto).toBe('Video: funciona (H264 896×512)');
    expect(l[1].texto).toBe('Cámara Reolink: E1 Pro');
  });

  it('explica por qué falló el video (clave) y no inventa lo demás', () => {
    const l = describirPrueba({ ok: false, rtsp: { ok: false, video: null, codigo: 'clave', mensaje: 'La cámara rechazó el usuario o la contraseña (401)' }, api: { ok: false, modelo: null, mensaje: null }, ptz: null });
    expect(l).toHaveLength(1);
    expect(l[0]).toEqual({ ok: false, texto: 'Video: La cámara rechazó el usuario o la contraseña (401)' });
  });

  it('una cámara sin API Reolink pero con video sigue siendo válida (aviso, no error)', () => {
    const l = describirPrueba({ ok: true, rtsp: { ok: true, video: { codec: 'h264', ancho: null, alto: null }, codigo: null, mensaje: null }, api: { ok: false, modelo: null, mensaje: 'La cámara no expone la API de Reolink' }, ptz: null });
    expect(l[0].ok).toBe(true);
    expect(l[1].ok).toBeNull();
  });

  it('PTZ ausente se dice sin marcarlo como error', () => {
    const l = describirPrueba({ ...pruebaOk, ptz: false });
    expect(l[2]).toEqual({ ok: null, texto: 'PTZ: no disponible en esta cámara' });
  });
});

describe('etiquetaCamara', () => {
  it('distingue transmitiendo, sin video, conectando y deshabilitada', () => {
    expect(etiquetaCamara(base)).toEqual({ texto: 'Transmitiendo', ok: true });
    expect(etiquetaCamara({ ...base, video: 'sin video', estado: 'connecting' })).toEqual({ texto: 'Sin video', ok: false });
    expect(etiquetaCamara({ ...base, video: null, estado: 'connecting' })).toEqual({ texto: 'Conectando…', ok: false });
    expect(etiquetaCamara({ ...base, habilitada: false })).toEqual({ texto: 'Deshabilitada', ok: null });
  });
});

describe('soloCambios', () => {
  const igual = { nombre: base.nombre, host: base.host, puerto: base.puerto, usuario: base.usuario, rtspPath: base.rtspPath, ptz: base.ptz, habilitada: base.habilitada };

  it('sin cambios no manda nada (y una clave vacía no cuenta)', () => {
    expect(soloCambios(base, { ...igual, password: '' })).toEqual({});
    expect(soloCambios(base, { ...igual, password: undefined })).toEqual({});
  });

  it('manda solo lo que cambió, incluida la clave si se escribe', () => {
    expect(soloCambios(base, { ...igual, nombre: 'Aula 1' })).toEqual({ nombre: 'Aula 1' });
    expect(soloCambios(base, { ...igual, host: '172.16.34.99', password: 'Nueva#1' })).toEqual({ host: '172.16.34.99', password: 'Nueva#1' });
  });

  it('forzar solo viaja si se pidió', () => {
    expect(soloCambios(base, { ...igual, nombre: 'X', forzar: true })).toEqual({ nombre: 'X', forzar: true });
    expect(soloCambios(base, { ...igual, nombre: 'X', forzar: false })).toEqual({ nombre: 'X' });
  });
});

describe('textoErrores', () => {
  it('une los errores por campo', () => {
    expect(textoErrores({ host: 'debe ser privada', puerto: 'inválido' })).toBe('host: debe ser privada; puerto: inválido');
    expect(textoErrores(null)).toBe('');
  });
});
