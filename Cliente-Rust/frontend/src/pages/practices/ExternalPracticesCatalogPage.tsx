// ExternalPracticesCatalogPage — Catálogo de prácticas del proveedor externo
// de autoría (cmd::integration::lab_practices). Solo lectura: no arranca
// sesiones ni conecta a ningún equipo — ver ExternalPracticeCard para la
// razón (contenido no confiable, sin binding local todavía).
//
// Nota: este componente no está enganchado a la navegación de la app
// todavía; es la vista mínima para poder ver/probar el catálogo. Cablearlo
// a un menú/ruta real es una decisión de producto pendiente.
import React from 'react';
import { Alert, Box, Button, Container, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { AlertTriangle } from 'lucide-react';
import { useLabPractices } from '../../hooks/useLabPractices';
import ExternalPracticeCard from '../../components/practicas/ExternalPracticeCard';

const ExternalPracticesCatalogPage: React.FC = () => {
    const { practices, status, error, refetch } = useLabPractices();

    if (status === 'loading') {
        return (
            <Box w="100%" h="100%" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Stack align="center" gap="md">
                    <Loader size="md" />
                    <Text c="dimmed" size="sm">Cargando catálogo de prácticas...</Text>
                </Stack>
            </Box>
        );
    }

    return (
        <Box w="100%" h="100%" style={{ overflow: 'auto' }}>
            <Container size="lg" py="xl" px="xl">
                <Stack gap="xl">
                    <Stack gap="sm">
                        <Title order={1}>Catálogo de prácticas (externo)</Title>
                        <Text size="md" c="dimmed" maw={640}>
                            Prácticas publicadas por aplicaciones de autoría externas. Este contenido es
                            importado y de solo lectura — para ejecutarlas hace falta vincularlas a un
                            entorno de laboratorio local (próxima fase).
                        </Text>
                    </Stack>

                    {status === 'error' && (
                        <Alert color="red" variant="light" icon={<AlertTriangle size={16} />} title="No se pudo cargar el catálogo">
                            <Stack gap="sm">
                                <Text size="sm">{error}</Text>
                                <Button size="xs" variant="light" color="red" onClick={() => void refetch()} style={{ alignSelf: 'flex-start' }}>
                                    Reintentar
                                </Button>
                            </Stack>
                        </Alert>
                    )}

                    {status === 'ready' && practices.length === 0 && (
                        <Text c="dimmed" size="sm">No hay prácticas publicadas todavía.</Text>
                    )}

                    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                        {practices.map(practice => (
                            <ExternalPracticeCard key={practice.id} practice={practice} />
                        ))}
                    </SimpleGrid>
                </Stack>
            </Container>
        </Box>
    );
};

export default ExternalPracticesCatalogPage;
