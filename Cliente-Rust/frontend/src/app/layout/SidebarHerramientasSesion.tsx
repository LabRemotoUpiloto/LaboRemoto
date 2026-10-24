// app/layout/SidebarHerramientasSesion.tsx — «Esta sesión» en una sesión de uso normal: cada botón muestra u oculta su panel
// en el mosaico de la sesión que se está viendo (ver features/sesion/herramientasSesion.ts). La terminal también: ocultarla
// no cierra la sesión. En el rail, un solo botón con el menú de todas.
import React from 'react';
import { ActionIcon, Menu, Text, UnstyledButton } from '@mantine/core';
import { Camera, Code2, Cpu, FolderOpen, LayoutGrid, MessageSquare, Monitor, SquareTerminal } from 'lucide-react';
import { canAccessPage, useEffectiveRole } from '@/features/cuenta/usePermissions';
import { alternar, TITULOS, useAbiertas, type IdHerramienta } from '@/features/sesion/herramientasSesion';

type Boton = { id: IdHerramienta; Icono: React.ComponentType<{ size?: number }>; permiso?: string; local?: boolean };
const BOTONES: Boton[] = [
  { id: 'terminal', Icono: SquareTerminal, local: true },
  { id: 'chat', Icono: MessageSquare, local: true },
  { id: 'camara', Icono: Camera },
  { id: 'escritorio', Icono: Monitor },
  { id: 'pines', Icono: Cpu },
  { id: 'archivos', Icono: FolderOpen, permiso: 'sftp' },
  { id: 'comandos', Icono: Code2, permiso: 'snippets', local: true },
];

const estilo = (abierta: boolean): React.CSSProperties => ({
  backgroundColor: abierta ? 'var(--interactive-selected)' : 'transparent',
  color: abierta ? 'var(--accent-primary)' : 'var(--text-secondary)',
  border: abierta ? '1px solid var(--accent-primary)' : '1px solid transparent',
});

export default function SidebarHerramientasSesion({ sesion, local = false, collapsed = false }: { sesion: string; local?: boolean; collapsed?: boolean }) {
  const role = useEffectiveRole();
  const abiertas = useAbiertas(sesion);
  // En la terminal local: Terminal, Chat y Comandos
  const lista = BOTONES.filter((b) => (!b.permiso || canAccessPage(b.permiso, role)) && (!local || b.local));
  const usar = (id: IdHerramienta) => alternar(sesion, id);

  if (collapsed) {
    return (
      <div className="pb-2 mb-1 border-b flex flex-col" style={{ borderColor: 'var(--border-subtle)' }}>
        <Menu shadow="md" width={210} position="right-start" withinPortal offset={8} closeOnItemClick={false}>
          <Menu.Target>
            <UnstyledButton data-no-window-drag aria-label="Esta sesión" className="flex items-center justify-center transition-colors"
              style={{ height: 34, width: 'calc(100% - 12px)', margin: '1px 6px', borderRadius: 6, color: 'var(--text-secondary)' }}>
              <LayoutGrid size={15} />
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Esta sesión</Menu.Label>
            {lista.map(({ id, Icono }) => {
              const abierta = abiertas.includes(id);
              return (
                <Menu.Item key={id} data-page={id === 'archivos' ? 'sftp' : id === 'comandos' ? 'snippets' : undefined}
                  leftSection={<Icono size={15} />} onClick={() => usar(id)} c={abierta ? 'var(--accent-primary)' : undefined}
                  rightSection={<span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{abierta ? 'visible' : 'oculto'}</span>}>
                  {TITULOS[id]}
                </Menu.Item>
              );
            })}
          </Menu.Dropdown>
        </Menu>
      </div>
    );
  }

  return (
    <div className="px-2 pb-2 mb-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
      <Text size="xs" fw={500} px={11} mb={4} style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Esta sesión</Text>
      {/* Siete botones en el ancho del sidebar: repartidos, a 25 px para que entren */}
      <div className={`flex px-1 ${local ? 'gap-1.5' : 'justify-between'}`}>
        {lista.map(({ id, Icono }) => {
          const abierta = abiertas.includes(id);
          return (
            <ActionIcon key={id} data-no-window-drag size={25} aria-label={TITULOS[id]} aria-pressed={abierta}
              // data-page: el recorrido guiado del chat los busca como cuando eran entradas del menú
              data-page={id === 'archivos' ? 'sftp' : id === 'comandos' ? 'snippets' : undefined}
              title={`${TITULOS[id]}: ${abierta ? 'ocultar' : 'mostrar'}`} onClick={() => usar(id)} style={estilo(abierta)}
              className="hover:bg-[var(--interactive-hover)] hover:text-[var(--text-primary)] transition-colors duration-150">
              <Icono size={14} />
            </ActionIcon>
          );
        })}
      </div>
    </div>
  );
}

