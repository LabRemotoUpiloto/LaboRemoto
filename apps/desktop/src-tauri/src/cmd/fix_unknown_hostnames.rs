/// Actualiza los logs que tienen hostname/username como null o "Unknown"
/// con valores extraídos del session_id (formato: user@host:port)
#[tauri::command]
pub async fn fix_unknown_hostnames() -> Result<String, String> {
    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurada".to_string())?;
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurada".to_string())?;

    let client = reqwest::Client::new();
    
    // 1. Obtener todos los logs (verificaremos hostname en código, no en query)
    let get_url = format!(
        "{}/rest/v1/session_logs?select=*",
        supabase_url
    );
    
    println!("🔍 Obteniendo todos los logs para verificar hostnames...");
    
    let response = client
        .get(&get_url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .send()
        .await
        .map_err(|e| format!("Error al obtener logs: {}", e))?;

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Error en query: {}", body));
    }

    let logs: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Error al parsear respuesta: {}", e))?;

    println!("📊 Total de logs encontrados: {}", logs.len());
    
    // Debug: mostrar los primeros logs para ver estructura
    if !logs.is_empty() {
        println!("🔍 Ejemplo de log: {:?}", logs[0]);
    }
    
    // Filtrar logs que necesitan actualización (host null, vacío o "Unknown")
    let logs_to_update: Vec<&serde_json::Value> = logs.iter()
        .filter(|log| {
            let host_value = log.get("host");
            let host_str = host_value.and_then(|h| h.as_str()).unwrap_or("");
            
            // Consideramos que necesita actualización si:
            // 1. El campo "host" no existe
            // 2. El campo "host" es null
            // 3. El valor es una cadena vacía
            // 4. El valor es "Unknown" o "unknown"
            let needs_update = host_value.is_none() 
                || host_value == Some(&serde_json::Value::Null)
                || host_str.is_empty() 
                || host_str == "Unknown" 
                || host_str == "unknown";
            
            if needs_update {
                println!("  → Log {} necesita actualización (host={:?})", 
                    log.get("id").and_then(|v| v.as_str()).unwrap_or("?"),
                    host_value
                );
            }
            
            needs_update
        })
        .collect();

    println!("📊 Logs con host Unknown/vacío: {}", logs_to_update.len());

    let mut updated_count = 0;
    let total_logs = logs_to_update.len();

    // 2. Actualizar cada log extrayendo info del session_id
    for log in &logs_to_update {
        let id = log["id"].as_str().unwrap_or("");
        let session_id = log["session_id"].as_str().unwrap_or("");
        
        // Parsear session_id: formato esperado "user@host:port" o UUID
        let (username, hostname) = if session_id.contains('@') && session_id.contains(':') {
            let parts: Vec<&str> = session_id.split('@').collect();
            let user = parts.get(0).unwrap_or(&"student").to_string();
            
            let host_port = parts.get(1).unwrap_or(&"192.168.20.66:22");
            let host = host_port.split(':').next().unwrap_or("192.168.20.66").to_string();
            
            (user, host)
        } else {
            // Si no tiene formato esperado, usar valores por defecto de Kali
            ("kali".to_string(), "192.168.20.66".to_string())
        };

        println!("🔧 Actualizando log {} → user={}, host={}", id, username, hostname);

        // 3. Actualizar en Supabase
        let update_url = format!(
            "{}/rest/v1/session_logs?id=eq.{}",
            supabase_url, id
        );

        let update_body = serde_json::json!({
            "username": username,
            "host": hostname
        });

        let update_response = client
            .patch(&update_url)
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=minimal")
            .json(&update_body)
            .send()
            .await
            .map_err(|e| format!("Error al actualizar log {}: {}", id, e))?;

        if update_response.status().is_success() {
            updated_count += 1;
            println!("✅ Log {} actualizado", id);
        } else {
            let err_body = update_response.text().await.unwrap_or_default();
            println!("❌ Error al actualizar log {}: {}", id, err_body);
        }
    }

    Ok(format!("✅ Actualizados {} de {} logs con host Unknown", updated_count, total_logs))
}
