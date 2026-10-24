// features/conexion/NuevaConexionDialogo.tsx — conectarse por SSH a un servidor (o a la Pi del laboratorio, o editar un equipo
// guardado) en un diálogo encima de Conexiones. La lógica es la del formulario de siempre (useConnectForm); aquí solo cambia
// la forma: piezas de components/ui y el error de conexión dentro del diálogo en vez de una notificación.
import { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useToasts } from '@/app/providers/ToastContext';
import { Aviso, Boton, BotonIcono, BotonPrincipal, Campo, Dialogo } from '@/components/ui';
import { KNOWN_DEVICES } from '@/lib/devices';
import { useConnectForm } from './useConnectForm';
import type { ConnectionToSave, RecentConnection } from './useRecentConnections';

export interface EquipoRapido { id: string; name: string; host: string; port: number }

interface Props {
  onCerrar: () => void;
  onConnected: (session: { id: string; label: string }) => void;
  /** La Pi del laboratorio: llena host y puerto (y los oculta); se entra con el usuario institucional. */
  quickHost?: EquipoRapido | null;
  /** Una conexión reciente: llena host, puerto y usuario. */
  recentConnection?: RecentConnection | null;
  /** Un equipo guardado para editar (con `_originalFile`). */
  initialPayload?: any | null;
  recentConnections?: RecentConnection[];
  onConnectionSuccess?: (c: ConnectionToSave) => void;
  /** Tras guardar o editar un equipo, para recargar la lista. */
  onGuardado?: () => void;
}

/** Mensaje de validación debajo del campo, en el color de error del tema. */
const ErrorCampo = ({ id, texto }: { id: string; texto?: string }) =>
  texto ? <span id={id} className="-mt-2.5 text-[12px] text-ui-critico-texto">{texto}</span> : null;

export default function NuevaConexionDialogo({
  onCerrar, onConnected, quickHost = null, recentConnection = null, initialPayload = null, recentConnections = [],
  onConnectionSuccess, onGuardado,
}: Props) {
  const { push } = useToasts();
  const [error, setError] = useState<string | null>(null);
  const [guardar, setGuardar] = useState(false);
  const [nombre, setNombre] = useState('');

  const f = useConnectForm({
    onConnected: (s) => { onCerrar(); onConnected({ id: s.id, label: s.label ?? s.id }); },
    quickHost,
    recentConnection,
    recentConnections,
    initialPayload,
    onConnectionSuccess,
    onConnectError: setError,
  });
  const edicion = f.isEditMode;
  const esPi = f.isRaspberryPi();
  const conectando = f.isConnecting;

  // Al editar, el nombre que ya tenía
  useEffect(() => { if (edicion) setNombre(f.hostName); }, [edicion, f.hostName]);

  // useConnectionActions avisa el guardado con este par de estados (antes abría un modal de «¡Éxito!»)
  useEffect(() => {
    if (!f.successAlertOpen) return;
    push({ type: 'success', message: f.successAlertMessage });
    f.setSuccessAlertOpen(false);
    f.setSuccessAlertMessage('');
    onGuardado?.();
    if (edicion) onCerrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.successAlertOpen]);

  const conectar = async () => {
    if (!f.isValid || conectando) return;
    setError(null);
    if (guardar && !edicion) await f.handleSaveHost(nombre);
    await f.connect();
  };

  const pi = KNOWN_DEVICES.RASPBERRY_PI_4;
  const titulo = edicion ? `Editar «${f.hostName || f.host}»` : esPi ? `Conectar a la ${pi.label}` : 'Nueva conexión';
  const descripcion = edicion
    ? 'Los cambios se guardan en este computador; la contraseña queda cifrada.'
    : esPi
      ? 'Entra con tu usuario y contraseña institucionales.'
      : 'Abre una terminal SSH en un servidor que no está en tu lista.';

  return (
    <Dialogo titulo={titulo} descripcion={descripcion} onCerrar={onCerrar}
      acciones={<>
        <Boton onClick={onCerrar}>Cancelar</Boton>
        {edicion && <Boton onClick={() => void f.handleSaveHost(nombre)} disabled={conectando}>Guardar cambios</Boton>}
        <BotonPrincipal type="submit" form="nueva-conexion" disabled={!f.isValid || conectando}>
          {conectando ? 'Conectando…' : <>Conectar <ArrowRight size={15} aria-hidden /></>}
        </BotonPrincipal>
      </>}>
      {/* data-tour / connect-form: el recorrido guiado del chat apunta a este formulario */}
      <form id="nueva-conexion" data-tour="connect-form" className="connect-form flex flex-col gap-4"
        onSubmit={(e) => { e.preventDefault(); void conectar(); }}>
        {error && <Aviso nivel="critico" titulo="No se pudo conectar" detalle={error} />}

        {esPi ? (
          <p className="m-0 text-[13px] text-ui-tinta-2">
            {pi.label} del laboratorio, <span className="font-ui-num">{pi.host}:{pi.port}</span>
          </p>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
            <div className="flex flex-col gap-4">
              <Campo etiqueta="Host" placeholder="192.168.1.100" mono disabled={conectando} value={f.host}
                aria-invalid={!!f.errors.host} aria-describedby={f.errors.host ? 'error-host' : undefined}
                onChange={(e) => f.handleHostChange(e.currentTarget.value)} />
              <ErrorCampo id="error-host" texto={f.errors.host} />
            </div>
            <div className="flex flex-col gap-4">
              <Campo etiqueta="Puerto" placeholder="22" mono inputMode="numeric" disabled={conectando} value={f.port}
                aria-invalid={!!f.errors.port} aria-describedby={f.errors.port ? 'error-puerto' : undefined}
                onChange={(e) => f.handlePortChange(e.currentTarget.value)} />
              <ErrorCampo id="error-puerto" texto={f.errors.port} />
            </div>
          </div>
        )}

        <Campo id="field-user" etiqueta="Usuario" placeholder={esPi ? 'UPILOTO\\usuario' : 'root, admin, ubuntu…'} mono
          disabled={conectando} value={f.user} autoComplete="off"
          aria-invalid={!!f.errors.user} aria-describedby={f.errors.user ? 'error-usuario' : undefined}
          onChange={(e) => {
            f.setUser(e.currentTarget.value);
            if (f.errors.user) f.setErrors((prev) => ({ ...prev, user: undefined }));
          }} />
        <ErrorCampo id="error-usuario" texto={f.errors.user} />

        <Campo etiqueta="Contraseña" type={f.showPassword ? 'text' : 'password'} disabled={conectando} value={f.password}
          autoComplete="off" aria-invalid={!!f.errors.password} aria-describedby={f.errors.password ? 'error-clave' : undefined}
          onChange={(e) => {
            f.setPassword(e.currentTarget.value);
            if (f.errors.password) f.setErrors((prev) => ({ ...prev, password: undefined }));
          }}
          derecha={
            <BotonIcono etiqueta={f.showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} disabled={conectando}
              onClick={() => f.setShowPassword(!f.showPassword)}>
              {f.showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </BotonIcono>
          } />
        <ErrorCampo id="error-clave" texto={f.errors.password} />

        {edicion ? (
          <Campo etiqueta="Nombre" placeholder="Por ejemplo: Raspberry del laboratorio" disabled={conectando} value={nombre}
            onChange={(e) => setNombre(e.currentTarget.value)} />
        ) : !esPi && (
          <>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-ui-tinta-2">
              <input type="checkbox" checked={guardar} disabled={conectando} onChange={(e) => setGuardar(e.currentTarget.checked)}
                className="h-4 w-4 accent-[var(--accent-primary)]" />
              Guardar en mis equipos (la contraseña queda cifrada)
            </label>
            {guardar && (
              <Campo etiqueta="Nombre (opcional)" placeholder="Por ejemplo: servidor de pruebas" disabled={conectando} value={nombre}
                onChange={(e) => setNombre(e.currentTarget.value)} />
            )}
          </>
        )}
      </form>
    </Dialogo>
  );
}

