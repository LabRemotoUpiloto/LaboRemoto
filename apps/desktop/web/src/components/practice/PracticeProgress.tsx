import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { type CommandEntry } from '../../hooks/useCommandHistory'
import './PracticeProgress.css'

interface ValidationResult {
  rule_description: string
  passed: boolean
  points_earned: number
  details: string
}

interface PracticeValidation {
  practice_id: string
  total_points: number
  earned_points: number
  percentage: number
  passed: boolean
  results: ValidationResult[]
  feedback: string
}

interface MoodleSync {
  assignment: {
    id: number
    name: string
    grade: number
    due_date?: number
  }
  user: {
    id: number
    username: string
    fullname: string
    email: string
  }
  submission?: any
  has_submitted: boolean
  is_graded: boolean
}

interface Props {
  practiceId: string
  assignmentId?: number
  student?: {
    id: number
    username: string
    fullname: string
    email: string
  }
  commandHistory: string[]
  commandEntries?: CommandEntry[]
  onSubmitSuccess?: () => void
}

const PracticeProgress: React.FC<Props> = ({
  practiceId,
  assignmentId,
  student,
  commandHistory,
  commandEntries = [],
  onSubmitSuccess,
}) => {
  const [validation, setValidation] = useState<PracticeValidation | null>(null)
  const [moodleSync, setMoodleSync] = useState<MoodleSync | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  // Validar progreso cada vez que cambia el historial de comandos
  useEffect(() => {
    if (commandHistory.length > 0) {
      validateProgress()
    }
  }, [commandHistory, practiceId])

  // Sincronizar con Moodle al montar el componente
  useEffect(() => {
    if (assignmentId && student) {
      syncWithMoodle()
    }
  }, [assignmentId, student?.username])

  const validateProgress = async () => {
    try {
      const result = await invoke<PracticeValidation>('validate_practice_progress', {
        practiceId,
        commandHistory,
      })
      setValidation(result)
    } catch (err) {
      console.error('Error validando práctica:', err)
    }
  }

  const syncWithMoodle = async () => {
    if (!assignmentId || !student) return

    setIsLoading(true)
    setError(null)

    try {
      const result = await invoke<MoodleSync>('moodle_sync_assignment', {
        assignmentId,
        username: student.username,
      })
      setMoodleSync(result)
    } catch (err: any) {
      setError(err.toString())
      console.error('Error sincronizando con Moodle:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const buildReport = (): string => {
    const now = new Date()
    const fmt = (d: Date) => d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const lines: string[] = []
    lines.push(`Reporte de practica — ${now.toLocaleDateString('es-MX')} ${fmt(now)}`)
    lines.push(`Estudiante: ${student?.username ?? '—'} (${student?.fullname ?? '—'})`)
    lines.push(`Progreso: ${validation ? Math.round(validation.percentage) : 0}% (${(validation?.earned_points ?? 0).toFixed(1)}/${(validation?.total_points ?? 0).toFixed(1)} pts)`)
    lines.push('')
    lines.push('Objetivos:')
    for (const r of (validation?.results ?? [])) {
      lines.push(`  ${r.passed ? '[OK]' : '[ ]'} ${r.rule_description}`)
    }
    lines.push('')
    lines.push('Comandos ejecutados:')
    if (commandEntries.length > 0) {
      for (const e of commandEntries) {
        lines.push(`  [${fmt(e.time)}] ${e.cmd}`)
      }
    } else {
      for (const cmd of commandHistory) {
        lines.push(`  ${cmd}`)
      }
    }
    return lines.join('\n')
  }

  const handleSubmitGrade = async () => {
    if (!assignmentId || !student || !moodleSync) return;

    if (moodleSync.is_graded) {
      const confirm = window.confirm(
        'Esta práctica ya fue calificada. ¿Deseas enviar una nueva calificación?'
      )
      if (!confirm) return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const maxGrade = (moodleSync?.assignment?.grade && moodleSync.assignment.grade > 0)
        ? moodleSync.assignment.grade
        : 5.0

      // Calcular calificación
      const gradeResult = await invoke<any>('calculate_practice_grade', {
        practiceId,
        commandHistory,
        maxGrade,
      })

      const grade: number = typeof gradeResult.grade === 'number' && !isNaN(gradeResult.grade)
        ? gradeResult.grade
        : ((validation?.percentage ?? 0) / 100) * maxGrade

      const comment = buildReport()

      // Enviar directamente a Moodle (sin backend intermedio)
      await invoke('moodle_submit_grade_direct', {
        assignmentId,
        userId: moodleSync!.user.id,
        grade,
        comment,
      })

      alert(`¡Práctica entregada exitosamente!\n\nCalificación: ${grade.toFixed(2)}/${moodleSync.assignment.grade}\n\nEl profesor puede ver el reporte de comandos en Moodle.`)

      if (onSubmitSuccess) {
        onSubmitSuccess()
      }

      // Actualizar sincronización
      await syncWithMoodle()

    } catch (err: any) {
      setError(err.toString())
      console.error('Error enviando calificación:', err)
      alert(`Error al entregar la práctica: ${err.message || err}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const progressPercentage = validation ? Math.round(validation.percentage) : 0
  const canSubmit = progressPercentage >= 60
  const progressColor = progressPercentage >= 100 ? '#10b981' : progressPercentage >= 60 ? '#3b82f6' : progressPercentage >= 30 ? '#f59e0b' : '#6b7280'

  return (
    <div className={`practice-progress-container ${showDetails ? '' : 'compact'}`}>

      {/* DEBUG temporal — quitar después */}
      {import.meta.env.DEV && (
        <div style={{ fontSize: 10, color: '#666', marginBottom: 4, fontFamily: 'monospace' }}>
          [{commandHistory.join(' | ')}]
        </div>
      )}

      {/* ── Fila compacta siempre visible ── */}
      <div className="pp-bar-row">
        <span className="pp-label">Práctica</span>
        <div className="pp-bar-track">
          <div className="pp-bar-fill" style={{ width: `${progressPercentage}%`, background: progressColor }} />
        </div>
        <span className="pp-pct" style={{ color: progressColor }}>{progressPercentage}%</span>
        <span className="pp-pts">{(validation?.earned_points ?? 0).toFixed(1)}/{(validation?.total_points ?? 0).toFixed(1)} pts</span>
        {moodleSync && (
          moodleSync.is_graded
            ? <span className="pp-badge graded">✓ Calificada</span>
            : moodleSync.has_submitted
              ? <span className="pp-badge submitted">⏳ Entregada</span>
              : null
        )}
        <button className="pp-toggle" onClick={() => setShowDetails(v => !v)}>
          {showDetails ? '▲ Ocultar' : '▼ Detalles'}
        </button>
      </div>

      {/* ── Panel expandido ── */}
      {showDetails && (
        <div className="pp-details">
          <div className="objectives-list">
            {(validation?.results ?? []).map((result, idx) => (
              <div key={idx} className={`objective-item ${result.passed ? 'completed' : 'pending'}`}>
                <span className="objective-icon">{result.passed ? '✓' : '○'}</span>
                <span className="objective-description">{result.rule_description}</span>
                <span className="objective-points">+{result.points_earned.toFixed(1)}</span>
              </div>
            ))}
            {!validation && (
              <p style={{ color: '#6b7280', fontSize: 12 }}>Ejecuta comandos para ver el progreso</p>
            )}
          </div>

          {assignmentId && student && (
            <div className="submit-section">
              {error && <div className="error-message">{error}</div>}

              {moodleSync?.is_graded ? (
                <div className="submit-status-box graded">
                  <span className="submit-status-icon">✅</span>
                  <div className="submit-status-text">
                    <strong>Práctica calificada</strong>
                    <span>El profesor ya revisó tu entrega</span>
                  </div>
                  <button
                    className="submit-btn-small"
                    onClick={handleSubmitGrade}
                    disabled={isSubmitting || isLoading}
                  >
                    {isSubmitting ? '⏳' : '🔄 Reenviar'}
                  </button>
                </div>
              ) : moodleSync?.has_submitted ? (
                <div className="submit-status-box submitted">
                  <span className="submit-status-icon">⏳</span>
                  <div className="submit-status-text">
                    <strong>Entregada — pendiente de revisión</strong>
                    <span>El profesor revisará tu reporte pronto</span>
                  </div>
                  <button
                    className="submit-btn-small"
                    onClick={handleSubmitGrade}
                    disabled={isSubmitting || isLoading}
                  >
                    {isSubmitting ? '⏳' : '🔄 Reenviar'}
                  </button>
                </div>
              ) : canSubmit ? (
                <>
                  <button
                    className="submit-btn enabled"
                    onClick={handleSubmitGrade}
                    disabled={isSubmitting || isLoading}
                  >
                    {isSubmitting ? '⏳ Enviando...' : '📤 Entregar para revisión del profesor'}
                  </button>
                  <p className="submit-hint">
                    Tu progreso ({progressPercentage}%) y comandos ejecutados se enviarán al profesor
                  </p>
                </>
              ) : (
                <div className="submit-locked">
                  <div className="submit-locked-bar">
                    <div className="submit-locked-fill" style={{ width: `${(progressPercentage / 60) * 100}%` }} />
                    <span className="submit-locked-label">{progressPercentage}/60%</span>
                  </div>
                  <p className="submit-hint locked">
                    🔒 Completa al menos el 60% para poder entregar
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PracticeProgress
