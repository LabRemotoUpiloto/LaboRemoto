/**
 * utils/cvaVideoLayout.ts
 *
 * Utilidades puras para el cálculo de dimensiones y estilos de los visores de video en CVA.
 * Asegura que el contenedor de la cámara local conserve estrictamente la proporción
 * intrínseca del sensor (videoWidth / videoHeight) sin recortar los bordes (evitando el
 * desalineamiento del esqueleto de MediaPipe) en cualquier resolución de pantalla o disposición de columnas.
 */

export interface CvaVideoContainerStyle {
    width: string;
    maxWidth: string;
    aspectRatio: string;
    position: 'relative';
    margin: string;
    overflow: 'hidden';
    borderRadius: string;
}

/**
 * Calcula los estilos CSS del contenedor del video local limitando por ANCHO
 * (maxWidth derivado de targetMaxHeight * aspectRatio) en lugar de recortar por maxHeight.
 */
export function computeLocalVideoBoxStyle(
    videoAspectRatio: number,
    targetMaxHeight: number = 480
): CvaVideoContainerStyle {
    const validAspectRatio = Number.isFinite(videoAspectRatio) && videoAspectRatio > 0
        ? videoAspectRatio
        : 4 / 3;

    // Límite por ancho calculado a partir de la altura objetivo:
    // maxWidth = round(targetMaxHeight * aspectRatio)
    // Al fijar aspectRatio sin maxHeight, la altura queda matemáticamente atada al ancho,
    // garantizando que nunca se produzca recorte vertical cuando la ventana es ancha.
    const maxWidthPx = Math.round(targetMaxHeight * validAspectRatio);

    return {
        width: '100%',
        maxWidth: `${maxWidthPx}px`,
        aspectRatio: `${validAspectRatio}`,
        position: 'relative',
        margin: '0 auto',
        overflow: 'hidden',
        borderRadius: 'var(--radius-sm)',
    };
}

/**
 * Función pura de simulación geométrica para pruebas automatizadas.
 * Calcula las dimensiones finales renderizadas (width x height) y la relación
 * de aspecto efectiva para cualquier ancho disponible de ventana y relación de aspecto de video.
 */
export function calculateEffectiveBoxDimensions(
    availableContainerWidth: number,
    videoAspectRatio: number,
    targetMaxHeight: number = 480
): { width: number; height: number; ratio: number; heightExceeded: boolean } {
    const validRatio = Number.isFinite(videoAspectRatio) && videoAspectRatio > 0
        ? videoAspectRatio
        : 4 / 3;
    const maxWidth = Math.round(targetMaxHeight * validRatio);
    const effectiveWidth = Math.min(availableContainerWidth, maxWidth);
    const effectiveHeight = effectiveWidth / validRatio;

    return {
        width: effectiveWidth,
        height: effectiveHeight,
        ratio: effectiveWidth / effectiveHeight,
        heightExceeded: effectiveHeight > targetMaxHeight + 0.5,
    };
}
