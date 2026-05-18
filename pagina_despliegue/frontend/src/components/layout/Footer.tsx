import { useState } from "react";
import { Link } from "react-router-dom";

function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function LinkedInIcon({ size = 16 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function MailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function ObfuscatedEmail() {
  const [revealed, setRevealed] = useState(false);
  const emailBase64 = "Z29uemFsZXpnYXJ6b24xNEBob3RtYWlsLmNvbQ==";
  const email = atob(emailBase64);

  if (revealed) {
    return (
      <a
        href={`mailto:${email}`}
        className="inline-flex items-center gap-2 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <MailIcon size={14} />
        {email}
      </a>
    );
  }

  return (
    <button
      onClick={() => setRevealed(true)}
      className="inline-flex items-center gap-2 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <MailIcon size={14} />
      Mostrar email
    </button>
  );
}

const TEAM = [
  {
    name: "Felipe González",
    github: "https://github.com/FelipeGo18",
    linkedin: "https://www.linkedin.com/in/andres-felipe-gonzalez-garzon-1623a128b/",
  },
  {
    name: "Haider Cañón",
    github: "https://github.com/Haider2231",
  },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-8">
        {/* Main content */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-12">
          {/* Brand + logos — spans 5 cols */}
          <div className="md:col-span-5">
            <Link
              to="/"
              className="inline-flex items-center gap-2.5 group mb-5"
            >
              <div className="flex items-center gap-1.5">
                <img
                  src="/logo.jpeg"
                  alt="Universidad Piloto"
                  className="h-8 w-auto object-contain rounded-[4px] opacity-90 group-hover:opacity-100 transition-opacity"
                />
                <div className="w-px h-6 bg-white/15" />
                <img
                  src="/abeja.jpeg"
                  alt="Semillero IoT"
                  className="h-8 w-auto object-contain rounded-[4px] opacity-90 group-hover:opacity-100 transition-opacity"
                />
              </div>
              <span className="font-mono text-sm font-bold tracking-[0.15em] uppercase text-foreground group-hover:text-white transition-colors">
                remote<span className="text-cyan">-lab</span>
              </span>
            </Link>

            <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
              Proyecto desarrollado en el{" "}
              <span className="text-foreground font-medium">Semillero de IoT</span> de la{" "}
              <span className="text-foreground font-medium">Universidad Piloto de Colombia</span>.
            </p>
            <p className="mt-3 text-muted text-xs leading-relaxed max-w-sm">
              Laboratorios remotos para que el aprendizaje
              no dependa de un horario ni de un lugar.
            </p>
          </div>

          {/* Navigation — spans 3 cols */}
          <div className="md:col-span-3">
            <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-4">
              Navegación
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link
                  to="/"
                  className="font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Inicio
                </Link>
              </li>
              <li>
                <Link
                  to="/descargar"
                  className="font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Descargar
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact + Team — spans 4 cols */}
          <div className="md:col-span-4">
            <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-4">
              Contacto
            </p>
            <ObfuscatedEmail />

            <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-4 mt-6">
              Equipo
            </p>
            <ul className="space-y-3">
              {TEAM.map((person) => (
                <li key={person.name} className="flex items-center gap-3">
                  <span className="font-mono text-sm text-muted-foreground">
                    {person.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href={person.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted hover:text-foreground transition-colors"
                      aria-label={`GitHub de ${person.name}`}
                    >
                      <GitHubIcon size={14} />
                    </a>
                    {person.linkedin && (
                      <a
                        href={person.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted hover:text-foreground transition-colors"
                        aria-label={`LinkedIn de ${person.name}`}
                      >
                        <LinkedInIcon size={14} />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <img src="/logo.jpeg" alt="" className="h-5 w-auto object-contain rounded-sm opacity-40" />
            <img src="/abeja.jpeg" alt="" className="h-5 w-auto object-contain rounded-sm opacity-40" />
            <p className="font-mono text-[11px] text-muted">
              © {year} Remote Lab · Universidad Piloto de Colombia
            </p>
          </div>
          <p className="font-mono text-[11px] text-muted">
            Hecho con <span className="text-red-500">♥</span> en Bogotá
          </p>
        </div>
      </div>
    </footer>
  );
}
