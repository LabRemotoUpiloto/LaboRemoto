import React from 'react';
import {
  TextInput, PasswordInput, Button, Group, Badge, Stack, Paper
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { RecentConnection } from './RecentConnectionsPanel';
import { ConnectionToSave } from '../../hooks/useRecentConnections';
import { useConnectForm } from '../../hooks/useConnectForm';

interface QuickHost {
  id: string;
  name: string;
  host: string;
  port: number;
}

export interface ConnectFormProps {
  onConnected: (info: { id: string; label?: string }) => void;
  getTermSize?: () => { cols: number; rows: number };
  initialPayload?: any | null;
  quickHost?: QuickHost | null;
  recentConnection?: RecentConnection | null;
  recentConnections?: RecentConnection[];
  onQuickHostCleared?: () => void;
  onConnectionSuccess?: (connection: ConnectionToSave) => void;
}

const ConnectForm: React.FC<ConnectFormProps> = (props) => {
  const {
    host, port, user, password, showPassword,
    errors, isConnecting, isPulsing, isRaspberryPi,
    saveModalOpen, setSaveModalOpen,
    successAlertOpen, successAlertMessage,
    setSuccessAlertOpen, setSuccessAlertMessage,
    isEditMode, isValid,
    handleHostChange, handlePortChange,
    setUser, setPassword, setShowPassword,
    setErrors, clearForm, connect, handleSaveHost,
  } = useConnectForm(props);

  // Mantine notification: replace SweetAlert success
  React.useEffect(() => {
    if (successAlertOpen) {
      modals.openConfirmModal({
        title: '¡Éxito!',
        centered: true,
        children: <p style={{ fontSize: 14, opacity: 0.7 }}>{successAlertMessage}</p>,
        labels: { confirm: 'Aceptar', cancel: '' },
        cancelProps: { display: 'none' },
        onConfirm: () => {
          setSuccessAlertOpen(false);
          setSuccessAlertMessage('');
          clearForm();
        },
        onClose: () => {
          setSuccessAlertOpen(false);
          setSuccessAlertMessage('');
          clearForm();
        },
      });
    }
  }, [successAlertOpen]);

  // Mantine modal: replace PromptModal for save host
  const openSaveModal = () => {
    let nameValue = '';
    modals.open({
      title: isEditMode ? 'Editar host guardado' : 'Guardar host',
      centered: true,
      children: (
        <form onSubmit={(e) => { e.preventDefault(); handleSaveHost(nameValue); modals.closeAll(); }}>
          <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 12 }}>
            {isEditMode ? 'Editar' : 'Guardar'} {user}@{host}:{port || '22'}
          </p>
          <TextInput
            data-autofocus
            placeholder="Nombre (opcional)"
            onChange={(e) => { nameValue = e.currentTarget.value; }}
            mb="md"
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" color="gray" onClick={() => modals.closeAll()}>
              Cancelar
            </Button>
            <Button type="submit" color="teal">
              {isEditMode ? 'Guardar cambios' : 'Guardar'}
            </Button>
          </Group>
        </form>
      ),
    });
  };

  return (
    <Paper
      className={`w-full max-w-md mx-auto transition-all duration-300 ${isPulsing ? 'ring-2 ring-teal-500/50' : ''}`}
      p="xl"
      radius="lg"
      withBorder
    >
      <form onSubmit={(e) => e.preventDefault()}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-xl font-semibold m-0">Conectar</h1>
          {props.quickHost && (
            <Badge color="teal" variant="light" size="sm">
              {props.quickHost.name || props.quickHost.host}
            </Badge>
          )}
          {!props.quickHost && props.recentConnection && isRaspberryPi() && (
            <Badge color="teal" variant="light" size="sm">Raspberry Pi 4</Badge>
          )}
        </div>

        <Stack gap="sm">
          {/* Host — oculto para Raspberry Pi */}
          {!isRaspberryPi() && (
            <TextInput
              id="field-host"
              label="Host"
              placeholder="192.168.1.100 o servidor.ejemplo.com"
              value={host}
              onChange={(e) => handleHostChange(e.currentTarget.value)}
              error={errors.host}
              title="Dirección IP o nombre de dominio del servidor SSH"
            />
          )}

          {/* Puerto — oculto para Raspberry Pi */}
          {!isRaspberryPi() && (
            <TextInput
              id="field-port"
              label="Puerto"
              placeholder="22"
              inputMode="numeric"
              value={port}
              onChange={(e) => handlePortChange(e.currentTarget.value)}
              error={errors.port}
              title="Puerto SSH del servidor (por defecto: 22). Rango válido: 1-65535"
            />
          )}

          {/* Usuario */}
          <TextInput
            id="field-user"
            label="Usuario"
            placeholder="root, admin, ubuntu..."
            value={user}
            onChange={(e) => {
              setUser(e.currentTarget.value);
              if (errors.user) setErrors(prev => ({ ...prev, user: undefined }));
            }}
            error={errors.user}
            title="Nombre de usuario para la conexión SSH"
          />

          {/* Password */}
          <PasswordInput
            id="field-pass"
            label="Contraseña"
            value={password}
            onChange={(e) => {
              setPassword(e.currentTarget.value);
              if (errors.password) setErrors(prev => ({ ...prev, password: undefined }));
            }}
            error={errors.password}
            visible={showPassword}
            onVisibilityChange={setShowPassword}
            autoComplete="off"
          />
        </Stack>

        {/* Acciones */}
        <Group mt="xl" gap="sm" justify="flex-end">
          <Button
            variant="subtle"
            color="gray"
            onClick={openSaveModal}
            disabled={isConnecting}
            title="Guardar host (Ctrl+S)"
          >
            Guardar host
          </Button>
          <Button
            type="submit"
            color="teal"
            onClick={connect}
            loading={isConnecting}
            disabled={!isValid}
            title={isValid ? 'Conectar (Enter)' : 'Completa todos los campos correctamente'}
          >
            Conectar
          </Button>
        </Group>
      </form>
    </Paper>
  );
};

export default ConnectForm;
