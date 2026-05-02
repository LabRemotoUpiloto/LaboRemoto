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
        header: { backgroundColor: '#1e2130', borderBottom: '1px solid rgba(255,255,255,0.05)' },
        content: { backgroundColor: '#1e2130' },
        title: { color: 'white', fontWeight: 600, fontSize: 14 }
      }}
    >
      <Text size="sm" c="dimmed" mb="lg">
        Cambiar a <strong className="text-white">{MODES.find(m => m.value === showModeConfirm)?.label}</strong> borrará los mensajes actuales.
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={cancelModeSwitch} className="bg-white/5 border-white/10 hover:bg-white/10 text-white/80">
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
        header: { backgroundColor: '#1e2130', borderBottom: '1px solid rgba(255,255,255,0.05)' },
        content: { backgroundColor: '#1e2130' },
        title: { color: 'white', fontWeight: 600, fontSize: 14 }
      }}
    >
      <div className="flex flex-col gap-3 py-2">
        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
          <span className="text-white/70">Enviar mensaje</span>
          <Kbd>Enter</Kbd>
        </div>
        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
          <span className="text-white/70">Nueva línea</span>
          <Kbd>Shift+Enter</Kbd>
        </div>
        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
          <span className="text-white/70">Cancelar respuesta en curso</span>
          <Kbd>Esc</Kbd>
        </div>
        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
          <span className="text-white/70">Recuperar último mensaje enviado</span>
          <Kbd>↑</Kbd>
        </div>
        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
          <span className="text-white/70">Buscar en mensajes</span>
          <Kbd>Ctrl+F</Kbd>
        </div>
        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
          <span className="text-white/70">Nuevo chat</span>
          <Kbd>Ctrl+N</Kbd>
        </div>
        <div className="flex justify-between items-center text-sm pb-1">
          <span className="text-white/70">Mostrar / ocultar esta ayuda</span>
          <Kbd>Shift+?</Kbd>
        </div>
      </div>
    </Modal>
  </>
);

export default ChatModals;
