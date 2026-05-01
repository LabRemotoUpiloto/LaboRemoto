import React from 'react'
import { Modal, Text, Button, Group } from '@mantine/core'

type Props = {
  open: boolean
  title?: string
  message?: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' | 'new' | cualquier string — mapea al color del botón */
  confirmClassName?: string
  loading?: boolean
}

const COLOR_MAP: Record<string, string> = {
  danger: 'red',
  new: 'teal',
  warning: 'yellow',
}

export default function ConfirmModal({
  open,
  title = 'Confirmar',
  message = '¿Estás seguro?',
  onConfirm,
  onCancel,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  confirmClassName = 'danger',
  loading = false,
}: Props) {
  const color = COLOR_MAP[confirmClassName] ?? 'red'

  return (
    <Modal
      opened={open}
      onClose={onCancel}
      title={title}
      centered
      size="sm"
      overlayProps={{ blur: 3 }}
      withCloseButton={!loading}
    >
      <Text size="sm" c="dimmed" mb="lg">
        {message}
      </Text>
      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" color="gray" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button color={color} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  )
}
