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

export interface UseHandSkeletonResult {
    isDisabled: boolean;
    skeletonColor: string;
    setSkeletonColor: (color: string) => void;
    processAndDrawFrame: (
        ctx: CanvasRenderingContext2D,
        video: HTMLVideoElement,
        cpuLoad?: number
    ) => void;
}

const MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const EMA_ALPHA = 0.4; // Factor de suavizado exponencial (0.4 nuevo, 0.6 anterior)

interface Point3D {
    x: number;
    y: number;
    z: number;
}

export function useHandSkeleton(enabled: boolean = true): UseHandSkeletonResult {
    const [isDisabled, setIsDisabled] = useState(false);
    const [skeletonColor, setSkeletonColor] = useState('#10B981'); // Verde por defecto
    const landmarkerRef = useRef<HandLandmarker | null>(null);
    const lastVideoTimeRef = useRef<number>(-1);

    // Suavizado EMA, fade-out y confianza
    const smoothedLandmarksRef = useRef<Point3D[] | null>(null);
    const fadeOutOpacityRef = useRef<number>(0);
    const lastConfidenceRef = useRef<number>(1.0);

    // Redimensionado de canvas
    const lastCanvasDimRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

    // Control de reintento único
    const hasRetriedRef = useRef(false);

    useEffect(() => {
        if (!enabled) return;

        let isMounted = true;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const createLandmarkerWithFallback = async (vision: any): Promise<HandLandmarker> => {
            const baseConfig = {
                baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' as const },
                runningMode: 'VIDEO' as const,
                numHands: 1,
            };

            try {
                // Intentar GPU primero
                return await HandLandmarker.createFromOptions(vision, baseConfig);
            } catch (gpuErr) {
                console.warn('MediaPipe GPU delegate falló, reintentando con CPU delegate...', gpuErr);
                // Fallback a CPU
                return await HandLandmarker.createFromOptions(vision, {
                    ...baseConfig,
                    baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' as const },
                });
            }
        };

        const initMediaPipe = async (attemptRetry: boolean = true) => {
            try {
                const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
                if (!isMounted) return;

                const landmarker = await createLandmarkerWithFallback(vision);
                if (isMounted) {
                    landmarkerRef.current = landmarker;
                    setIsDisabled(false);
                }
            } catch (err) {
                console.warn('Error inicializando MediaPipe HandLandmarker:', err);

                if (attemptRetry && !hasRetriedRef.current && isMounted) {
                    hasRetriedRef.current = true;
                    console.warn('Reintentando carga de MediaPipe en 2 segundos...');
                    retryTimer = setTimeout(() => {
                        if (isMounted) {
                            initMediaPipe(false);
                        }
                    }, 2000);
                } else if (isMounted) {
                    console.warn('MediaPipe HandLandmarker no pudo cargarse. Esqueleto deshabilitado en silencio.');
                    setIsDisabled(true);
                }
            }
        };

        initMediaPipe();

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
            // 1. Autopausa por alta carga de CPU (>70%) o deshabilitado
            if (isDisabled || !landmarkerRef.current || cpuLoad > 70) return;
            if (!video || video.paused || video.ended || video.readyState < 2) return;

            try {
                const width = ctx.canvas.width;
                const height = ctx.canvas.height;

                // Redimensionado del canvas: si cambió ancho/alto, reseteamos el estado de suavizado
                if (width !== lastCanvasDimRef.current.width || height !== lastCanvasDimRef.current.height) {
                    lastCanvasDimRef.current = { width, height };
                    smoothedLandmarksRef.current = null;
                    fadeOutOpacityRef.current = 0;
                }

                const now = performance.now();

                // No repetir trabajo si el frame del video no ha avanzado
                if (video.currentTime !== lastVideoTimeRef.current) {
                    lastVideoTimeRef.current = video.currentTime;
                    const results = landmarkerRef.current.detectForVideo(video, now);

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
            } catch (err) {
                console.warn('Error en detección decorativa de MediaPipe:', err);
            }
        },
        [isDisabled, skeletonColor]
    );

    return { isDisabled, skeletonColor, setSkeletonColor, processAndDrawFrame };
}
