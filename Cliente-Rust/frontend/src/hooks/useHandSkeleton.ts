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

export function useHandSkeleton(enabled: boolean = true): UseHandSkeletonResult {
    const [isDisabled, setIsDisabled] = useState(false);
    const [skeletonColor, setSkeletonColor] = useState('#10B981'); // Verde por defecto (tema)
    const landmarkerRef = useRef<HandLandmarker | null>(null);
    const lastVideoTimeRef = useRef<number>(-1);

    useEffect(() => {
        if (!enabled) return;

        let isMounted = true;

        const initMediaPipe = async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
                );

                if (!isMounted) return;

                const landmarker = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                        delegate: 'GPU',
                    },
                    runningMode: 'VIDEO',
                    numHands: 1, // Restringido estrictamente a 1 sola mano (AC9)
                });

                if (isMounted) {
                    landmarkerRef.current = landmarker;
                    setIsDisabled(false);
                }
            } catch (err) {
                // Degradación en silencio si falla CDN, red o WASM (AC9 / spec §4)
                console.warn('MediaPipe HandLandmarker no pudo cargarse. Esqueleto decorativo desactivado en silencio.', err);
                if (isMounted) {
                    setIsDisabled(true);
                }
            }
        };

        initMediaPipe();

        return () => {
            isMounted = false;
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
            // 1. Desactivación o autopausa por alta carga de CPU (>70%) (Principio 8 / AC10)
            if (isDisabled || !landmarkerRef.current || cpuLoad > 70) return;
            if (!video || video.paused || video.ended || video.readyState < 2) return;

            try {
                const now = performance.now();
                if (video.currentTime !== lastVideoTimeRef.current) {
                    lastVideoTimeRef.current = video.currentTime;
                    const results = landmarkerRef.current.detectForVideo(video, now);

                    if (results.landmarks && results.landmarks.length > 0) {
                        const landmarks = results.landmarks[0]; // Solo 1 mano

                        // Ancho y alto del canvas para escalar puntos normalizados (0..1)
                        const width = ctx.canvas.width;
                        const height = ctx.canvas.height;

                        ctx.save();
                        ctx.strokeStyle = skeletonColor;
                        ctx.fillStyle = skeletonColor;
                        ctx.lineWidth = 3;
                        ctx.lineJoin = 'round';
                        ctx.lineCap = 'round';

                        // Dibuja las conexiones (líneas del esqueleto)
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

                        // Dibuja los articulaciones (puntos)
                        landmarks.forEach((p) => {
                            ctx.beginPath();
                            ctx.arc(p.x * width, p.y * height, 4, 0, 2 * Math.PI);
                            ctx.fill();
                        });

                        ctx.restore();
                    }
                }
            } catch (err) {
                // Si falla runtime, no bloquear la aplicación ni el muestreo real
                console.warn('Error en detección decorativa de MediaPipe:', err);
            }
        },
        [isDisabled, skeletonColor]
    );

    return { isDisabled, skeletonColor, setSkeletonColor, processAndDrawFrame };
}
