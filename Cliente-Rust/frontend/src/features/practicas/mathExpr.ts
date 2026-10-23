/**
 * Evaluador de fórmulas aritméticas para los bloques interactivos de los
 * módulos (`calculator`): el módulo trae la fórmula como texto en el JSON de la
 * API, así que NUNCA se usa `eval`/`Function`: es un analizador recursivo
 * descendente que solo conoce números, variables, `pi`, + - * / ^, paréntesis
 * y unas pocas funciones.
 *
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/') unary)*
 *   unary   := '-' unary | power
 *   power   := primary ('^' unary)?
 *   primary := número | variable | función '(' args ')' | '(' expr ')'
 */

export type MathVars = Record<string, number>;

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sign: Math.sign,
  min: Math.min,
  max: Math.max,
};

const CONSTANTS: MathVars = { pi: Math.PI };

type Token =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' | '(' | ')' | ',' };

const MAX_LENGTH = 300;

function tokenize(src: string): Token[] {
  if (src.length > MAX_LENGTH) throw new Error('fórmula demasiado larga');
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const text = src.slice(i, j);
      if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) throw new Error(`número inválido: ${text}`);
      out.push({ t: 'num', v: Number(text) });
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j) });
      i = j;
    } else if ('+-*/^(),'.includes(c)) {
      out.push({ t: 'op', v: c as '+' });
      i++;
    } else {
      throw new Error(`carácter no permitido: ${c}`);
    }
  }
  return out;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[], private vars: MathVars) {}

  parse(): number {
    const v = this.expr();
    if (this.pos < this.tokens.length) throw new Error('sobra texto al final de la fórmula');
    return v;
  }

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private isOp(v: string): boolean {
    const t = this.peek();
    return !!t && t.t === 'op' && t.v === v;
  }
  private take(v: string) {
    if (!this.isOp(v)) throw new Error(`se esperaba "${v}"`);
    this.pos++;
  }

  private expr(): number {
    let v = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.tokens[this.pos++] as { v: string }).v;
      const r = this.term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  private term(): number {
    let v = this.unary();
    while (this.isOp('*') || this.isOp('/')) {
      const op = (this.tokens[this.pos++] as { v: string }).v;
      const r = this.unary();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }

  private unary(): number {
    if (this.isOp('-')) { this.pos++; return -this.unary(); }
    return this.power();
  }

  private power(): number {
    const base = this.primary();
    if (this.isOp('^')) { this.pos++; return Math.pow(base, this.unary()); }
    return base;
  }

  private primary(): number {
    const t = this.peek();
    if (!t) throw new Error('la fórmula termina antes de tiempo');
    if (t.t === 'num') { this.pos++; return t.v; }
    if (t.t === 'id') {
      this.pos++;
      if (this.isOp('(')) {
        const fn = FUNCTIONS[t.v];
        if (!fn) throw new Error(`función desconocida: ${t.v}`);
        this.take('(');
        const args: number[] = [];
        if (!this.isOp(')')) {
          args.push(this.expr());
          while (this.isOp(',')) { this.pos++; args.push(this.expr()); }
        }
        this.take(')');
        return fn(...args);
      }
      if (Object.prototype.hasOwnProperty.call(this.vars, t.v)) return this.vars[t.v];
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, t.v)) return CONSTANTS[t.v];
      throw new Error(`variable desconocida: ${t.v}`);
    }
    if (t.t === 'op' && t.v === '(') {
      this.pos++;
      const v = this.expr();
      this.take(')');
      return v;
    }
    throw new Error(`token inesperado: ${t.v}`);
  }
}

/** Evalúa `src` con `vars`. Lanza `Error` si la fórmula es inválida. */
export function evaluateExpr(src: string, vars: MathVars = {}): number {
  return new Parser(tokenize(src), vars).parse();
}

/** Como `evaluateExpr`, pero devuelve `null` en vez de lanzar o dar un número no finito. */
export function tryEvaluateExpr(src: string, vars: MathVars = {}): number | null {
  try {
    const v = evaluateExpr(src, vars);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** Formatea un número con `decimals` decimales, con coma decimal (es-CO). */
export function formatNumber(v: number | null, decimals = 1): string {
  if (v === null) return '—';
  return v.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Reemplaza `{nombre}` en una plantilla; los nombres sin valor se dejan tal cual. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(values, k) ? values[k] : m,
  );
}
