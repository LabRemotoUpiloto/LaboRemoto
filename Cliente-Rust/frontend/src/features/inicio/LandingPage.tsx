// features/inicio/LandingPage.tsx — Inicio: la portada (AgentHomeHero) y, debajo, algo útil con datos reales. Al personal, cómo
// está el laboratorio ahora (equipos, prácticas en curso, cámaras); al estudiante, su avance en Linux y por dónde seguir.
import React, { useEffect, useState } from 'react';
import { ArrowRight, Terminal } from 'lucide-react';
import { Boton, Punto, Seccion, TARJETA } from '@/components/ui';
import { useAuth } from '@/features/cuenta/AuthContext';
import { canAccessPage, useEffectiveRole } from '@/features/cuenta/usePermissions';
import { dispositivosService, type DispositivoActividad } from '@/features/actividad/dispositivos.service';
import { sesionesService } from '@/features/actividad/sesiones.service';
import { RANKS, useEarnedBadges } from '@/features/practicas/badges.service';
import { PILOT_GROUP_KEY } from '@/features/camaras/grupos';
import { invoke } from '@tauri-apps/api/core';
import type { NvrCamera } from '@/bindings/NvrCamera';
import AgentHomeHero from './AgentHomeHero';
import { useDisplayName } from './useDisplayName';

interface LandingPageProps {
  onStartTutorial?: () => void;
  onOpenPanel?: (panelId: string) => void;
}

function Fila({ nombre, children, accion }: { nombre: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-t border-ui-pista px-5 py-3 first:border-t-0">
      <span className="w-[180px] shrink-0 truncate text-[13px] font-semibold text-ui-tinta" title={nombre}>{nombre}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {accion}
    </div>
  );
}

/** Personal: lo que está pasando ahora en el laboratorio. Cada fila lleva a la página que lo muestra completo. */
function Ahora({ onOpenPanel }: { onOpenPanel?: (p: string) => void }) {
  const rol = useEffectiveRole();
  const [equipos, setEquipos] = useState<DispositivoActividad[] | null>(null);
  const [enCurso, setEnCurso] = useState<number | null>(null);
  const [camaras, setCamaras] = useState<NvrCamera[] | null>(null);

  useEffect(() => {
    let vivo = true;
    dispositivosService.resumen(1).then((r) => { if (vivo) setEquipos(r.dispositivos); }).catch(() => { if (vivo) setEquipos([]); });
    sesionesService.resumen(1).then((r) => { if (vivo) setEnCurso(r.sesiones.filter((s) => !s.fin).length); }).catch(() => { /* sin dato */ });
    invoke<NvrCamera[]>('nvr_list_cameras', { groupKey: PILOT_GROUP_KEY })
      .then((c) => { if (vivo) setCamaras(c); }).catch(() => { /* sin dato */ });
    return () => { vivo = false; };
  }, []);

  const ir = (pagina: string, texto: string) => canAccessPage(pagina, rol) && onOpenPanel && (
    <button type="button" onClick={() => onOpenPanel(pagina)}
      className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-ui-acento-texto hover:underline">
      {texto} <ArrowRight size={14} aria-hidden />
    </button>
  );
  const vivas = camaras?.filter((c) => c.status === 'active').length ?? 0;

  return (
    <Seccion titulo="Ahora en el laboratorio">
      <div className={TARJETA}>
        {equipos === null && <Fila nombre="Equipos"><span className="text-[13px] text-ui-apagado" role="status">Consultando…</span></Fila>}
        {equipos?.map((d) => (
          <Fila key={d.id} nombre={d.nombre} accion={ir('rendimiento', 'Monitoreo')}>
            {d.enLinea
              ? <Punto nivel="bien" fuerte="En línea" resto={d.conectados.length ? `(${d.conectados.length} ${d.conectados.length === 1 ? 'conectado' : 'conectados'})` : '(nadie conectado)'} />
              : <Punto nivel="critico" fuerte="Sin conexión" />}
          </Fila>
        ))}
        <Fila nombre="Prácticas" accion={ir('dashboard', 'Actividad')}>
          {enCurso === null ? <Punto nivel="apagado" fuerte="Sin dato" />
            : enCurso ? <Punto nivel="bien" fuerte={`${enCurso} en curso`} />
            : <Punto nivel="apagado" fuerte="Ninguna" resto="en curso" />}
        </Fila>
        <Fila nombre="Cámaras" accion={ir('vigilancia', 'Vigilancia')}>
          {camaras === null ? <Punto nivel="apagado" fuerte="Sin dato" />
            : <Punto nivel={camaras.length && vivas === camaras.length ? 'bien' : 'alerta'} fuerte={`${vivas} de ${camaras.length}`} resto="en vivo" />}
        </Fila>
      </div>
    </Seccion>
  );
}

/** Estudiante: su avance en Linux y por dónde seguir. */
function Avance({ onOpenPanel }: { onOpenPanel?: (p: string) => void }) {
  const ganadas = useEarnedBadges();
  const modulos = RANKS.filter((r) => r.moduleId);
  const siguiente = modulos.find((r) => !ganadas[r.moduleId!]);
  const hechos = modulos.length - modulos.filter((r) => !ganadas[r.moduleId!]).length;
  return (
    <Seccion titulo="Tu avance en Linux">
      <div className={`${TARJETA} flex items-center gap-5 px-5 py-4`}>
        <div className="flex shrink-0 gap-1.5" role="img" aria-label={`${hechos} de ${modulos.length} módulos terminados`}>
          {modulos.map((r) => <span key={r.id} className={`h-1.5 w-8 rounded-sm ${ganadas[r.moduleId!] ? 'bg-ui-acento-texto' : 'bg-ui-pista'}`} />)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {siguiente ? (
            <>
              <span className="text-[13px] text-ui-tinta-2">Sigue con {siguiente.code}: {siguiente.title}</span>
              <span className="truncate text-[12px] text-ui-apagado">{siguiente.description}</span>
            </>
          ) : (
            <span className="text-[13px] text-ui-tinta-2">Terminaste todos los módulos disponibles.</span>
          )}
        </div>
        {onOpenPanel && <Boton onClick={() => onOpenPanel('practices')}>Ir a Prácticas</Boton>}
      </div>
    </Seccion>
  );
}

const LandingPage: React.FC<LandingPageProps> = ({ onStartTutorial, onOpenPanel }) => {
  const displayName = useDisplayName();
  const { isAuthenticated } = useAuth();
  const rol = useEffectiveRole();

  return (
    <div className="relative h-full overflow-auto bg-ui-fondo">
      <div className="mx-auto flex min-h-full w-full max-w-[1080px] flex-col justify-center gap-12 py-10">
        <AgentHomeHero displayName={displayName} onOpenPanel={onOpenPanel} onStartTutorial={onStartTutorial} />
        {isAuthenticated && (
          <div className="px-4 md:px-8">
            {rol === 'estudiante' ? <Avance onOpenPanel={onOpenPanel} />
              : canAccessPage('vigilancia', rol) ? <Ahora onOpenPanel={onOpenPanel} /> : null}
          </div>
        )}
      </div>

      {/* Para quien no puede iniciar sesión con Keycloak (p. ej. un invitado sin cuenta institucional) pero necesita conectarse
          a un servidor por SSH: discreto a propósito, no compite con «Iniciar sesión». */}
      {!isAuthenticated && onOpenPanel && (
        <Boton onClick={() => onOpenPanel('ssh-guest')} className="absolute bottom-5 right-5">
          <Terminal size={14} aria-hidden /> Conexión SSH
        </Boton>
      )}
    </div>
  );
};

export default LandingPage;
