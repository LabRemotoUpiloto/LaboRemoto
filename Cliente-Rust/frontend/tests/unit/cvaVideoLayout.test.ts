// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
    computeLocalVideoBoxStyle,
    calculateEffectiveBoxDimensions,
} from '../../src/utils/cvaVideoLayout';

describe('cvaVideoLayout Utility', () => {
    describe('computeLocalVideoBoxStyle', () => {
        it('calculates maxWidth based on 4/3 aspect ratio and targetMaxHeight=480', () => {
            const style = computeLocalVideoBoxStyle(4 / 3, 480);
            expect(style.width).toBe('100%');
            expect(style.maxWidth).toBe('640px'); // 480 * (4/3) = 640
            expect(style.aspectRatio).toBe(`${4 / 3}`);
            expect(style.margin).toBe('0 auto');
            expect(style.position).toBe('relative');
        });

        it('calculates maxWidth based on 16/9 aspect ratio and targetMaxHeight=480', () => {
            const style = computeLocalVideoBoxStyle(16 / 9, 480);
            expect(style.maxWidth).toBe('853px'); // Math.round(480 * 1.7777...) = 853
            expect(style.aspectRatio).toBe(`${16 / 9}`);
        });

        it('falls back safely to 4/3 when aspect ratio is 0, NaN, or negative', () => {
            expect(computeLocalVideoBoxStyle(0).maxWidth).toBe('640px');
            expect(computeLocalVideoBoxStyle(NaN).maxWidth).toBe('640px');
            expect(computeLocalVideoBoxStyle(-1.5).maxWidth).toBe('640px');
        });
    });

    describe('calculateEffectiveBoxDimensions across multiple screen widths and aspect ratios', () => {
        const testWidths = [
            { name: 'Pantalla ultra ancha / completa (1920px)', width: 1920 },
            { name: 'Pantalla ancha (≥1600px)', width: 1600 },
            { name: 'Pantalla de portátil / ventana media (1200px)', width: 1200 },
            { name: 'Columna dividida en SimpleGrid (600px)', width: 600 },
            { name: 'Columna estrecha / móvil (360px)', width: 360 },
        ];

        const aspectRatios = [
            { name: '4:3 (cámara estándar)', ratio: 4 / 3 },
            { name: '16:9 (cámara panorámica HD/FHD)', ratio: 16 / 9 },
            { name: '1:1 (cuadrada)', ratio: 1 },
        ];

        testWidths.forEach(({ name: widthName, width }) => {
            aspectRatios.forEach(({ name: ratioName, ratio }) => {
                it(`conserva la proporción exacta para ${ratioName} en ${widthName}`, () => {
                    const result = calculateEffectiveBoxDimensions(width, ratio, 480);

                    // 1. La proporción resultante debe ser idéntica a la del sensor (tolerancia de punto flotante)
                    expect(result.ratio).toBeCloseTo(ratio, 4);

                    // 2. La altura nunca debe superar targetMaxHeight (480px)
                    expect(result.height).toBeLessThanOrEqual(480.01);
                    expect(result.heightExceeded).toBe(false);

                    // 3. El ancho nunca debe superar el ancho disponible
                    expect(result.width).toBeLessThanOrEqual(width);
                });
            });
        });
    });
});
