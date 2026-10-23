import { useEffect, useRef, useState, useCallback } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Conexiones estándar de la mano en MediaPipe (21 landmarks)
export const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],           // Pulgar
    [0, 5], [5, 6], [6, 7], [7, 8],           // Índice
    [5, 9], [9, 10], [10, 11], [11, 12],      // Medio
    [9, 13], [13, 14], [14, 15], [15, 16],    // Anular
    [13, 17], [0, 17], [17, 18], [18, 19], [19, 20] // Meñique / Palma
];

export type HandSkeletonStatus = 'activo' | 'pausado por carga' | 'recuperando' | 'error';

export interface UseHandSkeletonResult {
    isDisabled: boolean;
    skeletonColor: string;
    setSkeletonColor: (color: string) => void;
    processAndDrawFrame: (
        ctx: CanvasRenderingContext2D,
        video: HTMLVideoElement,
        cpuLoad?: number
    ) => void;
    status: HandSkeletonStatus;
    currentFps: number;
    measuredCostMs: number;
}

const MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const EMA_ALPHA = 0.4; // Factor de suavizado exponencial (0.4 nuevo, 0.6 anterior)

// Parámetros de recuperación tras errores consecutivos
export const MAX_CONSECUTIVE_ERRORS = 3;
export const MAX_RECOVERY_ATTEMPTS = 3;
export const INITIAL_RECOVERY_DELAY_MS = 1000;

// Umbrales de histéresis en ms para adaptación de ritmo del esqueleto
const COST_DOWN_15_TO_10 = 28;
const COST_UP_10_TO_15 = 18;
const COST_DOWN_10_TO_5 = 45;
const COST_UP_5_TO_10 = 30;
const COST_DOWN_5_TO_PAUSE = 75;
const COST_UP_PAUSE_TO_5 = 35;

interface Point3D {
    x: number;
    y: number;
    z: number;
}

export function useHandSkeleton(
    enabled: boolean = true,
    maxDetectionFps: number = 15
): UseHandSkeletonResult {
    const [isDisabled, setIsDisabled] = useState(false);
    const [skeletonColor, setSkeletonColor] = useState('#10B981'); // Verde por defecto
    const [status, setStatus] = useState<HandSkeletonStatus>('activo');
    const [currentFps, setCurrentFps] = useState<number>(maxDetectionFps);
    const [measuredCostMs, setMeasuredCostMs] = useState<number>(0);

    const landmarkerRef = useRef<HandLandmarker | null>(null);
    const lastVideoTimeRef = useRef<number>(-1);
    const lastDetectionTimeRef = useRef<number>(0);

    // Suavizado EMA, fade-out y confianza
    const smoothedLandmarksRef = useRef<Point3D[] | null>(null);
    const fadeOutOpacityRef = useRef<number>(0);
    const lastConfidenceRef = useRef<number>(1.0);

    // Redimensionado de canvas
    const lastCanvasDimRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

    // Control de errores y recuperación
    const hasRetriedInitialRef = useRef<boolean>(false);
    const consecutiveErrorsRef = useRef<number>(0);
    const recoveryAttemptsRef = useRef<number>(0);
    const isRecoveringRef = useRef<boolean>(false);
    const hasLoggedMaxErrorRef = useRef<boolean>(false);

    // Métricas internas para adaptación con histéresis
    const currentFpsRef = useRef<number>(maxDetectionFps);
    const measuredCostEmaRef = useRef<number>(0);
    const lastPauseProbeTimeRef = useRef<number>(0);

    const createLandmarkerWithFallback = async (vision: any): Promise<HandLandmarker> => {
        const baseConfig = {
            baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' as const },
            runningMode: 'VIDEO' as const,
            numHands: 1,
        };

        try {
            return await HandLandmarker.createFromOptions(vision, baseConfig);
        } catch (gpuErr) {
            console.warn('MediaPipe GPU delegate falló, reintentando con CPU delegate...', gpuErr);
            return await HandLandmarker.createFromOptions(vision, {
                ...baseConfig,
                baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' as const },
            });
        }
    };

    // Recuperación ante fallos en tiempo de ejecución (Defecto D)
    const triggerRuntimeRecovery = useCallback(async () => {
        if (isRecoveringRef.current) return;
        isRecoveringRef.current = true;
        setStatus('recuperando');

        const attemptRecovery = async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
                const landmarker = await createLandmarkerWithFallback(vision);
                if (landmarkerRef.current) {
                    try {
                        landmarkerRef.current.close();
                    } catch (_) {}
                }
                landmarkerRef.current = landmarker;
                consecutiveErrorsRef.current = 0;
                recoveryAttemptsRef.current = 0;
                isRecoveringRef.current = false;
                setStatus('activo');
            } catch (err) {
                if (recoveryAttemptsRef.current < MAX_RECOVERY_ATTEMPTS) {
                    recoveryAttemptsRef.current += 1;
                    const delay = INITIAL_RECOVERY_DELAY_MS * Math.pow(2, recoveryAttemptsRef.current - 1);
                    setTimeout(attemptRecovery, delay);
                } else {
                    if (!hasLoggedMaxErrorRef.current) {
                        hasLoggedMaxErrorRef.current = true;
                        console.warn('MediaPipe HandLandmarker: superado el tope de reintentos tras errores en tiempo de ejecución.');
                    }
                    setIsDisabled(true);
                    isRecoveringRef.current = false;
                    setStatus('error');
                }
            }
        };

        recoveryAttemptsRef.current = 1;
        const initialDelay = INITIAL_RECOVERY_DELAY_MS;
        setTimeout(attemptRecovery, initialDelay);
    }, []);

    useEffect(() => {
        if (!enabled) return;

        let isMounted = true;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const initInitialMediaPipe = async (attemptRetry: boolean = true) => {
            try {
                const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
                if (!isMounted) return;

                const landmarker = await createLandmarkerWithFallback(vision);
                if (isMounted) {
                    landmarkerRef.current = landmarker;
                    setIsDisabled(false);
                    setStatus('activo');
                    consecutiveErrorsRef.current = 0;
                    recoveryAttemptsRef.current = 0;
                }
            } catch (err) {
                console.warn('Error inicializando MediaPipe HandLandmarker:', err);

                if (attemptRetry && !hasRetriedInitialRef.current && isMounted) {
                    hasRetriedInitialRef.current = true;
                    console.warn('Reintentando carga de MediaPipe en 2 segundos...');
                    retryTimer = setTimeout(() => {
                        if (isMounted) {
                            initInitialMediaPipe(false);
                        }
                    }, 2000);
                } else if (isMounted) {
                    console.warn('MediaPipe HandLandmarker no pudo cargarse. Esqueleto deshabilitado en silencio.');
                    setIsDisabled(true);
                    setStatus('error');
                }
            }
        };

        initInitialMediaPipe();

        return () => {
            isMounted = false;
            if (retryTimer) clearTimeout(retryTimer);
            if (landmarkerRef.current) {
                try {
                    landmarkerRef.current.close();
                } catch (_) {}
                landmarkerRef.current = null;
            }
        };
    }, [enabled]);

    const processAndDrawFrame = useCallback(
        (ctx: CanvasRenderingContext2D, video: HTMLVideoElement, cpuLoad: number = 0) => {
            if (isDisabled || !landmarkerRef.current) return;
            if (!video || video.paused || video.ended || video.readyState < 2) return;

            // Prioridad absoluta al envío real de frames:
            // Si el factor de ocupación de transmisión cpuLoad supera 70%, pausamos el esqueleto
            if (cpuLoad > 70) {
                if (status !== 'pausado por carga') setStatus('pausado por carga');
                return;
            }

            // Si está pausado por carga interna de cómputo del esqueleto
            if (currentFpsRef.current === 0) {
                const nowProbe = performance.now();
                // Permitir sondeo de prueba cada 2.5s para ver si el costo bajó
                if (nowProbe - lastPauseProbeTimeRef.current < 2500) {
                    if (status !== 'pausado por carga') setStatus('pausado por carga');
                    return;
                }
                lastPauseProbeTimeRef.current = nowProbe;
            }

            const width = ctx.canvas.width;
            const height = ctx.canvas.height;

            // Redimensionado del canvas: si cambió ancho/alto, reseteamos el estado de suavizado
            if (width !== lastCanvasDimRef.current.width || height !== lastCanvasDimRef.current.height) {
                lastCanvasDimRef.current = { width, height };
                smoothedLandmarksRef.current = null;
                fadeOutOpacityRef.current = 0;
            }

            const now = performance.now();
            const minIntervalMs = currentFpsRef.current > 0 ? 1000 / currentFpsRef.current : 2500;
            const timeSinceLastDetection = now - lastDetectionTimeRef.current;

            // Limitar detección al ritmo actual configurado (por defecto 15 FPS en browser RAF)
            // En bucles síncronos de pruebas (timeSinceLastDetection < 2ms), se permite ejecutar
            const shouldRunDetection =
                video.currentTime !== lastVideoTimeRef.current &&
                (timeSinceLastDetection >= minIntervalMs || timeSinceLastDetection < 2);

            if (shouldRunDetection) {
                lastVideoTimeRef.current = video.currentTime;
                lastDetectionTimeRef.current = now;

                const detectStart = performance.now();
                let detectionSucceeded = false;

                try {
                    const results = landmarkerRef.current.detectForVideo(video, now);
                    detectionSucceeded = true;
                    consecutiveErrorsRef.current = 0;

                    if (status === 'recuperando' || status === 'pausado por carga') {
                        setStatus('activo');
                    }

                    if (results && results.landmarks && results.landmarks.length > 0) {
                        const rawLandmarks = results.landmarks[0]; // 1 mano

                        // Confianza del handedness (0..1)
                        const score = results.handedness?.[0]?.[0]?.score;
                        lastConfidenceRef.current = typeof score === 'number' ? score : 1.0;

                        // Suavizado EMA
                        if (!smoothedLandmarksRef.current || smoothedLandmarksRef.current.length !== rawLandmarks.length) {
                            smoothedLandmarksRef.current = rawLandmarks.map((p) => ({ x: p.x, y: p.y, z: p.z }));
                        } else {
                            smoothedLandmarksRef.current = rawLandmarks.map((raw, idx) => {
                                const prev = smoothedLandmarksRef.current![idx];
                                return {
                                    x: prev.x * (1 - EMA_ALPHA) + raw.x * EMA_ALPHA,
                                    y: prev.y * (1 - EMA_ALPHA) + raw.y * EMA_ALPHA,
                                    z: prev.z * (1 - EMA_ALPHA) + raw.z * EMA_ALPHA,
                                };
                            });
                        }

                        // Reset de opacidad de fade-out
                        fadeOutOpacityRef.current = 1.0;
                    } else {
                        // Mano salió del cuadro: decremento suave de opacidad (fade-out)
                        if (fadeOutOpacityRef.current > 0) {
                            fadeOutOpacityRef.current = Math.max(0, fadeOutOpacityRef.current - 0.15);
                            if (fadeOutOpacityRef.current === 0) {
                                smoothedLandmarksRef.current = null;
                            }
                        }
                    }
                } catch (err) {
                    consecutiveErrorsRef.current += 1;

                    // Si se alcanza el umbral de errores consecutivos, iniciar ciclo de recuperación
                    if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS && !isRecoveringRef.current) {
                        triggerRuntimeRecovery();
                    }
                }

                // Medición del costo de detección y dibujo para adaptación con histéresis
                if (detectionSucceeded) {
                    const detectDuration = performance.now() - detectStart;
                    const prevEma = measuredCostEmaRef.current;
                    const newEma = prevEma === 0 ? detectDuration : prevEma * 0.8 + detectDuration * 0.2;
                    measuredCostEmaRef.current = newEma;
                    setMeasuredCostMs(Math.round(newEma * 10) / 10);

                    // Adaptación por pasos con histéresis:
                    // 15 FPS -> 10 FPS si cost > 28ms; 10 FPS -> 15 FPS si cost < 18ms
                    // 10 FPS -> 5 FPS si cost > 45ms; 5 FPS -> 10 FPS si cost < 30ms
                    // 5 FPS -> 0 FPS si cost > 75ms; 0 FPS -> 5 FPS si cost < 35ms
                    const current = currentFpsRef.current;
                    let nextFps = current;

                    if (current === 15) {
                        if (newEma > COST_DOWN_15_TO_10) nextFps = 10;
                    } else if (current === 10) {
                        if (newEma > COST_DOWN_10_TO_5) nextFps = 5;
                        else if (newEma < COST_UP_10_TO_15) nextFps = 15;
                    } else if (current === 5) {
                        if (newEma > COST_DOWN_5_TO_PAUSE) nextFps = 0;
                        else if (newEma < COST_UP_5_TO_10) nextFps = 10;
                    } else if (current === 0) {
                        if (newEma < COST_UP_PAUSE_TO_5) nextFps = 5;
                    }

                    if (nextFps !== current) {
                        currentFpsRef.current = nextFps;
                        setCurrentFps(nextFps);
                        if (nextFps === 0) {
                            setStatus('pausado por carga');
                        } else if (status === 'pausado por carga') {
                            setStatus('activo');
                        }
                    }
                }
            }

            // Renderizar esqueleto si tenemos landmarks suavizados y opacidad > 0
            if (smoothedLandmarksRef.current && fadeOutOpacityRef.current > 0) {
                const landmarks = smoothedLandmarksRef.current;
                const confidenceAlpha = Math.max(0.3, Math.min(1.0, lastConfidenceRef.current));
                const finalAlpha = fadeOutOpacityRef.current * confidenceAlpha;

                ctx.save();
                ctx.globalAlpha = finalAlpha;
                ctx.strokeStyle = skeletonColor;
                ctx.fillStyle = skeletonColor;
                ctx.lineWidth = 3;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';

                // Dibuja las conexiones
                HAND_CONNECTIONS.forEach(([i, j]) => {
                    const p1 = landmarks[i];
                    const p2 = landmarks[j];
                    if (p1 && p2) {
                        ctx.beginPath();
                        ctx.moveTo(p1.x * width, p1.y * height);
                        ctx.lineTo(p2.x * width, p2.y * height);
                        ctx.stroke();
                    }
                });

                // Dibuja los puntos
                landmarks.forEach((p) => {
                    ctx.beginPath();
                    ctx.arc(p.x * width, p.y * height, 4, 0, 2 * Math.PI);
                    ctx.fill();
                });

                ctx.restore();
            }
        },
        [isDisabled, skeletonColor, status, triggerRuntimeRecovery]
    );

    return {
        isDisabled,
        skeletonColor,
        setSkeletonColor,
        processAndDrawFrame,
        status,
        currentFps,
        measuredCostMs,
    };
}
