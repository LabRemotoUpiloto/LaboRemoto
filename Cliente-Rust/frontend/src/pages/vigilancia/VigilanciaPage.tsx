// pages/vigilancia/VigilanciaPage.tsx — grilla de cámaras NVR con PTZ para el
// tier 'operativo' (laboratorista + semillerista) y admin_lab. Restringida en
// Sidebar.tsx y HomeContainer.tsx vía PAGE_ACCESS['vigilancia'] en
// usePermissions.ts, igual que cualquier otra página del tier.
import React from 'react';
import { Box, Title } from '@mantine/core';
import CameraGrid, { PILOT_GROUP_KEY } from '../../components/raspberry/CameraGrid';

const VigilanciaPage: React.FC = () => {
  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <Box px="xl" py="md" style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <Title order={1} style={{ fontSize: 26, letterSpacing: '-.02em' }}>Vigilancia</Title>
      </Box>
      <Box style={{ flex: 1, minHeight: 0 }}>
        {/* groupKey explícito (sin sessionId): la grilla arranca sola al
            montar la página, igual que cualquier otra vista de monitoreo.
            showPtz solo aquí -- el panel de cámaras de una sesión normal
            nunca debe mostrar controles PTZ. */}
        <CameraGrid sessionId={null} groupKey={PILOT_GROUP_KEY} autoStart showPtz />
      </Box>
    </Box>
  );
};

export default VigilanciaPage;
