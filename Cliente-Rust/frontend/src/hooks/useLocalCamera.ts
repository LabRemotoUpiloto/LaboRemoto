import { useEffect, useRef, useState } from 'react';

export interface UseLocalCameraResult {
  stream: MediaStream | null;
  active: boolean;
  error: string | null;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  setSelectedDeviceId: (id: string | null) => void;
  startCamera: () => Promise<MediaStream | null>;
  stopCamera: () => void;
}

export function useLocalCamera(): UseLocalCameraResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cargar lista de dispositivos de videoinput disponibles
  const updateDevicesList = async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter((device) => device.kind === 'videoinput');
      setDevices(videoDevices);
      
      // Auto-seleccionar primer dispositivo si no hay ninguno seleccionado
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.warn('Error enumerando dispositivos de video:', err);
    }
  };

  useEffect(() => {
    // Escuchar cambios en la conexión de dispositivos
    navigator.mediaDevices.addEventListener('devicechange', updateDevicesList);
    updateDevicesList();

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', updateDevicesList);
    };
  }, [selectedDeviceId]);

  const startCamera = async (): Promise<MediaStream | null> => {
    setError(null);

    // Confirmar secure context para Tauri / Webview
    if (!window.isSecureContext) {
      console.warn('Tauri webview is not running in a secure context! getUserMedia may be blocked.');
    }

    try {
      // Detener cualquier stream previo
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Restricciones de captura con rango (min/ideal/max)
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          width: { min: 320, ideal: 640, max: 1280 },
          height: { min: 240, ideal: 480, max: 720 },
          frameRate: { min: 5, ideal: 15, max: 30 }
        },
        audio: false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Registrar listener para detección de desconexión física de la cámara (track.onended)
      mediaStream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          console.warn('Detección de corte de cámara: track.onended disparado.');
          stopCamera();
          setError('Se perdió la conexión con la cámara web. Por favor, vuelve a conectarla o selecciona otro dispositivo.');
        };
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setActive(true);
      return mediaStream;
    } catch (err: any) {
      let errMsg = 'No se pudo acceder a la cámara';
      const name = err?.name || '';
      
      // P5: Distinguir cámara ocupada de permiso denegado
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        errMsg = 'La cámara está siendo utilizada por otra aplicación. Por favor, ciérrala e inténtalo de nuevo.';
      } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        errMsg = 'Permiso denegado: Por favor, permite el acceso a la cámara en tu navegador o sistema operativo.';
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        errMsg = 'No se detectó ninguna cámara conectada a este dispositivo.';
      } else if (err?.message) {
        errMsg = err.message;
      }
      
      setError(errMsg);
      setActive(false);
      setStream(null);
      return null;
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        // Remover listener para evitar triggers duplicados al apagar manualmente
        track.onended = null;
        track.stop();
      });
      streamRef.current = null;
    }
    setStream(null);
    setActive(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
      }
    };
  }, []);

  return {
    stream,
    active,
    error,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    startCamera,
    stopCamera
  };
}
