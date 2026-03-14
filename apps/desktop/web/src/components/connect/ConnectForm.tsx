import React from 'react';
import PromptModal from '../modals/PromptModal';
import SweetAlert from '../modals/SweetAlert';
import { RecentConnection } from './RecentConnectionsPanel';
import { ConnectionToSave } from '../../hooks/useRecentConnections';
import { useConnectForm } from '../../hooks/useConnectForm';
import './ConnectForm.css';

interface QuickHost {
  id: string;
  name: string;
  host: string;
  port: number;
}

export interface ConnectFormProps {
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

const ConnectForm: React.FC<ConnectFormProps> = (props) => {
  const {
    host,
    port,
    user,
    password,
    showPassword,
    errors,
    isConnecting,
    isPulsing,
    isRaspberryPi,
    saveModalOpen,
    setSaveModalOpen,
    successAlertOpen,
    successAlertMessage,
    setSuccessAlertOpen,
    setSuccessAlertMessage,
    isEditMode,
    isValid,
    handleHostChange,
    handlePortChange,
    setUser,
    setPassword,
    setShowPassword,
    setErrors,
    clearForm,
    connect,
    handleSaveHost
  } = useConnectForm(props);

  return (
    <>
      <div className="connect-form-wrapper">
        <form className={`connect-form ${isPulsing ? 'connect-form--pulse' : ''}`} onSubmit={(e) => e.preventDefault()}>
          <header className="connect-form__header">
            <h1 className="connect-form__title">Conectar</h1>
            {props.quickHost && (
              <span className="connect-form__badge">
                {props.quickHost.name || props.quickHost.host}
              </span>
            )}
            {!props.quickHost && props.recentConnection && isRaspberryPi() && (
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
                  autoComplete="off"
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
                  {showPassword ? (
                    // Ojo abierto
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  ) : (
                    // Ojo cerrado
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  )}
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
