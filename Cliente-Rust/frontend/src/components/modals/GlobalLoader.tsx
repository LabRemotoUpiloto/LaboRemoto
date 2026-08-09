import React from 'react'
import { Loader, Button, Text } from '@mantine/core'
import { useLoading } from '../../contexts/LoadingContext'

export default function GlobalLoader() {
  const { loading, label, onCancel } = useLoading()

  if (!loading) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-body, sans-serif)',
    }}>
      <div style={{
        background: 'var(--background-secondary, var(--background-primary, #1c1c1e))',
        border: '1px solid var(--border-subtle, rgba(128, 128, 128, 0.25))',
        borderRadius: 16,
        padding: '40px 48px',
        maxWidth: 420, width: '90%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
        boxShadow: 'var(--shadow, 0 12px 40px rgba(0, 0, 0, 0.35))',
      }}>
        <Loader color="var(--accent-primary)" type="oval" size="lg" />
        <Text fw={700} size="lg" ta="center" style={{ color: 'var(--text-primary)' }}>{label ?? 'Cargando...'}</Text>
        <Text size="sm" ta="center" style={{ color: 'var(--text-secondary)' }}>Espera mientras se establece la conexión</Text>
        {onCancel && (
          <Button
            variant="outline"
            color="red"
            size="sm"
            onClick={() => onCancel()}
            style={{
              marginTop: 8,
              borderColor: 'var(--danger, #ef4444)',
              color: 'var(--danger, #ef4444)',
            }}
          >
            Cancelar conexión
          </Button>
        )}
      </div>
    </div>
  )
}
