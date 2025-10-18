import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLoading } from '../../contexts/LoadingContext';
import { useToasts } from '../../contexts/ToastContext';
import PromptModal from '../modals/PromptModal';
import { RecentConnection } from './RecentConnectionsPanel';
import { ConnectionToSave } from '../../hooks/useRecentConnections';
import './ConnectForm.css';

interface QuickHost {
  id: string;
  name: string;
  host: string;
  port: number;
}

interface ConnectFormProps {
  onConnected: (info: { id: string; label?: string }) => void;
  getTermSize?: () => { cols: number; rows: number };
  initialPayload?: any | null;
  quickHost?: QuickHost | null;
  recentConnection?: RecentConnection | null;
  recentConnections?: RecentConnection[];
  onQuickHostCleared?: () => void;
  onConnectionSuccess?: (connection: ConnectionToSave) => void;
}

interface FieldError {
  host?: string;
  port?: string;
  user?: string;
  password?: string;
}

const ConnectForm: React.FC<ConnectFormProps> = ({
  onConnected,
  getTermSize,
  initialPayload,
  quickHost,
  recentConnection,
  recentConnections = [],
  onQuickHostCleared,
  onConnectionSuccess,
}) => {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldError>({});
  const [busyLocal, setBusyLocal] = useState(false);
  const { setLoading } = useLoading();
  const { push } = useToasts();

  // Modal para guardar host
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  // Estado para animaciones
  const [isPulsing, setIsPulsing] = useState(false);

  // Trigger pulse animation cuando se selecciona un host
  const triggerPulse = useCallback(() => {
    setIsPulsing(true);
    setTimeout(() => setIsPulsing(false), 500);
  }, []);

  // Atajos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+D: Duplicar última conexión reciente
      if (e.ctrlKey && e.key === 'd' && recentConnection) {
        e.preventDefault();
        setHost(recentConnection.host);
        setPort(String(recentConnection.port));
        setUser(recentConnection.user);
        setPassword('');
        push({ type: 'info', message: 'Conexión duplicada' });
      }

      // Escape: Limpiar formulario
      if (e.key === 'Escape' && !saveModalOpen && !busyLocal) {
        e.preventDefault();
        setHost('');
        setPort('22');
        setUser('');
        setPassword('');
        setErrors({});
        if (onQuickHostCleared) onQuickHostCleared();
        push({ type: 'info', message: 'Formulario limpiado' });
      }

      // Ctrl+S: Abrir modal de guardar
      if (e.ctrlKey && e.key === 's' && !busyLocal) {
        e.preventDefault();
        setSaveModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recentConnection, saveModalOpen, busyLocal, onQuickHostCleared, push]);

  // Cargar desde quick host
  useEffect(() => {
    if (!quickHost) return;
    setHost(quickHost.host);
    setPort(String(quickHost.port));
    setUser('');
    setPassword('');
    setErrors({});
    triggerPulse();
  }, [quickHost, triggerPulse]);

  // Cargar desde conexión reciente
  useEffect(() => {
    if (!recentConnection) return;
    setHost(recentConnection.host);
    setPort(String(recentConnection.port));
    setUser(recentConnection.user);
    setPassword(''); // No guardamos contraseñas
    setErrors({});
    triggerPulse();
  }, [recentConnection, triggerPulse]);

  // Auto-connect desde initialPayload
  useEffect(() => {
    if (initialPayload) {
      const p = initialPayload;
      if (p.host) setHost(p.host);
      if (p.port) setPort(String(p.port));
      if (p.user) setUser(p.user);
      if (p.password) setPassword(p.password);
      if (p.autoConnect) {
        setTimeout(() => {
          connect();
        }, 50);
      }
    }
  }, [initialPayload]);

  // Validación de puerto
  const validatePort = useCallback((value: string): string | undefined => {
    if (!value.trim()) return undefined; // Vacío usa default 22
    const num = parseInt(value, 10);
    if (isNaN(num)) return 'Puerto debe ser numérico';
    if (num < 1 || num > 65535) return 'Puerto debe estar entre 1-65535';
    return undefined;
  }, []);

  // Validación de host mejorada
  const validateHost = useCallback((value: string): string | undefined => {
    if (!value.trim()) return 'Host es requerido';
    
    const trimmed = value.trim();
    
    // Detectar y prevenir espacios
    if (value !== trimmed || /\s/.test(trimmed)) {
      return 'Host no puede contener espacios';
    }
    
    // Validar IPv4
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(trimmed)) {
      const parts = trimmed.split('.');
      const validOctets = parts.every(part => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
      });
      if (!validOctets) return 'Dirección IP inválida (cada octeto debe ser 0-255)';
      return undefined; // IP válida
    }
    
    // Validar hostname/dominio
    // Permite: letras, números, guiones, puntos
    // Formato: example.com, sub.example.com, localhost, server-01
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!hostnameRegex.test(trimmed)) {
      return 'Host inválido (solo letras, números, puntos y guiones)';
    }
    
    // Validar que no empiece/termine con guión o punto
    if (trimmed.startsWith('-') || trimmed.endsWith('-') || 
        trimmed.startsWith('.') || trimmed.endsWith('.')) {
      return 'Host no puede empezar/terminar con guión o punto';
    }
    
    return undefined;
  }, []);

  // Handler de cambio de puerto con validación
  const handlePortChange = (value: string) => {
    // Solo permitir números
    if (value && !/^\d+$/.test(value)) return;
    
    setPort(value);
    clearQuickHostIfNeeded();
    
    const error = validatePort(value);
    setErrors(prev => ({ ...prev, port: error }));
  };

  // Handler de cambio de host con validación
  const handleHostChange = (value: string) => {
    setHost(value);
    clearQuickHostIfNeeded();
    
    const error = validateHost(value);
    setErrors(prev => ({ ...prev, host: error }));
  };

  // Validar antes de conectar
  const validateForm = (): boolean => {
    const newErrors: FieldError = {};
    
    newErrors.host = validateHost(host);
    newErrors.port = validatePort(port);
    if (!user.trim()) newErrors.user = 'Usuario es requerido';
    if (!password.trim()) newErrors.password = 'Password es requerido';

    setErrors(newErrors);
    return !Object.values(newErrors).some(e => e !== undefined);
  };

  // Detectar si el host ya existe en conexiones recientes
  const checkDuplicateConnection = (): boolean => {
    const parsedPort = parseInt(port.trim() || '22', 10);
    const safePort = (parsedPort > 0 && parsedPort <= 65535) ? parsedPort : 22;
    
    const exists = recentConnections.some(
      conn => 
        conn.host === host.trim() && 
        conn.port === safePort && 
        conn.user === user.trim()
    );

    if (exists) {
      push({ 
        type: 'info', 
        message: `Ya conectaste a ${user.trim()}@${host.trim()}:${safePort} anteriormente` 
      });
    }

    return exists;
  };

  const connect = async () => {
    if (!validateForm()) {
      push({ type: 'error', message: 'Por favor corrige los errores' });
      return;
    }

    // Detectar duplicados (solo aviso informativo, no bloquea conexión)
    checkDuplicateConnection();

    setBusyLocal(true);
    setLoading(true, `Conectando a ${host}...`);
    
    try {
      const parsedPort = parseInt(port.trim() || '22', 10);
      const safePort = (parsedPort > 0 && parsedPort <= 65535) ? parsedPort : 22;
      const size = getTermSize ? getTermSize() : { cols: 80, rows: 24 };
      
      const id = await invoke<string>('ssh_connect', {
        host: host.trim(),
        port: safePort,
        user: user.trim(),
        password,
        cols: size.cols,
        rows: size.rows,
      });
      
      const label = `${user}@${host}`;
      onConnected({ id, label });
      push({ type: 'success', message: `Conectado a ${label}` });
      
      // Guardar en historial de conexiones recientes
      if (onConnectionSuccess) {
        onConnectionSuccess({
          host: host.trim(),
          port: safePort,
          user: user.trim(),
        });
      }
    } catch (e: any) {
      push({ type: 'error', message: e?.toString?.() ?? 'Error conectando' });
    } finally {
      setBusyLocal(false);
      setLoading(false, null);
    }
  };

  const handleSaveHost = async (name: string) => {
    if (!validateForm()) {
      push({ type: 'error', message: 'Corrige los errores antes de guardar' });
      return;
    }

    const parsedPort = parseInt(port.trim() || '22', 10);
    const safePort = (parsedPort > 0 && parsedPort <= 65535) ? parsedPort : 22;
    const hostId = `${host}:${safePort}:${user}`;

    try {
      const { saveHostWithMaster } = await import('../../api/storage');
      const payload = {
        host: host.trim(),
        port: safePort,
        user: user.trim(),
        password,
        name: name.trim() || undefined,
      };
      
      await saveHostWithMaster(hostId, payload as any);
      push({ type: 'success', message: 'Host guardado correctamente' });
      setSaveModalOpen(false);
    } catch (e: any) {
      console.error('saveHostWithMaster error', e);
      push({ type: 'error', message: 'Error guardando host' });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!busyLocal) connect();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      setSaveModalOpen(true);
    }
  };

  const clearQuickHostIfNeeded = useCallback(() => {
    if (quickHost) onQuickHostCleared?.();
  }, [quickHost, onQuickHostCleared]);

  const isValid = !errors.host && !errors.port && !errors.user && !errors.password &&
                  host.trim() && user.trim() && password.trim();

  return (
    <>
      <div className="connect-form-wrapper">
        <form className={`connect-form ${isPulsing ? 'connect-form--pulse' : ''}`} onKeyDown={onKeyDown} onSubmit={(e) => e.preventDefault()}>
          <header className="connect-form__header">
            <h1 className="connect-form__title">Conectar</h1>
            {quickHost && (
              <span className="connect-form__badge">
                {quickHost.name || quickHost.host}
              </span>
            )}
          </header>

          <div className="connect-form__fields">
            {/* Host */}
            <div className="connect-form__field">
              <div className="connect-form__input-wrapper">
                <input
                  id="field-host"
                  className={`connect-form__input ${errors.host ? 'connect-form__input--error' : ''}`}
                  placeholder=" "
                  value={host}
                  onChange={(e) => handleHostChange(e.target.value)}
                  disabled={busyLocal}
                  title="Dirección IP o nombre de dominio del servidor SSH (ej: 192.168.1.100 o servidor.ejemplo.com)"
                />
                <label htmlFor="field-host" className="connect-form__label">
                  Host
                </label>
              </div>
              {errors.host && (
                <span className="connect-form__error">
                  <span className="connect-form__error-icon">⚠️</span>
                  {errors.host}
                </span>
              )}
            </div>

            {/* Port */}
            <div className="connect-form__field">
              <div className="connect-form__input-wrapper">
                <input
                  id="field-port"
                  className={`connect-form__input ${errors.port ? 'connect-form__input--error' : ''}`}
                  placeholder=" "
                  type="text"
                  inputMode="numeric"
                  value={port}
                  onChange={(e) => handlePortChange(e.target.value)}
                  disabled={busyLocal}
                  title="Puerto SSH del servidor (por defecto: 22). Rango válido: 1-65535"
                />
                <label htmlFor="field-port" className="connect-form__label">
                  Puerto
                </label>
              </div>
              {errors.port && (
                <span className="connect-form__error">
                  <span className="connect-form__error-icon">⚠️</span>
                  {errors.port}
                </span>
              )}
            </div>

            {/* User */}
            <div className="connect-form__field connect-form__field--full">
              <div className="connect-form__input-wrapper">
                <input
                  id="field-user"
                  className={`connect-form__input ${errors.user ? 'connect-form__input--error' : ''}`}
                  placeholder=" "
                  value={user}
                  onChange={(e) => {
                    setUser(e.target.value);
                    clearQuickHostIfNeeded();
                    if (errors.user) setErrors(prev => ({ ...prev, user: undefined }));
                  }}
                  disabled={busyLocal}
                  title="Nombre de usuario para la conexión SSH (ej: root, admin, ubuntu)"
                />
                <label htmlFor="field-user" className="connect-form__label">
                  Usuario
                </label>
              </div>
              {errors.user && (
                <span className="connect-form__error">
                  <span className="connect-form__error-icon">⚠️</span>
                  {errors.user}
                </span>
              )}
            </div>

            {/* Password */}
            <div className="connect-form__field connect-form__field--full">
              <div className="connect-form__input-wrapper">
                <input
                  id="field-pass"
                  className={`connect-form__input ${errors.password ? 'connect-form__input--error' : ''}`}
                  placeholder=" "
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearQuickHostIfNeeded();
                    if (errors.password) setErrors(prev => ({ ...prev, password: undefined }));
                  }}
                  disabled={busyLocal}
                  title="Contraseña SSH del usuario. No se guarda en el historial por seguridad"
                />
                <label htmlFor="field-pass" className="connect-form__label">
                  Password
                </label>
              </div>
              {errors.password && (
                <span className="connect-form__error">
                  <span className="connect-form__error-icon">⚠️</span>
                  {errors.password}
                </span>
              )}
            </div>
          </div>

          <div className="connect-form__actions">
            <button
              type="button"
              className="connect-form__btn connect-form__btn--secondary"
              onClick={() => setSaveModalOpen(true)}
              disabled={busyLocal}
              title="Guardar host (Ctrl+S)"
            >
              Guardar host
            </button>
            <button
              type="submit"
              className="connect-form__btn connect-form__btn--primary"
              onClick={connect}
              disabled={busyLocal || !isValid}
              title={isValid ? 'Conectar (Enter)' : 'Completa todos los campos correctamente'}
            >
              {busyLocal && <span className="connect-form__spinner" />}
              Conectar
            </button>
          </div>
        </form>
      </div>

      <PromptModal
        open={saveModalOpen}
        title="Guardar host"
        message={`Guardar ${user}@${host}:${port || '22'}`}
        placeholder="Nombre (opcional)"
        onCancel={() => setSaveModalOpen(false)}
        onConfirm={handleSaveHost}
      />
    </>
  );
};

export default ConnectForm;
