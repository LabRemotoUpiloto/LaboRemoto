// ============================================
// DASHBOARDS Y ESTADÍSTICAS POR ROL
// ============================================
// Este módulo provee estadísticas personalizadas para cada rol:
// - Estudiantes: métricas personales de uso
// - Profesores: progreso de grupos y estudiantes
// - Administradores: métricas globales del sistema

use serde::{Deserialize, Serialize};
use std::env;
use chrono::Datelike;

// ============================================
// ESTRUCTURAS DE DATOS
// ============================================

#[derive(Debug, Serialize, Deserialize)]
pub struct StudentDashboardStats {
    pub total_sessions: i32,
    pub total_time_minutes: i32,
    pub last_session_date: Option<String>,
    pub favorite_hosts: Vec<FavoriteHost>,
    pub recent_sessions: Vec<RecentSession>,
    pub activity_by_weekday: Vec<DayActivity>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FavoriteHost {
    pub hostname: String,
    pub connection_count: i32,
    pub total_time_minutes: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecentSession {
    pub id: String,
    pub hostname: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_minutes: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DayActivity {
    pub day_name: String, // "Lunes", "Martes", etc.
    pub session_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProfessorDashboardStats {
    pub total_groups: i32,
    pub total_students: i32,
    pub active_students_week: i32,
    pub top_students: Vec<TopStudent>,
    pub groups_summary: Vec<GroupSummary>,
    pub inactive_students: Vec<InactiveStudent>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TopStudent {
    pub student_id: String,
    pub student_name: String,
    pub student_email: String,
    pub session_count: i32,
    pub total_time_minutes: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GroupSummary {
    pub group_id: String,
    pub group_name: String,
    pub member_count: i32,
    pub active_members_week: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InactiveStudent {
    pub student_id: String,
    pub student_name: String,
    pub student_email: String,
    pub days_inactive: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AdminDashboardStats {
    pub total_users: i32,
    pub total_students: i32,
    pub total_professors: i32,
    pub total_admins: i32,
    pub active_users: i32,
    pub inactive_users: i32,
    pub total_sessions_all_time: i32,
    pub sessions_this_week: i32,
    pub recent_users: Vec<RecentUser>,
    pub recent_sessions_global: Vec<RecentSessionGlobal>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecentUser {
    pub id: String,
    pub username: String,
    pub email: String,
    pub role_id: i32,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecentSessionGlobal {
    pub id: String,
    pub username: String,
    pub hostname: String,
    pub started_at: String,
    pub duration_minutes: Option<i32>,
}

// ============================================
// DASHBOARD ESTUDIANTE
// ============================================
#[tauri::command]
pub async fn get_student_dashboard_stats(
    requesting_user_id: String,
) -> Result<StudentDashboardStats, String> {
    let supabase_url = env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    let service_role_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();

    // Obtener todas las sesiones del estudiante
    let sessions_response = client
        .get(format!("{}/rest/v1/session_logs", supabase_url))
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .query(&[("user_id", format!("eq.{}", requesting_user_id)), ("select", "*".to_string()), ("order", "started_at.desc".to_string())])
        .send()
        .await
        .map_err(|e| format!("Error al obtener sesiones: {}", e))?;

    let sessions: Vec<serde_json::Value> = sessions_response
        .json()
        .await
        .map_err(|e| format!("Error al parsear sesiones: {}", e))?;

    // Calcular estadísticas
    let total_sessions = sessions.len() as i32;
    
    let mut total_time_minutes = 0;
    let mut host_stats: std::collections::HashMap<String, (i32, i32)> = std::collections::HashMap::new();
    let mut weekday_stats: std::collections::HashMap<String, i32> = std::collections::HashMap::new();

    for session in &sessions {
        // Duración
        if let (Some(started), Some(ended)) = (
            session["started_at"].as_str(),
            session["ended_at"].as_str(),
        ) {
            if let (Ok(start_time), Ok(end_time)) = (
                chrono::DateTime::parse_from_rfc3339(started),
                chrono::DateTime::parse_from_rfc3339(ended),
            ) {
                let duration = (end_time - start_time).num_minutes() as i32;
                total_time_minutes += duration;

                // Stats por host
                if let Some(hostname) = session["hostname"].as_str() {
                    let entry = host_stats.entry(hostname.to_string()).or_insert((0, 0));
                    entry.0 += 1; // count
                    entry.1 += duration; // total time
                }

                // Stats por día de la semana
                let weekday = start_time.weekday();
                let day_name = match weekday {
                    chrono::Weekday::Mon => "Lunes",
                    chrono::Weekday::Tue => "Martes",
                    chrono::Weekday::Wed => "Miércoles",
                    chrono::Weekday::Thu => "Jueves",
                    chrono::Weekday::Fri => "Viernes",
                    chrono::Weekday::Sat => "Sábado",
                    chrono::Weekday::Sun => "Domingo",
                };
                *weekday_stats.entry(day_name.to_string()).or_insert(0) += 1;
            }
        }
    }

    // Top 5 hosts favoritos
    let mut favorite_hosts: Vec<FavoriteHost> = host_stats
        .into_iter()
        .map(|(hostname, (count, time))| FavoriteHost {
            hostname,
            connection_count: count,
            total_time_minutes: time,
        })
        .collect();
    favorite_hosts.sort_by(|a, b| b.connection_count.cmp(&a.connection_count));
    favorite_hosts.truncate(5);

    // Últimas 5 sesiones
    let recent_sessions: Vec<RecentSession> = sessions
        .iter()
        .take(5)
        .map(|s| {
            let duration = if let (Some(started), Some(ended)) = (
                s["started_at"].as_str(),
                s["ended_at"].as_str(),
            ) {
                if let (Ok(start_time), Ok(end_time)) = (
                    chrono::DateTime::parse_from_rfc3339(started),
                    chrono::DateTime::parse_from_rfc3339(ended),
                ) {
                    Some((end_time - start_time).num_minutes() as i32)
                } else {
                    None
                }
            } else {
                None
            };

            RecentSession {
                id: s["id"].as_str().unwrap_or("").to_string(),
                hostname: s["hostname"].as_str().unwrap_or("Unknown").to_string(),
                started_at: s["started_at"].as_str().unwrap_or("").to_string(),
                ended_at: s["ended_at"].as_str().map(|e| e.to_string()),
                duration_minutes: duration,
            }
        })
        .collect();

    // Actividad por día de la semana
    let days = vec!["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    let activity_by_weekday: Vec<DayActivity> = days
        .iter()
        .map(|day| DayActivity {
            day_name: day.to_string(),
            session_count: *weekday_stats.get(&day.to_string()).unwrap_or(&0),
        })
        .collect();

    let last_session_date = sessions.first().and_then(|s| s["started_at"].as_str().map(|d| d.to_string()));

    Ok(StudentDashboardStats {
        total_sessions,
        total_time_minutes,
        last_session_date,
        favorite_hosts,
        recent_sessions,
        activity_by_weekday,
    })
}

// ============================================
// DASHBOARD PROFESOR
// ============================================
#[tauri::command]
pub async fn get_professor_dashboard_stats(
    requesting_user_id: String,
    requesting_role_id: i32,
) -> Result<ProfessorDashboardStats, String> {
    if requesting_role_id != 2 && requesting_role_id != 3 {
        return Err("Solo profesores y administradores pueden acceder".to_string());
    }

    let supabase_url = env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    let service_role_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();

    // Obtener grupos del profesor
    let groups_filter = if requesting_role_id == 3 {
        vec![] // Admin ve todos
    } else {
        vec![("professor_id", format!("eq.{}", requesting_user_id))]
    };

    let groups_response = client
        .get(format!("{}/rest/v1/groups", supabase_url))
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .query(&groups_filter)
        .query(&[("select", "*".to_string())])
        .send()
        .await
        .map_err(|e| format!("Error al obtener grupos: {}", e))?;

    let groups: Vec<serde_json::Value> = groups_response.json().await.unwrap_or_default();
    let total_groups = groups.len() as i32;

    // Obtener todos los estudiantes de los grupos
    let mut all_student_ids = std::collections::HashSet::new();
    let mut groups_summary = Vec::new();

    for group in &groups {
        let group_id = group["id"].as_str().unwrap_or("");
        
        let members_response = client
            .get(format!("{}/rest/v1/group_members", supabase_url))
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .query(&[("group_id", format!("eq.{}", group_id)), ("select", "student_id".to_string())])
            .send()
            .await
            .map_err(|e| format!("Error al obtener miembros: {}", e))?;

        let members: Vec<serde_json::Value> = members_response.json().await.unwrap_or_default();
        
        for member in &members {
            if let Some(student_id) = member["student_id"].as_str() {
                all_student_ids.insert(student_id.to_string());
            }
        }

        groups_summary.push(GroupSummary {
            group_id: group_id.to_string(),
            group_name: group["name"].as_str().unwrap_or("").to_string(),
            member_count: members.len() as i32,
            active_members_week: 0, // Se calculará después
        });
    }

    let total_students = all_student_ids.len() as i32;

    // Calcular estudiantes activos esta semana y top students
    let now = chrono::Utc::now();
    let week_ago = now - chrono::Duration::days(7);
    let week_ago_str = week_ago.to_rfc3339();

    let mut top_students = Vec::new();
    let mut active_students_week = 0;

    for student_id in &all_student_ids {
        let sessions_response = client
            .get(format!("{}/rest/v1/session_logs", supabase_url))
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .query(&[("user_id", format!("eq.{}", student_id)), ("select", "*".to_string())])
            .send()
            .await
            .map_err(|e| format!("Error al obtener sesiones de estudiante: {}", e))?;

        let sessions: Vec<serde_json::Value> = sessions_response.json().await.unwrap_or_default();
        
        let recent_sessions: Vec<_> = sessions
            .iter()
            .filter(|s| {
                if let Some(started) = s["started_at"].as_str() {
                    started >= week_ago_str.as_str()
                } else {
                    false
                }
            })
            .collect();

        if !recent_sessions.is_empty() {
            active_students_week += 1;
        }

        // Calcular tiempo total
        let mut total_time = 0;
        for session in &sessions {
            if let (Some(started), Some(ended)) = (
                session["started_at"].as_str(),
                session["ended_at"].as_str(),
            ) {
                if let (Ok(start_time), Ok(end_time)) = (
                    chrono::DateTime::parse_from_rfc3339(started),
                    chrono::DateTime::parse_from_rfc3339(ended),
                ) {
                    total_time += (end_time - start_time).num_minutes() as i32;
                }
            }
        }

        // Obtener info del estudiante
        let user_response = client
            .get(format!("{}/rest/v1/users", supabase_url))
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .query(&[("id", format!("eq.{}", student_id)), ("select", "*".to_string())])
            .send()
            .await
            .map_err(|e| format!("Error al obtener usuario: {}", e))?;

        let users: Vec<serde_json::Value> = user_response.json().await.unwrap_or_default();
        
        if let Some(user) = users.first() {
            top_students.push(TopStudent {
                student_id: student_id.clone(),
                student_name: user["name"].as_str().unwrap_or("Unknown").to_string(),
                student_email: user["email"].as_str().unwrap_or("").to_string(),
                session_count: sessions.len() as i32,
                total_time_minutes: total_time,
            });
        }
    }

    // Ordenar top students por actividad
    top_students.sort_by(|a, b| b.session_count.cmp(&a.session_count));
    top_students.truncate(10);

    // Estudiantes inactivos (más de 7 días sin actividad)
    let inactive_students = Vec::new(); // TODO: Implementar si es necesario

    Ok(ProfessorDashboardStats {
        total_groups,
        total_students,
        active_students_week,
        top_students,
        groups_summary,
        inactive_students,
    })
}

// ============================================
// DASHBOARD ADMINISTRADOR
// ============================================
#[tauri::command]
pub async fn get_admin_dashboard_stats(
    requesting_role_id: i32,
) -> Result<AdminDashboardStats, String> {
    if requesting_role_id != 3 {
        return Err("Solo administradores pueden acceder".to_string());
    }

    let supabase_url = env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    let service_role_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();

    // Obtener todos los usuarios
    let users_response = client
        .get(format!("{}/rest/v1/users", supabase_url))
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .query(&[("select", "*".to_string())])
        .send()
        .await
        .map_err(|e| format!("Error al obtener usuarios: {}", e))?;

    let users: Vec<serde_json::Value> = users_response.json().await.unwrap_or_default();

    let total_users = users.len() as i32;
    let total_students = users.iter().filter(|u| u["role_id"].as_i64() == Some(1)).count() as i32;
    let total_professors = users.iter().filter(|u| u["role_id"].as_i64() == Some(2)).count() as i32;
    let total_admins = users.iter().filter(|u| u["role_id"].as_i64() == Some(3)).count() as i32;
    let active_users = users.iter().filter(|u| u["is_active"].as_bool() == Some(true)).count() as i32;
    let inactive_users = total_users - active_users;

    // Obtener todas las sesiones
    let sessions_response = client
        .get(format!("{}/rest/v1/session_logs", supabase_url))
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .query(&[("select", "*".to_string()), ("order", "started_at.desc".to_string())])
        .send()
        .await
        .map_err(|e| format!("Error al obtener sesiones: {}", e))?;

    let sessions: Vec<serde_json::Value> = sessions_response.json().await.unwrap_or_default();
    
    let total_sessions_all_time = sessions.len() as i32;

    // Sesiones esta semana
    let now = chrono::Utc::now();
    let week_ago = now - chrono::Duration::days(7);
    let week_ago_str = week_ago.to_rfc3339();

    let sessions_this_week = sessions
        .iter()
        .filter(|s| {
            if let Some(started) = s["started_at"].as_str() {
                started >= week_ago_str.as_str()
            } else {
                false
            }
        })
        .count() as i32;

    // Usuarios recientes (últimos 10)
    let mut recent_users_data = users.clone();
    recent_users_data.sort_by(|a, b| {
        let a_created = a["created_at"].as_str().unwrap_or("");
        let b_created = b["created_at"].as_str().unwrap_or("");
        b_created.cmp(a_created)
    });

    let recent_users: Vec<RecentUser> = recent_users_data
        .iter()
        .take(10)
        .map(|u| RecentUser {
            id: u["id"].as_str().unwrap_or("").to_string(),
            username: u["name"].as_str().unwrap_or("Unknown").to_string(),
            email: u["email"].as_str().unwrap_or("").to_string(),
            role_id: u["role_id"].as_i64().unwrap_or(1) as i32,
            created_at: u["created_at"].as_str().unwrap_or("").to_string(),
        })
        .collect();

    // Sesiones recientes globales (últimas 10)
    let recent_sessions_global: Vec<RecentSessionGlobal> = sessions
        .iter()
        .take(10)
        .map(|s| {
            let duration = if let (Some(started), Some(ended)) = (
                s["started_at"].as_str(),
                s["ended_at"].as_str(),
            ) {
                if let (Ok(start_time), Ok(end_time)) = (
                    chrono::DateTime::parse_from_rfc3339(started),
                    chrono::DateTime::parse_from_rfc3339(ended),
                ) {
                    Some((end_time - start_time).num_minutes() as i32)
                } else {
                    None
                }
            } else {
                None
            };

            // Buscar nombre de usuario
            let user_id = s["user_id"].as_str().unwrap_or("");
            let username = users
                .iter()
                .find(|u| u["id"].as_str() == Some(user_id))
                .and_then(|u| u["name"].as_str())
                .unwrap_or("Unknown")
                .to_string();

            RecentSessionGlobal {
                id: s["id"].as_str().unwrap_or("").to_string(),
                username,
                hostname: s["hostname"].as_str().unwrap_or("Unknown").to_string(),
                started_at: s["started_at"].as_str().unwrap_or("").to_string(),
                duration_minutes: duration,
            }
        })
        .collect();

    Ok(AdminDashboardStats {
        total_users,
        total_students,
        total_professors,
        total_admins,
        active_users,
        inactive_users,
        total_sessions_all_time,
        sessions_this_week,
        recent_users,
        recent_sessions_global,
    })
}
