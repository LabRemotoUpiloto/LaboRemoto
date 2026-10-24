// features/cuenta/AjustesPage.tsx — la aplicación (versión y actualizaciones, apariencia) y la sesión. El tema se elige en su
// propia página (Temas); aquí solo se dice cuál está en uso.
import React, { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { LogOut, RefreshCw } from 'lucide-react';
import { Boton, BotonPrincipal, Encabezado, Pagina, Seccion, TARJETA } from '@/components/ui';
import { useTheme } from '@/app/providers/ThemeContext';
import { useAuth } from './useAuth';
import { TEMAS } from './ThemesPage';

type Busqueda = 'nada' | 'buscando' | 'al-dia' | 'disponible' | 'instalando' | 'error';

interface Props {
  onOpenPanel?: (panelId: string) => void;
}

function Opcion({ titulo, detalle, accion }: { titulo: string; detalle: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-t border-ui-pista px-5 py-4 first:border-t-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14px] font-semibold text-ui-tinta">{titulo}</span>
        <span className="text-[13px] text-ui-tinta-2">{detalle}</span>
      </div>
      {accion}
    </div>
  );
}

export default function AjustesPage({ onOpenPanel }: Props) {
  const { logout } = useAuth();
  const { theme, temaFijo } = useTheme();
  const [version, setVersion] = useState('');
  const [busqueda, setBusqueda] = useState<Busqueda>('nada');
  const [nueva, setNueva] = useState<string | null>(null);

  useEffect(() => { getVersion().then(setVersion).catch(() => setVersion('')); }, []);

  const buscar = async () => {
    setBusqueda('buscando');
    try {
      const upd = await check();
      if (upd) { setNueva(upd.version); setBusqueda('disponible'); } else setBusqueda('al-dia');
    } catch {
      setBusqueda('error');
    }
  };

  const instalar = async () => {
    setBusqueda('instalando');
    try {
      const upd = await check();
      if (upd) { await upd.downloadAndInstall(); await relaunch(); } else setBusqueda('al-dia');
    } catch {
      setBusqueda('error');
    }
  };

  const tema = TEMAS.find((t) => t.id === theme)?.label ?? theme;
  const textoVersion: Record<Busqueda, React.ReactNode> = {
    nada: <>Tienes la <span className="font-ui-num text-ui-tinta">v{version}</span>. Revisa si hay una más nueva.</>,
    buscando: 'Buscando actualizaciones…',
    'al-dia': <>Tienes la última versión (<span className="font-ui-num text-ui-tinta">v{version}</span>).</>,
    disponible: <>Hay una versión nueva: <span className="font-ui-num text-ui-tinta">v{nueva}</span>. Se instala y la aplicación se reinicia.</>,
    instalando: 'Descargando e instalando…',
    error: <span className="text-ui-critico-texto">No se pudo revisar: sin conexión con el servidor de actualizaciones.</span>,
  };

  return (
    <Pagina ancho="max-w-[760px]">
      <Encabezado titulo="Ajustes" descripcion="Preferencias de tu cuenta y de la aplicación." />

      <Seccion titulo="Aplicación">
        <div className={TARJETA}>
          <Opcion titulo="Versión" detalle={textoVersion[busqueda]}
            accion={busqueda === 'disponible' || busqueda === 'instalando'
              ? <BotonPrincipal disabled={busqueda === 'instalando'} onClick={() => void instalar()}>{busqueda === 'instalando' ? 'Instalando…' : 'Instalar y reiniciar'}</BotonPrincipal>
              : busqueda === 'al-dia' ? undefined
              : <Boton disabled={busqueda === 'buscando'} onClick={() => void buscar()}><RefreshCw size={14} aria-hidden /> Buscar actualización</Boton>} />
          <Opcion titulo="Apariencia"
            detalle={temaFijo ? 'Tu rol usa el tema institucional de la universidad.' : <>Tema actual: {tema}.</>}
            accion={!temaFijo && <Boton onClick={() => onOpenPanel?.('themes')}>Cambiar tema</Boton>} />
        </div>
      </Seccion>

      <Seccion titulo="Sesión">
        <div className={TARJETA}>
          <Opcion titulo="Cerrar sesión" detalle="Termina tu sesión en este equipo."
            accion={<Boton onClick={logout} className="hover:enabled:border-ui-critico hover:enabled:text-ui-critico-texto"><LogOut size={14} aria-hidden /> Cerrar sesión</Boton>} />
        </div>
      </Seccion>
    </Pagina>
  );
}
