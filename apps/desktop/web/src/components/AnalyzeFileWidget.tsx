import React, { useState } from 'react';
import { analyzeFile, FileAnalysis } from '../api/fileAnalysis';
import './AnalyzeFileWidget.css';

interface Props {
  sessionId?: string | null;
}

const AnalyzeFileWidget: React.FC<Props> = ({ sessionId }) => {
  const [pathInput, setPathInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FileAnalysis | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);

  async function run(p?: string) {
    const target = p ?? pathInput.trim();
    if (!target) return;
    setLoading(true); setError(null); setSelectedCandidate(null);
    try {
      const resp = await analyzeFile(target, sessionId || undefined);
      setAnalysis(resp.analysis);
    } catch (e: any) {
      setError(e?.toString?.() || 'Error desconocido');
    } finally { setLoading(false); }
  }

  function reset() {
    setAnalysis(null); setError(null); setSelectedCandidate(null);
  }

  const ambiguous = analysis?.disambiguation_required && (analysis?.candidates?.length || 0) > 1;

  return (
    <div className="afw-root">
      <h3>Analizar archivo</h3>
      {!analysis && (
        <div className="afw-form">
          <input
            className="afw-input"
            placeholder="ruta o nombre (remoto/local)"
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') run(); }}
          />
          <button disabled={loading || !pathInput.trim()} onClick={() => run()}>{loading ? '...' : 'Analizar'}</button>
        </div>
      )}
      {error && <div className="afw-error">{error}</div>}
      {analysis && !ambiguous && (
        <div className="afw-result">
          <div className="afw-meta">
            <strong>Ruta:</strong> {analysis.path}<br/>
            {analysis.language && <><strong>Lenguaje:</strong> {analysis.language}<br/></>}
            {analysis.line_count > 0 && <><strong>Líneas:</strong> {analysis.line_count}<br/></>}
            {analysis.size_bytes > 0 && <><strong>Tamaño:</strong> {analysis.size_bytes} bytes<br/></>}
            {analysis.sha256 && analysis.sha256.length > 0 && <><strong>SHA256:</strong> {analysis.sha256.slice(0,16)}…<br/></>}
          </div>
          {analysis.narrative && <p className="afw-narrative">{analysis.narrative}</p>}
          {analysis.purpose && <p><strong>Propósito:</strong> {analysis.purpose}</p>}
          {analysis.key_points && analysis.key_points.length > 0 && (
            <ul className="afw-kps">{analysis.key_points.map((kp,i)=><li key={i}>{kp}</li>)}</ul>
          )}
          {(!analysis.key_points || analysis.key_points.length===0) && analysis.ai_only && <em>(Esperando summary IA o modo AI-only sin puntos)</em>}
          <div className="afw-buttons">
            <button onClick={reset}>Nuevo análisis</button>
          </div>
        </div>
      )}
      {analysis && ambiguous && (
        <div className="afw-ambiguo">
          <p><strong>{analysis.candidates?.length} coincidencias para “{analysis.path}”. Selecciona una ruta:</strong></p>
          <ul className="afw-candidates">
            {analysis.candidates!.map(c => (
              <li key={c} className={selectedCandidate===c ? 'sel' : ''}>
                <button onClick={() => { setSelectedCandidate(c); run(c); }}>{c}</button>
              </li>
            ))}
          </ul>
          <div className="afw-buttons">
            <button onClick={reset}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyzeFileWidget;
