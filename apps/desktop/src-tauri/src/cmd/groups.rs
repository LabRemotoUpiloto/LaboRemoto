// ============================================
// GESTIÓN DE GRUPOS PARA PROFESORES
// ============================================
// Este módulo maneja la creación, listado, edición y eliminación de grupos,
// así como la asignación de estudiantes a grupos.
// Solo profesores (role_id=2) y administradores (role_id=3) tienen acceso.

use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub professor_id: String,
    pub professor_username: Option<String>,
    pub professor_email: Option<String>,
    pub member_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GroupMember {
    pub id: String,
    pub group_id: String,
    pub student_id: String,
    pub student_username: String,
    pub student_email: String,
    pub student_role_id: i32,
    pub joined_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddStudentRequest {
    pub group_id: String,
    pub student_id: String,
}

// ============================================
// CREAR GRUPO
// ============================================
// Solo profesores y admins pueden crear grupos
#[tauri::command]
pub async fn create_group(
    requesting_user_id: String,
    requesting_role_id: i32,
    request: CreateGroupRequest,
) -> Result<Group, String> {
    // Validar que es profesor o admin
    if requesting_role_id != 2 && requesting_role_id != 3 {
        return Err("Solo profesores y administradores pueden crear grupos".to_string());
    }

    let supabase_url = env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    let service_role_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();

    // Crear el grupo en Supabase
    let create_payload = serde_json::json!({
        "name": request.name,
        "description": request.description,
        "professor_id": requesting_user_id
    });

    let create_response = client
        .post(format!("{}/rest/v1/groups", supabase_url))
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&create_payload)
        .send()
        .await
        .map_err(|e| format!("Error al crear grupo: {}", e))?;

    if !create_response.status().is_success() {
        let error_text = create_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Error al crear grupo: {}", error_text));
    }

    let created_groups: Vec<serde_json::Value> = create_response
        .json()
        .await
        .map_err(|e| format!("Error al parsear respuesta: {}", e))?;

    let created_group = created_groups.first()
        .ok_or_else(|| "No se recibió respuesta del servidor".to_string())?;

    // Obtener información del profesor
    let professor_response = client
        .get(format!("{}/rest/v1/users", supabase_url))
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .query(&[("id", format!("eq.{}", requesting_user_id)), ("select", "*".to_string())])
        .send()
        .await
        .map_err(|e| format!("Error al obtener profesor: {}", e))?;

    let professors: Vec<serde_json::Value> = professor_response
        .json()
        .await
        .unwrap_or_default();

    let professor = professors.first();

    Ok(Group {
        id: created_group["id"].as_str().unwrap_or("").to_string(),
        name: created_group["name"].as_str().unwrap_or("").to_string(),
        description: created_group["description"].as_str().map(|s| s.to_string()),
        professor_id: requesting_user_id,
        professor_username: professor.and_then(|p| p["username"].as_str().map(|s| s.to_string())),
        professor_email: professor.and_then(|p| p["email"].as_str().map(|s| s.to_string())),
        member_count: 0,
        created_at: created_group["created_at"].as_str().unwrap_or("").to_string(),
        updated_at: created_group["updated_at"].as_str().unwrap_or("").to_string(),
    })
}

// ============================================
// LISTAR GRUPOS DE UN PROFESOR
// ============================================
#[tauri::command]
pub async fn list_professor_groups(
    requesting_user_id: String,
    requesting_role_id: i32,
) -> Result<Vec<Group>, String> {
    // Validar que es profesor o admin
    if requesting_role_id != 2 && requesting_role_id != 3 {
        return Err("Solo profesores y administradores pueden ver grupos".to_string());
    }

    let supabase_url = env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    let service_role_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();

    // Los admins ven todos los grupos, los profesores solo los suyos
    let filter = if requesting_role_id == 3 {
        vec![]
    } else {
        vec![("professor_id", format!("eq.{}", requesting_user_id))]
    };

    // Obtener grupos
    let groups_response = client
        .get(format!("{}/rest/v1/groups", supabase_url))
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .query(&filter)
        .query(&[("select", "*"), ("order", "created_at.desc")])
        .send()
        .await
        .map_err(|e| format!("Error al obtener grupos: {}", e))?;

    let groups_data: Vec<serde_json::Value> = groups_response
        .json()
        .await
        .map_err(|e| format!("Error al parsear grupos: {}", e))?;

    let mut result = Vec::new();

    for group_data in groups_data {
        let group_id = group_data["id"].as_str().unwrap_or("");
        let professor_id = group_data["professor_id"].as_str().unwrap_or("");

        // Contar miembros del grupo
        let members_response = client
            .get(format!("{}/rest/v1/group_members", supabase_url))
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .query(&[("group_id", format!("eq.{}", group_id)), ("select", "id".to_string())])
            .send()
            .await
            .map_err(|e| format!("Error al contar miembros: {}", e))?;

        let members_data: Vec<serde_json::Value> = members_response
            .json()
            .await
            .unwrap_or_default();

        // Obtener info del profesor
        let professor_response = client
            .get(format!("{}/rest/v1/users", supabase_url))
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .query(&[("id", format!("eq.{}", professor_id)), ("select", "*".to_string())])
            .send()
            .await
            .map_err(|e| format!("Error al obtener profesor: {}", e))?;

        let professors: Vec<serde_json::Value> = professor_response
            .json()
            .await
            .unwrap_or_default();

        let professor = professors.first();

        result.push(Group {
            id: group_id.to_string(),
            name: group_data["name"].as_str().unwrap_or("").to_string(),
            description: group_data["description"].as_str().map(|s| s.to_string()),
            professor_id: professor_id.to_string(),
            professor_username: professor.and_then(|p| p["username"].as_str().map(|s| s.to_string())),
            professor_email: professor.and_then(|p| p["email"].as_str().map(|s| s.to_string())),
            member_count: members_data.len() as i32,
            created_at: group_data["created_at"].as_str().unwrap_or("").to_string(),
            updated_at: group_data["updated_at"].as_str().unwrap_or("").to_string(),
        });
    }

    Ok(result)
}

// ============================================
// AGREGAR ESTUDIANTE A GRUPO
// ============================================
#[tauri::command]
pub async fn add_student_to_group(
    requesting_user_id: String,
    requesting_role_id: i32,
    request: AddStudentRequest,
) -> Result<GroupMember, String> {
    // Validar que es profesor o admin
    if requesting_role_id != 2 && requesting_role_id != 3 {
        return Err("Solo profesores y administradores pueden agregar estudiantes".to_string());
    }

    let supabase_url = env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    let service_role_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();

    // Si es profesor (no admin), validar que el grupo le pertenece
    if requesting_role_id == 2 {
        let group_response = client
            .get(format!("{}/rest/v1/groups", supabase_url))
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .query(&[("id", format!("eq.{}", request.group_id)), ("select", "professor_id".to_string())])
            .send()
            .await
            .map_err(|e| format!("Error al verificar grupo: {}", e))?;

        let groups: Vec<serde_json::Value> = group_response
            .json()
            .await
            .unwrap_or_default();

        if let Some(group) = groups.first() {
            if group["professor_id"].as_str() != Some(&requesting_user_id) {
                return Err("No tienes permiso para agregar estudiantes a este grupo".to_string());
            }
        } else {
            return Err("Grupo no encontrado".to_string());
        }
    }

    // Agregar estudiante al grupo
    let add_payload = serde_json::json!({
        "group_id": request.group_id,
        "student_id": request.student_id
    });

    let add_response = client
        .post(format!("{}/rest/v1/group_members", supabase_url))
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&add_payload)
        .send()
        .await
        .map_err(|e| format!("Error al agregar estudiante: {}", e))?;

    if !add_response.status().is_success() {
        let error_text = add_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Error al agregar estudiante: {}", error_text));
    }

    let added_members: Vec<serde_json::Value> = add_response
        .json()
        .await
        .map_err(|e| format!("Error al parsear respuesta: {}", e))?;

    let added_member = added_members.first()
        .ok_or_else(|| "No se recibió respuesta del servidor".to_string())?;

    // Obtener info del estudiante
    let student_response = client
        .get(format!("{}/rest/v1/users", supabase_url))
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .query(&[("id", format!("eq.{}", request.student_id)), ("select", "*".to_string())])
        .send()
        .await
        .map_err(|e| format!("Error al obtener estudiante: {}", e))?;

    let students: Vec<serde_json::Value> = student_response
        .json()
        .await
        .unwrap_or_default();

    let student = students.first()
        .ok_or_else(|| "Estudiante no encontrado".to_string())?;

    Ok(GroupMember {
        id: added_member["id"].as_str().unwrap_or("").to_string(),
        group_id: request.group_id,
        student_id: request.student_id,
        student_username: student["username"].as_str().unwrap_or("").to_string(),
        student_email: student["email"].as_str().unwrap_or("").to_string(),
        student_role_id: student["role_id"].as_i64().unwrap_or(1) as i32,
        joined_at: added_member["joined_at"].as_str().unwrap_or("").to_string(),
    })
}

// ============================================
// LISTAR MIEMBROS DE UN GRUPO
// ============================================
#[tauri::command]
pub async fn list_group_members(
    requesting_user_id: String,
    requesting_role_id: i32,
    group_id: String,
) -> Result<Vec<GroupMember>, String> {
    // Validar que es profesor o admin
    if requesting_role_id != 2 && requesting_role_id != 3 {
        return Err("Solo profesores y administradores pueden ver miembros".to_string());
    }

    let supabase_url = env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    let service_role_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();

    // Si es profesor (no admin), validar que el grupo le pertenece
    if requesting_role_id == 2 {
        let group_response = client
            .get(format!("{}/rest/v1/groups", supabase_url))
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .query(&[("id", format!("eq.{}", group_id)), ("select", "professor_id".to_string())])
            .send()
            .await
            .map_err(|e| format!("Error al verificar grupo: {}", e))?;

        let groups: Vec<serde_json::Value> = group_response
            .json()
            .await
            .unwrap_or_default();

        if let Some(group) = groups.first() {
            if group["professor_id"].as_str() != Some(&requesting_user_id) {
                return Err("No tienes permiso para ver miembros de este grupo".to_string());
            }
        } else {
            return Err("Grupo no encontrado".to_string());
        }
    }

    // Obtener miembros del grupo
    let members_response = client
        .get(format!("{}/rest/v1/group_members", supabase_url))
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .query(&[("group_id", format!("eq.{}", group_id)), ("select", "*".to_string()), ("order", "joined_at.asc".to_string())])
        .send()
        .await
        .map_err(|e| format!("Error al obtener miembros: {}", e))?;

    let members_data: Vec<serde_json::Value> = members_response
        .json()
        .await
        .map_err(|e| format!("Error al parsear miembros: {}", e))?;

    let mut result = Vec::new();

    for member_data in members_data {
        let student_id = member_data["student_id"].as_str().unwrap_or("");

        // Obtener info del estudiante
        let student_response = client
            .get(format!("{}/rest/v1/users", supabase_url))
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .query(&[("id", format!("eq.{}", student_id)), ("select", "*".to_string())])
            .send()
            .await
            .map_err(|e| format!("Error al obtener estudiante: {}", e))?;

        let students: Vec<serde_json::Value> = student_response
            .json()
            .await
            .unwrap_or_default();

        if let Some(student) = students.first() {
            result.push(GroupMember {
                id: member_data["id"].as_str().unwrap_or("").to_string(),
                group_id: group_id.clone(),
                student_id: student_id.to_string(),
                student_username: student["username"].as_str().unwrap_or("").to_string(),
                student_email: student["email"].as_str().unwrap_or("").to_string(),
                student_role_id: student["role_id"].as_i64().unwrap_or(1) as i32,
                joined_at: member_data["joined_at"].as_str().unwrap_or("").to_string(),
            });
        }
    }

    Ok(result)
}

// ============================================
// REMOVER ESTUDIANTE DE GRUPO
// ============================================
#[tauri::command]
pub async fn remove_student_from_group(
    requesting_user_id: String,
    requesting_role_id: i32,
    group_id: String,
    student_id: String,
) -> Result<(), String> {
    // Validar que es profesor o admin
    if requesting_role_id != 2 && requesting_role_id != 3 {
        return Err("Solo profesores y administradores pueden remover estudiantes".to_string());
    }

    let supabase_url = env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    let service_role_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();

    // Si es profesor (no admin), validar que el grupo le pertenece
    if requesting_role_id == 2 {
        let group_response = client
            .get(format!("{}/rest/v1/groups", supabase_url))
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .query(&[("id", format!("eq.{}", group_id)), ("select", "professor_id".to_string())])
            .send()
            .await
            .map_err(|e| format!("Error al verificar grupo: {}", e))?;

        let groups: Vec<serde_json::Value> = group_response
            .json()
            .await
            .unwrap_or_default();

        if let Some(group) = groups.first() {
            if group["professor_id"].as_str() != Some(&requesting_user_id) {
                return Err("No tienes permiso para remover estudiantes de este grupo".to_string());
            }
        } else {
            return Err("Grupo no encontrado".to_string());
        }
    }

    // Remover estudiante del grupo
    let delete_response = client
        .delete(format!("{}/rest/v1/group_members", supabase_url))
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .query(&[("group_id", format!("eq.{}", group_id)), ("student_id", format!("eq.{}", student_id))])
        .send()
        .await
        .map_err(|e| format!("Error al remover estudiante: {}", e))?;

    if !delete_response.status().is_success() {
        let error_text = delete_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Error al remover estudiante: {}", error_text));
    }

    Ok(())
}

// ============================================
// ELIMINAR GRUPO
// ============================================
#[tauri::command]
pub async fn delete_group(
    requesting_user_id: String,
    requesting_role_id: i32,
    group_id: String,
) -> Result<(), String> {
    // Validar que es profesor o admin
    if requesting_role_id != 2 && requesting_role_id != 3 {
        return Err("Solo profesores y administradores pueden eliminar grupos".to_string());
    }

    let supabase_url = env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    let service_role_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();

    // Si es profesor (no admin), validar que el grupo le pertenece
    if requesting_role_id == 2 {
        let group_response = client
            .get(format!("{}/rest/v1/groups", supabase_url))
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .query(&[("id", format!("eq.{}", group_id)), ("select", "professor_id".to_string())])
            .send()
            .await
            .map_err(|e| format!("Error al verificar grupo: {}", e))?;

        let groups: Vec<serde_json::Value> = group_response
            .json()
            .await
            .unwrap_or_default();

        if let Some(group) = groups.first() {
            if group["professor_id"].as_str() != Some(&requesting_user_id) {
                return Err("No tienes permiso para eliminar este grupo".to_string());
            }
        } else {
            return Err("Grupo no encontrado".to_string());
        }
    }

    // Eliminar grupo (los miembros se eliminan automáticamente por CASCADE)
    let delete_response = client
        .delete(format!("{}/rest/v1/groups", supabase_url))
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .query(&[("id", format!("eq.{}", group_id))])
        .send()
        .await
        .map_err(|e| format!("Error al eliminar grupo: {}", e))?;

    if !delete_response.status().is_success() {
        let error_text = delete_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Error al eliminar grupo: {}", error_text));
    }

    Ok(())
}
