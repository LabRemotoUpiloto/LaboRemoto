import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLoading } from '../../contexts/LoadingContext';
import { useToasts } from '../../contexts/ToastContext';
import PromptModal from '../modals/PromptModal';
import SweetAlert from '../modals/SweetAlert';
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
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldError>({});
  const { setLoading, loading: isConnecting } = useLoading();
  const { push } = useToasts();

  // Modal para guardar host
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  
  // SweetAlert para confirmaciones
  const [successAlertOpen, setSuccessAlertOpen] = useState(false);
  const [successAlertMessage, setSuccessAlertMessage] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [originalHostFile, setOriginalHostFile] = useState<string | null>(null);

  // Estado para animaciones
  const [isPulsing, setIsPulsing] = useState(false);

  // Estados para conexión cancelable
  const [connectionAbortController, setConnectionAbortController] = useState<AbortController | null>(null);

  // Helper: Detectar si es Raspberry Pi (desde quickHost o recentConnection o campos actuales)
  const isRaspberryPi = useCallback(() => {
    // Desde quickHost
    if (quickHost?.host === '200.115.181.211' && quickHost?.port === 9000) {
      return true;
    }
    // Desde recentConnection
    if (recentConnection?.host === '200.115.181.211' && recentConnection?.port === 9000) {
      return true;
    }
    // Desde campos actuales (para mantener el estado)
    if (host === '200.115.181.211' && port === '9000') {
      return true;
    }
    return false;
  }, [quickHost, recentConnection, host, port]);

  // Trigger pulse animation cuando se selecciona un host
  const triggerPulse = useCallback(() => {
    setIsPulsing(true);
    setTimeout(() => setIsPulsing(false), 500);
  }, []);

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
      
      // Limpiar campos primero
      setHost('');
      setPort('22');
      setUser('');
      setPassword('');
      setShowPassword(false);
      setErrors({});
      
      // Luego cargar datos del payload
      if (p.host) setHost(p.host);
      if (p.port) setPort(String(p.port));
      if (p.user) setUser(p.user);
      if (p.password) setPassword(p.password);
      
      // Detectar modo edición: si viene initialPayload SIN autoConnect, es edición
      const isEdit = !!p.host && !p.autoConnect;
      setIsEditMode(isEdit);
      
      // Guardar archivo original si es edición
      if (isEdit && p._originalFile) {
        setOriginalHostFile(p._originalFile);
      }
      
      if (p.autoConnect) {
        setTimeout(() => {
          connect();
        }, 50);
      }
    } else {
      // Si no hay initialPayload, limpiar todo
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
      // Mensaje personalizado para Raspberry Pi
      const isRaspberryPiConnection = host.trim() === '200.115.181.211' && safePort === 9000;
      const displayInfo = isRaspberryPiConnection 
        ? `${user.trim()}@Raspberry Pi 4`
        : `${user.trim()}@${host.trim()}:${safePort}`;
      
      push({ 
        type: 'info', 
        message: `Ya te has conectado a ${displayInfo} anteriormente` 
      });
    }

    return exists;
  };

  const cancelConnection = () => {
    if (connectionAbortController) {
      connectionAbortController.abort();
    }
    setConnectionAbortController(null);
    setLoading(false, null, null);
    push({ type: 'info', message: 'Conexión cancelada' });
  };

  const connect = async () => {
    if (!validateForm()) {
      push({ type: 'error', message: 'Por favor corrige los errores' });
      return;
    }

    console.log('🔌 Starting connection...');

    // Detectar duplicados (solo aviso informativo, no bloquea conexión)
    checkDuplicateConnection();

    const parsedPort = parseInt(port.trim() || '22', 10);
    const safePort = (parsedPort > 0 && parsedPort <= 65535) ? parsedPort : 22;
    const size = getTermSize ? getTermSize() : { cols: 80, rows: 24 };

    // Crear AbortController para poder cancelar la conexión
    const abortController = new AbortController();
    setConnectionAbortController(abortController);
    
    // Mensaje personalizado para Raspberry Pi
    const isRaspberryPiConn = host.trim() === '200.115.181.211' && port.trim() === '9000';
    const displayName = isRaspberryPiConn ? 'Raspberry Pi 4' : host.trim();
    const loadingMessage = isRaspberryPiConn ? 'Conectando a Raspberry Pi 4...' : `Conectando a ${host}...`;
    
    console.log('📡 Loading message:', loadingMessage);
    
    // Variables para cleanup
    let unlistenSuccess: any = null;
    let unlistenError: any = null;
    let timeoutId: any = null;
    
    try {
      // Importar listen
      const { listen } = await import('@tauri-apps/api/event');
      
      console.log('🎧 Setting up event listeners...');
      
      // Configurar listeners ANTES de invocar ssh_connect
      const connectionPromise = new Promise<{ id: string; label: string }>((resolve, reject) => {
        // Listener de éxito
        listen<any>('ssh_connected', (event) => {
          console.log('✅ ssh_connected event received:', event.payload);
          if (event.payload?.id && !abortController.signal.aborted) {
            const label = `${user}@${displayName}`;
            
            // Guardar en historial
            if (onConnectionSuccess) {
              onConnectionSuccess({
                host: host.trim(),
                port: safePort,
                user: user.trim(),
              });
            }
            
            resolve({ id: event.payload.id, label });
          }
        }).then((unlisten) => {
          unlistenSuccess = unlisten;
          console.log('✅ Success listener registered');
        }).catch(reject);
        
        // Listener de error
        listen<any>('ssh_connect_error', (event) => {
          console.log('❌ ssh_connect_error event received:', event.payload);
          if (event.payload?.id && !abortController.signal.aborted) {
            reject(new Error(event.payload.error || 'Error conectando'));
          }
        }).then((unlisten) => {
          unlistenError = unlisten;
          console.log('✅ Error listener registered');
        }).catch(reject);
      });
      
      // Activar el loader global con botón de cancelar
      console.log('🔄 Activating GlobalLoader...');
      setLoading(true, loadingMessage, cancelConnection);
      
      // Timeout de 30 segundos
      timeoutId = setTimeout(() => {
        if (!abortController.signal.aborted) {
          console.log('⏱️ Connection timeout (30s)');
          abortController.abort();
          if (unlistenSuccess) unlistenSuccess();
          if (unlistenError) unlistenError();
          setLoading(false, null, null);
          setConnectionAbortController(null);
          push({ type: 'error', message: 'Tiempo de espera agotado (30s)' });
        }
      }, 30000);
      
      // Pequeño delay para asegurar que los listeners estén listos
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('📞 Invoking ssh_connect...');
      // Invocar ssh_connect (retorna ID inmediatamente)
      const id = await invoke<string>('ssh_connect', {
        host: host.trim(),
        port: safePort,
        user: user.trim(),
        password,
        cols: size.cols,
        rows: size.rows,
      });
      
      console.log('🆔 SSH connection initiated with ID:', id);
      
      // Verificar si fue cancelado
      if (abortController.signal.aborted) {
        if (timeoutId) clearTimeout(timeoutId);
        if (unlistenSuccess) unlistenSuccess();
        if (unlistenError) unlistenError();
        return;
      }
      
      // Esperar resultado de la conexión
      const result = await connectionPromise;
      
      // Limpiar timeout y listeners
      if (timeoutId) clearTimeout(timeoutId);
      if (unlistenSuccess) unlistenSuccess();
      if (unlistenError) unlistenError();
      
      // Éxito: abrir terminal
      onConnected(result);
      push({ type: 'success', message: `Conectado a ${displayName}` });
      setLoading(false, null, null);
      setConnectionAbortController(null);
      
    } catch (e: any) {
      // Limpiar recursos
      if (timeoutId) clearTimeout(timeoutId);
      if (unlistenSuccess) unlistenSuccess();
      if (unlistenError) unlistenError();
      
      if (!abortController.signal.aborted) {
        const errorMessage = e?.message || e?.toString?.() || 'Error conectando';
        push({ type: 'error', message: errorMessage });
        setLoading(false, null, null);
        setConnectionAbortController(null);
      }
    }
  };

  const handleSaveHost = async (name: string) => {
    if (!validateForm()) {
      push({ type: 'error', message: 'Corrige los errores antes de guardar' });
      return;
    }

    const parsedPort = parseInt(port.trim() || '22', 10);
    const safePort = (parsedPort > 0 && parsedPort <= 65535) ? parsedPort : 22;
    const newHostId = `${host.trim()}:${safePort}:${user.trim()}`;

    try {
      const { saveHostWithMaster, deleteHostFile } = await import('../../api/storage');
      const payload = {
        host: host.trim(),
        port: safePort,
        user: user.trim(),
        password,
        name: name.trim() || undefined,
      };
      
      // Si es modo edición y el ID cambió, eliminar el archivo viejo
      if (isEditMode && originalHostFile && originalHostFile !== newHostId) {
        try {
          await deleteHostFile(originalHostFile);
        } catch (delError) {
          console.warn('No se pudo eliminar el host original:', delError);
          // Continuar de todos modos para guardar el nuevo
        }
      }
      
      // Guardar el host (nuevo o actualizado)
      await saveHostWithMaster(newHostId, payload as any);
      
      // Mostrar SweetAlert según el modo
      setSaveModalOpen(false);
      setSuccessAlertMessage(isEditMode ? 'Host editado correctamente' : 'Host guardado correctamente');
      setSuccessAlertOpen(true);
      
      // Limpiar modo edición después de guardar
      if (isEditMode) {
        setIsEditMode(false);
        setOriginalHostFile(null);
      }
    } catch (e: any) {
      console.error('saveHostWithMaster error', e);
      push({ type: 'error', message: 'Error guardando host' });
    }
  };

  const clearQuickHostIfNeeded = useCallback(() => {
    if (quickHost) onQuickHostCleared?.();
  }, [quickHost, onQuickHostCleared]);

  // Función para limpiar el formulario completamente
  const clearForm = useCallback(() => {
    setHost('');
    setPort('22');
    setUser('');
    setPassword('');
    setShowPassword(false);
    setErrors({});
    setIsEditMode(false);
    setOriginalHostFile(null);
    if (onQuickHostCleared) onQuickHostCleared();
  }, [onQuickHostCleared]);

  const isValid = !errors.host && !errors.port && !errors.user && !errors.password &&
                  host.trim() && user.trim() && password.trim();

  return (
    <>
      <div className="connect-form-wrapper">
        <form className={`connect-form ${isPulsing ? 'connect-form--pulse' : ''}`} onSubmit={(e) => e.preventDefault()}>
          <header className="connect-form__header">
            <h1 className="connect-form__title">Conectar</h1>
            {quickHost && (
              <span className="connect-form__badge">
                {quickHost.name || quickHost.host}
              </span>
            )}
            {!quickHost && recentConnection && isRaspberryPi() && (
              <span className="connect-form__badge">
                Raspberry Pi 4
              </span>
            )}
          </header>

          <div className="connect-form__fields">
            {/* Host - Solo mostrar si NO es Raspberry Pi (desde quickHost o recentConnection) */}
            {!isRaspberryPi() && (
              <div className="connect-form__field">
                <div className="connect-form__input-wrapper">
                  <input
                    id="field-host"
                    className={`connect-form__input ${errors.host ? 'connect-form__input--error' : ''}`}
                    placeholder=" "
                    value={host}
                    onChange={(e) => handleHostChange(e.target.value)}
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
            )}

            {/* Port - Solo mostrar si NO es Raspberry Pi (desde quickHost o recentConnection) */}
            {!isRaspberryPi() && (
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
            )}

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
                    if (errors.user) setErrors(prev => ({ ...prev, user: undefined }));
                  }}
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
              <div className="connect-form__input-wrapper connect-form__input-wrapper--password">
                <input
                  id="field-pass"
                  className={`connect-form__input ${errors.password ? 'connect-form__input--error' : ''}`}
                  placeholder=" "
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors(prev => ({ ...prev, password: undefined }));
                  }}
                  title="Contraseña SSH del usuario. No se guarda en el historial por seguridad"
                />
                <label htmlFor="field-pass" className="connect-form__label">
                  Password
                </label>
                <button
                  type="button"
                  className="connect-form__password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
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
              disabled={isConnecting}
              title="Guardar host (Ctrl+S)"
            >
              Guardar host
            </button>
            <button
              type="submit"
              className="connect-form__btn connect-form__btn--primary"
              onClick={connect}
              disabled={isConnecting || !isValid}
              title={isValid ? 'Conectar (Enter)' : 'Completa todos los campos correctamente'}
            >
              {isConnecting && <span className="connect-form__spinner" />}
              Conectar
            </button>
          </div>
        </form>
      </div>

      <PromptModal
        open={saveModalOpen}
        title={isEditMode ? "Editar host guardado" : "Guardar host"}
        message={`${isEditMode ? 'Editar' : 'Guardar'} ${user}@${host}:${port || '22'}`}
        placeholder="Nombre (opcional)"
        onCancel={() => setSaveModalOpen(false)}
        onConfirm={handleSaveHost}
      />
      
      <SweetAlert
        open={successAlertOpen}
        type="success"
        title="¡Éxito!"
        message={successAlertMessage}
        confirmText="Aceptar"
        showCancel={false}
        onConfirm={() => {
          setSuccessAlertOpen(false);
          setSuccessAlertMessage('');
          // Limpiar formulario después de confirmar
          clearForm();
        }}
      />
    </>
  );
};

export default ConnectForm;
