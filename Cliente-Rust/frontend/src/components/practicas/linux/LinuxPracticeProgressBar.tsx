import React from 'react';
import { type LinuxValidationResult } from '../../../services/linuxPractice.service';

interface Props {
  result: LinuxValidationResult;
  moduleTitle?: string;
}

export const LinuxPracticeProgressBar: React.FC<Props> = ({ result, moduleTitle }) => {
  const { percentage = 0, passed = false, results = [], earned_points = 0, total_points = 0 } = result;
  const passedCount = results.filter((r) => r.passed).length;
  const totalRules = results.length;
  const roundedPct = Math.round(percentage);

  return (
    <div
      style={{
        margin: '6px 12px',
        padding: '8px 14px',
        borderRadius: '8px',
        backgroundColor: 'var(--background-secondary)',
        border: '1px solid var(--border-color)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '6px',
          fontSize: '12px',
          lineHeight: '1.4',
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {moduleTitle || 'Práctica de laboratorio'}
        </span>
        <span
          style={{
            color: 'var(--text-secondary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {totalRules > 0 ? `${passedCount} de ${totalRules} pasos` : ''}
          {total_points > 0 ? ` (${earned_points}/${total_points} pts)` : ''}
          {totalRules > 0 ? ` — ${roundedPct}%` : `${roundedPct}%`}
        </span>
      </div>

      {/* Progress Track */}
      <div
        style={{
          width: '100%',
          height: '6px',
          borderRadius: '3px',
          backgroundColor: 'var(--background-tertiary)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: '3px',
            width: `${Math.max(0, Math.min(100, percentage))}%`,
            backgroundColor: passed ? 'var(--accent-tertiary, #007a33)' : 'var(--accent-primary)',
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
};

export default LinuxPracticeProgressBar;
