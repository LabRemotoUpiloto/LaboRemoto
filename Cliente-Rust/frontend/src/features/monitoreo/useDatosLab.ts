// pages/rendimiento/useDatosLab.ts — lo que la página de Monitoreo pide en vivo: el informe de la Pi 4
// (cada 2 s, solo lo nuevo) y el estado de las cámaras según el broker (cada 10 s).
import { useEffect, useRef, useState } from 'react';
import { rendimientoPi, type InformePi, type MuestraPi } from './rendimiento.service';
import { camarasAdminService, type CamaraAdmin } from '@/features/camaras/camarasAdmin.service';
import { unirMuestras } from './rendimientoStats';

const SONDEO_PI_MS = 2000;
const SONDEO_CAMARAS_MS = 10000;

export interface DatosPi {
  informe: Omit<InformePi, 'muestras'> | null;
  muestras: MuestraPi[];
  ultima: MuestraPi | null;
  error: string | null;
}

export function useInformePi(): DatosPi {
  const [informe, setInforme] = useState<Omit<InformePi, 'muestras'> | null>(null);
  const [muestras, setMuestras] = useState<MuestraPi[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ultimoRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    let enVuelo = false;
    const pedir = async () => {
      if (enVuelo) return;
      enVuelo = true;
      try {
        const r = await rendimientoPi(ultimoRef.current);
        if (!vivo) return;
        const { muestras: nuevas, ...resto } = r;
        setInforme(resto);
        if (nuevas.length) {
          ultimoRef.current = nuevas[nuevas.length - 1].t;
          setMuestras((prev) => unirMuestras(prev, nuevas));
        }
        setError(null);
      } catch (e: any) {
        if (vivo) setError(e?.message ?? String(e));
      } finally {
        enVuelo = false;
      }
    };
    pedir();
    const id = window.setInterval(pedir, SONDEO_PI_MS);
    return () => { vivo = false; window.clearInterval(id); };
  }, []);

  return { informe, muestras, ultima: muestras.length ? muestras[muestras.length - 1] : null, error };
}

export interface DatosCamaras {
  camaras: CamaraAdmin[] | null;
  error: string | null;
}

export function useCamaras(): DatosCamaras {
  const [camaras, setCamaras] = useState<CamaraAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const pedir = async () => {
      try {
        const r = await camarasAdminService.listar();
        if (!vivo) return;
        setCamaras(r.camaras);
        setError(null);
      } catch (e: any) {
        if (vivo) setError(e?.message ?? String(e));
      }
    };
    pedir();
    const id = window.setInterval(pedir, SONDEO_CAMARAS_MS);
    return () => { vivo = false; window.clearInterval(id); };
  }, []);

  return { camaras, error };
}
