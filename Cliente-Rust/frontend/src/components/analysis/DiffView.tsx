import React from 'react';

interface Props { diff: string }

const DiffView: React.FC<Props> = ({ diff }) => {
  const lines = diff.split(/\r?\n/);
  return (
    <pre className="m-0 p-3 bg-black/40 rounded-md overflow-x-auto text-[12px] font-mono leading-relaxed" aria-label="Diff de cambios propuestos">
      {lines.map((l, i) => {
        let cls = 'text-white/60';
        let bgCls = '';
        if (l.startsWith('+')) {
          cls = 'text-green-400';
          bgCls = 'bg-green-500/10';
        } else if (l.startsWith('-')) {
          cls = 'text-red-400';
          bgCls = 'bg-red-500/10';
        } else if (l.startsWith('@@')) {
          cls = 'text-blue-400 font-semibold';
          bgCls = 'bg-blue-500/10';
        }
        return <div key={i} className={`px-2 py-0.5 whitespace-pre ${cls} ${bgCls}`}>{l || ' '}</div>;
      })}
    </pre>
  );
};
export default DiffView;
