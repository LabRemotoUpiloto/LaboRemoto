import React, { useMemo } from 'react';
import './FileNavigationBar.css';

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
    <nav className="file-navigation-bar" aria-label="Navegación de directorios" title={path}>
      <span className="file-navigation-bar__root" title={rootLabel}>
        {shortRoot}
      </span>
      <span className="file-navigation-bar__separator">/</span>
      {displaySegments.map((crumb, i) => (
        <React.Fragment key={crumb.full + ':' + i}>
          {crumb.full === '__ellipsis__' ? (
            <span className="file-navigation-bar__ellipsis">…</span>
          ) : (
            <button
              onClick={() => onNavigate(crumb.full)}
              className="file-navigation-bar__crumb"
              title={crumb.full}
              aria-label={`Navegar a ${crumb.name}`}
            >
              {crumb.name}
            </button>
          )}
          {i < displaySegments.length - 1 && (
            <span className="file-navigation-bar__separator">/</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};

export default FileNavigationBar;
