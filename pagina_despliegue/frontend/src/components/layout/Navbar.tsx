import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { label: "inicio", href: "/" },
    { label: "descargar", href: "/descargar" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/60">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo cluster */}
        <Link
          to="/"
          className="flex items-center gap-2.5 group"
        >
          <div className="flex items-center gap-1.5">
            <img
              src="/logo.jpeg"
              alt="Universidad Piloto"
              className="h-7 w-auto object-contain rounded-[4px] opacity-90 group-hover:opacity-100 transition-opacity"
            />
            <div className="w-px h-5 bg-white/15" />
            <img
              src="/abeja.jpeg"
              alt="Semillero IoT"
              className="h-7 w-auto object-contain mix-blend-screen opacity-90 group-hover:opacity-100 transition-opacity"
            />
          </div>
          <span className="font-mono text-sm font-bold tracking-[0.15em] uppercase text-foreground group-hover:text-white transition-colors">
            remote<span className="text-cyan">-lab</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`font-mono text-xs tracking-widest transition-colors ${
                location.pathname === link.href
                  ? "text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background animate-fade-in">
          <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setMobileOpen(false)}
                className={`px-0 py-3 font-mono text-xs tracking-widest border-b border-border/40 transition-colors ${
                  location.pathname === link.href
                    ? "text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
