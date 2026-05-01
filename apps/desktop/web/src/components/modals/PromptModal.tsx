import React, { useState, useEffect } from 'react'
import { Modal, TextInput, Button, Group, Text } from '@mantine/core'

type Props = {
  open: boolean
  title?: string
  message?: string
  placeholder?: string
  defaultValue?: string
  onConfirm: (value: string) => void
  onCancel: () => void
  confirmLabel?: string
  cancelLabel?: string
}

export default function PromptModal({
  open,
  title = 'Input',
  message = '',
  placeholder = '',
  defaultValue = '',
  onConfirm,
  onCancel,
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
}: Props) {
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    if (open) setValue(defaultValue)
  }, [open, defaultValue])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim()) onConfirm(value.trim())
  }

  return (
    <Modal
      opened={open}
      onClose={onCancel}
      title={title}
      centered
      size="sm"
      overlayProps={{ blur: 3 }}
    >
      <form onSubmit={handleSubmit}>
        {message && (
          <Text size="sm" c="dimmed" mb="sm">
            {message}
          </Text>
        )}
        <TextInput
          data-autofocus
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          mb="lg"
          autoComplete="off"
        />
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" type="button" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="submit" color="teal" disabled={!value.trim()}>
            {confirmLabel}
          </Button>
        </Group>
      </form>
    </Modal>
  )
}
