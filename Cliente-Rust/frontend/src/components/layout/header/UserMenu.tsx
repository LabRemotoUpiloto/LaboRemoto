import React from 'react';
import { Menu, Tooltip, UnstyledButton, Text } from '@mantine/core';

const UserMenu: React.FC = () => {
  return (
    <Menu shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <Tooltip label="Pendiente de implementar" withArrow position="bottom-end">
          <UnstyledButton className="flex items-center gap-2 h-7 px-2.5 rounded-md hover:bg-secondary transition-colors">
            <span className="w-5 h-5 rounded-full bg-accent-primary/20 border border-accent-primary/30 flex items-center justify-center text-[9px] font-bold text-accent-primary shrink-0 select-none">
              AI
            </span>
            <Text size="xs" fw={500} className="hidden xl:block text-secondary">
              Invitado
            </Text>
          </UnstyledButton>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Usuario</Menu.Label>
        <Menu.Item disabled>Perfil (Próximamente)</Menu.Item>
        <Menu.Item disabled>Ajustes (Próximamente)</Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red" disabled>Cerrar Sesión</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};

export default UserMenu;
