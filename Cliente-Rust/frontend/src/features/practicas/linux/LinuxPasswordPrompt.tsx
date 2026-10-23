// components/practicas/linux/LinuxPasswordPrompt.tsx
//
// Diálogo NATIVO (no navegador) para pedir la contraseña de Active Directory
// una sola vez por sesión, justo antes de abrir el SSH a la Pi. Nunca se
// persiste: vive solo en memoria del hook que la usa y se descarta después
// de conectar.

import React, { useState } from 'react';
import { Modal, PasswordInput, Button, Stack, Text, Group } from '@mantine/core';
import { Lock } from 'lucide-react';

interface Props {
  opened: boolean;
  username: string;
  loading?: boolean;
  errorMessage?: string | null;
  onSubmit: (password: string) => void;
  onCancel: () => void;
  /** Clase extra del cuadro (el tutorial de bienvenida la usa para resaltarlo). */
  contentClassName?: string;
  /** Título del módulo al que se entra (se abre directo desde su tarjeta, sin página intermedia). */
  modulo?: string;
}

const LinuxPasswordPrompt: React.FC<Props> = ({
  opened, username, loading, errorMessage, onSubmit, onCancel, contentClassName, modulo,
}) => {
  const [password, setPassword] = useState('');

  const handleSubmit = () => {
    if (!password) return;
    onSubmit(password);
  };

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title="Conectar a tu espacio de trabajo"
      centered
      size="sm"
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      classNames={contentClassName ? { content: contentClassName } : undefined}
    >
      <Stack gap="md">
        {modulo && (
          <Text size="sm">
            Vas a entrar a <strong>{modulo}</strong>.
          </Text>
        )}
        <Text size="sm" c="dimmed">
          Se conecta como <strong>{username}</strong> al equipo del laboratorio —
          es tu misma cuenta de la universidad. La contraseña se usa una sola vez para
          esta conexión y no se guarda.
        </Text>

        <PasswordInput
          label="Contraseña"
          leftSection={<Lock size={15} style={{ color: 'var(--text-secondary)' }} />}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          autoFocus
          disabled={loading}
          data-autofocus
        />

        {errorMessage && (
          <Text size="sm" c="red">{errorMessage}</Text>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={loading} disabled={!password}>
            Conectar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default LinuxPasswordPrompt;
