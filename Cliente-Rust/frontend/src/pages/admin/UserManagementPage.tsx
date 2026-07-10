import React, { useState } from 'react';
import { adminService, KeycloakUser, KeycloakRole } from '../../services/admin.service';
import { Container, Title, Text, TextInput, Table, Badge, Stack, Paper, Group, ActionIcon, Loader, Center } from '@mantine/core';
import { Search, ShieldAlert, X } from 'lucide-react';
import { notifications } from '@mantine/notifications';
export default function UserManagementPage() {
    const [query, setQuery] = useState('');
    const [users, setUsers] = useState<KeycloakUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [userRoles, setUserRoles] = useState<Record<string, KeycloakRole[]>>({});
    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!query.trim()) return;
        setLoading(true);
        try {
            const results = await adminService.searchUsers(query);
            setUsers(results);
            
            // Fetch roles for all returned users
            const rolesMap: Record<string, KeycloakRole[]> = {};
            for (const user of results) {
                const roles = await adminService.getUserRoles(user.id);
                rolesMap[user.id] = roles;
            }
            setUserRoles(rolesMap);
            
        } catch (err: any) {
            notifications.show({ title: 'Error', message: err.toString(), color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    const toggleRole = async (userId: string, roleName: string) => {
        const hasRole = userRoles[userId]?.some(r => r.name === roleName);
        const assign = !hasRole;
        
        try {
            await adminService.toggleUserRole(userId, roleName, assign);
            // Re-fetch roles
            const roles = await adminService.getUserRoles(userId);
            setUserRoles(prev => ({ ...prev, [userId]: roles }));
            notifications.show({ title: 'Éxito', message: `Rol ${roleName} ${assign ? 'asignado' : 'removido'} exitosamente.`, color: 'green' });
        } catch (err: any) {
            notifications.show({ title: 'Error', message: `Error modificando rol: ${err.toString()}`, color: 'red' });
        }
    };

    const targetRoles = ['admin_lab', 'semillerista', 'laboratorista'];

    return (
        <Container size="lg" py="xl" px="xl" h="100%" style={{ overflow: 'auto' }}>
            <Stack gap="xl">
                <Stack gap="sm">
                    <Title order={1}>Gestión de Usuarios</Title>
                    <Text size="md" c="dimmed" maw={600}>
                        Busca usuarios registrados en el sistema para asignar o remover privilegios administrativos y roles especiales.
                    </Text>
                </Stack>

                <Paper withBorder p="md" radius="md">
                    <form onSubmit={handleSearch}>
                        <Group align="flex-end">
                            <TextInput
                                flex={1}
                                label="Buscar usuario"
                                placeholder="Nombre, apellido o correo..."
                                value={query}
                                onChange={(e) => setQuery(e.currentTarget.value)}
                                leftSection={<Search size={16} />}
                                rightSection={
                                    query && (
                                        <ActionIcon variant="subtle" color="gray" onClick={() => setQuery('')}>
                                            <X size={14} />
                                        </ActionIcon>
                                    )
                                }
                            />
                        </Group>
                    </form>
                </Paper>

                {loading ? (
                    <Center py="xl">
                        <Loader />
                    </Center>
                ) : users.length > 0 ? (
                    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Usuario</Table.Th>
                                    <Table.Th>Nombre Completo</Table.Th>
                                    <Table.Th>Privilegios</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {users.map(user => {
                                    const currentRoles = userRoles[user.id] || [];
                                    return (
                                        <Table.Tr key={user.id}>
                                            <Table.Td>
                                                <Stack gap={2}>
                                                    <Text size="sm" fw={500}>{user.username}</Text>
                                                    <Text size="xs" c="dimmed">{user.email || 'Sin correo'}</Text>
                                                </Stack>
                                            </Table.Td>
                                            <Table.Td>
                                                {user.firstName || user.lastName 
                                                    ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                                                    : '-'
                                                }
                                            </Table.Td>
                                            <Table.Td>
                                                <Group gap="xs">
                                                    {targetRoles.map(roleName => {
                                                        const isActive = currentRoles.some(r => r.name === roleName);
                                                        return (
                                                            <Badge
                                                                key={roleName}
                                                                color={isActive ? 'blue' : 'gray'}
                                                                variant={isActive ? 'filled' : 'outline'}
                                                                style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                                                                onClick={() => toggleRole(user.id, roleName)}
                                                                size="sm"
                                                            >
                                                                {roleName}
                                                            </Badge>
                                                        );
                                                    })}
                                                </Group>
                                            </Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>
                    </Paper>
                ) : (
                    query && !loading && (
                        <Paper withBorder p="xl" radius="md">
                            <Center>
                                <Stack align="center" gap="xs">
                                    <ShieldAlert size={40} style={{ opacity: 0.5 }} />
                                    <Text c="dimmed">No se encontraron usuarios para la búsqueda.</Text>
                                </Stack>
                            </Center>
                        </Paper>
                    )
                )}
            </Stack>
        </Container>
    );
}
