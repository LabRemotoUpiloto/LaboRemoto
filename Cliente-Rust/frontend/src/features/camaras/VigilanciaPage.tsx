// pages/vigilancia/VigilanciaPage.tsx — grilla de cámaras NVR con PTZ para los
// roles de personal. Restringida en Sidebar.tsx y HomeContainer.tsx vía
// PAGE_ACCESS['vigilancia'] en usePermissions.ts.
import React, { useState } from 'react';
import { Box, Title, Group, Button } from '@mantine/core';
import { Settings2 } from 'lucide-react';
import CameraGrid, { PILOT_GROUP_KEY } from './CameraGrid';
import CamarasAdminModal from './CamarasAdminModal';
import { useEffectiveRole, puedeAdministrarCamaras } from '@/hooks/usePermissions';

const VigilanciaPage: React.FC = () => {
  const role = useEffectiveRole();
  const [adminAbierto, setAdminAbierto] = useState(false);
  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <Box px="xl" py="md" style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <Group justify="space-between" wrap="nowrap">
          <Title order={1} style={{ fontSize: 26, letterSpacing: '-.02em' }}>Vigilancia</Title>
          {puedeAdministrarCamaras(role) && (
            <Button variant="default" leftSection={<Settings2 size={16} aria-hidden />} onClick={() => setAdminAbierto(true)}>
              Administrar cámaras
            </Button>
          )}
        </Group>
      </Box>
      <Box style={{ flex: 1, minHeight: 0 }}>
        {/* groupKey explícito (sin sessionId): la grilla arranca sola al
            montar la página, igual que cualquier otra vista de monitoreo.
            showPtz solo aquí -- el panel de cámaras de una sesión normal
            nunca debe mostrar controles PTZ. */}
        <CameraGrid sessionId={null} groupKey={PILOT_GROUP_KEY} autoStart showPtz />
      </Box>
      {/* La grilla sondea al broker cada pocos segundos: una cámara nueva o editada aparece sola. */}
      {puedeAdministrarCamaras(role) && <CamarasAdminModal opened={adminAbierto} onClose={() => setAdminAbierto(false)} />}
    </Box>
  );
};

export default VigilanciaPage;
