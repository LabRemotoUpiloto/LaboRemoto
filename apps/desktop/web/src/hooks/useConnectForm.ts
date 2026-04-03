import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLoading } from "../contexts/LoadingContext";
import { useToasts } from "../contexts/ToastContext";
import type { ConnectFormProps } from "../components/connect/ConnectForm";

type FieldError = {
  host?: string;
  port?: string;
  user?: string;
  password?: string;
};

export function useConnectForm({
  onConnected,
  getTermSize,
  initialPayload,
  quickHost,
  recentConnection,
  recentConnections = [],
  onQuickHostCleared,
  onConnectionSuccess
}: ConnectFormProps) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldError>({});
  const { setLoading, loading: isConnecting } = useLoading();
  const { push } = useToasts();

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [successAlertOpen, setSuccessAlertOpen] = useState(false);
  const [successAlertMessage, setSuccessAlertMessage] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [originalHostFile, setOriginalHostFile] = useState<string | null>(null);
  const [isPulsing, setIsPulsing] = useState(false);
  const [connectionAbortController, setConnectionAbortController] = useState<AbortController | null>(null);

  const isRaspberryPi = useCallback(() => {
    if (quickHost?.host === "200.115.181.211" && quickHost?.port === 9000) {
      return true;
    }
    if (recentConnection?.host === "200.115.181.211" && recentConnection?.port === 9000) {
      return true;
    }
    if (host === "200.115.181.211" && port === "9000") {
      return true;
    }
    return false;
  }, [quickHost, recentConnection, host, port]);

  const triggerPulse = useCallback(() => {
    setIsPulsing(true);
    setTimeout(() => setIsPulsing(false), 500);
  }, []);

  useEffect(() => {
    if (!quickHost) return;
    setHost(quickHost.host);
    setPort(String(quickHost.port));
    setUser("");
    setPassword("");
    setErrors({});
    triggerPulse();
  }, [quickHost, triggerPulse]);

  useEffect(() => {
    if (!recentConnection) return;
    setHost(recentConnection.host);
    setPort(String(recentConnection.port));
    setUser(recentConnection.user);
    setPassword("");
    setErrors({});
    triggerPulse();
  }, [recentConnection, triggerPulse]);

  useEffect(() => {
    if (initialPayload) {
      const p = initialPayload as any;
      setHost("");
      setPort("22");
      setUser("");
      setPassword("");
      setShowPassword(false);
      setErrors({});
      if (p.host) setHost(p.host);
      if (p.port) setPort(String(p.port));
      if (p.user) setUser(p.user);
      if (p.password) setPassword(p.password);
      const isEdit = !!p.host && !p.autoConnect;
      setIsEditMode(isEdit);
      if (isEdit && p._originalFile) {
        setOriginalHostFile(p._originalFile);
      }
      if (p.autoConnect) {
        setTimeout(() => {
          connect();
        }, 50);
      }
    } else {
      setHost("");
      setPort("22");
      setUser("");
      setPassword("");
      setShowPassword(false);
      setErrors({});
      setIsEditMode(false);
      setOriginalHostFile(null);
    }
  }, [initialPayload]);

  const validatePort = useCallback((value: string): string | undefined => {
    if (!value.trim()) return undefined;
    const num = parseInt(value, 10);
    if (isNaN(num)) return "Puerto debe ser numérico";
    if (num < 1 || num > 65535) return "Puerto debe estar entre 1-65535";
    return undefined;
  }, []);

  const validateHost = useCallback((value: string): string | undefined => {
    if (!value.trim()) return "Host es requerido";
    const trimmed = value.trim();
    if (value !== trimmed || /\s/.test(trimmed)) {
      return "Host no puede contener espacios";
    }
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(trimmed)) {
      const parts = trimmed.split(".");
      const validOctets = parts.every(part => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
      });
      if (!validOctets) return "Dirección IP inválida (cada octeto debe ser 0-255)";
      return undefined;
    }
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!hostnameRegex.test(trimmed)) {
      return "Host inválido (solo letras, números, puntos y guiones)";
    }
    if (trimmed.startsWith("-") || trimmed.endsWith("-") || trimmed.startsWith(".") || trimmed.endsWith(".")) {
      return "Host no puede empezar/terminar con guión o punto";
    }
    return undefined;
  }, []);

  const clearQuickHostIfNeeded = useCallback(() => {
    if (quickHost) onQuickHostCleared?.();
  }, [quickHost, onQuickHostCleared]);

  const handlePortChange = (value: string) => {
    if (value && !/^\d+$/.test(value)) return;
    setPort(value);
    clearQuickHostIfNeeded();
    const error = validatePort(value);
    setErrors(prev => ({ ...prev, port: error }));
  };

  const handleHostChange = (value: string) => {
    setHost(value);
    clearQuickHostIfNeeded();
    const error = validateHost(value);
    setErrors(prev => ({ ...prev, host: error }));
  };

  const validateForm = (): boolean => {
    const newErrors: FieldError = {};
    newErrors.host = validateHost(host);
    newErrors.port = validatePort(port);
    if (!user.trim()) newErrors.user = "Usuario es requerido";
    if (!password.trim()) newErrors.password = "Password es requerido";
    setErrors(newErrors);
    return !Object.values(newErrors).some(e => e !== undefined);
  };

  const checkDuplicateConnection = (): boolean => {
    const parsedPort = parseInt(port.trim() || "22", 10);
    const safePort = parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 22;
    const exists = recentConnections.some(conn => conn.host === host.trim() && conn.port === safePort && conn.user === user.trim());
    if (exists) {
      const isRaspberryPiConnection = host.trim() === "200.115.181.211" && safePort === 9000;
      const displayInfo = isRaspberryPiConnection ? `${user.trim()}@Raspberry Pi 4` : `${user.trim()}@${host.trim()}:${safePort}`;
      push({ type: "info", message: `Ya te has conectado a ${displayInfo} anteriormente` });
    }
    return exists;
  };

  const cancelConnection = () => {
    if (connectionAbortController) {
      connectionAbortController.abort();
    }
    setConnectionAbortController(null);
    setLoading(false, null, null);
    push({ type: "info", message: "Conexión cancelada" });
  };

  const connect = async () => {
    if (!validateForm()) {
      push({ type: "error", message: "Por favor corrige los errores" });
      return;
    }
    checkDuplicateConnection();
    const parsedPort = parseInt(port.trim() || "22", 10);
    const safePort = parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 22;
    const size = getTermSize ? getTermSize() : { cols: 80, rows: 24 };
    const abortController = new AbortController();
    setConnectionAbortController(abortController);
    const isRaspberryPiConn = host.trim() === "200.115.181.211" && port.trim() === "9000";
    const displayName = isRaspberryPiConn ? "Raspberry Pi 4" : host.trim();
    const loadingMessage = isRaspberryPiConn ? "Conectando a Raspberry Pi 4..." : `Conectando a ${host}...`;
    let unlistenSuccess: any = null;
    let unlistenError: any = null;
    let timeoutId: any = null;
    try {
      const { listen } = await import("@tauri-apps/api/event");
      const connectionPromise = new Promise<{ id: string; label: string }>((resolve, reject) => {
        listen<any>("ssh_connected", event => {
          if (event.payload?.id && !abortController.signal.aborted) {
            const label = `${user}@${displayName}`;
            if (onConnectionSuccess) {
              onConnectionSuccess({
                host: host.trim(),
                port: safePort,
                user: user.trim()
              } as any);
            }
            resolve({ id: event.payload.id, label });
          }
        })
          .then(unlisten => {
            unlistenSuccess = unlisten;
          })
          .catch(reject);
        listen<any>("ssh_connect_error", event => {
          if (event.payload?.id && !abortController.signal.aborted) {
            reject(new Error(event.payload.error || "Error conectando"));
          }
        })
          .then(unlisten => {
            unlistenError = unlisten;
          })
          .catch(reject);
      });
      setLoading(true, loadingMessage, cancelConnection);
      timeoutId = setTimeout(() => {
        if (!abortController.signal.aborted) {
          abortController.abort();
          if (unlistenSuccess) unlistenSuccess();
          if (unlistenError) unlistenError();
          setLoading(false, null, null);
          setConnectionAbortController(null);
          push({ type: "error", message: "Tiempo de espera agotado (30s)" });
        }
      }, 30000);
      await new Promise(resolve => setTimeout(resolve, 100));
      const id = await invoke<string>("ssh_connect", {
        host: host.trim(),
        port: safePort,
        user: user.trim(),
        password,
        cols: size.cols,
        rows: size.rows
      });
      if (abortController.signal.aborted) {
        if (timeoutId) clearTimeout(timeoutId);
        if (unlistenSuccess) unlistenSuccess();
        if (unlistenError) unlistenError();
        return;
      }
      const result = await connectionPromise;
      if (timeoutId) clearTimeout(timeoutId);
      if (unlistenSuccess) unlistenSuccess();
      if (unlistenError) unlistenError();
      onConnected(result);
      push({ type: "success", message: `Conectado a ${displayName}` });
      setLoading(false, null, null);
      setConnectionAbortController(null);
    } catch (e: any) {
      if (timeoutId) clearTimeout(timeoutId);
      if (unlistenSuccess) unlistenSuccess();
      if (unlistenError) unlistenError();
      if (!abortController.signal.aborted) {
        const errorMessage = e?.message || e?.toString?.() || "Error conectando";
        push({ type: "error", message: errorMessage });
        setLoading(false, null, null);
        setConnectionAbortController(null);
      }
    }
  };

  const handleSaveHost = async (name: string) => {
    if (!validateForm()) {
      push({ type: "error", message: "Corrige los errores antes de guardar" });
      return;
    }
    const parsedPort = parseInt(port.trim() || "22", 10);
    const safePort = parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 22;
    const newHostId = `${host.trim()}:${safePort}:${user.trim()}`;
    try {
      const { saveHostWithMaster, deleteHostFile } = await import("../api/storage");
      const payload = {
        host: host.trim(),
        port: safePort,
        user: user.trim(),
        password,
        name: name.trim() || undefined
      };
      if (isEditMode && originalHostFile && originalHostFile !== newHostId) {
        try {
          await deleteHostFile(originalHostFile);
        } catch {
        }
      }
      await saveHostWithMaster(newHostId, payload as any);
      setSaveModalOpen(false);
      setSuccessAlertMessage(isEditMode ? "Host editado correctamente" : "Host guardado correctamente");
      setSuccessAlertOpen(true);
      if (isEditMode) {
        setIsEditMode(false);
        setOriginalHostFile(null);
      }
    } catch (e: any) {
      push({ type: "error", message: "Error guardando host" });
    }
  };

  const clearForm = useCallback(() => {
    setHost("");
    setPort("22");
    setUser("");
    setPassword("");
    setShowPassword(false);
    setErrors({});
    setIsEditMode(false);
    setOriginalHostFile(null);
    if (onQuickHostCleared) onQuickHostCleared();
  }, [onQuickHostCleared]);

  const isValid = useMemo(
    () =>
      !errors.host &&
      !errors.port &&
      !errors.user &&
      !errors.password &&
      host.trim() &&
      user.trim() &&
      password.trim(),
    [errors, host, user, password]
  );

  return {
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
  };
}

