import React, { useEffect, useState } from 'react';
import { adminService, KeycloakUser, KeycloakRole } from '../../services/admin.service';
import { Container, Title, Text, TextInput, Badge, Stack, Paper, Group, ActionIcon, Loader, Center, Button, SimpleGrid, Box, ThemeIcon } from '@mantine/core';
import { Search, ShieldAlert, X, UserRound, ShieldCheck } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import Swal from 'sweetalert2';
export default function UserManagementPage() {
    const [query, setQuery] = useState('');
    const [users, setUsers] = useState<KeycloakUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [userRoles, setUserRoles] = useState<Record<string, KeycloakRole[]>>({});
    const searchUsers = async (searchQuery: string) => {
        if (searchQuery.length < 2) {
            return;
        }

        setLoading(true);
        setHasSearched(true);
        try {
            const results = await adminService.searchUsers(searchQuery);
            setUsers(results);

            const rolesEntries = await Promise.all(
                results.map(async (user) => [user.id, await adminService.getUserRoles(user.id)] as const)
            );
            const rolesMap = Object.fromEntries(rolesEntries);
            setUserRoles(rolesMap);

        } catch (err: any) {
            notifications.show({ title: 'Error', message: err.toString(), color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const searchQuery = query.trim();
        if (searchQuery.length < 2) {
            setUsers([]);
            setUserRoles({});
            setHasSearched(false);
            setLoading(false);
            return;
        }

        const timeoutId = window.setTimeout(() => {
            searchUsers(searchQuery);
        }, 350);

        return () => window.clearTimeout(timeoutId);
    }, [query]);

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const searchQuery = query.trim();
        if (searchQuery.length < 2) {
            notifications.show({ title: 'Búsqueda muy corta', message: 'Ingresa al menos 2 caracteres.', color: 'yellow' });
            return;
        }

        await searchUsers(searchQuery);
    };

    const clearSearch = () => {
        setQuery('');
        setUsers([]);
        setUserRoles({});
        setHasSearched(false);
    };

    const escapeHtml = (value: string) => value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const toggleRole = async (userId: string, roleName: string) => {
        const hasRole = userRoles[userId]?.some(r => r.name === roleName);
        const assign = !hasRole;
        const user = users.find(u => u.id === userId);
        const userLabel = user?.username || user?.email || 'este usuario';
        const roleLabel = roleLabels[roleName] || roleName;
        const result = await Swal.fire({
            html: `
                <style>
                    .role-confirm-popup {
                        padding: 0 !important;
                        border-radius: 18px !important;
                        background: var(--background-secondary) !important;
                        color: var(--text-primary) !important;
                        border: 1px solid var(--border-subtle) !important;
                        box-shadow: var(--shadow) !important;
                        overflow: hidden !important;
                        width: min(92vw, 520px) !important;
                    }
                    .role-confirm-html { margin: 0 !important; padding: 0 !important; }
                    .role-confirm-shell {
                        text-align: left;
                        background: var(--background-secondary);
                    }
                    .role-confirm-head {
                        padding: 24px 26px 20px;
                        border-bottom: 1px solid var(--border-subtle);
                    }
                    .role-confirm-eyebrow {
                        color: var(--accent-primary);
                        font-size: 11px;
                        font-weight: 800;
                        letter-spacing: .12em;
                        text-transform: uppercase;
                        margin-bottom: 10px;
                    }
                    .role-confirm-title {
                        color: var(--text-primary);
                        font-size: 25px;
                        font-weight: 850;
                        line-height: 1.1;
                        letter-spacing: -.03em;
                    }
                    .role-confirm-body {
                        padding: 22px 26px 20px;
                    }
                    .role-confirm-copy,
                    .role-confirm-label {
                        color: var(--text-secondary);
                        font-size: 14px;
                        line-height: 1.6;
                    }
                    .role-confirm-change {
                        margin-top: 16px;
                        padding: 0;
                        border-radius: 14px;
                        background: var(--background-tertiary);
                        border: 1px solid var(--border-subtle);
                        overflow: hidden;
                    }
                    .role-confirm-row {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 14px;
                        padding: 14px 16px;
                    }
                    .role-confirm-row + .role-confirm-row {
                        border-top: 1px solid var(--border-subtle);
                    }
                    .role-confirm-label { font-size: 12px; }
                    .role-confirm-value {
                        color: var(--text-primary);
                        font-size: 15px;
                        font-weight: 800;
                        word-break: break-word;
                        text-align: right;
                    }
                    .role-confirm-role {
                        color: var(--accent-primary);
                        font-size: 15px;
                        font-weight: 850;
                        text-align: right;
                        text-transform: uppercase;
                        letter-spacing: .04em;
                    }
                    .role-confirm-action {
                        color: var(--accent-primary);
                        font-weight: 800;
                        text-transform: uppercase;
                    }
                    .role-confirm-warning {
                        margin-top: 14px;
                        color: var(--text-tertiary, var(--text-secondary));
                        font-size: 12px;
                        line-height: 1.55;
                    }
                    .role-confirm-actions {
                        gap: 10px !important;
                        margin: 0 !important;
                        padding: 0 26px 24px !important;
                        justify-content: flex-end !important;
                    }
                    .role-confirm-confirm,
                    .role-confirm-cancel {
                        border-radius: 999px;
                        min-width: 118px;
                        padding: 11px 16px;
                        font-size: 14px;
                        font-weight: 800;
                        cursor: pointer;
                        transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
                    }
                    .role-confirm-confirm {
                        border: 0;
                        background: var(--accent-primary);
                        color: var(--text-inverse);
                        box-shadow: 0 10px 22px color-mix(in srgb, var(--accent-primary) 24%, transparent);
                    }
                    .role-confirm-cancel {
                        background: var(--background-tertiary);
                        color: var(--text-secondary);
                        border: 1px solid var(--border-subtle);
                    }
                    .role-confirm-confirm:hover,
                    .role-confirm-cancel:hover { transform: translateY(-1px); }
                    @media (max-width: 520px) {
                        .role-confirm-head { padding: 22px 20px 16px; }
                        .role-confirm-body { padding: 18px 20px 20px; }
                        .role-confirm-row { align-items: flex-start; flex-direction: column; gap: 6px; }
                        .role-confirm-value, .role-confirm-role { text-align: left; }
                        .role-confirm-actions { padding: 0 20px 22px !important; flex-direction: column-reverse; }
                        .role-confirm-confirm, .role-confirm-cancel { width: 100%; }
                    }
                </style>
                <div class="role-confirm-shell">
                    <div class="role-confirm-head">
                        <div class="role-confirm-eyebrow">Confirmación requerida</div>
                        <div class="role-confirm-title">${assign ? 'Asignar privilegio' : 'Remover privilegio'}</div>
                    </div>
                    <div class="role-confirm-body">
                        <div class="role-confirm-copy">Se actualizarán los permisos del usuario seleccionado.</div>
                        <div class="role-confirm-change">
                            <div class="role-confirm-row">
                                <div class="role-confirm-label">Acción</div>
                                <div class="role-confirm-action">${assign ? 'Asignar' : 'Remover'}</div>
                            </div>
                            <div class="role-confirm-row">
                                <div class="role-confirm-label">Rol</div>
                                <div class="role-confirm-role">${escapeHtml(roleLabel)}</div>
                            </div>
                            <div class="role-confirm-row">
                                <div class="role-confirm-label">Usuario</div>
                                <div class="role-confirm-value">${escapeHtml(userLabel)}</div>
                            </div>
                        </div>
                        <div class="role-confirm-warning">Este cambio modifica permisos reales del usuario en el sistema.</div>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: assign ? 'Sí, asignar' : 'Sí, remover',
            cancelButtonText: 'Cancelar',
            buttonsStyling: false,
            reverseButtons: true,
            customClass: {
                container: 'swal-fullscreen',
                popup: 'role-confirm-popup',
                htmlContainer: 'role-confirm-html',
                actions: 'role-confirm-actions',
                confirmButton: 'role-confirm-confirm',
                cancelButton: 'role-confirm-cancel',
            },
        });
        if (!result.isConfirmed) return;

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
    const roleLabels: Record<string, string> = {
        admin_lab: 'Admin Lab',
        semillerista: 'Semillerista',
        laboratorista: 'Laboratorista',
    };

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
                                description="Escribe al menos 2 caracteres para buscar automáticamente."
                                placeholder="Nombre, usuario o correo institucional..."
                                value={query}
                                onChange={(e) => setQuery(e.currentTarget.value)}
                                leftSection={<Search size={16} />}
                                rightSection={
                                    query && (
                                        <ActionIcon variant="subtle" color="gray" onClick={clearSearch}>
                                            <X size={14} />
                                        </ActionIcon>
                                    )
                                }
                            />
                            <Button
                                type="submit"
                                leftSection={<Search size={16} />}
                                loading={loading}
                                disabled={query.trim().length < 2}
                                style={{
                                    backgroundColor: 'var(--accent-primary)',
                                    color: 'var(--text-inverse)',
                                    border: '1px solid color-mix(in srgb, var(--accent-primary) 70%, transparent)',
                                }}
                            >
                                Buscar
                            </Button>
                        </Group>
                    </form>
                </Paper>

                {loading ? (
                    <Center py="xl">
                        <Loader />
                    </Center>
                ) : users.length > 0 ? (
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                        {users.map(user => {
                            const currentRoles = userRoles[user.id] || [];
                            const fullName = user.firstName || user.lastName
                                ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                                : 'Nombre no registrado';
                            const initials = (user.username || user.email || 'U').slice(0, 2).toUpperCase();

                            return (
                                <Paper
                                    key={user.id}
                                    withBorder
                                    radius="xl"
                                    p="lg"
                                    style={{
                                        position: 'relative',
                                        overflow: 'hidden',
                                        backgroundColor: 'var(--background-secondary)',
                                        borderColor: 'var(--border-subtle)',
                                        boxShadow: 'var(--shadow)',
                                    }}
                                >
                                    <Box
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            right: 0,
                                            width: 96,
                                            height: 96,
                                            background: 'linear-gradient(135deg, var(--accent-primary-subtle), transparent)',
                                            borderBottomLeftRadius: 96,
                                        }}
                                    />

                                    <Group align="flex-start" justify="space-between" wrap="nowrap">
                                        <Group align="flex-start" wrap="nowrap">
                                            <ThemeIcon
                                                size={54}
                                                radius="lg"
                                                style={{
                                                    fontWeight: 800,
                                                    fontSize: 15,
                                                    backgroundColor: 'var(--accent-primary-subtle)',
                                                    color: 'var(--accent-primary)',
                                                    border: '1px solid color-mix(in srgb, var(--accent-primary) 22%, transparent)',
                                                }}
                                            >
                                                {initials || <UserRound size={22} />}
                                            </ThemeIcon>
                                            <Stack gap={3}>
                                                <Group gap="xs">
                                                    <Text fw={800} size="md">{user.username}</Text>
                                                    {currentRoles.some(r => r.name === 'admin_lab') && (
                                                        <Badge
                                                            leftSection={<ShieldCheck size={12} />}
                                                            style={{
                                                                backgroundColor: 'var(--accent-primary-subtle)',
                                                                color: 'var(--accent-primary)',
                                                                border: '1px solid color-mix(in srgb, var(--accent-primary) 22%, transparent)',
                                                            }}
                                                        >
                                                            Admin
                                                        </Badge>
                                                    )}
                                                </Group>
                                                <Text size="sm" c="dimmed">{fullName}</Text>
                                                <Text size="xs" c="dimmed">{user.email || 'Sin correo registrado'}</Text>
                                            </Stack>
                                        </Group>
                                    </Group>

                                    <Box mt="lg" pt="md" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                                        <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb="xs" style={{ letterSpacing: '.08em' }}>
                                            Privilegios
                                        </Text>
                                        <Group gap="xs">
                                            {targetRoles.map(roleName => {
                                                const isActive = currentRoles.some(r => r.name === roleName);
                                                return (
                                                    <Badge
                                                        key={roleName}
                                                        radius="md"
                                                        size="lg"
                                                        style={{
                                                            cursor: 'pointer',
                                                            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                                            backgroundColor: isActive ? 'var(--accent-primary)' : 'transparent',
                                                            color: isActive ? 'var(--text-inverse)' : 'var(--text-secondary)',
                                                            border: isActive
                                                                ? '1px solid var(--accent-primary)'
                                                                : '1px solid var(--border-strong, var(--border-subtle))',
                                                        }}
                                                        onClick={() => toggleRole(user.id, roleName)}
                                                    >
                                                        {roleLabels[roleName]}
                                                    </Badge>
                                                );
                                            })}
                                        </Group>
                                    </Box>
                                </Paper>
                            );
                        })}
                    </SimpleGrid>
                ) : (
                    hasSearched ? (
                        <Paper withBorder p="xl" radius="md">
                            <Center>
                                <Stack align="center" gap="xs">
                                    <ShieldAlert size={40} style={{ opacity: 0.5 }} />
                                    <Text c="dimmed">No se encontraron usuarios para la búsqueda.</Text>
                                </Stack>
                            </Center>
                        </Paper>
                    ) : (
                        <Paper withBorder p="xl" radius="md">
                            <Center>
                                <Stack align="center" gap="xs">
                                    <Search size={40} style={{ opacity: 0.45 }} />
                                    <Text fw={600}>Escribe para buscar usuarios</Text>
                                    <Text size="sm" c="dimmed">Los resultados aparecerán automáticamente al ingresar 2 o más caracteres.</Text>
                                </Stack>
                            </Center>
                        </Paper>
                    )
                )}
            </Stack>
        </Container>
    );
}
