export interface SshCredentials {
    host: string;
    port: number;
    username: string;
    password?: string;
  }

export interface SftpEntry {
  name: string;
  path: string;
  kind: string;
  size?: number;
  perms?: string;
  mtime?: number;
}

export interface LocalEntry {
  name: string;
  path: string;
  kind: string;
  size?: number;
  mtime?: number;
}
