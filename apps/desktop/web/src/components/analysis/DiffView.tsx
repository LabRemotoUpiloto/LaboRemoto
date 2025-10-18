import React from 'react';
import './DiffView.css';

interface Props { diff: string }

const DiffView: React.FC<Props> = ({ diff }) => {
  const lines = diff.split(/\r?\n/);
  return (
    <pre className="diff-view" aria-label="Diff de cambios propuestos">
      {lines.map((l, i) => {
        const cls = l.startsWith('+') ? 'added' : l.startsWith('-') ? 'removed' : 'ctx';
        return <div key={i} className={`diff-line ${cls}`}>{l || ' '}</div>;
      })}
    </pre>
  );
};
export default DiffView;
