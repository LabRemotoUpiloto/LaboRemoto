// El chat de la terminal local le dice al modelo qué shell es.
import { describe, expect, it } from 'vitest';
import { reglasTerminalLocal } from '@/features/chat/terminalLocal';

describe('chat de la terminal local', () => {
  it('en Windows con pwsh pide comandos de PowerShell 7', () => {
    const r = reglasTerminalLocal('C:\Program Files\PowerShell\7\pwsh.exe', 'windows');
    expect(r).toContain('PowerShell 7 (pwsh)');
    expect(r).toContain('Windows');
    expect(r).not.toContain('bash.');
  });

  it('reconoce Windows PowerShell y otras shells', () => {
    expect(reglasTerminalLocal('powershell.exe', 'windows')).toContain('Windows PowerShell');
    expect(reglasTerminalLocal('/bin/zsh', 'macos')).toContain('La terminal es zsh');
  });
});
