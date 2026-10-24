// features/actividad/DispositivosPanel.tsx — pestaña «Dispositivos» de Actividad: quién entra por SSH a cada Pi, con su ubicación.
// Aparte de las prácticas. Los datos salen del agente de cada dispositivo (cmd::dispositivos) y solo cuentan las conexiones
// nuevas, desde que el agente se activó: no hay historial anterior. Fechas como en el Excel de conexiones (fechaExcel).
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Aviso, Boton, Buscador, FilasCargando, NOTA, Num, Punto, Seccion, TARJETA, Tabla } from '@/components/ui';
import { dispositivosService, type ConexionDispositivo, type DispositivoActividad } from './dispositivos.service';
import SesionesMapa from './SesionesMapa';
import { formatoDuracion } from './dashboardStats';
import {
  duracionConexion, estadoDispositivo, fechaExcel, haceTiempo, nombreConexion, porUsuario, puntosDeConexiones, ubicacionConexion,
} from './dispositivosStats';
import { PersonaBoton, type PropsPestana } from './piezas';
import { useResumen } from './useResumen';

const MAX_FILAS = 100;

export default function DispositivosPanel({ dias, recarga, reintentar }: PropsPestana) {
  const { datos, error, cargando, ahora } = useResumen(dispositivosService.resumen, dias, recarga, 15_000);

  if (cargando && !datos) return <FilasCargando plantilla="grid-cols-[minmax(0,1fr)_100px_130px_130px]" columnas={4} />;
  if (error && !datos) return <Aviso nivel="critico" titulo="No se pudo cargar la actividad de los dispositivos" detalle={error} accion={<Boton onClick={reintentar}>Reintentar</Boton>} />;
  if (!datos?.dispositivos.length) return <Aviso titulo="No hay dispositivos configurados" />;
  return (
    <>
      {error && <Aviso nivel="alerta" titulo="No se pudo actualizar" detalle={`Se muestran los datos anteriores. Detalle: ${error}`} />}
      {datos.dispositivos.map((d) => <Dispositivo key={d.id} d={d} dias={dias} ahora={ahora} />)}
    </>
  );
}

function Dispositivo({ d, dias, ahora }: { d: DispositivoActividad; dias: number; ahora: number }) {
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState<string | null>(null);
  const estado = estadoDispositivo(d, ahora);
  const puntos = useMemo(() => puntosDeConexiones(d.conexiones), [d.conexiones]);
  const usuarios = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return porUsuario(d.conexiones, ahora).filter((u) => !q || u.nombre.toLowerCase().includes(q) || u.usuario.toLowerCase().includes(q));
  }, [d.conexiones, ahora, busqueda]);
  const historial = usuarios.find((u) => u.usuario === elegido);
  const nr = d.noReconocidas;

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="m-0 font-ui-titulo text-lg font-bold text-ui-tinta">{d.nombre}</h2>
          <Punto nivel={estado.ok === true ? 'bien' : estado.ok === false ? 'critico' : 'apagado'} fuerte={estado.texto} />
        </div>
        <p className="m-0 max-w-[760px] text-[15px] leading-relaxed text-ui-tinta-2">
          En los últimos <Num>{dias}</Num> días hubo <Num>{d.totalConexiones}</Num> {d.totalConexiones === 1 ? 'entrada' : 'entradas'} por SSH
          de <Num>{d.personasDistintas}</Num> {d.personasDistintas === 1 ? 'persona' : 'personas'};{' '}
          <Num>{d.cuentaCompartida.conexiones}</Num> con la cuenta compartida <span className="font-ui-num text-ui-tinta">{d.cuentaCompartida.nombre}</span>
          {d.cuentaCompartida.activas > 0 && <> (<Num>{d.cuentaCompartida.activas}</Num> abiertas ahora)</>}.
        </p>
        {d.conectados.length
          ? <Punto nivel="bien" fuerte={`${d.conectados.length} ${d.conectados.length === 1 ? 'conectado' : 'conectados'}`} resto="ahora mismo" />
          : <Punto nivel="apagado" fuerte="Nadie" resto="está conectado en este momento." />}
      </section>

      {nr.conexiones > 0 && (
        <Aviso nivel="alerta"
          titulo={`${nr.conexiones} ${nr.conexiones === 1 ? 'entrada' : 'entradas'} con cuentas no reconocidas${nr.activas ? `, ${nr.activas} abierta(s) ahora` : ''}`}
          detalle={<>No son del directorio ni la cuenta compartida. Última: <span className="font-ui-num">{nr.ultimas[0].usuario}</span> desde{' '}
            <span className="font-ui-num">{nr.ultimas[0].ip}</span>{nr.ultimas[0].pais ? ` (${nr.ultimas[0].pais})` : ''}, {haceTiempo(nr.ultimas[0].inicio, ahora)}.</>} />
      )}

      {d.conectados.length > 0 && (
        <Seccion titulo="Conectados ahora">
          <Tabla
            plantilla="grid-cols-[minmax(0,1fr)_130px_130px_minmax(0,1fr)]"
            columnas={[{ titulo: 'Persona' }, { titulo: 'Desde', derecha: true }, { titulo: 'IP' }, { titulo: 'Ubicación' }]}
            claves={d.conectados.map((c) => c.id)}
            filas={d.conectados.map((c) => [
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold text-ui-tinta">{nombreConexion(c)}</span>
                {c.nombre && <span className="truncate font-ui-num text-[11px] text-ui-apagado">{c.usuario}</span>}
              </span>,
              <Num>{fechaExcel(c.inicio)}</Num>,
              <span className="font-ui-num text-[12px]">{c.ip}</span>,
              <span className="block truncate">{ubicacionConexion(c)}</span>,
            ])}
          />
        </Seccion>
      )}

      {puntos.length > 0 && (
        <Seccion titulo="Desde dónde se conectan" derecha={<span className={NOTA}>aproximado por IP (nivel ciudad)</span>}>
          <div className={`${TARJETA} h-[280px]`}><SesionesMapa puntos={puntos} /></div>
        </Seccion>
      )}

      <Seccion titulo={`Personas en ${d.nombre}`}
        derecha={<Buscador icono={Search} valor={busqueda} onCambio={setBusqueda} placeholder="Buscar por nombre o usuario" etiqueta={`Buscar personas en ${d.nombre}`} />}>
        {d.totalConexiones > d.conexiones.length && (
          <span className={NOTA}>Las {d.conexiones.length} conexiones más recientes de {d.totalConexiones}.</span>
        )}
        {usuarios.length ? (
          <Tabla
            plantilla="grid-cols-[minmax(0,1fr)_100px_130px_130px]"
            columnas={[{ titulo: 'Persona' }, { titulo: 'Conexiones', derecha: true }, { titulo: 'Tiempo total', derecha: true }, { titulo: 'Última', derecha: true }]}
            claves={usuarios.map((u) => u.usuario)}
            filas={usuarios.map((u) => [
              <PersonaBoton nombre={u.nombre} usuario={u.usuario} abierta={elegido === u.usuario} enCurso={u.activa ? 'conectado' : undefined}
                onClick={() => setElegido(elegido === u.usuario ? null : u.usuario)} />,
              <Num>{u.conexiones.length}</Num>,
              <Num>{formatoDuracion(u.tiempoTotalMs)}</Num>,
              <Num>{fechaExcel(u.ultima)}</Num>,
            ])}
          />
        ) : busqueda.trim()
          ? <Aviso titulo={`Nadie coincide con «${busqueda.trim()}»`} />
          : <Aviso titulo="Todavía no hay conexiones registradas" detalle="Aparecen aquí a medida que las personas entran por SSH." />}
      </Seccion>

      {historial && (
        <Seccion titulo={`Conexiones de ${historial.nombre}`} derecha={<Boton onClick={() => setElegido(null)}>Cerrar</Boton>}>
          <TablaConexiones conexiones={historial.conexiones.slice(0, MAX_FILAS)} ahora={ahora} />
        </Seccion>
      )}
    </>
  );
}

function TablaConexiones({ conexiones, ahora }: { conexiones: ConexionDispositivo[]; ahora: number }) {
  return (
    <Tabla
      plantilla="grid-cols-[130px_minmax(0,1fr)_130px_minmax(0,1fr)]"
      columnas={[{ titulo: 'Conexión' }, { titulo: 'Desconexión' }, { titulo: 'IP' }, { titulo: 'Ubicación' }]}
      claves={conexiones.map((c) => c.id)}
      filas={conexiones.map((c) => [
        <Num>{fechaExcel(c.inicio)}</Num>,
        c.activa
          ? <span className="text-ui-bien-texto">Lleva <Num>{duracionConexion(c, ahora)}</Num> conectado</span>
          : <span><Num>{fechaExcel(c.fin)}</Num>{c.cierre === 'sin_cierre' && <span className="ml-1 text-[11px] text-ui-apagado">(sin cierre)</span>}</span>,
        <span className="font-ui-num text-[12px]">{c.ip}</span>,
        <span className="block truncate">{ubicacionConexion(c)}</span>,
      ])}
    />
  );
}
