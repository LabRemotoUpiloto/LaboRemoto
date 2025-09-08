import { invoke } from '@tauri-apps/api/core'

export async function saveHostEncrypted(passphrase: string, id: string, payload: any) {
  const json = JSON.stringify(payload)
  return invoke('save_host_encrypted', { passphrase, id, jsonPayload: json })
}

export async function loadHostEncrypted(passphrase: string, id: string) {
  const result = await invoke<string>('load_host_encrypted', { passphrase, id })
  return JSON.parse(result)
}

export async function saveHostWithMaster(id: string, payload: any) {
  const json = JSON.stringify(payload)
  return invoke('save_host_master', { id, jsonPayload: json })
}

export async function loadHostWithMaster(id: string) {
  const result = await invoke<string>('load_host_master', { id })
  return JSON.parse(result)
}

export async function listHostFiles() {
  return invoke<string[]>('list_hosts_files')
}

export async function deleteHostFile(id: string) {
  return invoke('delete_host_file', { id })
}

export async function listHostEntries() {
  return invoke<any[]>('list_hosts_entries')
}

export async function connectFromHost(host: string, port: number, user: string, password: string, cols = 80, rows = 24) {
  return invoke<string>('ssh_connect', { host, port, user, password, cols, rows })
}

export async function connectFromStored(id: string, cols = 80, rows = 24) {
  return invoke<string>('ssh_connect_stored', { id, cols, rows })
}
