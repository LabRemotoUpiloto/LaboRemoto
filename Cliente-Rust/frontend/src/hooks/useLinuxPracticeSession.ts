/**
 * useLinuxPracticeSession.ts
 *
 * Orquesta la práctica de Linux: resuelve host/usuario desde el backend
 * (que a su vez lo resuelve de la sesión Keycloak activa), pide la
 * contraseña de Active Directory UNA vez por un diálogo nativo (nunca el
 * navegador, nunca se persiste), abre la sesión SSH real, y mantiene el
 * chat como "profesor" — inyecta practice_context/practice_tutorial en la
 * memoria de sesión y lo reconstruye cada vez que se valida progreso.
 */

import { useCallback, useRef, useState } from 'react';
import { sshConnect, memPut } from '../services/ssh.service';
import { extractSessionCommands } from '../services/session.service';
import {
  linuxConnectionTarget,
  linuxValidate,
  type LinuxBlock,
  type LinuxModule,
  type LinuxValidationResult,
} from '../services/linuxPractice.service';

interface UseLinuxPracticeSessionParams {
  onNewSession: (info: { id: string; label: string }) => void;
}

interface PasswordPromptState {
  username: string;
}

function isCommandStep(b: LinuxBlock): b is Extract<LinuxBlock, { type: 'command_step' }> {
  return b.type === 'command_step';
}

function isTextBlock(b: LinuxBlock): b is Extract<LinuxBlock, { type: 'text' }> {
  return b.type === 'text';
}

function buildPracticeContext(module: LinuxModule, result: LinuxValidationResult | null): string {
  const lines: string[] = [];
  lines.push(`Sos la guía de la Práctica de Linux — Módulo ${module.order}: ${module.title}`);
  lines.push(`Objetivo: ${module.objective}`);
  lines.push('');
  lines.push('Progreso actual:');

  const commandSteps = module.blocks.filter(isCommandStep);

  for (const rule of module.validation_rules) {
    const ruleResult = result?.results.find((r) => r.rule_id === rule.id);
    const step = commandSteps.find((s) => s.command === rule.target);
    const label = step?.command ?? rule.target ?? rule.id;

    if (ruleResult?.passed) {
      lines.push(`[x] ${label} — validado`);
    } else {
      const explain = step?.explain_md ? ` — pendiente: "${step.explain_md}"` : ' — pendiente';
      lines.push(`[ ] ${label}${explain}`);
    }
  }

  lines.push('');
  lines.push(
    'Guialo hacia el siguiente paso pendiente. No le des el comando textual salvo que lo ' +
      'pida explícitamente — explicá qué hace y por qué, dejá que lo escriba él.',
  );

  return lines.join('\n');
}

export function useLinuxPracticeSession({ onNewSession }: UseLinuxPracticeSessionParams) {
  const [connecting, setConnecting] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<PasswordPromptState | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const passwordResolverRef = useRef<((password: string) => void) | null>(null);
  const passwordRejecterRef = useRef<((err: Error) => void) | null>(null);
  const sessionByPractice = useRef<Record<string, string>>({});

  const askPassword = useCallback((username: string): Promise<string> => {
    setPasswordPrompt({ username });
    return new Promise<string>((resolve, reject) => {
      passwordResolverRef.current = resolve;
      passwordRejecterRef.current = reject;
    });
  }, []);

  const submitPassword = useCallback((password: string) => {
    passwordResolverRef.current?.(password);
  }, []);

  const cancelPassword = useCallback(() => {
    passwordRejecterRef.current?.(new Error('Conexión cancelada'));
    setPasswordPrompt(null);
  }, []);

  /** Conecta (pidiendo contraseña si hace falta) y devuelve el sessionId de la terminal. */
  const connect = useCallback(
    async (module: LinuxModule): Promise<string> => {
      setConnecting(true);
      setConnectError(null);
      try {
        const target = await linuxConnectionTarget();
        const password = await askPassword(target.user);
        setPasswordPrompt(null);

        const sessionId = await sshConnect({
          host: target.host,
          port: target.port,
          user: target.user,
          password,
          cols: 120,
          rows: 40,
        });

        sessionByPractice.current[module.id] = sessionId;
        onNewSession({ id: sessionId, label: `Linux — ${module.title}` });

        const introBlock = module.blocks.find(isTextBlock);
        await memPut(sessionId, {
          practice_context: buildPracticeContext(module, null),
          practice_tutorial: introBlock?.body_md ?? module.objective,
        });

        return sessionId;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setConnectError(msg);
        throw err;
      } finally {
        setConnecting(false);
        setPasswordPrompt(null);
      }
    },
    [askPassword, onNewSession],
  );

  /** Re-valida contra el historial real de comandos y actualiza el contexto del chat. */
  const revalidate = useCallback(async (module: LinuxModule): Promise<LinuxValidationResult | null> => {
    const sessionId = sessionByPractice.current[module.id];
    if (!sessionId) return null;

    const commandHistory = await extractSessionCommands(sessionId);
    const result = await linuxValidate(module.id, commandHistory);

    await memPut(sessionId, {
      practice_context: buildPracticeContext(module, result),
    });

    return result;
  }, []);

  return {
    connect,
    revalidate,
    connecting,
    connectError,
    passwordPrompt,
    submitPassword,
    cancelPassword,
  };
}
