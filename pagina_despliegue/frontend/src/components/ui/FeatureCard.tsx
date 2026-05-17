import type { ComponentType } from "react";

interface FeatureCardProps {
  Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  body: string;
}

export default function FeatureCard({ Icon, title, body }: FeatureCardProps) {
  return (
    <div className="feature-card bg-surface p-8 flex flex-col gap-5 hover:bg-surface-2 transition-colors duration-300 group">
      <div className="w-10 h-10 border border-border flex items-center justify-center transition-all duration-300">
        <Icon size={18} className="text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div>
        <h3 className="font-mono text-sm font-bold text-foreground mb-2">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
