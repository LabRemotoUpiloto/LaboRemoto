export default function TerminalTitleBar() {
  return (
    <div className="flex items-center px-4 py-1.5 border-b border-border bg-surface-2">
      <span className="text-muted-foreground text-[10px] tracking-wide">
        student@remote-lab: ~/physics-lab-01
      </span>
      <div className="ml-auto flex items-center gap-2 text-muted text-[10px]">
        <span className="hover:text-foreground cursor-default">─</span>
        <span className="hover:text-foreground cursor-default">□</span>
        <span className="hover:text-danger cursor-default">✕</span>
      </div>
    </div>
  );
}
