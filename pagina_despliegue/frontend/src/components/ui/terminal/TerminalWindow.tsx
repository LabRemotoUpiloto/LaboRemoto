import { useTerminal } from "./useTerminal";
import TerminalTitleBar from "./TerminalTitleBar";
import TerminalLine from "./TerminalLine";

export default function TerminalWindow() {
  const {
    history,
    input,
    setInput,
    introDone,
    bodyRef,
    inputRef,
    handleKeyDown,
    focusInput,
    handleWheel,
  } = useTerminal();

  return (
    <div
      className="w-full max-w-lg border border-border bg-surface font-mono text-xs select-none"
      onClick={focusInput}
    >
      <TerminalTitleBar />

      <div
        ref={bodyRef}
        className="terminal-body p-4 space-y-1 min-h-[220px] max-h-[340px] overflow-y-scroll overscroll-contain"
        onWheel={handleWheel}
      >
        {history.map((line, i) => (
          <TerminalLine key={i} line={line} />
        ))}

        {introDone && (
          <div className="flex items-center gap-1">
            <span className="text-foreground shrink-0">$</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent outline-none text-foreground caret-cyan"
              spellCheck={false}
              autoComplete="off"
              autoFocus
            />
          </div>
        )}

        {!introDone && (
          <span className="inline-block w-2 h-4 bg-cyan/80 animate-blink" />
        )}
      </div>
    </div>
  );
}
