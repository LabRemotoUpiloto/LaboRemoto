// features/usuarios/UserManagementPage.tsx — Usuarios: quién usa la app y qué rol tiene cada persona.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@/features/cuenta/useAuth';
import { ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_ORDER, type EffectiveRole } from '@/features/cuenta/usePermissions';
import {
  Aviso, Boton, BotonPrincipal, Buscador, Desplegable, Dialogo, Encabezado, FilasCargando, Num, Pagina, SUAVE, Tabla,
} from '@/components/ui';
import { adminService, type KeycloakUser } from './admin.service';
import { armarPersonas, esDocenteDeDirectorio, filtrarPersonas, fotoDe, inicialesDe, nombreDe, type Persona } from './personas';

const PLANTILLA = 'grid-cols-[minmax(0,1fr)_120px_210px]';
const COLUMNAS = [{ titulo: 'Persona' }, { titulo: 'Registro', derecha: true }, { titulo: 'Rol' }];

function fecha(ms?: number) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface Cambio { persona: Persona; nuevo: EffectiveRole }

export default function UserManagementPage() {
  const { user: yo } = useAuth();
  const esYo = (u: KeycloakUser) => !!yo?.preferred_username && u.username.toLowerCase() === yo.preferred_username.toLowerCase();

  // Se carga todo una vez (usuarios de cada rol especial + todos, para derivar Estudiante):
  // el filtro y la búsqueda son del lado del cliente, instantáneos.
  const [porRol, setPorRol] = useState<Partial<Record<EffectiveRole, KeycloakUser[]>>>({});
  const [todos, setTodos] = useState<KeycloakUser[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<EffectiveRole | 'todos'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [cambio, setCambio] = useState<Cambio | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [especiales, universo] = await Promise.all([
        // Si un realm role aún no existe en Keycloak (p. ej. `docente` antes de crearlo),
        // esa lista queda vacía en vez de romper toda la pantalla.
        Promise.all(ASSIGNABLE_ROLES.map((r) => adminService.listUsersByRole(r)
          .catch((err) => { console.warn(`[Usuarios] rol '${r}' no consultable:`, err); return [] as KeycloakUser[]; })
          .then((us) => [r, us] as const))),
        adminService.listAllUsers(),
      ]);
      setPorRol(Object.fromEntries(especiales));
      setTodos(universo);
    } catch (err) {
      setError(String(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const personas = useMemo(() => armarPersonas(porRol, todos), [porRol, todos]);
  const visibles = useMemo(() => filtrarPersonas(personas, filtro, busqueda), [personas, filtro, busqueda]);

  const pedirCambio = (persona: Persona, nuevo: EffectiveRole) => {
    // Quien se baja a sí mismo de administrador pierde el acceso a este panel y no puede deshacerlo.
    if (esYo(persona.user)) return;
    // El directorio de la universidad manda: no se le puede quitar «Docente» (sí darle uno de más jerarquía).
    if (nuevo === 'estudiante' && esDocenteDeDirectorio(persona.user)) return;
    setCambio({ persona, nuevo });
  };

  const confirmarCambio = async () => {
    if (!cambio) return;
    const { persona: { user }, nuevo } = cambio;
    setGuardando(true);
    try {
      if (nuevo !== 'estudiante') await adminService.toggleUserRole(user.id, nuevo, true);
      for (const r of ASSIGNABLE_ROLES) {
        if (r !== nuevo && (porRol[r] ?? []).some((u) => u.id === user.id)) await adminService.toggleUserRole(user.id, r, false);
      }
      setCambio(null);
      await cargar();
      notifications.show({ title: 'Rol actualizado', message: `${nombreDe(user)} ahora es ${ROLE_LABELS[nuevo]}.`, color: 'green' });
    } catch (err) {
      notifications.show({ title: 'No se pudo cambiar el rol', message: String(err), color: 'red' });
    } finally {
      setGuardando(false);
    }
  };

  const opcionesFiltro = [
    { valor: 'todos' as const, etiqueta: 'Todos los roles' },
    ...ROLE_ORDER.map((r) => ({ valor: r, etiqueta: ROLE_LABELS[r] })),
  ];

  return (
    <Pagina>
      <Encabezado titulo="Usuarios" descripcion="Quién usa la app y qué puede hacer cada persona." />

      {error ? (
        <Aviso nivel="critico" titulo="No se pudo cargar la lista de usuarios" detalle={error}
          accion={<Boton onClick={() => void cargar()}>Reintentar</Boton>} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Desplegable<EffectiveRole | 'todos'> etiqueta="Filtrar por rol" valor={filtro} onCambio={setFiltro} opciones={opcionesFiltro} className="w-[220px]" />
            <Buscador icono={Search} valor={busqueda} onCambio={setBusqueda} placeholder="Buscar por nombre o correo" />
          </div>

          {cargando ? (
            <FilasCargando plantilla={PLANTILLA} columnas={3} />
          ) : visibles.length === 0 ? (
            <Aviso
              titulo={busqueda.trim() ? `Nadie coincide con «${busqueda.trim()}»` : 'No hay personas con este rol'}
              detalle={busqueda.trim() ? 'Prueba con otra parte del nombre, del usuario o del correo.' : undefined} />
          ) : (
            <Tabla
              plantilla={PLANTILLA}
              columnas={COLUMNAS}
              claves={visibles.map((p) => p.user.id)}
              filas={visibles.map((p) => [
                <PersonaCelda persona={p} yo={esYo(p.user)} />,
                <Num>{fecha(p.user.createdTimestamp)}</Num>,
                esYo(p.user)
                  ? <span title="No puedes cambiar tu propio rol: te quedarías sin acceso. Pídeselo a otro administrador."
                      className="px-3 text-[13px] text-ui-tinta">{ROLE_LABELS[p.rol]}</span>
                  : <RolSelector persona={p} onCambio={(nuevo) => pedirCambio(p, nuevo)} />,
              ])}
            />
          )}
        </>
      )}

      {cambio && (
        <Dialogo
          titulo="¿Cambiar el rol?"
          descripcion={<>
            <strong className="text-ui-tinta">{nombreDe(cambio.persona.user)}</strong> pasará de{' '}
            <strong className="text-ui-tinta">{ROLE_LABELS[cambio.persona.rol]}</strong> a{' '}
            <strong className="text-ui-tinta">{ROLE_LABELS[cambio.nuevo]}</strong>. Esto cambia lo que puede ver y hacer en la aplicación.
          </>}
          onCerrar={() => { if (!guardando) setCambio(null); }}
          acciones={<>
            <Boton onClick={() => setCambio(null)} disabled={guardando}>Cancelar</Boton>
            <BotonPrincipal onClick={() => void confirmarCambio()} disabled={guardando}>{guardando ? 'Cambiando…' : 'Cambiar rol'}</BotonPrincipal>
          </>}
        />
      )}
    </Pagina>
  );
}

function PersonaCelda({ persona: { user }, yo }: { persona: Persona; yo: boolean }) {
  const foto = fotoDe(user);
  return (
    <span className="flex items-center gap-3">
      {foto
        ? <img src={foto} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        : <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${SUAVE} text-[11px] font-bold text-ui-acento-texto`}>{inicialesDe(user)}</span>}
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold text-ui-tinta">
          {nombreDe(user)}{yo && <span className="ml-2 text-[11px] font-normal text-ui-apagado">tú</span>}
        </span>
        <span className="truncate text-[12px] text-ui-apagado">{user.email || user.username}</span>
      </span>
    </span>
  );
}

/** El rol de una persona: a un docente del directorio no se le puede quitar «Docente» (sí dar uno de más jerarquía). */
function RolSelector({ persona, onCambio }: { persona: Persona; onCambio: (r: EffectiveRole) => void }) {
  const docenteDirectorio = esDocenteDeDirectorio(persona.user);
  return (
    <Desplegable<EffectiveRole>
      etiqueta={`Rol de ${nombreDe(persona.user)}`}
      valor={persona.rol}
      onCambio={(r) => { if (r !== persona.rol) onCambio(r); }}
      className="w-full"
      opciones={ROLE_ORDER.map((r) => ({
        valor: r,
        etiqueta: r === 'estudiante' && docenteDirectorio ? `${ROLE_LABELS[r]} (es docente en el directorio)` : ROLE_LABELS[r],
        deshabilitada: r === 'estudiante' && docenteDirectorio,
      }))}
    />
  );
}
