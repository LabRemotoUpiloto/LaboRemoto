import { invoke } from '@tauri-apps/api/core';

export interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  /** Cuenta habilitada en Keycloak (viene en la representación estándar). */
  enabled?: boolean;
  /** Fecha de creación en Keycloak (epoch millis). */
  createdTimestamp?: number;
  /** Atributos custom -- Keycloak siempre los representa como array de strings.
   *  `avatar[0]` es la data URL que el usuario subió desde Perfil (ver PerfilPage). */
  attributes?: Record<string, string[]>;
}

export interface KeycloakRole {
  id: string;
  name: string;
}

export const adminService = {
  searchUsers: async (query: string): Promise<KeycloakUser[]> => {
    return await invoke<KeycloakUser[]>('admin_search_users', { query });
  },

  listUsersByRole: async (roleName: string): Promise<KeycloakUser[]> => {
    return await invoke<KeycloakUser[]>('admin_list_users_by_role', { roleName });
  },

  listAllUsers: async (): Promise<KeycloakUser[]> => {
    return await invoke<KeycloakUser[]>('admin_list_all_users');
  },

  getUserRoles: async (userId: string): Promise<KeycloakRole[]> => {
    return await invoke<KeycloakRole[]>('admin_get_user_roles', { userId });
  },

  toggleUserRole: async (userId: string, roleName: string, assign: boolean): Promise<void> => {
    await invoke<void>('admin_toggle_user_role', { userId, roleName, assign });
  }
};
