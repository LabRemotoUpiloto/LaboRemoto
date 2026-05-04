import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { type CommandEntry } from '../../hooks/useCommandHistory'
import Swal from 'sweetalert2'
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
    lines.push(`<strong>Reporte de práctica — ${now.toLocaleDateString('es-MX')} ${fmt(now)}</strong>`)
    lines.push(`<strong>Estudiante:</strong> ${student?.username ?? '—'} (${student?.fullname ?? '—'})`)
    lines.push(`<strong>Progreso:</strong> ${validation ? Math.round(validation.percentage) : 0}% (${(validation?.earned_points ?? 0).toFixed(1)}/${(validation?.total_points ?? 0).toFixed(1)} pts)`)
    lines.push('')
    lines.push('<strong>Objetivos:</strong>')
    for (const r of (validation?.results ?? [])) {
      lines.push(`&nbsp;&nbsp;${r.passed ? '✅' : '❌'} ${r.rule_description}`)
    }
    lines.push('')
    lines.push('<strong>Comandos ejecutados:</strong>')
    if (commandEntries.length > 0) {
      for (const e of commandEntries) {
        lines.push(`&nbsp;&nbsp;<code>[${fmt(e.time)}] ${e.cmd}</code>`)
      }
    } else {
      for (const cmd of commandHistory) {
        lines.push(`&nbsp;&nbsp;<code>${cmd}</code>`)
      }
    }
    return lines.join('<br>')
  }

  const handleSubmitGrade = async () => {
    if (!assignmentId || !student || !moodleSync) return;

    if (moodleSync.is_graded) {
      const result = await Swal.fire({
        title: 'Práctica ya calificada',
        text: '¿Deseas enviar una nueva calificación?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, reenviar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: 'var(--accent-secondary, #3B82F6)',
        cancelButtonColor: 'transparent',
        position: 'center',
        customClass: { container: 'swal-fullscreen' },
      })
      if (!result.isConfirmed) return
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
        username: moodleSync!.user.username || student?.username,
        grade,
        comment,
      })

      await Swal.fire({
        title: '¡Práctica entregada!',
        html: `<div style="font-size:52px;font-weight:800;color:var(--accent-primary,#10B981);line-height:1;margin:8px 0">${grade.toFixed(1)}<span style="font-size:22px;color:var(--text-tertiary,#6B7280)"> / ${moodleSync.assignment.grade ?? 100}</span></div><p style="color:var(--text-secondary,#9CA3AF);margin:0">El reporte con tus comandos fue enviado al profesor en Moodle.</p>`,
        icon: 'success',
        confirmButtonText: 'Cerrar',
        confirmButtonColor: 'var(--accent-primary, #10B981)',
        position: 'center',
        customClass: { container: 'swal-fullscreen' },
      })

      if (onSubmitSuccess) {
        onSubmitSuccess()
      }

      // Actualizar sincronización
      await syncWithMoodle()

    } catch (err: any) {
      setError(err.toString())
      console.error('Error enviando calificación:', err)
      Swal.fire({
        title: 'Error al entregar',
        text: err?.message || err?.toString() || 'Error desconocido',
        icon: 'error',
        confirmButtonText: 'Cerrar',
        confirmButtonColor: 'var(--danger, #EF4444)',
        position: 'center',
        customClass: { container: 'swal-fullscreen' },
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const progressPercentage = validation ? Math.round(validation.percentage) : 0
  const canSubmit = progressPercentage >= 60
  const progressColor = progressPercentage >= 100 ? '#10b981' : progressPercentage >= 60 ? '#3b82f6' : progressPercentage >= 30 ? '#f59e0b' : '#6b7280'

  return (
    <div className={`practice-progress-container ${showDetails ? '' : 'compact'}`}>

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
            ? <span className="pp-badge graded"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> Calificada</span>
            : moodleSync.has_submitted
              ? <span className="pp-badge submitted"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Entregada</span>
              : null
        )}
        <button className="pp-toggle" onClick={() => setShowDetails(v => !v)}>
          {showDetails
            ? <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="18 15 12 9 6 15"/></svg> Ocultar</>
            : <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg> Detalles</>}
        </button>
      </div>

      {/* ── Panel expandido ── */}
      {showDetails && (
        <div className="pp-details">
          <div className="objectives-list">
            {(validation?.results ?? []).map((result, idx) => (
              <div key={idx} className={`objective-item ${result.passed ? 'completed' : 'pending'}`}>
                <span className="objective-icon">{result.passed ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/></svg>}</span>
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
                  <span className="submit-status-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>
                  <div className="submit-status-text">
                    <strong>Práctica calificada</strong>
                    <span>El profesor ya revisó tu entrega</span>
                  </div>
                  <button
                    className="submit-btn-small"
                    onClick={handleSubmitGrade}
                    disabled={isSubmitting || isLoading}
                  >
                    {isSubmitting ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 11 16 11"/><path d="M20.49 15a9 9 0 1 1-.18-3.63"/></svg> Reenviar</>}
                  </button>
                </div>
              ) : moodleSync?.has_submitted ? (
                <div className="submit-status-box submitted">
                  <span className="submit-status-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
                  <div className="submit-status-text">
                    <strong>Entregada — pendiente de revisión</strong>
                    <span>El profesor revisará tu reporte pronto</span>
                  </div>
                  <button
                    className="submit-btn-small"
                    onClick={handleSubmitGrade}
                    disabled={isSubmitting || isLoading}
                  >
                    {isSubmitting ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 11 16 11"/><path d="M20.49 15a9 9 0 1 1-.18-3.63"/></svg> Reenviar</>}
                  </button>
                </div>
              ) : canSubmit ? (
                <>
                  <button
                    className="submit-btn enabled"
                    onClick={handleSubmitGrade}
                    disabled={isSubmitting || isLoading}
                  >
                    {isSubmitting
                      ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Enviando...</>
                      : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Entregar para revisión</>}
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Completa al menos el 60% para poder entregar
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
