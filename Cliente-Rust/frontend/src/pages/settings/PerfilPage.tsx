// pages/settings/PerfilPage.tsx — info de cuenta (viene de la sesión de
// Keycloak ya activa, `AuthSessionInfo`) + foto de perfil editable. La foto
// se guarda como atributo custom en Keycloak. Este realm federa usuarios
// desde LDAP en modo solo-lectura, así que la API de cuenta propia
// (self-service) rechaza cualquier escritura (`readOnlyUserMessage`) --
// terminó escribiéndose vía la Admin API en el backend (ver doc en
// `account_set_avatar`, auth/commands.rs), que sí puede tocar atributos
// custom aunque el usuario sea de solo lectura, pero requiere admin_lab.
// Por eso el control de subida solo se muestra para ese rol -- para el
// resto sería un botón que siempre falla. Editar nombre/email/password
// sigue fuera de alcance.
import React, { useEffect, useRef, useState } from 'react';
import { Box, Card, Text, Title, Group, Avatar, Badge, Stack, Divider, Loader } from '@mantine/core';
import { User, Mail, ShieldCheck, AtSign, Camera } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAccessTier } from '../../hooks/usePermissions';
import { authService } from '../../services/auth.service';
import { resizeImageToDataUrl } from '../../utils/resizeImage';

function formatRoleLabel(roles: string[] | undefined): string {
  if (roles?.includes('admin_lab')) return 'Administrador';
  if (roles?.includes('laboratorista')) return 'Laboratorista';
  if (roles?.includes('semillerista')) return 'Semillerista';
  return 'Estudiante';
}

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <Group gap="sm" wrap="nowrap">
    <Box
      className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
      style={{ color: 'var(--accent-primary)', backgroundColor: 'var(--interactive-hover)', border: '1px solid var(--border-subtle)' }}
    >
      {icon}
    </Box>
    <Stack gap={0}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm" fw={500}>{value}</Text>
    </Stack>
  </Group>
);

export default function PerfilPage() {
  const { user } = useAuth();
  const tier = useAccessTier();
  const canEditAvatar = tier === 'admin';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authService.getAvatar().then((url) => {
      if (!cancelled) setAvatar(url);
    }).catch(() => { /* sin avatar todavía, no es un error real */ });
    return () => { cancelled = true; };
  }, []);

  const fullName = [user?.given_name, user?.family_name].filter(Boolean).join(' ') || user?.name || user?.preferred_username || 'Usuario';
  const roleLabel = formatRoleLabel(user?.roles);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo despues
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Elige un archivo de imagen');
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await authService.setAvatar(dataUrl);
      setAvatar(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="page-header-integrated border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <h2 className="page-header-title">Perfil</h2>
        <div className="page-header-content">
          <p className="page-header-description">
            Información de tu cuenta institucional.
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 scroll-smooth custom-scrollbar">
        <div className="max-w-[560px] mx-auto">
          <Card padding="lg" radius="md" withBorder>
            <Group gap="md" mb="lg">
              <Box
                className={canEditAvatar ? 'relative cursor-pointer group' : 'relative'}
                onClick={() => canEditAvatar && !uploading && fileInputRef.current?.click()}
                title={canEditAvatar ? 'Cambiar foto de perfil' : undefined}
              >
                <Avatar size={56} radius="xl" color="var(--accent-primary)" src={avatar || undefined}>
                  <User size={26} />
                </Avatar>
                {canEditAvatar && (
                  <div
                    className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
                  >
                    {uploading ? <Loader size={16} color="white" /> : <Camera size={16} color="white" />}
                  </div>
                )}
                {canEditAvatar && (
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                )}
              </Box>
              <Stack gap={2}>
                <Title order={4}>{fullName}</Title>
                <Badge variant="light" size="sm" radius="xl">{roleLabel}</Badge>
              </Stack>
            </Group>

            {error && <Text size="xs" c="red" mb="md">{error}</Text>}

            <Divider mb="lg" />

            <Stack gap="md">
              <InfoRow icon={<AtSign size={15} />} label="Usuario" value={user?.preferred_username || '—'} />
              {user?.email && <InfoRow icon={<Mail size={15} />} label="Correo" value={user.email} />}
              <InfoRow icon={<ShieldCheck size={15} />} label="Rol" value={roleLabel} />
            </Stack>
          </Card>
        </div>
      </div>
    </div>
  );
}
