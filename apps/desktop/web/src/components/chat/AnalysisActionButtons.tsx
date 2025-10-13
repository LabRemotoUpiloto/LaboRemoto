import React from 'react';
import './AnalysisActionButtons.css';

interface AnalysisActionButtonsProps {
  onEditWithRecommendations: () => void;
  onImproveFile: () => void;
  onApplyRecommendations: () => void;
  fileName?: string;
  disabled?: boolean;
}

export const AnalysisActionButtons: React.FC<AnalysisActionButtonsProps> = ({
  onEditWithRecommendations,
  onImproveFile,
  onApplyRecommendations,
  fileName,
  disabled = false
}) => {
  return (
    <div className="analysis-action-buttons">
      <div className="analysis-actions-header">
        <span className="analysis-actions-title">
          {fileName ? `Acciones para ${fileName}` : 'Acciones disponibles'}
        </span>
      </div>
      
      <div className="analysis-actions-grid">
        <button
          className="analysis-action-btn recommend-btn"
          onClick={onEditWithRecommendations}
          disabled={disabled}
          title="Editar archivo aplicando las recomendaciones del análisis"
          type="button"
        >
          <div className="analysis-btn-icon">🔧</div>
          <div className="analysis-btn-content">
            <div className="analysis-btn-title">Aplicar Recomendaciones</div>
            <div className="analysis-btn-desc">Edita con mejoras sugeridas</div>
          </div>
        </button>

        <button
          className="analysis-action-btn improve-btn"
          onClick={onImproveFile}
          disabled={disabled}
          title="Mejorar el código aplicando buenas prácticas"
          type="button"
        >
          <div className="analysis-btn-icon">🚀</div>
          <div className="analysis-btn-content">
            <div className="analysis-btn-title">Mejorar Código</div>
            <div className="analysis-btn-desc">Optimizar y refactorizar</div>
          </div>
        </button>

        <button
          className="analysis-action-btn apply-btn"
          onClick={onApplyRecommendations}
          disabled={disabled}
          title="Aplicar todas las recomendaciones encontradas"
          type="button"
        >
          <div className="analysis-btn-icon">✅</div>
          <div className="analysis-btn-content">
            <div className="analysis-btn-title">Aplicar Mejoras</div>
            <div className="analysis-btn-desc">Implementar sugerencias</div>
          </div>
        </button>
      </div>
    </div>
  );
};

export default AnalysisActionButtons;
