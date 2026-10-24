// features/sftp/PanelArchivos.tsx — los archivos del servidor como herramienta de la sesión (no una página): navegar, abrir,
// descargar a Descargas, subir arrastrando desde el Explorador, crear carpeta, renombrar, borrar e ir a la carpeta en la
// terminal. El lado local es el propio Explorador de Windows. Usa los mismos comandos SFTP que la página de dos paneles.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { Menu } from '@mantine/core';
import {
  ArrowUp, ChevronRight, Copy, CornerDownLeft, Download, File, FileText, Folder, FolderPlus, MoreHorizontal, Pencil,
  RefreshCw, Trash2,
} from 'lucide-react';
import { useToasts } from '@/app/providers/ToastContext';
import {
  Aviso, BarraAcento, Boton, BotonIcono, BotonPeligro, BotonPrincipal, Campo, Dialogo, Paginador, paginar,
} from '@/components/ui';
import { commandClient } from '@/lib/command.service';
import type { SftpEntry } from '@/types';
import { useRemoteFsBrowser } from './hooks/useRemoteFsBrowser';
import { useSftpSession } from './hooks/useSftpSession';
import { getParentRemotePath, joinLocalPath, joinRemotePath } from './pathUtils';

const POR_PAGINA = 25;
const TEXTO = /\.(txt|csv|log|md|json|ya?ml|py|sh|c|cpp|h|js|ts|ini|conf|cfg)$/i;

const peso = (b?: number) =>
  b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1).replace('.', ',')} KB` : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;
const comillas = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`;

type Dialogos =
  | { tipo: 'carpeta' }
  | { tipo: 'renombrar'; entrada: SftpEntry }
  | { tipo: 'borrar'; entrada: SftpEntry };

export default function PanelArchivos({ sessionId, isActive, onIrEnTerminal }: {
  sessionId: string;
  /** Solo el panel visible de la sesión que se ve recibe lo que se suelta desde el Explorador. */
  isActive: boolean;
  /** Escribe `cd carpeta` en la terminal de la sesión. */
  onIrEnTerminal: (carpeta: string) => void;
}) {
  const { push } = useToasts();
  const fs = useRemoteFsBrowser(sessionId);
  const { transfers } = useSftpSession(sessionId);
  const [pagina, setPagina] = useState(1);
  const [dialogo, setDialogo] = useState<Dialogos | null>(null);
  const [soltando, setSoltando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const abrirAlTerminar = useRef(new Map<string, string>());
  useEffect(() => { setPagina(1); }, [fs.path]);

  // Carpetas primero, después archivos (cada grupo por nombre)
  const lista = useMemo(() => [...fs.display].sort((a, b) => (a.kind === 'dir' ? 0 : 1) - (b.kind === 'dir' ? 0 : 1) || a.name.localeCompare(b.name)), [fs.display]);
  const pag = paginar(lista, pagina, POR_PAGINA);
  const ruta = (e: SftpEntry) => e.path || joinRemotePath(fs.path, e.name);
  const enCurso = transfers.filter((t) => t.status === 'running' && t.session_id === sessionId);

  const error = (accion: string, e: unknown) => push({ type: 'error', message: `${accion}: ${(e as any)?.message ?? String(e)}` });

  const subir = useCallback(async (local: string) => {
    const nombre = local.split(/[\\/]/).filter(Boolean).pop() || local;
    const remoto = joinRemotePath(fs.path, nombre);
    try {
      let esCarpeta = false;
      try { await invoke('local_list_dir', { path: local }); esCarpeta = true; } catch { /* es un archivo */ }
      if (esCarpeta) await invoke('sftp_upload_dir_start', { id: sessionId, localPath: local, remotePath: remoto });
      else await commandClient.invoke('sftp_upload_start', { id: sessionId, local_path: local, remote_path: remoto });
    } catch (e) { error('No se pudo subir', e); }
  }, [fs.path, sessionId]);

  // Arrastrar desde el Explorador de Windows: llega a la ventana; cae aquí si se suelta sobre este panel.
  useEffect(() => {
    if (!isActive) return;
    let soltar: (() => void) | undefined;
    let vivo = true;
    getCurrentWebview().onDragDropEvent((ev) => {
      const p = ev.payload;
      if (p.type === 'leave') { setSoltando(false); return; }
      const el = caja.current;
      if (!el) return;
      const escala = window.devicePixelRatio || 1;
      const x = p.position.x / escala, y = p.position.y / escala;
      const r = el.getBoundingClientRect();
      const dentro = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      if (p.type === 'over') { setSoltando(dentro); return; }
      if (p.type === 'drop') {
        setSoltando(false);
        if (dentro) for (const local of p.paths) void subir(local);
      }
    }).then((u) => { if (vivo) soltar = u; else u(); });
    return () => { vivo = false; soltar?.(); };
  }, [isActive, subir]);

  // Recarga la carpeta cuando termina una subida a ella; abre lo que se pidió abrir al terminar su descarga.
  const vistos = useRef(new Set<string>());
  useEffect(() => {
    for (const t of transfers) {
      if (t.status === 'running' || vistos.current.has(t.id)) continue;
      vistos.current.add(t.id);
      const abrir = abrirAlTerminar.current.get(t.id);
      if (abrir) {
        abrirAlTerminar.current.delete(t.id);
        if (t.status === 'done') invoke('local_open_path', { path: abrir }).catch((e) => error('No se pudo abrir', e));
      } else if (t.status === 'done' && t.direction === 'upload') {
        void fs.refresh();
      } else if (t.status === 'done' && t.direction === 'download') {
        push({ type: 'success', message: `Descargado en ${t.local_path}` });
      }
    }
  }, [transfers]);

  const descargar = async (e: SftpEntry, abrirDespues = false) => {
    try {
      const carpeta = abrirDespues
        ? joinLocalPath(await invoke<string>('local_temp_dir'), 'laboremoto-open')
        : await invoke<string>('local_downloads_dir');
      const local = joinLocalPath(carpeta, e.name);
      if (e.kind === 'dir') {
        await invoke('sftp_download_dir_start', { id: sessionId, remotePath: ruta(e), localPath: local });
      } else {
        const r = await commandClient.invoke<unknown, { transfer_id: string }>('sftp_download_start', { id: sessionId, remote_path: ruta(e), local_path: local });
        if (abrirDespues) abrirAlTerminar.current.set(r.transfer_id, local);
      }
    } catch (err) { error('No se pudo descargar', err); }
  };

  const abrir = (e: SftpEntry) => (e.kind === 'dir' ? fs.setPath(ruta(e)) : void descargar(e, true));

  const copiarRuta = async (e: SftpEntry) => {
    try { await navigator.clipboard.writeText(ruta(e)); push({ type: 'success', message: 'Ruta copiada' }); }
    catch { push({ type: 'error', message: 'No se pudo copiar la ruta' }); }
  };

  const crearCarpeta = async (nombre: string) => {
    const p = joinRemotePath(fs.path, nombre);
    try {
      await commandClient.invoke('sftp_mkdir', { id: sessionId, path: p });
      fs.insertEntry({ name: nombre, path: p, kind: 'dir' });
      setDialogo(null);
    } catch (e) { error('No se pudo crear la carpeta', e); }
  };

  const renombrar = async (e: SftpEntry, nombre: string) => {
    const nuevo = joinRemotePath(fs.path, nombre);
    try {
      await commandClient.invoke('sftp_rename', { id: sessionId, old_path: ruta(e), new_path: nuevo });
      fs.removeEntry(e.name);
      fs.insertEntry({ ...e, name: nombre, path: nuevo });
      setDialogo(null);
    } catch (err) { error('No se pudo renombrar', err); }
  };

  const borrar = async (e: SftpEntry) => {
    try {
      await invoke('sftp_remove', { id: sessionId, path: ruta(e), recursive: e.kind === 'dir' });
      fs.removeEntry(e.name);
      push({ type: 'success', message: `«${e.name}» borrado` });
    } catch (err) { error('No se pudo borrar', err); }
    setDialogo(null);
  };

  const partes = fs.path.split('/').filter(Boolean);
  const padre = getParentRemotePath(fs.path);

  return (
    <div ref={caja} className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-ui-pista px-2 py-1">
        <BotonIcono etiqueta="Subir un nivel" disabled={!padre} onClick={() => padre && fs.setPath(padre)}><ArrowUp size={14} /></BotonIcono>
        <nav aria-label="Ruta" className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[12px]">
          <button type="button" onClick={() => fs.setPath('/')} className="font-ui-num text-ui-apagado hover:text-ui-acento-texto">/</button>
          {partes.map((p, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="shrink-0 text-ui-fantasma" aria-hidden />}
              <button type="button" onClick={() => fs.setPath('/' + partes.slice(0, i + 1).join('/'))}
                aria-current={i === partes.length - 1 ? 'page' : undefined}
                className="truncate font-ui-num text-ui-apagado hover:text-ui-acento-texto aria-[current=page]:text-ui-tinta">{p}</button>
            </span>
          ))}
        </nav>
        <BotonIcono etiqueta="Ir a esta carpeta en la terminal" onClick={() => onIrEnTerminal(fs.path)}><CornerDownLeft size={14} /></BotonIcono>
        <BotonIcono etiqueta="Nueva carpeta" onClick={() => setDialogo({ tipo: 'carpeta' })}><FolderPlus size={14} /></BotonIcono>
        <BotonIcono etiqueta="Recargar" onClick={() => void fs.refresh()}><RefreshCw size={14} /></BotonIcono>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto">
        {fs.error ? (
          <div className="p-3"><Aviso nivel="critico" titulo="No se pudo leer la carpeta" detalle={fs.error}
            accion={<Boton onClick={() => void fs.refresh()}>Reintentar</Boton>} /></div>
        ) : fs.loading && !fs.rows.length ? (
          <p className="m-0 p-3 text-[13px] text-ui-apagado" role="status">Cargando…</p>
        ) : !lista.length ? (
          <p className="m-0 p-4 text-[13px] text-ui-tinta-2">Esta carpeta está vacía. Arrastra archivos desde tu computador para subirlos aquí.</p>
        ) : (
          <ul className="m-0 list-none p-0" aria-label={`Archivos de ${fs.path}`}>
            {pag.filas.map((e) => {
              const Icono = e.kind === 'dir' ? Folder : TEXTO.test(e.name) ? FileText : File;
              return (
                <li key={e.name} className="group flex items-center gap-2 px-2 hover:bg-[color-mix(in_srgb,var(--accent-primary)_6%,transparent)]">
                  <button type="button" onDoubleClick={() => abrir(e)} onClick={() => e.kind === 'dir' && abrir(e)}
                    title={e.kind === 'dir' ? `Abrir ${e.name}` : `${e.name} (doble clic para abrir)`}
                    className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-1 text-left text-[13px]">
                    <Icono size={15} className="shrink-0 text-ui-apagado" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-ui-tinta">{e.name}</span>
                    <span className="font-ui-num text-[11px] text-ui-apagado">{e.kind === 'dir' ? '' : peso(e.size)}</span>
                  </button>
                  <Menu position="bottom-end" withinPortal shadow="md" width={240}>
                    <Menu.Target>
                      <BotonIcono etiqueta={`Opciones de ${e.name}`}><MoreHorizontal size={14} /></BotonIcono>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<FileText size={14} />} onClick={() => abrir(e)}>Abrir</Menu.Item>
                      <Menu.Item leftSection={<Download size={14} />} onClick={() => void descargar(e)}>Descargar a Descargas</Menu.Item>
                      <Menu.Item leftSection={<CornerDownLeft size={14} />}
                        onClick={() => onIrEnTerminal(e.kind === 'dir' ? ruta(e) : fs.path)}>Ir a esta carpeta en la terminal</Menu.Item>
                      <Menu.Item leftSection={<Copy size={14} />} onClick={() => void copiarRuta(e)}>Copiar ruta</Menu.Item>
                      <Menu.Item leftSection={<Pencil size={14} />} onClick={() => setDialogo({ tipo: 'renombrar', entrada: e })}>Renombrar</Menu.Item>
                      <Menu.Item leftSection={<Trash2 size={14} />} c="var(--color-ui-critico-texto)" onClick={() => setDialogo({ tipo: 'borrar', entrada: e })}>Borrar</Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </li>
              );
            })}
          </ul>
        )}
        {soltando && (
          <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-[max(2px,calc(var(--radius-md,8px)-2px))] border-2 border-dashed border-ui-acento bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] p-4 text-center">
            <span className="text-[13px] font-semibold text-ui-acento-texto">Suelta para subir a <span className="font-ui-num">{fs.path}</span></span>
          </div>
        )}
      </div>

      {lista.length > POR_PAGINA && <Paginador pagina={pag} onPagina={setPagina} unidad="elementos" />}

      {enCurso.map((t) => {
        const nombre = (t.direction === 'upload' ? t.local_path : t.remote_path)?.split(/[\\/]/).pop();
        const frac = t.total ? (t.bytes ?? 0) / t.total : 0;
        return (
          <div key={t.id} className="flex flex-col gap-1.5 border-t border-ui-pista px-3 py-2">
            <span className="flex justify-between gap-2 text-[12px] text-ui-tinta-2">
              <span className="truncate">{t.direction === 'upload' ? 'Subiendo' : 'Descargando'} {nombre}</span>
              {t.total ? <span className="font-ui-num">{Math.round(frac * 100)} %</span> : null}
            </span>
            <BarraAcento frac={frac} />
          </div>
        );
      })}

      {dialogo?.tipo === 'carpeta' && (
        <DialogoNombre titulo="Nueva carpeta" etiqueta="Nombre" accion="Crear" onCerrar={() => setDialogo(null)} onAceptar={(n) => void crearCarpeta(n)} />
      )}
      {dialogo?.tipo === 'renombrar' && (
        <DialogoNombre titulo={`Renombrar «${dialogo.entrada.name}»`} etiqueta="Nombre nuevo" accion="Renombrar" inicial={dialogo.entrada.name}
          onCerrar={() => setDialogo(null)} onAceptar={(n) => void renombrar(dialogo.entrada, n)} />
      )}
      {dialogo?.tipo === 'borrar' && (
        <Dialogo titulo={`¿Borrar «${dialogo.entrada.name}»?`}
          descripcion={dialogo.entrada.kind === 'dir' ? 'Se borra la carpeta con todo lo que tiene, en el servidor. No se puede deshacer.' : 'Se borra del servidor. No se puede deshacer.'}
          onCerrar={() => setDialogo(null)}
          acciones={<><Boton onClick={() => setDialogo(null)}>Cancelar</Boton><BotonPeligro onClick={() => void borrar(dialogo.entrada)}>Borrar</BotonPeligro></>} />
      )}
    </div>
  );
}

function DialogoNombre({ titulo, etiqueta, accion, inicial = '', onCerrar, onAceptar }: {
  titulo: string; etiqueta: string; accion: string; inicial?: string; onCerrar: () => void; onAceptar: (nombre: string) => void;
}) {
  const [nombre, setNombre] = useState(inicial);
  const valido = !!nombre.trim() && !/[/\\]/.test(nombre) && nombre.trim() !== inicial;
  return (
    <Dialogo titulo={titulo} onCerrar={onCerrar}
      acciones={<><Boton onClick={onCerrar}>Cancelar</Boton><BotonPrincipal type="submit" form="dialogo-nombre" disabled={!valido}>{accion}</BotonPrincipal></>}>
      <form id="dialogo-nombre" onSubmit={(e) => { e.preventDefault(); if (valido) onAceptar(nombre.trim()); }}>
        <Campo etiqueta={etiqueta} mono value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
      </form>
    </Dialogo>
  );
}

/** El `cd` que se escribe en la terminal (con comillas, por si la ruta tiene espacios). */
export const cdA = (carpeta: string) => `cd ${comillas(carpeta)}`;
