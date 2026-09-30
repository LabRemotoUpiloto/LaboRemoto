// pages/practices/LinuxModulePage.tsx
//
// Pantalla PRE-conexión de la categoría Linux: solo título, objetivo y el
// botón para conectar. Todo el contenido del módulo (texto, analogías,
// media, comandos a probar, quiz final) se entrega DESPUÉS de conectar, por
// el chat de la sesión SSH recién abierta (ver ChatPane.tsx) -- no antes de
// empezar la práctica.

import React, { useEffect, useState } from 'react';
import {
  Box, Container, Stack, Title, Text, Button, Group, Paper, Loader, Alert, Badge,
} from '@mantine/core';
import { ArrowLeft, PlugZap, MonitorCheck, RotateCcw, Eye } from 'lucide-react';
import LinuxPasswordPrompt from '../../components/practicas/linux/LinuxPasswordPrompt';
import type { LinuxPracticeSessionApi } from '../../hooks/useLinuxPracticeSession';
import { linuxGetModule, type LinuxModule } from '../../services/linuxPractice.service';
import { useAccessTier } from '../../hooks/usePermissions';
import { useEarnedBadges } from '../../services/badges.service';

interface Props {
  practiceId: string;
  onBack: () => void;
  /**
   * Instancia única del hook, vive a nivel de App (mismo patrón que
   * usePracticeSession) — sobrevive a que esta página se desmonte cuando el
   * estudiante navega a la pestaña de la sesión SSH recién abierta. El
   * polling de revalidación corre adentro del hook, no acá.
   */
  linuxSession: LinuxPracticeSessionApi;
  /**
   * Reinicia por completo el progreso de un módulo ya completo (cierra la
   * sesión SSH real si sigue abierta y borra la insignia) -- ver App.tsx
   * (handleRestartLinuxModule). Por ahora solo se ofrece al rol `admin`
   * (ver usePermissions.ts): a futuro se abre a una lista de roles
   * configurable, pero el mecanismo ya queda armado para reusarlo tal cual.
   */
  onRestartModule?: (moduleId: string) => Promise<void>;
}

const LinuxModulePage: React.FC<Props> = ({ practiceId, onBack, linuxSession, onRestartModule }) => {
  const [module, setModule] = useState<LinuxModule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Elección del administrador cuando reabre un módulo ya completo (ver
  // abajo) -- 'view' salta directo al flujo normal de conectar/seguir sin
  // tocar nada; 'repeat' dispara el reinicio real y, apenas la insignia se
  // borra (useEarnedBadges es reactivo), el chooser desaparece solo.
  const [adminChoice, setAdminChoice] = useState<'view' | null>(null);
  const [restarting, setRestarting] = useState(false);

  const {
    connect, connecting, submittingPassword, connectError,
    passwordPrompt, submitPassword, cancelPassword,
    connectedModules,
  } = linuxSession;

  const connected = module ? !!connectedModules[module.id] : false;
  const tier = useAccessTier();
  const earnedBadges = useEarnedBadges();
  const alreadyCompleted = module ? module.id in earnedBadges : false;
  // Por ahora exclusivo de `admin` -- acá es donde se engancha la lista de
  // roles configurable a futuro que se mencionó al pedir esta feature.
  const showAdminChooser = tier === 'admin' && alreadyCompleted && adminChoice === null;

  useEffect(() => {
    let cancelled = false;
    setModule(null);
    setLoadError(null);
    setAdminChoice(null);
    linuxGetModule(practiceId)
      .then((m) => { if (!cancelled) setModule(m); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [practiceId]);

  const handleRestart = async () => {
    if (!module || restarting) return;
    setRestarting(true);
    try {
      await onRestartModule?.(module.id);
    } finally {
      setRestarting(false);
    }
  };

  const handleConnect = async () => {
    if (!module) return;
    try {
      await connect(module);
    } catch {
      // connectError ya queda visible en el panel de abajo
    }
  };

  if (loadError) {
    return (
      <Container size="sm" py="xl">
        <Alert color="red" title="No se pudo cargar el módulo">{loadError}</Alert>
        <Button mt="md" variant="subtle" leftSection={<ArrowLeft size={14} />} onClick={onBack}>
          Volver
        </Button>
      </Container>
    );
  }

  if (!module) {
    return (
      <Box w="100%" h="100%" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size="md" />
      </Box>
    );
  }

  // Ya completaste este módulo: como admin, elegí qué hacer antes de entrar
  // (salir, repetirlo de cero para observar comportamientos, o solo verlo
  // como quedó). Reemplaza el flujo normal de conectar -- se vuelve a
  // mostrar el chooser cada vez que se reabre este módulo, mientras siga
  // completo.
  if (showAdminChooser) {
    return (
      <Box w="100%" h="100%" style={{ overflow: 'auto' }}>
        <Container size="sm" py="xl">
          <Stack gap="xl">
            <Button variant="subtle" color="gray" size="sm" leftSection={<ArrowLeft size={14} />} onClick={onBack} style={{ alignSelf: 'flex-start' }}>
              Volver a Linux
            </Button>

            <Stack gap={10}>
              <Group gap={8}>
                <Text fz="xs" tt="uppercase" fw={700} c="teal" style={{ letterSpacing: '0.08em' }}>
                  Módulo {module.order}
                </Text>
                <Badge variant="light" color="green" size="sm">Completo</Badge>
              </Group>
              <Title order={1} style={{ fontSize: '1.75rem' }}>{module.title}</Title>
              <Text c="dimmed" maw={520}>
                Ya completaste este módulo. Como administrador, elegí qué hacer para revisar comportamientos.
              </Text>
            </Stack>

            <Paper withBorder radius="md" p="md">
              <Group justify="flex-end" gap="sm">
                <Button variant="subtle" color="gray" onClick={onBack}>
                  Salir
                </Button>
                <Button variant="light" leftSection={<Eye size={16} />} onClick={() => setAdminChoice('view')}>
                  Ver
                </Button>
                <Button
                  color="red"
                  leftSection={<RotateCcw size={16} />}
                  loading={restarting}
                  onClick={handleRestart}
                >
                  Repetir
                </Button>
              </Group>
            </Paper>
          </Stack>
        </Container>
      </Box>
    );
  }

  return (
    <Box w="100%" h="100%" style={{ overflow: 'auto' }}>
      <Container size="sm" py="xl">
        <Stack gap="xl">
          <Button variant="subtle" color="gray" size="sm" leftSection={<ArrowLeft size={14} />} onClick={onBack} style={{ alignSelf: 'flex-start' }}>
            Volver a Linux
          </Button>

          <Stack gap={10}>
            <Group gap={8}>
              <Text fz="xs" tt="uppercase" fw={700} c="teal" style={{ letterSpacing: '0.08em' }}>
                Módulo {module.order}
              </Text>
              <Badge variant="light" color="gray" size="sm" tt="capitalize">{module.difficulty}</Badge>
              {module.estimated_minutes && (
                <Badge variant="light" color="gray" size="sm">~{module.estimated_minutes} min</Badge>
              )}
            </Group>
            <Title order={1} style={{ fontSize: '1.75rem' }}>{module.title}</Title>
            <Text c="dimmed" maw={520}>{module.objective}</Text>
          </Stack>

          {connected ? (
            <Paper withBorder radius="md" p="md">
              <Group gap="sm" wrap="nowrap">
                <MonitorCheck size={18} color="var(--success, #10b981)" />
                <Text fz="sm" c="dimmed">
                  Ya estás conectado a este módulo — seguí la práctica en el chat de tu pestaña de terminal.
                </Text>
              </Group>
            </Paper>
          ) : (
            <Paper withBorder radius="md" p="md">
              <Group justify="space-between" align="center" wrap="nowrap">
                <Text fz="sm" c="dimmed">
                  El tutor te va a guiar paso a paso por el chat una vez conectado — no hace falta leer nada antes.
                </Text>
                <Button leftSection={<PlugZap size={16} />} loading={connecting} onClick={handleConnect}>
                  Conectar
                </Button>
              </Group>
              {connectError && <Text fz="sm" c="red" mt="sm">{connectError}</Text>}
            </Paper>
          )}
        </Stack>
      </Container>

      <LinuxPasswordPrompt
        opened={!!passwordPrompt}
        username={passwordPrompt?.username ?? ''}
        loading={submittingPassword}
        errorMessage={connectError}
        onSubmit={submitPassword}
        onCancel={cancelPassword}
      />
    </Box>
  );
};

export default LinuxModulePage;
