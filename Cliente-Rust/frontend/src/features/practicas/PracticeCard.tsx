import React from 'react';
import './practiceCard.css';

interface PracticeCardProps {
    id: string;
    name: string;
    description: string;
    hasCamera: boolean;
    onStart: () => void;
    loading?: boolean;
    /** Ya la completó (tiene la insignia): la tarjeta invita a repetirla. */
    completada?: boolean;
    /** Una frase de qué vas a hacer, en palabras de alguien que empieza. */
    resumen?: string;
    /** Insignia ya resuelta para esta práctica puntual (ver
     * badges/insigniaRegistry.tsx) -- `null` si todavía no se ganó o la
     * práctica no tiene una propia. Se pinta como hermana de la tarjeta, para
     * que el sello sobresalga de la esquina sin quedar recortado. */
    badge?: React.ReactNode | null;
}

/**
 * Una práctica como ficha: número grande, duración, título y la acción como texto. La tarjeta entera es el botón
 * (no hay un botón lleno repetido en cada una) y cada práctica es independiente, sin orden obligatorio.
 */
const PracticeCard: React.FC<PracticeCardProps> = ({ name, description, hasCamera, onStart, loading = false, completada = false, resumen, badge = null }) => {
    // El backend compone la descripción como «Módulo X · ~Y min» (ver practicas.rs).
    const numero = /M[oó]dulo\s+(\d+)/i.exec(description)?.[1] ?? null;
    const minutos = /~?\s*(\d+)\s*min/i.exec(description)?.[1] ?? null;

    return (
        <div className="relative h-full">
            {badge}
            <button
                type="button"
                className={`ficha animate-reveal${completada ? ' ficha--completada' : ''}`}
                onClick={onStart}
                disabled={loading}
                data-tour="practica-iniciar"
                aria-label={`${completada ? 'Repetir' : 'Empezar'} ${name}`}
            >
                <span className="ficha-arriba">
                    {numero && <span className="ficha-numero">{numero.padStart(2, '0')}</span>}
                    <span className="ficha-datos">
                        {minutos && minutos !== '0' && <span>{minutos} min</span>}
                        {hasCamera && <span>con cámara</span>}
                    </span>
                </span>
                <span className="ficha-texto">
                    <span className="ficha-titulo">{name}</span>
                    {resumen && <span className="ficha-resumen">{resumen}</span>}
                </span>
                <span className="ficha-accion">
                    {loading
                        ? 'Preparando…'
                        : completada
                            ? <>Completada. <span className="ficha-enlace">Repetir</span></>
                            : <span className="ficha-enlace">Empezar práctica</span>}
                </span>
            </button>
        </div>
    );
};

export default PracticeCard;
