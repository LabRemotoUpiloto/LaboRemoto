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
import { ArrowLeft, PlugZap, MonitorCheck } from 'lucide-react';
import LinuxPasswordPrompt from '../../components/practicas/linux/LinuxPasswordPrompt';
import type { LinuxPracticeSessionApi } from '../../hooks/useLinuxPracticeSession';
import { linuxGetModule, type LinuxModule } from '../../services/linuxPractice.service';

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
}

const LinuxModulePage: React.FC<Props> = ({ practiceId, onBack, linuxSession }) => {
  const [module, setModule] = useState<LinuxModule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const {
    connect, connecting, submittingPassword, connectError,
    passwordPrompt, submitPassword, cancelPassword,
    connectedModules,
  } = linuxSession;

  const connected = module ? !!connectedModules[module.id] : false;

  useEffect(() => {
    let cancelled = false;
    setModule(null);
    setLoadError(null);
    linuxGetModule(practiceId)
      .then((m) => { if (!cancelled) setModule(m); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [practiceId]);

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
