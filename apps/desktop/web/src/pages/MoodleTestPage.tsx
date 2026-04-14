import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './MoodleTestPage.css';

const MoodleTestPage: React.FC = () => {
  const [assignmentId, setAssignmentId] = useState('2');
  const [username, setUsername] = useState('estudiante_prueba');
  const [practiceId, setPracticeId] = useState('eve3-p1');
  const [commandHistory, setCommandHistory] = useState('ls, python flechas.py');
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addResult = (title: string, data: any, error?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    if (error) {
      setResults(prev => [...prev, `[${timestamp}] ❌ ${title}: ${error}`]);
    } else {
      setResults(prev => [...prev, `[${timestamp}] ✅ ${title}: ${JSON.stringify(data, null, 2)}`]);
    }
  };

  const testSyncAssignment = async () => {
    setLoading(true);
    try {
      const result = await invoke<any>('moodle_sync_assignment', {
        assignmentId: parseInt(assignmentId),
        username,
      });
      addResult('moodle_sync_assignment', result);
    } catch (err: any) {
      addResult('moodle_sync_assignment', null, err.toString());
    }
    setLoading(false);
  };

  const testValidatePractice = async () => {
    setLoading(true);
    try {
      const commands = commandHistory.split(',').map(c => c.trim());
      const result = await invoke<any>('validate_practice_progress', {
        practiceId,
        commandHistory: commands,
      });
      addResult('validate_practice_progress', result);
    } catch (err: any) {
      addResult('validate_practice_progress', null, err.toString());
    }
    setLoading(false);
  };

  const testCalculateGrade = async () => {
    setLoading(true);
    try {
      const commands = commandHistory.split(',').map(c => c.trim());
      const result = await invoke<any>('calculate_practice_grade', {
        practiceId,
        commandHistory: commands,
        maxGrade: 5.0,
      });
      addResult('calculate_practice_grade', result);
    } catch (err: any) {
      addResult('calculate_practice_grade', null, err.toString());
    }
    setLoading(false);
  };

  const testSubmitGrade = async () => {
    setLoading(true);
    try {
      // Primero obtener el user ID
      const syncResult = await invoke<any>('moodle_sync_assignment', {
        assignmentId: parseInt(assignmentId),
        username,
      });

      const commands = commandHistory.split(',').map(c => c.trim());
      const gradeResult = await invoke<any>('calculate_practice_grade', {
        practiceId,
        commandHistory: commands,
        maxGrade: 5.0,
      });

      const result = await invoke<any>('moodle_submit_grade_direct', {
        assignmentId: parseInt(assignmentId),
        userId: syncResult.user.id,
        grade: gradeResult.grade,
        comment: 'Test desde MoodleTestPage',
      });
      addResult('moodle_submit_grade_direct', result);
    } catch (err: any) {
      addResult('moodle_submit_grade_direct', null, err.toString());
    }
    setLoading(false);
  };

  const clearResults = () => {
    setResults([]);
  };

  return (
    <div className="moodle-test-page">
      <h1>🧪 Pruebas de Integración Moodle</h1>

      <div className="test-form">
        <div className="form-group">
          <label>Assignment ID:</label>
          <input
            type="number"
            value={assignmentId}
            onChange={(e) => setAssignmentId(e.target.value)}
            placeholder="Ej: 2"
          />
        </div>

        <div className="form-group">
          <label>Username (Moodle):</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Ej: estudiante_prueba"
          />
        </div>

        <div className="form-group">
          <label>Practice ID:</label>
          <input
            type="text"
            value={practiceId}
            onChange={(e) => setPracticeId(e.target.value)}
            placeholder="Ej: eve3-p1"
          />
        </div>

        <div className="form-group">
          <label>Command History (separados por coma):</label>
          <input
            type="text"
            value={commandHistory}
            onChange={(e) => setCommandHistory(e.target.value)}
            placeholder="Ej: ls, python flechas.py"
          />
        </div>
      </div>

      <div className="test-buttons">
        <button onClick={testSyncAssignment} disabled={loading}>
          🔄 Test: moodle_sync_assignment
        </button>
        <button onClick={testValidatePractice} disabled={loading}>
          ✅ Test: validate_practice_progress
        </button>
        <button onClick={testCalculateGrade} disabled={loading}>
          📊 Test: calculate_practice_grade
        </button>
        <button onClick={testSubmitGrade} disabled={loading} className="primary">
          🎯 Test: moodle_submit_grade_direct
        </button>
        <button onClick={clearResults} disabled={loading} className="secondary">
          🗑️ Limpiar resultados
        </button>
      </div>

      {loading && <div className="loading">⏳ Ejecutando...</div>}

      <div className="results">
        <h2>Resultados:</h2>
        <div className="results-list">
          {results.length === 0 ? (
            <p className="no-results">No hay resultados aún. Ejecuta un test.</p>
          ) : (
            results.map((result, index) => (
              <pre key={index} className={result.includes('❌') ? 'error' : 'success'}>
                {result}
              </pre>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default MoodleTestPage;
