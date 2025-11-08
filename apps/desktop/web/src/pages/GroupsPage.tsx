import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAuth } from '../contexts/AuthContext'
import { useToasts } from '../contexts/ToastContext'
import Swal from 'sweetalert2'
import './GroupsPage.css'

interface Group {
  id: string
  name: string
  description?: string
  professor_id: string
  professor_username?: string
  professor_email?: string
  member_count: number
  created_at: string
  updated_at: string
}

interface GroupMember {
  id: string
  group_id: string
  student_id: string
  student_username: string
  student_email: string
  student_role_id: number
  joined_at: string
}

interface User {
  id: string
  username: string
  email: string
  role_id: number
  is_active: boolean
  ldap_username?: string
  is_mock_user: boolean
  created_at: string
}

const GroupsPage: React.FC = () => {
  const { user, isAdmin, isProfessor } = useAuth()
  const { showToast } = useToasts()
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([])
  const [students, setStudents] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMembers, setLoadingMembers] = useState(false)

  useEffect(() => {
    loadGroups()
    loadStudents()
  }, [user])

  const loadGroups = async () => {
    if (!user) return

    try {
      setLoading(true)
      const result = await invoke<Group[]>('list_professor_groups', {
        requestingUserId: user.user_id,
        requestingRoleId: user.role_id,
      })
      setGroups(result)
    } catch (error) {
      console.error('Error al cargar grupos:', error)
      showToast('Error al cargar grupos', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadStudents = async () => {
    if (!user) return

    try {
      // Solo admins pueden listar todos los usuarios
      if (isAdmin) {
        const allUsers = await invoke<User[]>('list_all_users', {
          requestingUserId: user.user_id,
          requestingRoleId: user.role_id,
        })
        // Filtrar solo estudiantes activos
        const activeStudents = allUsers.filter(u => u.role_id === 1 && u.is_active)
        setStudents(activeStudents)
      }
    } catch (error) {
      console.error('Error al cargar estudiantes:', error)
    }
  }

  const loadGroupMembers = async (groupId: string) => {
    if (!user) return

    try {
      setLoadingMembers(true)
      const members = await invoke<GroupMember[]>('list_group_members', {
        requestingUserId: user.user_id,
        requestingRoleId: user.role_id,
        groupId: groupId,
      })
      setGroupMembers(members)
    } catch (error) {
      console.error('Error al cargar miembros:', error)
      showToast('Error al cargar miembros del grupo', 'error')
    } finally {
      setLoadingMembers(false)
    }
  }

  const handleSelectGroup = (group: Group) => {
    setSelectedGroup(group)
    loadGroupMembers(group.id)
  }

  const handleCreateGroup = async () => {
    const result = await Swal.fire({
      title: 'Crear Nuevo Grupo',
      html: `
        <input id="group-name" class="swal2-input" placeholder="Nombre del grupo" style="width: 80%;">
        <textarea id="group-description" class="swal2-textarea" placeholder="Descripción (opcional)" style="width: 80%; min-height: 80px;"></textarea>
      `,
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const nameInput = document.getElementById('group-name') as HTMLInputElement
        const descInput = document.getElementById('group-description') as HTMLTextAreaElement
        
        if (!nameInput?.value) {
          Swal.showValidationMessage('El nombre es requerido')
          return null
        }
        
        return {
          name: nameInput.value,
          description: descInput?.value || null,
        }
      },
    })

    if (result.isConfirmed && result.value && user) {
      try {
        await invoke('create_group', {
          requestingUserId: user.user_id,
          requestingRoleId: user.role_id,
          request: result.value,
        })
        showToast('Grupo creado exitosamente', 'success')
        loadGroups()
      } catch (error: any) {
        console.error('Error al crear grupo:', error)
        showToast(error || 'Error al crear grupo', 'error')
      }
    }
  }

  const handleAddStudent = async () => {
    if (!selectedGroup || !user) return

    // Obtener estudiantes que NO están ya en el grupo
    const currentMemberIds = groupMembers.map(m => m.student_id)
    const availableStudents = students.filter(s => !currentMemberIds.includes(s.id))

    if (availableStudents.length === 0) {
      Swal.fire('Sin estudiantes disponibles', 'Todos los estudiantes ya están en este grupo', 'info')
      return
    }

    const options: Record<string, string> = {}
    availableStudents.forEach(s => {
      options[s.id] = `${s.username} (${s.email})`
    })

    const result = await Swal.fire({
      title: 'Agregar Estudiante',
      input: 'select',
      inputOptions: options,
      inputPlaceholder: 'Selecciona un estudiante',
      showCancelButton: true,
      confirmButtonText: 'Agregar',
      cancelButtonText: 'Cancelar',
    })

    if (result.isConfirmed && result.value) {
      try {
        await invoke('add_student_to_group', {
          requestingUserId: user.user_id,
          requestingRoleId: user.role_id,
          request: {
            group_id: selectedGroup.id,
            student_id: result.value,
          },
        })
        showToast('Estudiante agregado exitosamente', 'success')
        loadGroupMembers(selectedGroup.id)
        loadGroups() // Actualizar member_count
      } catch (error: any) {
        console.error('Error al agregar estudiante:', error)
        showToast(error || 'Error al agregar estudiante', 'error')
      }
    }
  }

  const handleRemoveStudent = async (studentId: string, studentName: string) => {
    if (!selectedGroup || !user) return

    const result = await Swal.fire({
      title: '¿Remover estudiante?',
      text: `¿Estás seguro de que quieres remover a ${studentName} de este grupo?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, remover',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#e74c3c',
    })

    if (result.isConfirmed) {
      try {
        await invoke('remove_student_from_group', {
          requestingUserId: user.user_id,
          requestingRoleId: user.role_id,
          groupId: selectedGroup.id,
          studentId: studentId,
        })
        showToast('Estudiante removido exitosamente', 'success')
        loadGroupMembers(selectedGroup.id)
        loadGroups() // Actualizar member_count
      } catch (error: any) {
        console.error('Error al remover estudiante:', error)
        showToast(error || 'Error al remover estudiante', 'error')
      }
    }
  }

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (!user) return

    const result = await Swal.fire({
      title: '¿Eliminar grupo?',
      html: `¿Estás seguro de que quieres eliminar el grupo <strong>"${groupName}"</strong>?<br><br><small>Esta acción no se puede deshacer.</small>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#e74c3c',
    })

    if (result.isConfirmed) {
      try {
        await invoke('delete_group', {
          requestingUserId: user.user_id,
          requestingRoleId: user.role_id,
          groupId: groupId,
        })
        showToast('Grupo eliminado exitosamente', 'success')
        if (selectedGroup?.id === groupId) {
          setSelectedGroup(null)
          setGroupMembers([])
        }
        loadGroups()
      } catch (error: any) {
        console.error('Error al eliminar grupo:', error)
        showToast(error || 'Error al eliminar grupo', 'error')
      }
    }
  }

  if (!user || (!isProfessor && !isAdmin)) {
    return (
      <div className="groups-page">
        <div className="error-message">
          <h2>⚠️ Acceso Denegado</h2>
          <p>Solo profesores y administradores pueden acceder a esta página.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="groups-page">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Cargando grupos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="groups-page">
      <div className="groups-header">
        <h1>👥 Gestión de Grupos</h1>
        <button className="create-group-btn" onClick={handleCreateGroup}>
          ➕ Crear Grupo
        </button>
      </div>

      <div className="groups-container">
        {/* Panel izquierdo: Lista de grupos */}
        <div className="groups-list-panel">
          <h2>Mis Grupos ({groups.length})</h2>
          
          {groups.length === 0 ? (
            <div className="empty-state">
              <p>📂 No tienes grupos creados aún</p>
              <button className="create-first-group-btn" onClick={handleCreateGroup}>
                Crear mi primer grupo
              </button>
            </div>
          ) : (
            <div className="groups-list">
              {groups.map(group => (
                <div
                  key={group.id}
                  className={`group-card ${selectedGroup?.id === group.id ? 'selected' : ''}`}
                  onClick={() => handleSelectGroup(group)}
                >
                  <div className="group-card-header">
                    <h3>{group.name}</h3>
                    <button
                      className="delete-group-icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteGroup(group.id, group.name)
                      }}
                      title="Eliminar grupo"
                    >
                      🗑️
                    </button>
                  </div>
                  {group.description && (
                    <p className="group-description">{group.description}</p>
                  )}
                  <div className="group-meta">
                    <span className="member-count">👥 {group.member_count} miembros</span>
                    <span className="created-date">📅 {new Date(group.created_at).toLocaleDateString()}</span>
                  </div>
                  {isAdmin && group.professor_username && (
                    <div className="professor-info">
                      👨‍🏫 {group.professor_username}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel derecho: Detalles del grupo seleccionado */}
        <div className="group-details-panel">
          {selectedGroup ? (
            <>
              <div className="group-details-header">
                <div>
                  <h2>{selectedGroup.name}</h2>
                  {selectedGroup.description && (
                    <p className="group-description-full">{selectedGroup.description}</p>
                  )}
                </div>
                <button className="add-student-btn" onClick={handleAddStudent}>
                  ➕ Agregar Estudiante
                </button>
              </div>

              {loadingMembers ? (
                <div className="loading-members">
                  <div className="spinner-small"></div>
                  <p>Cargando miembros...</p>
                </div>
              ) : (
                <>
                  <h3>Estudiantes ({groupMembers.length})</h3>
                  
                  {groupMembers.length === 0 ? (
                    <div className="empty-members">
                      <p>📋 Este grupo no tiene estudiantes aún</p>
                      <button className="add-first-student-btn" onClick={handleAddStudent}>
                        Agregar primer estudiante
                      </button>
                    </div>
                  ) : (
                    <div className="members-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Estudiante</th>
                            <th>Email</th>
                            <th>Fecha de Ingreso</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupMembers.map(member => (
                            <tr key={member.id}>
                              <td>
                                <div className="student-info">
                                  <div className="student-avatar">
                                    {member.student_username.charAt(0).toUpperCase()}
                                  </div>
                                  <span>{member.student_username}</span>
                                </div>
                              </td>
                              <td>{member.student_email}</td>
                              <td>{new Date(member.joined_at).toLocaleDateString()}</td>
                              <td>
                                <button
                                  className="remove-student-btn"
                                  onClick={() => handleRemoveStudent(member.student_id, member.student_username)}
                                  title="Remover del grupo"
                                >
                                  ❌ Remover
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="no-group-selected">
              <p>👈 Selecciona un grupo para ver sus detalles</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GroupsPage

