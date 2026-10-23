// tour/bienvenida/BienvenidaTutorial.tsx — la primera vez que un estudiante inicia sesión en este equipo, le ofrece el
// tutorial narrado. También lo arranca cuando alguien lo pide (evento `app:tutorial-bienvenida`, p. ej. «Iniciar recorrido»
// en Inicio), para cualquier rol.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { Volume2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useEffectiveRole } from '../../hooks/usePermissions';
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
    <Modal opened={ofrecer} onClose={ahoraNo} centered radius="lg" size="md" withCloseButton={false} zIndex={3000}>
      <Stack gap="md" align="center" ta="center" py="sm">
        <img src="/abeja-Profesor.jpeg" alt="Profesor Bee" style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'contain', background: '#fff' }} />
        <Text fw={800} size="xl">¡Bienvenido a LaboRemoto!</Text>
        <Text size="sm" c="dimmed">
          En un minuto y medio te mostramos qué hay en la aplicación y cómo hacer tu primera práctica.
        </Text>
        <Group gap={6} justify="center">
          <Volume2 size={16} aria-hidden />
          <Text size="xs" c="dimmed">Tiene voz: sube el volumen.</Text>
        </Group>
        <Group justify="center" mt="xs">
          <Button variant="subtle" color="gray" onClick={ahoraNo}>Ahora no</Button>
          <Button onClick={pedirTutorialBienvenida}>Empezar el recorrido</Button>
        </Group>
        <Text size="xs" c="dimmed">Puedes verlo cuando quieras con «Iniciar recorrido», en Inicio.</Text>
      </Stack>
    </Modal>
    </>
  );
}
