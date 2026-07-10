import { invoke } from '@tauri-apps/api/core';

export interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface KeycloakRole {
  id: string;
  name: string;
}

export const adminService = {
  searchUsers: async (query: string): Promise<KeycloakUser[]> => {
    return await invoke<KeycloakUser[]>('admin_search_users', { query });
  },

  getUserRoles: async (userId: string): Promise<KeycloakRole[]> => {
    return await invoke<KeycloakRole[]>('admin_get_user_roles', { userId });
  },

  toggleUserRole: async (userId: string, roleName: string, assign: boolean): Promise<void> => {
    await invoke<void>('admin_toggle_user_role', { userId, roleName, assign });
  }
};
