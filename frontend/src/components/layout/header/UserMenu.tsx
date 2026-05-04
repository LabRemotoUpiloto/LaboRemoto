import React from 'react';
import { Menu, Tooltip, UnstyledButton, Group, Avatar, Text } from '@mantine/core';

const UserMenu: React.FC = () => {
  return (
    <Menu shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <Tooltip label="Pendiente de implementar" withArrow position="bottom-end">
          <UnstyledButton className="hover:bg-secondary/50 p-1 rounded-md transition-colors">
            <Group gap={6} wrap="nowrap">
              <Avatar
                size={24}
                radius="xl"
                color="blue"
              >
                AI
              </Avatar>
              <div className="hidden xl:block">
                <Text size="xs" fw={500} c="dimmed">
                  Invitado
                </Text>
              </div>
            </Group>
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
