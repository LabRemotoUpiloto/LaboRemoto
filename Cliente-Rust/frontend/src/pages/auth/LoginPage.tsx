import React from 'react';
import { Button, Container, Title, Text, Stack, Paper } from '@mantine/core';
import { useAuth } from '../../contexts/AuthContext';
import { MonitorIcon } from '../../components/icons/SidebarIcons';

const LoginPage: React.FC = () => {
  const { login, isLoading } = useAuth();

  return (
    <Container size="xs" style={{ height: '100vh', display: 'flex', alignItems: 'center' }}>
      <Paper radius="md" p="xl" withBorder w="100%" shadow="md">
        <Stack align="center" gap="md">
          <MonitorIcon size={48} />
          <Title order={2}>LaboRemoto</Title>
          <Text c="dimmed" size="sm" ta="center" mb="md">
            Plataforma de Laboratorios Remotos. Por favor, inicia sesión para continuar.
          </Text>
          <Button 
            fullWidth 
            onClick={login} 
            loading={isLoading}
            size="md"
          >
            Iniciar Sesión Institucional
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
};

export default LoginPage;
