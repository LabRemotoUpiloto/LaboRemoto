// features/chat/panel/lectoresDocumento.ts — pdfjs y mammoth, para sacar el texto de un PDF o un Word adjunto en el chat. Pesan
// unos 2 MB: no van en el arranque, se cargan aparte (cargarLectores en app/diferidos.ts).
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export { mammoth, pdfjsLib };
