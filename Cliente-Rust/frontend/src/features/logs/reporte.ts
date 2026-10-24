// features/logs/reporte.ts — PDF con los comandos de una sesión (desde la lista y desde el registro abierto).
import { invoke } from '@tauri-apps/api/core';
import { buildCommandsReportHtml } from './commandParser';
import { extractSessionCommands } from './session.service';
import type { SessionLog } from './sesiones';

/** Arma el reporte, lo guarda junto al registro y devuelve la ruta del archivo. */
export async function guardarReporteComandos(session: SessionLog): Promise<string> {
  const comandos = await extractSessionCommands(session.id);
  const contenedor = document.createElement('div');
  contenedor.innerHTML = buildCommandsReportHtml(comandos, {
    sessionId: session.id,
    user: session.user,
    host: session.host,
    startTime: session.startedAt,
    endTime: session.endedAt,
  });
  // html2pdf (con html2canvas y jsPDF) pesa cerca de 2 MB: se carga solo al generar un reporte
  const { default: html2pdf } = await import('html2pdf.js');
  const base64 = await html2pdf().set({
    margin: 10,
    filename: `Commands_Report_${session.host}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    // el reporte es blanco: con otro fondo, los márgenes salían oscuros
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 1000 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
  }).from(contenedor).outputPdf('datauristring');
  return invoke<string>('save_pdf_base64', { sessionLogId: session.id, base64Data: base64 });
}
