import type { ComponentType } from "react";

interface FeatureCardProps {
  Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  body: string;
}

export default function FeatureCard({ Icon, title, body }: FeatureCardProps) {
  return (
    <div className="feature-card relative bg-surface border border-border p-5 flex flex-col gap-3">
      <div className="w-8 h-8 border border-border flex items-center justify-center">
        <Icon size={14} className="text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div>
        <h3 className="font-mono text-[13px] font-bold text-foreground mb-1.5">{title}</h3>
        <p className="text-muted-foreground text-xs leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
