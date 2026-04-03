import { invoke } from '@tauri-apps/api/core'

export async function saveHostWithMaster(id: string, payload: any) {
  const json = JSON.stringify(payload)
  return invoke('save_host_master', { id, jsonPayload: json })
}

export async function deleteHostFile(id: string) {
  return invoke('delete_host_file', { id })
}

export async function listHostEntries() {
  return invoke<any[]>('list_hosts_entries')
}


