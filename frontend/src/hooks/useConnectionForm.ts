/**
 * useConnectionForm.ts
 *
 * Responsabilidad única: estado y validación del formulario de conexión SSH.
 * NO sabe nada de Tauri, ni de `invoke`, ni de la red.
 *
 * Gestiona:
 * - Campos del formulario (host, port, user, password)
 * - Validación de cada campo
 * - Auto-relleno desde quickHost / recentConnection / initialPayload
 * - Estado de edición de host guardado
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConnectFormProps } from '../components/connect/ConnectForm';
import { isRaspberryPi4 } from '../constants/devices';

export type FieldError = {
  host?: string;
  port?: string;
  user?: string;
  password?: string;
};

export function useConnectionForm({
  quickHost,
  recentConnection,
  recentConnections = [],
  onQuickHostCleared,
  initialPayload,
}: Pick<
  ConnectFormProps,
  'quickHost' | 'recentConnection' | 'recentConnections' | 'onQuickHostCleared' | 'initialPayload'
> & { onAutoConnect?: () => void }) {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldError>({});
  const [isPulsing, setIsPulsing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [originalHostFile, setOriginalHostFile] = useState<string | null>(null);

  // ── Detección de tipo de dispositivo ─────────────────────────────────────────

  const isRaspberryPiConnection = useCallback(() => {
    const h = quickHost?.host ?? recentConnection?.host ?? host;
    const p = quickHost?.port ?? recentConnection?.port ?? Number(port);
    return isRaspberryPi4(h, p);
  }, [quickHost, recentConnection, host, port]);

  // ── Animación de pulso al autorellenar ───────────────────────────────────────

  const triggerPulse = useCallback(() => {
    setIsPulsing(true);
    setTimeout(() => setIsPulsing(false), 500);
  }, []);

  // ── Auto-relleno desde quickHost ──────────────────────────────────────────────

  useEffect(() => {
    if (quickHost) {
      setHost(quickHost.host);
      setPort(String(quickHost.port));
      setUser('');
      setPassword('');
      setErrors({});
      triggerPulse();
    } else if (!recentConnection && !initialPayload) {
      setHost('');
      setPort('22');
      setUser('');
      setPassword('');
      setErrors({});
    }
  }, [quickHost, triggerPulse]);

  // ── Auto-relleno desde recentConnection ──────────────────────────────────────

  useEffect(() => {
    if (!recentConnection) return;
    setHost(recentConnection.host);
    setPort(String(recentConnection.port));
    setUser(recentConnection.user);
    setPassword('');
    setErrors({});
    triggerPulse();
  }, [recentConnection, triggerPulse]);

  // ── Auto-relleno desde initialPayload (edición de host guardado) ─────────────

  useEffect(() => {
    if (initialPayload) {
      const p = initialPayload as any;
      setHost('');
      setPort('22');
      setUser('');
      setPassword('');
      setShowPassword(false);
      setErrors({});
      if (p.host) setHost(p.host);
      if (p.port) setPort(String(p.port));
      if (p.user) setUser(p.user);
      if (p.password) setPassword(p.password);
      const isEdit = !!p.host && !p.autoConnect;
      setIsEditMode(isEdit);
      if (isEdit && p._originalFile) setOriginalHostFile(p._originalFile);
    } else {
      setHost('');
      setPort('22');
      setUser('');
      setPassword('');
      setShowPassword(false);
      setErrors({});
      setIsEditMode(false);
      setOriginalHostFile(null);
    }
  }, [initialPayload]);

  // ── Validadores ───────────────────────────────────────────────────────────────

  const validatePort = useCallback((value: string): string | undefined => {
    if (!value.trim()) return undefined;
    const num = parseInt(value, 10);
    if (isNaN(num)) return 'Puerto debe ser numérico';
    if (num < 1 || num > 65535) return 'Puerto debe estar entre 1-65535';
    return undefined;
  }, []);

  const validateHost = useCallback((value: string): string | undefined => {
    if (!value.trim()) return 'Host es requerido';
    const trimmed = value.trim();
    if (value !== trimmed || /\s/.test(trimmed)) return 'Host no puede contener espacios';
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(trimmed)) {
      const validOctets = trimmed.split('.').every(part => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
      });
      if (!validOctets) return 'Dirección IP inválida (cada octeto debe ser 0-255)';
      return undefined;
    }
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!hostnameRegex.test(trimmed)) return 'Host inválido (solo letras, números, puntos y guiones)';
    if (trimmed.startsWith('-') || trimmed.endsWith('-') || trimmed.startsWith('.') || trimmed.endsWith('.'))
      return 'Host no puede empezar/terminar con guión o punto';
    return undefined;
  }, []);

  const validateForm = (): boolean => {
    const newErrors: FieldError = {};
    newErrors.host = validateHost(host);
    newErrors.port = validatePort(port);
    if (!user.trim()) newErrors.user = 'Usuario es requerido';
    if (!password.trim()) newErrors.password = 'Password es requerido';
    setErrors(newErrors);
    return !Object.values(newErrors).some(e => e !== undefined);
  };

  // ── Handlers de cambio de campo ───────────────────────────────────────────────

  const clearQuickHostIfNeeded = useCallback(() => {
    if (quickHost) onQuickHostCleared?.();
  }, [quickHost, onQuickHostCleared]);

  const handleHostChange = (value: string) => {
    setHost(value);
    clearQuickHostIfNeeded();
    setErrors(prev => ({ ...prev, host: validateHost(value) }));
  };

  const handlePortChange = (value: string) => {
    if (value && !/^\d+$/.test(value)) return;
    setPort(value);
    clearQuickHostIfNeeded();
    setErrors(prev => ({ ...prev, port: validatePort(value) }));
  };

  const clearForm = useCallback(() => {
    setHost('');
    setPort('22');
    setUser('');
    setPassword('');
    setShowPassword(false);
    setErrors({});
    setIsEditMode(false);
    setOriginalHostFile(null);
    onQuickHostCleared?.();
  }, [onQuickHostCleared]);

  // ── Validez derivada del formulario ──────────────────────────────────────────

  const isValid = useMemo(
    () => !errors.host && !errors.port && !errors.user && !errors.password && host.trim() && user.trim() && password.trim(),
    [errors, host, user, password]
  );

  return {
    // Valores de campos
    host, port, user, password, showPassword,
    // Setters directos
    setUser, setPassword, setShowPassword, setErrors,
    // Handlers con validación
    handleHostChange, handlePortChange,
    // Estado derivado
    errors, isValid, isPulsing, isEditMode, originalHostFile, isRaspberryPi: isRaspberryPiConnection,
    // Acciones de formulario
    validateForm, clearForm,
    // Helpers para acciones de conexión
    recentConnections,
  };
}
