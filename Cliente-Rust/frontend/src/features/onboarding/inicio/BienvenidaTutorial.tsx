// tour/bienvenida/BienvenidaTutorial.tsx — la primera vez que un estudiante inicia sesión en este equipo, le ofrece el
// tutorial narrado. También lo arranca cuando alguien lo pide (evento `app:tutorial-bienvenida`, p. ej. «Iniciar recorrido»
// en Inicio), para cualquier rol.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { GraduationCap, Volume2 } from 'lucide-react';
import { Boton, BotonPrincipal, Dialogo } from '@/components/ui';
import { useAuth } from '@/features/cuenta/AuthContext';
import { useEffectiveRole } from '@/features/cuenta/usePermissions';
import LinuxPasswordPrompt from '@/features/practicas/linux/LinuxPasswordPrompt';
import { escenaTutorial, iniciarTutorialBienvenida, marcarTutorialVisto, tutorialYaVisto } from './tutorialBienvenida';

const EVENTO_TUTORIAL_BIENVENIDA = 'app:tutorial-bienvenida';

/** Pide el tutorial desde cualquier parte de la app. */
export const pedirTutorialBienvenida = () => window.dispatchEvent(new CustomEvent(EVENTO_TUTORIAL_BIENVENIDA));

/** Ventanas reales de la app que el tutorial muestra en algunos pasos: solo para verlas (no envían nada). */
function EscenaTutorial({ usuario }: { usuario: string }) {
  const escena = useSyncExternalStore(escenaTutorial.suscribir, escenaTutorial.leer);
  return (
    <LinuxPasswordPrompt
      opened={escena === 'contrasena'}
      username={usuario || 'tu.usuario'}
      onSubmit={() => {}}
      onCancel={() => {}}
      contentClassName="tb-escena-contrasena"
    />
  );
}

export default function BienvenidaTutorial({ abrirPagina }: { abrirPagina: (pagina: string) => void }) {
  const { isAuthenticated, user } = useAuth();
  const rol = useEffectiveRole();
  const usuario = user?.preferred_username ?? '';
  const [ofrecer, setOfrecer] = useState(false);

  // Solo a estudiantes, una vez por usuario y equipo, y un instante después de entrar (que la app termine de pintarse).
  useEffect(() => {
    if (!isAuthenticated || !usuario || rol !== 'estudiante' || tutorialYaVisto(usuario)) return;
    const t = setTimeout(() => setOfrecer(true), 1200);
    return () => clearTimeout(t);
  }, [isAuthenticated, usuario, rol]);

  useEffect(() => {
    const empezar = () => {
      setOfrecer(false);
      if (usuario) marcarTutorialVisto(usuario);
      iniciarTutorialBienvenida(abrirPagina);
    };
    window.addEventListener(EVENTO_TUTORIAL_BIENVENIDA, empezar);
    return () => window.removeEventListener(EVENTO_TUTORIAL_BIENVENIDA, empezar);
  }, [abrirPagina, usuario]);

  const ahoraNo = () => {
    setOfrecer(false);
    if (usuario) marcarTutorialVisto(usuario);
  };

  return (
    <>
    <EscenaTutorial usuario={usuario} />
    {ofrecer && (
      <Dialogo ancho="w-[440px]" titulo="¡Bienvenido a LaboRemoto!" onCerrar={ahoraNo}
        descripcion="En un minuto y medio te mostramos qué hay en la aplicación y cómo hacer tu primera práctica."
        acciones={<>
          <Boton onClick={ahoraNo}>Ahora no</Boton>
          <BotonPrincipal onClick={pedirTutorialBienvenida}><GraduationCap size={16} aria-hidden /> Empezar el recorrido</BotonPrincipal>
        </>}>
        <div className="flex items-center gap-4">
          <img src="/abeja-Profesor.jpeg" alt="" className="h-16 w-16 shrink-0 rounded-full bg-white object-contain" />
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 text-[13px] text-ui-tinta-2"><Volume2 size={15} aria-hidden /> Tiene voz: sube el volumen.</span>
            <span className="text-[12px] text-ui-apagado">Puedes verlo cuando quieras con «Iniciar recorrido», en Inicio.</span>
          </div>
        </div>
      </Dialogo>
    )}
    </>
  );
}
