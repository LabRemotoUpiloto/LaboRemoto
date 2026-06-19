import React from 'react';
import { ChatMode } from '../chatModes/types';
import { MODES } from './chatPane.constants';
import { Modal, Button, Text, Kbd, Group } from '@mantine/core';

interface Props {
  showModeConfirm: ChatMode | null;
  confirmModeSwitch: () => void;
  cancelModeSwitch: () => void;
  showShortcuts: boolean;
  setShowShortcuts: (v: boolean) => void;
}

const ChatModals: React.FC<Props> = ({
  showModeConfirm, confirmModeSwitch, cancelModeSwitch,
  showShortcuts, setShowShortcuts,
}) => (
  <>
    <Modal
      opened={!!showModeConfirm}
      onClose={cancelModeSwitch}
      title="Cambiar modo"
      centered
      size="sm"
      styles={{
        header: { backgroundColor: 'var(--background-secondary)', borderBottom: '1px solid var(--border-subtle)' },
        content: { backgroundColor: 'var(--background-secondary)' },
        title: { color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }
      }}
    >
      <Text size="sm" c="dimmed" mb="lg">
        Cambiar a <strong style={{ color: 'var(--text-primary)' }}>{MODES.find(m => m.value === showModeConfirm)?.label}</strong> borrará los mensajes actuales.
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={cancelModeSwitch}>
          Cancelar
        </Button>
        <Button onClick={confirmModeSwitch} color="blue">
          Cambiar
        </Button>
      </Group>
    </Modal>

    <Modal
      opened={showShortcuts}
      onClose={() => setShowShortcuts(false)}
      title="Atajos de teclado"
      centered
      size="md"
      styles={{
        header: { backgroundColor: 'var(--background-secondary)', borderBottom: '1px solid var(--border-subtle)' },
        content: { backgroundColor: 'var(--background-secondary)' },
        title: { color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }
      }}
    >
      <div className="flex flex-col gap-3 py-2">
        {[
          ['Enviar mensaje', 'Enter'],
          ['Nueva línea', 'Shift+Enter'],
          ['Cancelar respuesta en curso', 'Esc'],
          ['Recuperar último mensaje enviado', '↑'],
          ['Buscar en mensajes', 'Ctrl+F'],
          ['Nuevo chat', 'Ctrl+N'],
        ].map(([label, key]) => (
          <div key={key} className="flex justify-between items-center text-sm pb-2" style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
            <span>{label}</span>
            <Kbd>{key}</Kbd>
          </div>
        ))}
        <div className="flex justify-between items-center text-sm pb-1" style={{ color: 'var(--text-secondary)' }}>
          <span>Mostrar / ocultar esta ayuda</span>
          <Kbd>Shift+?</Kbd>
        </div>
      </div>
    </Modal>
  </>
);

export default ChatModals;
