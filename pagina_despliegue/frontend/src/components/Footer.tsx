import { Link } from "react-router-dom";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <Link
          to="/"
          className="font-mono text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground transition-colors"
        >
          cliente<span style={{ color: "#ce422b" }}>-rust</span>
        </Link>

        <div className="flex items-center gap-6 font-mono text-[11px] text-muted tracking-widest uppercase">
          <Link to="/" className="hover:text-muted-foreground transition-colors">inicio</Link>
          <Link to="/descargar" className="hover:text-muted-foreground transition-colors">descargar</Link>
        </div>

        <p className="font-mono text-[11px] text-muted tracking-widest">
          © {year} — Rust 🦀 — v1.0.0
        </p>
      </div>
    </footer>
  );
}
