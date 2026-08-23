// pages/settings/AjustesPage.tsx — cuenta/sesion y app, no apariencia (eso ya
// vive en su propia pagina, ThemesPage) para no duplicar superficie.
import React, { useEffect, useState } from 'react';
import { Box, Card, Text, Group, Stack, Button, Badge } from '@mantine/core';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { Palette, RefreshCw, LogOut, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

type CheckState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'installing' | 'error';

interface Props {
  onOpenPanel?: (panelId: string) => void;
}

const SettingsRow: React.FC<{ icon: React.ReactNode; title: string; description: string; action: React.ReactNode }> = ({ icon, title, description, action }) => (
  <Group justify="space-between" wrap="nowrap" gap="md">
    <Group gap="sm" wrap="nowrap">
      <Box
        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
        style={{ color: 'var(--accent-primary)', backgroundColor: 'var(--interactive-hover)', border: '1px solid var(--border-subtle)' }}
      >
        {icon}
      </Box>
      <Stack gap={0}>
        <Text size="sm" fw={500}>{title}</Text>
        <Text size="xs" c="dimmed">{description}</Text>
      </Stack>
    </Group>
    {action}
  </Group>
);

export default function AjustesPage({ onOpenPanel }: Props) {
  const { logout } = useAuth();
  const [appVersion, setAppVersion] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion(''));
  }, []);

  const handleCheckUpdate = async () => {
    setCheckState('checking');
    try {
      const upd = await check();
      if (upd) {
        setAvailableVersion(upd.version);
        setCheckState('available');
      } else {
        setCheckState('up-to-date');
      }
    } catch {
      setCheckState('error');
    }
  };

  const handleInstallUpdate = async () => {
    setCheckState('installing');
    try {
      const upd = await check();
      if (upd) {
        await upd.downloadAndInstall();
        await relaunch();
      } else {
        setCheckState('up-to-date');
      }
    } catch {
      setCheckState('error');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="page-header-integrated border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <h2 className="page-header-title">Ajustes</h2>
        <div className="page-header-content">
          <p className="page-header-description">
            Preferencias de cuenta y de la aplicación.
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 scroll-smooth custom-scrollbar">
        <div className="max-w-[560px] mx-auto">
          <Card padding="lg" radius="md" withBorder mb="md">
            <Stack gap="lg">
              <SettingsRow
                icon={<Badge variant="transparent" p={0} size="xs">{appVersion ? `v${appVersion}` : '—'}</Badge>}
                title="Versión de la aplicación"
                description={
                  checkState === 'checking' ? 'Buscando actualizaciones…'
                  : checkState === 'up-to-date' ? 'Ya tienes la última versión'
                  : checkState === 'available' ? `Nueva versión disponible: v${availableVersion}`
                  : checkState === 'installing' ? 'Descargando e instalando…'
                  : checkState === 'error' ? 'No se pudo verificar (sin conexión)'
                  : 'Revisa si hay una actualización nueva'
                }
                action={
                  checkState === 'available' ? (
                    <Button size="xs" variant="filled" onClick={handleInstallUpdate} loading={false}>
                      Instalar y reiniciar
                    </Button>
                  ) : checkState === 'up-to-date' ? (
                    <CheckCircle2 size={18} color="var(--success, #4ade80)" />
                  ) : (
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<RefreshCw size={13} />}
                      onClick={handleCheckUpdate}
                      loading={checkState === 'checking' || checkState === 'installing'}
                    >
                      Buscar
                    </Button>
                  )
                }
              />

              <SettingsRow
                icon={<Palette size={15} />}
                title="Apariencia"
                description="Elige el tema visual de la aplicación"
                action={
                  <Button size="xs" variant="light" onClick={() => onOpenPanel?.('themes')}>
                    Ir a Temas
                  </Button>
                }
              />
            </Stack>
          </Card>

          <Card padding="lg" radius="md" withBorder>
            <SettingsRow
              icon={<LogOut size={15} />}
              title="Cerrar sesión"
              description="Termina tu sesión actual en este equipo"
              action={
                <Button size="xs" color="red" variant="light" onClick={logout}>
                  Cerrar sesión
                </Button>
              }
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
