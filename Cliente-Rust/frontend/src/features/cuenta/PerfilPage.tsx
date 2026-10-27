// features/cuenta/PerfilPage.tsx — la cuenta como lista de datos (de la sesión de Keycloak, `AuthSessionInfo`) y lo que se
// va ganando en las prácticas: insignias y pósters como filas con su estado.
//
// La foto se guarda como atributo custom en Keycloak. Este realm federa usuarios desde LDAP en modo solo lectura, así que la
// API de cuenta propia rechaza cualquier escritura (`readOnlyUserMessage`): se escribe con la Admin API en el backend (ver
// `account_set_avatar`, auth/commands.rs), que puede tocar atributos custom pero requiere admin_lab. Por eso «Cambiar foto»
// solo aparece para ese rol; para el resto sería un botón que siempre falla. Editar nombre, correo o clave sigue fuera de alcance.
import React, { useEffect, useRef, useState } from 'react';
import { Camera, Download, User } from 'lucide-react';
import { Boton, Encabezado, NOTA, Pagina, Seccion, TARJETA } from '@/components/ui';
import { RANKS, useEarnedBadges } from '@/features/practicas/badges.service';
import { POSTERS, downloadPoster, useUnlockedPosters, type PosterDef } from '@/features/practicas/posters.service';
import { MedalIcon } from '@/features/practicas/linux/MedalIcon';
import VisorPoster from '@/features/practicas/linux/VisorPoster';
import { useAuth } from './useAuth';
import { ROLE_LABELS, useEffectiveRole } from './usePermissions';
import { authService } from './auth.service';
import { resizeImageToDataUrl } from './resizeImage';

// Los colores de la medalla son parte del dibujo (como un ícono de marca), no del tema
const MEDALLA_ARO = '#e21f19';
const MEDALLA_DISCO = '#f7cd3d';

const fecha = (t: number) => new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

function Dato({ etiqueta, children, mono }: { etiqueta: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-baseline gap-4 border-t border-ui-pista px-5 py-3">
      <dt className="text-[13px] text-ui-apagado">{etiqueta}</dt>
      <dd className={`m-0 truncate text-[13px] text-ui-tinta ${mono ? 'font-ui-num' : ''}`}>{children}</dd>
    </div>
  );
}

export default function PerfilPage() {
  const { user } = useAuth();
  const role = useEffectiveRole();
  const puedeCambiarFoto = role === 'admin_lab';
  const ganadas = useEarnedBadges();
  const posters = useUnlockedPosters();
  const archivo = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viendo, setViendo] = useState<PosterDef | null>(null);

  useEffect(() => {
    let vivo = true;
    authService.getAvatar().then((url) => { if (vivo) setFoto(url); }).catch(() => { /* sin foto todavía */ });
    return () => { vivo = false; };
  }, []);

  const nombre = [user?.given_name, user?.family_name].filter(Boolean).join(' ') || user?.name || user?.preferred_username || 'Usuario';

  const elegirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Elige un archivo de imagen'); return; }
    setError(null);
    setSubiendo(true);
    try {
      const dataUrl = await resizeImageToDataUrl(f);
      await authService.setAvatar(dataUrl);
      setFoto(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Pagina ancho="max-w-[760px]">
      <Encabezado titulo="Perfil" descripcion="Tu cuenta institucional y lo que vas ganando en las prácticas." />

      <Seccion titulo="Cuenta">
        <dl className={`${TARJETA} m-0`}>
          <div className="flex items-center gap-4 px-5 py-4">
            {foto
              ? <img src={foto} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
              : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_9%,transparent)] text-ui-acento-texto"><User size={22} aria-hidden /></span>}
            <span className="min-w-0 flex-1 truncate font-ui-titulo text-[16px] font-bold text-ui-tinta">{nombre}</span>
            {puedeCambiarFoto && (
              <>
                <Boton disabled={subiendo} onClick={() => archivo.current?.click()}>
                  <Camera size={14} aria-hidden /> {subiendo ? 'Subiendo…' : 'Cambiar foto'}
                </Boton>
                <input ref={archivo} type="file" accept="image/*" className="hidden" onChange={(e) => void elegirFoto(e)} />
              </>
            )}
          </div>
          {error && <p className="m-0 border-t border-ui-pista px-5 py-2 text-[12px] text-ui-critico-texto" role="alert">No se pudo cambiar la foto: {error}</p>}
          <Dato etiqueta="Usuario" mono>{user?.preferred_username || 'Sin usuario'}</Dato>
          {user?.email && <Dato etiqueta="Correo">{user.email}</Dato>}
          <Dato etiqueta="Rol">{ROLE_LABELS[role]}</Dato>
        </dl>
      </Seccion>

      <Seccion titulo="Insignias de Linux" derecha={<span className={NOTA}>solo tú las ves</span>}>
        <ul className={`${TARJETA} m-0 list-none p-0`}>
          {RANKS.map((r, i) => {
            const g = r.moduleId ? ganadas[r.moduleId] : undefined;
            return (
              <li key={r.id} className={`flex items-center gap-4 px-5 py-3 ${i ? 'border-t border-ui-pista' : ''}`}>
                <MedalIcon locked={!g} ringColor={MEDALLA_ARO} discColor={MEDALLA_DISCO} code={r.code}
                  className={`h-9 w-9 shrink-0 ${g ? '' : 'text-ui-fantasma opacity-60'}`} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={`text-[13px] font-semibold ${r.moduleId ? 'text-ui-tinta' : 'text-ui-apagado'}`}>{r.title}</span>
                  <span className="text-[12px] text-ui-apagado">{r.description}</span>
                </span>
                <span className={`shrink-0 text-right text-[12px] ${g ? 'text-ui-bien-texto' : 'text-ui-apagado'}`}>
                  {g ? `Ganada el ${fecha(g.earnedAt)}` : r.moduleId ? `Al terminar el módulo ${r.code}` : 'Próximamente'}
                </span>
              </li>
            );
          })}
        </ul>
      </Seccion>

      {POSTERS.length > 0 && (
        <Seccion titulo="Pósters">
          <ul className={`${TARJETA} m-0 list-none p-0`}>
            {POSTERS.map((p, i) => {
              const libre = p.id in posters;
              const modulo = RANKS.find((r) => r.moduleId === p.moduleId)?.code ?? '';
              return (
                <li key={p.id} className={`flex items-center gap-4 px-5 py-3 ${i ? 'border-t border-ui-pista' : ''}`}>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={`text-[13px] font-semibold ${libre ? 'text-ui-tinta' : 'text-ui-apagado'}`}>{p.title}</span>
                    <span className="text-[12px] text-ui-apagado">{libre ? p.description : `Se desbloquea al terminar el módulo ${modulo}.`}</span>
                  </span>
                  {libre && (
                    <span className="flex shrink-0 gap-2">
                      <Boton onClick={() => setViendo(p)}>Ver</Boton>
                      <Boton onClick={() => void downloadPoster(p)}><Download size={14} aria-hidden /> Descargar</Boton>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Seccion>
      )}

      {viendo && <VisorPoster poster={viendo} onCerrar={() => setViendo(null)} />}
    </Pagina>
  );
}
