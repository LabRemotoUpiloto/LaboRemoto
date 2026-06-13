import React from 'react'
import { Loader, Button, Text } from '@mantine/core'
import { useLoading } from '../../contexts/LoadingContext'

export default function GlobalLoader() {
  const { loading, label, onCancel } = useLoading()

  if (!loading) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-secondary, #1a1a2e)',
        border: '1px solid var(--border-color, #333)',
        borderRadius: 16,
        padding: '40px 48px',
        maxWidth: 420, width: '90%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}>
        <Loader color="blue" type="oval" size="lg" />
        <Text fw={600} size="lg" ta="center">{label ?? 'Cargando...'}</Text>
        <Text c="dimmed" size="sm" ta="center">Espera mientras se establece la conexión</Text>
        {onCancel && (
          <Button
            variant="outline" color="red" size="sm"
            onClick={() => onCancel()}
            style={{ marginTop: 8 }}
          >
            Cancelar conexión
          </Button>
        )}
      </div>
    </div>
  )
}
