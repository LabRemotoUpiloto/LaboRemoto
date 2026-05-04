import React, { useMemo } from 'react';

interface FileNavigationBarProps {
  rootLabel: string;
  path: string;
  onNavigate: (path: string) => void;
  prefix?: string;
}

interface Crumb {
  name: string;
  full: string;
}

const FileNavigationBar: React.FC<FileNavigationBarProps> = ({
  rootLabel,
  path,
  onNavigate,
  prefix,
}) => {
  const segments = useMemo(() => {
    const normalized = path.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    let accumulated = prefix ?? (normalized.startsWith('/') ? '/' : '');
    const crumbs: Crumb[] = [];

    if (accumulated === '/') {
      crumbs.push({ name: '/', full: '/' });
    }

    for (const part of parts) {
      accumulated = accumulated
        ? accumulated.endsWith('/')
          ? accumulated + part
          : accumulated + '/' + part
        : part;
      crumbs.push({ name: part, full: accumulated });
    }

    return crumbs;
  }, [path, prefix]);

  const displaySegments = useMemo(() => {
    // Colapsar el medio cuando hay muchos segmentos
    if (segments.length > 5) {
      return [
        segments[0],
        segments[1],
        { name: '…', full: '__ellipsis__' },
        segments[segments.length - 2],
        segments[segments.length - 1],
      ];
    }
    return segments;
  }, [segments]);

  const shortRoot = useMemo(() => {
    const label = rootLabel || '';
    if (label.length > 18) {
      return label.slice(0, 10) + '…' + label.slice(-6);
    }
    return label;
  }, [rootLabel]);

  return (
    <nav className="flex items-center gap-[6px] flex-1 min-w-0 px-3 py-1.5 bg-tertiary rounded-lg border border-subtle overflow-x-auto custom-scrollbar" aria-label="Navegación de directorios" title={path}>
      <span className="opacity-80 text-primary font-semibold text-[13px] max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap shrink-0" title={rootLabel}>
        {shortRoot}
      </span>
      <span className="opacity-40 text-secondary text-[14px] select-none shrink-0">/</span>
      {displaySegments.map((crumb, i) => {
        const isLast = i === displaySegments.length - 1;
        return (
          <React.Fragment key={crumb.full + ':' + i}>
            {crumb.full === '__ellipsis__' ? (
              <span className="px-1 opacity-50 text-secondary select-none">…</span>
            ) : (
              <button
                onClick={() => onNavigate(crumb.full)}
                className={`px-2 py-1 rounded-md text-[13px] cursor-pointer transition-all duration-200 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 active:scale-95 ${
                  isLast 
                    ? 'bg-accent/10 font-semibold text-accent border border-transparent' 
                    : 'bg-transparent border border-transparent font-medium text-primary hover:bg-white/5 hover:border-subtle hover:text-accent'
                }`}
                title={crumb.full}
                aria-label={`Navegar a ${crumb.name}`}
              >
                {crumb.name}
              </button>
            )}
            {!isLast && (
              <span className="opacity-40 text-secondary text-[14px] select-none shrink-0">/</span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default FileNavigationBar;
