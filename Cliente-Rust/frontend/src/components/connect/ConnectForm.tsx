import React from 'react';
import {
  TextInput, PasswordInput, Button, Group, Stack, Divider,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { Terminal, Globe, Hash, User, Lock, Save, ArrowRight } from 'lucide-react';
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
  /** Oculta "Guardar host" -- ej. en la conexión de invitado (sin sesión),
   *  donde no tiene sentido ofrecer guardar hosts locales. */
  hideSaveHost?: boolean;
}

const ConnectForm: React.FC<ConnectFormProps> = (props) => {
  const { hideSaveHost } = props;
  const {
    host, port, user, password, showPassword,
    errors, isConnecting, isPulsing, isRaspberryPi,
    saveModalOpen, setSaveModalOpen,
    successAlertOpen, successAlertMessage,
    setSuccessAlertOpen, setSuccessAlertMessage,
    isEditMode, isValid, hostName,
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

  // Mantine modal: pide el nombre solo para hosts NUEVOS. Editando uno ya
  // guardado el nombre ya se conoce (hostName) -- pedirlo de nuevo acá se
  // sentía como si la app no supiera que ya estaba editando algo existente.
  const openSaveModal = () => {
    let nameValue = '';
    modals.open({
      title: 'Guardar host',
      centered: true,
      children: (
        <form onSubmit={(e) => { e.preventDefault(); handleSaveHost(nameValue); modals.closeAll(); }}>
          <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 12 }}>
            Guardar {user}@{host}:{port || '22'}
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
            <Button type="submit">
              Guardar
            </Button>
          </Group>
        </form>
      ),
    });
  };

  // En edición, guarda directo con el nombre que ya tenía -- sin modal
  // intermedio pidiendo confirmarlo de nuevo.
  const handlePrimarySaveClick = () => {
    if (isEditMode) handleSaveHost(hostName);
    else openSaveModal();
  };

  return (
    <div
      className="w-full transition-all duration-300 rounded-xl"
      style={{ boxShadow: isPulsing ? '0 0 0 2px color-mix(in srgb, var(--accent-primary) 40%, transparent)' : 'none' }}
    >
      <form onSubmit={(e) => { e.preventDefault(); if (isValid) connect(); }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)', color: 'var(--accent-primary)' }}>
            <Terminal size={18} />
          </div>
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold m-0 leading-tight text-[var(--text-primary)]">
              Conexión SSH
            </h2>
            <span className="text-[11px] text-[var(--text-secondary)] leading-tight mt-0.5">
              Introduce las credenciales del servidor
            </span>
          </div>
        </div>

        <Divider className="mb-5 opacity-50" />

        <Stack gap="md" className="dribbble-input-container">
          {/* Host + Port row — ocultos para Raspberry Pi */}
          {!isRaspberryPi() && (
            <div className="flex gap-3">
              <div className="flex-1">
                <TextInput
                  id="field-host"
                  label="Host"
                  placeholder="192.168.1.100"
                  value={host}
                  onChange={(e) => handleHostChange(e.currentTarget.value)}
                  error={errors.host}
                  title="Dirección IP o nombre de dominio del servidor SSH"
                  leftSection={<Globe size={15} style={{ color: 'var(--text-secondary)' }} />}
                />
              </div>
              <div className="w-24">
                <TextInput
                  id="field-port"
                  label="Puerto"
                  placeholder="22"
                  inputMode="numeric"
                  value={port}
                  onChange={(e) => handlePortChange(e.currentTarget.value)}
                  error={errors.port}
                  title="Puerto SSH (1-65535)"
                  leftSection={<Hash size={15} style={{ color: 'var(--text-secondary)' }} />}
                />
              </div>
            </div>
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
            leftSection={<User size={15} style={{ color: 'var(--text-secondary)' }} />}
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
            leftSection={<Lock size={15} style={{ color: 'var(--text-secondary)' }} />}
          />
        </Stack>

        {/* Acciones */}
        <Group mt="xl" gap="sm" justify={hideSaveHost ? 'flex-end' : 'space-between'}>
          {!hideSaveHost && (
            <Button
              onClick={handlePrimarySaveClick}
              disabled={isConnecting}
              className="dribbble-btn-secondary text-xs h-9 px-4"
              title={isEditMode ? 'Finalizar edición (Ctrl+S)' : 'Guardar host (Ctrl+S)'}
              leftSection={<Save size={14} />}
            >
              {isEditMode ? 'Finalizar edición' : 'Guardar host'}
            </Button>
          )}
          <Button
            type="submit"
            loading={isConnecting}
            disabled={!isValid}
            className="dribbble-btn-primary text-xs h-9 px-4"
            title={isValid ? 'Conectar (Enter)' : 'Completa todos los campos correctamente'}
            rightSection={!isConnecting && <ArrowRight size={16} />}
          >
            Conectar
          </Button>
        </Group>
      </form>
    </div>
  );
};

export default ConnectForm;
