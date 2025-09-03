// In a real app, you would define this in a way that it's shared between frontend and backend
// For now, we'll define it in the frontend.
export interface SshCredentials {
    host: string;
    port: number;
    username: string;
    password?: string;
    // Add other auth methods as needed, e.g., privateKey
  }
  