import { Link } from "react-router-dom";
import type { ComponentType } from "react";

interface ButtonProps {
  to: string;
  label: string;
  Icon?: ComponentType<{ size?: number }>;
  variant?: "primary" | "ghost";
  className?: string;
}

export default function Button({ to, label, Icon, variant = "primary", className = "" }: ButtonProps) {
  if (variant === "ghost") {
    return (
      <Link
        to={to}
        className={`inline-flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-foreground tracking-widest uppercase transition-colors group ${className}`}
      >
        {label}
        {Icon && <Icon size={12} />}
      </Link>
    );
  }

  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2.5 px-6 py-3 bg-cyan text-background font-mono text-xs font-bold tracking-widest uppercase hover:bg-cyan-light transition-colors ${className}`}
    >
      {Icon && <Icon size={13} />}
      {label}
    </Link>
  );
}
