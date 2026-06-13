import type { Line } from "./types";

interface Props {
  line: Line;
}

export default function TerminalLine({ line }: Props) {
  return (
    <div className="leading-relaxed whitespace-pre-wrap break-all">
      {line.type === "cmd" && <span className="text-foreground">{line.text}</span>}
      {line.type === "info" && <span className="text-muted-foreground">{line.text}</span>}
      {line.type === "ok" && <span style={{ color: "#00d2be" }}>{line.text}</span>}
      {line.type === "err" && <span className="text-danger">{line.text}</span>}
      {line.type === "ascii" && (
        <span className="text-cyan/80" style={{ fontSize: "9px", lineHeight: 1.2 }}>
          {line.text}
        </span>
      )}
    </div>
  );
}
