use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub role_id: i32,
    pub is_active: bool,
    pub ldap_username: Option<String>,
    pub is_mock_user: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateUserRequest {
    pub user_id: String,
    pub role_id: Option<i32>,
    pub is_active: Option<bool>,
}

/// Lista todos los usuarios del sistema (solo admins)
#[tauri::command]
pub async fn list_all_users(
    requesting_user_id: String,
    requesting_role_id: i32,
) -> Result<Vec<User>, String> {
    // Verificar que quien solicita sea admin (role_id = 3)
    if requesting_role_id != 3 {
        return Err("Acceso denegado: solo administradores pueden listar usuarios".to_string());
    }

    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();
    
    let users_url = format!(
        "{}/rest/v1/users?select=id,username,email,role_id,is_active,ldap_username,is_mock_user,created_at&order=created_at.desc",
        supabase_url
    );
    
    let users: Vec<User> = client
        .get(&users_url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .send()
        .await
        .map_err(|e| format!("Error obteniendo usuarios: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Error parseando usuarios: {}", e))?;
    
    println!("👑 Admin {} listed {} users", requesting_user_id, users.len());
    
    Ok(users)
}

/// Actualiza el rol o estado activo de un usuario (solo admins)
#[tauri::command]
pub async fn update_user(
    requesting_user_id: String,
    requesting_role_id: i32,
    request: UpdateUserRequest,
) -> Result<(), String> {
    // Verificar que quien solicita sea admin
    if requesting_role_id != 3 {
        return Err("Acceso denegado: solo administradores pueden actualizar usuarios".to_string());
    }

    // No permitir que un admin se desactive a sí mismo
    if request.user_id == requesting_user_id && request.is_active == Some(false) {
        return Err("No puedes desactivar tu propia cuenta".to_string());
    }

    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();
    
    // Construir objeto de actualización
    let mut update_data = serde_json::json!({});
    
    if let Some(role_id) = request.role_id {
        // Validar que el role_id sea válido (1, 2 o 3)
        if ![1, 2, 3].contains(&role_id) {
            return Err(format!("Role ID inválido: {}", role_id));
        }
        update_data["role_id"] = serde_json::json!(role_id);
    }
    
    if let Some(is_active) = request.is_active {
        update_data["is_active"] = serde_json::json!(is_active);
    }

    let update_url = format!(
        "{}/rest/v1/users?id=eq.{}",
        supabase_url, request.user_id
    );
    
    client
        .patch(&update_url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .header("Prefer", "return=minimal")
        .json(&update_data)
        .send()
        .await
        .map_err(|e| format!("Error actualizando usuario: {}", e))?;
    
    println!(
        "👑 Admin {} updated user {}: {:?}",
        requesting_user_id, request.user_id, update_data
    );
    
    Ok(())
}

/// Obtiene estadísticas de usuarios (solo admins)
#[tauri::command]
pub async fn get_user_statistics(
    requesting_user_id: String,
    requesting_role_id: i32,
) -> Result<serde_json::Value, String> {
    // Verificar que quien solicita sea admin
    if requesting_role_id != 3 {
        return Err("Acceso denegado: solo administradores pueden ver estadísticas".to_string());
    }

    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();
    
    // Obtener todos los usuarios para contar
    let users_url = format!(
        "{}/rest/v1/users?select=role_id,is_active",
        supabase_url
    );
    
    let users: Vec<serde_json::Value> = client
        .get(&users_url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .send()
        .await
        .map_err(|e| format!("Error obteniendo usuarios: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Error parseando usuarios: {}", e))?;
    
    // Contar por rol y estado
    let total = users.len();
    let students = users.iter().filter(|u| u["role_id"].as_i64() == Some(1)).count();
    let professors = users.iter().filter(|u| u["role_id"].as_i64() == Some(2)).count();
    let admins = users.iter().filter(|u| u["role_id"].as_i64() == Some(3)).count();
    let active = users.iter().filter(|u| u["is_active"].as_bool() == Some(true)).count();
    let inactive = total - active;
    
    let stats = serde_json::json!({
        "total": total,
        "students": students,
        "professors": professors,
        "admins": admins,
        "active": active,
        "inactive": inactive,
    });
    
    println!("👑 Admin {} retrieved user statistics", requesting_user_id);
    
    Ok(stats)
}
