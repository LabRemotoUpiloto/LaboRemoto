// pages/practices/LinuxModulePage.tsx
//
// Reemplaza el grid genérico de PracticeCard para la categoría Linux: trae
// el contenido en bloques del módulo desde la Pi, conecta la sesión SSH de
// trabajo (usuario de Keycloak + contraseña pedida una vez), y mantiene el
// progreso validando en vivo contra el historial real de comandos.

import React, { useEffect, useState } from 'react';
import {
  Box, Container, Stack, Title, Text, Button, Group, Progress, Paper, Loader, Alert, ThemeIcon,
} from '@mantine/core';
import { ArrowLeft, PlugZap, CheckCircle2 } from 'lucide-react';
import { BlockView } from '../../components/practicas/linux/blocks/BlockRenderer';
import LinuxPasswordPrompt from '../../components/practicas/linux/LinuxPasswordPrompt';
import LinuxPracticeProgressBar from '../../components/practicas/linux/LinuxPracticeProgressBar';
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
    connectedModules, results,
  } = linuxSession;

  const connected = module ? !!connectedModules[module.id] : false;
  const result = module ? (results[module.id] ?? null) : null;

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
      // connectError ya queda visible en el modal/panel
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

  const percentage = result?.percentage ?? 0;

  return (
    <Box w="100%" h="100%" style={{ overflow: 'auto' }}>
      <Container size="md" py="xl">
        <Stack gap="xl">
          <Group justify="space-between" align="center">
            <Button variant="subtle" color="gray" size="sm" leftSection={<ArrowLeft size={14} />} onClick={onBack}>
              Volver a Linux
            </Button>
            {result && (
              <Group gap={8}>
                {result.passed && (
                  <ThemeIcon color="green" variant="light" radius="xl" size={22}>
                    <CheckCircle2 size={14} />
                  </ThemeIcon>
                )}
                <Text fz="sm" c="dimmed">{result.earned_points}/{result.total_points} pts</Text>
              </Group>
            )}
          </Group>

          <Stack gap={6}>
            <Text fz="xs" tt="uppercase" fw={700} c="teal" style={{ letterSpacing: '0.08em' }}>
              Módulo {module.order}
            </Text>
            <Title order={1} style={{ fontSize: '1.75rem' }}>{module.title}</Title>
            <Text c="dimmed" maw={620}>{module.objective}</Text>
          </Stack>

          {result && (
            <LinuxPracticeProgressBar result={result} moduleTitle={module.title} />
          )}

          {!connected && (
            <Paper withBorder radius="md" p="md">
              <Group justify="space-between" align="center" wrap="nowrap">
                <Text fz="sm" c="dimmed">
                  Conectate a tu espacio de trabajo para empezar a escribir los comandos.
                </Text>
                <Button leftSection={<PlugZap size={16} />} loading={connecting} onClick={handleConnect}>
                  Conectar
                </Button>
              </Group>
              {connectError && <Text fz="sm" c="red" mt="sm">{connectError}</Text>}
            </Paper>
          )}

          <Stack gap="md">
            {module.blocks.map((block) => (
              <BlockView key={block.id} block={block} rules={module.validation_rules} result={result} />
            ))}
          </Stack>

          {result?.passed && (
            <Alert color="green" title="¡Módulo completo!">
              Completaste el Módulo {module.order} con {result.earned_points}/{result.total_points} puntos
              {' '}({result.percentage}%).
            </Alert>
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
