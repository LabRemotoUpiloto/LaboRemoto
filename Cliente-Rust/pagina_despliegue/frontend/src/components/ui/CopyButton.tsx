import { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="shrink-0 p-1 text-muted hover:text-cyan transition-colors"
      aria-label="Copiar"
    >
      {copied ? <Check size={12} className="text-cyan" /> : <Copy size={12} />}
    </button>
  );
}
