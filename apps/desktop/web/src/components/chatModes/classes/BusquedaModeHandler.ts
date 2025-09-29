import { BaseModeHandler } from './BaseModeHandler';
import { ModeHandlerContext, Message } from '../types';

// --- Fuzzy helpers (similar enfoque a AnalisisModeHandler) ---
const SEARCH_BASE = [
  'buscar','busca','busqueda','búsqueda','encuentra','encontrar','localizar','hallar','find','search','grep'
];
const OPEN_BASE = [ 'abrir','abre','open','mostrar','muestra','ver' ];
const BLOCKED_INTENTS = [
  'crea','create','creame','generar','genera','analiza','analizar','resumir','resume','explica','explicame','editar','modifica','cambiar'
];

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^a-z0-9]/g,'');
}
function levenshtein(a:string,b:string):number { const m=a.length,n=b.length; if(!m) return n; if(!n) return m; const dp=Array.from({length:m+1},()=>new Array<number>(n+1)); for(let i=0;i<=m;i++) dp[i][0]=i; for(let j=0;j<=n;j++) dp[0][j]=j; for(let i=1;i<=m;i++){ for(let j=1;j<=n;j++){ const c=a[i-1]===b[j-1]?0:1; dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+c); } } return dp[m][n]; }
const SEARCH_N = SEARCH_BASE.map(normalize);
const OPEN_N = OPEN_BASE.map(normalize);
const BLOCKED_N = BLOCKED_INTENTS.map(normalize);

function fuzzyIn(tok: string, coll: string[], maxDist: number): boolean {
  const t = normalize(tok); if(!t) return false; if (coll.includes(t)) return true; return coll.some(v => levenshtein(t,v) <= maxDist);
}

const ONLY_SEARCH_MSG = 'Modo búsqueda: sólo peticiones para localizar o mostrar archivos. Ejemplos: "buscar main.py", "grep TODO", "abre src/index.ts"';

export class BusquedaModeHandler extends BaseModeHandler {
  help = 'Búsqueda: localizar archivos por nombre, contenido (grep) o abrir un archivo específico.';

  async send(finalInput: string, userMsg: Message, ctx: ModeHandlerContext) {
    const raw = finalInput.trim();
    const first = raw.split(/\s+/)[0] || '';

    // Bloqueo de intenciones ajenas
    if (fuzzyIn(first, BLOCKED_N, 1)) {
      ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: ONLY_SEARCH_MSG }]);
      return;
    }

    // Apertura directa: "abre foo.ts" / "open file.py"
    const openRe = /^(abrir|abre|open|ver|mostrar|muestra)\s+(.+)/i;
    let m: RegExpMatchArray | null;
    if ((m = raw.match(openRe))) {
      const path = (m[2]||'').split(/\s+/)[0];
      if (!path) {
        ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: 'Falta la ruta a abrir.' }]);
        return;
      }
      await ctx.invokeBusqueda({ finalInput: `abrir ${path}`, userMsg });
      return;
    }

    // Búsqueda nombre/contenido: primer token fuzzy en SEARCH_BASE o comando grep.
    if (fuzzyIn(first, SEARCH_N, 2)) {
      await ctx.invokeBusqueda({ finalInput: raw, userMsg });
      return;
    }

    // Atajo para grep si usuario escribe directamente patron.ext sin verbo
    const looksLikeFile = /\.[a-zA-Z0-9]{1,6}$/.test(raw) && raw.split(/\s+/).length === 1;
    if (looksLikeFile) {
      ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Escribe: buscar ${raw}` }]);
      return;
    }

    // Fallback estricto
    ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: ONLY_SEARCH_MSG }]);
  }
}
