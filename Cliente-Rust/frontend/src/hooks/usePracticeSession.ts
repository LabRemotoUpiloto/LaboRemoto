/**
 * usePracticeSession.ts
 *
 * Gestiona el lanzamiento de prácticas de laboratorio:
 * - Conexión SSH al workspace de la práctica
 * - Apertura de la pestaña de sesión
 * - Inyección de contexto y tutorial en la memoria de sesión
 * - Navegación al directorio de trabajo
 * - Activación de cámara y/o chat IA según configuración
 *
 * Extraído de App.tsx. Usa la capa de servicios (ssh.service, ai -> mem_put)
 * en lugar de llamar `invoke` directamente.
 */

import { useCallback, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import type { PracticeLaunchPayload, PracticeSessionMeta } from '../types';
import { sshConnect, sshStdin, memPut } from '../services/ssh.service';

interface UsePracticeSessionParams {
  onNewSession: (info: { id: string; label: string }) => void;
  setCameraOpen: (sessionId: string, open: boolean) => void;
  setChatOpen: (open: boolean) => void;
}

export function usePracticeSession({
  onNewSession,
  setCameraOpen,
  setChatOpen,
}: UsePracticeSessionParams) {
  const [practiceMeta, setPracticeMeta] = useState<Record<string, PracticeSessionMeta>>({});

  const emitLog = (practiceId: string, level: string, message: string) => {
    emit('practice:log', { practice_id: practiceId, level, message });
  };

  /**
   * Lanza una práctica de laboratorio completa.
   * Emite eventos `practice:log` en cada paso para que el panel de log los muestre.
   * Si cualquier paso falla, lanza error → PracticesPage lo captura y lo muestra.
   */
  const handleStartPractice = useCallback(async ({ practice, student }: PracticeLaunchPayload) => {
    const log = (level: string, msg: string) => emitLog(practice.id, level, msg);

    // 1. Conectar via SSH al workspace
    log('info', `🔌 Conectando SSH al workspace (${practice.connection.user}@${practice.connection.host}:${practice.connection.port})...`);
    let sessionId: string;
    try {
      sessionId = await sshConnect({
        host: practice.connection.host,
        port: practice.connection.port,
        user: practice.connection.user,
        password: practice.connection.password,
        cols: 120,
        rows: 40,
      });
      log('success', `✅ Conexión SSH al workspace exitosa (session: ${sessionId.substring(0, 8)}...)`);
    } catch (err) {
      log('error', `❌ Error conectando al workspace: ${err}`);
      throw err;
    }

    // 2. Esperar estabilización de la sesión
    log('info', '⏳ Esperando estabilización de la sesión...');
    await new Promise(r => setTimeout(r, 1200));

    // 3. Abrir pestaña de sesión
    log('info', '📂 Abriendo pestaña de la sesión...');
    onNewSession({ id: sessionId, label: `Práctica: ${practice.name}` });
    setPracticeMeta(prev => ({
      ...prev,
      [sessionId]: {
        practiceId: practice.id,
        assignmentId: practice.moodle_assignment_id,
        student,
      },
    }));

    // 4. Inyectar contexto de la práctica en memoria de sesión
    if (practice.panels?.chat_context || practice.panels?.chat_tutorial) {
      try {
        await memPut(sessionId, {
          practice_context: practice.panels.chat_context,
          practice_tutorial: practice.panels.chat_tutorial,
        });
      } catch (e) {
        console.error('Error inyectando contexto de práctica:', e);
      }
    }
    log('success', '✅ Pestaña de sesión abierta');

    // 5. Navegar al directorio de trabajo
    if (practice.terminal?.working_directory) {
      log('info', `📁 Cambiando al directorio de trabajo: ${practice.terminal.working_directory}`);
      try {
        await sshStdin(sessionId, `cd ${practice.terminal.working_directory}\n`);
        await new Promise(r => setTimeout(r, 500));
        log('success', `✅ Directorio de trabajo: ${practice.terminal.working_directory}`);
      } catch (err) {
        log('error', `❌ Error cambiando de directorio: ${err}`);
        throw err;
      }
    }

    // 6. Activar cámara si la práctica lo requiere
    if (practice.panels?.camera) {
      log('info', '📷 Activando cámara del laboratorio...');
      setCameraOpen(sessionId, true);
      log('success', '✅ Cámara del laboratorio activada');
    }

    // 7. Activar chat IA si la práctica lo requiere
    if (practice.panels?.chat) {
      log('info', '💬 Activando chat de asistente IA...');
      setChatOpen(true);
      log('success', '✅ Chat IA activado con contexto de la práctica');
    }

    log('success', '🎉 Práctica lista — ¡buena suerte!');
  }, [onNewSession, setCameraOpen, setChatOpen]);

  const clearPracticeMeta = useCallback((sessionId: string) => {
    setPracticeMeta(prev => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }, []);

  return { practiceMeta, handleStartPractice, clearPracticeMeta };
}
