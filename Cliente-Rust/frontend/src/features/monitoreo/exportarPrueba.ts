// pages/rendimiento/exportarPrueba.ts — guarda la prueba como Excel (.xlsx) con el diálogo de «Guardar como».
import writeExcelFile from 'write-excel-file/browser';
import { invoke } from '@tauri-apps/api/core';
import type { MuestraPi } from './rendimiento.service';
import type { ResumenPrueba } from './rendimientoStats';
import { hojasDePrueba } from './hojasPrueba';

/** Devuelve la ruta donde quedó, o null si el usuario canceló. */
export async function guardarExcelDePrueba(muestras: MuestraPi[], resumen: ResumenPrueba): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await writeExcelFile(hojasDePrueba(muestras, resumen) as any).toBlob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const inicio = new Date(resumen.inicio * 1000);
  const nombre = `prueba-pi4-${inicio.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-')}`
    + `-${String(inicio.getHours()).padStart(2, '0')}h${String(inicio.getMinutes()).padStart(2, '0')}.xlsx`;
  try {
    return await invoke<string>('save_binary_file', { contenidoBase64: btoa(binario), defaultName: nombre });
  } catch (e: any) {
    if (String(e?.message ?? e).includes('cancelada')) return null;
    throw e;
  }
}
