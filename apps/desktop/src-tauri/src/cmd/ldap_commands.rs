use crate::cmd::ldap_auth::{ldap_login, map_ldap_groups_to_role, LdapUser};
use crate::cmd::ldap_sync::{sync_ldap_user_to_supabase, UserSession};
use crate::cmd::jwt_auth::generate_jwt;

#[tauri::command]
pub async fn ldap_login_and_sync(
    username: String,
    password: String,
) -> Result<UserSession, String> {
    // 1. Validar credenciales contra LDAP
    let ldap_user = ldap_login(username.clone(), password).await?;
    
    // 2. Determinar rol basado en grupos LDAP
    let role_id = map_ldap_groups_to_role(&ldap_user.groups);
    
    // 3. Sincronizar usuario con Supabase
    let user_id = sync_ldap_user_to_supabase(
        &username,
        &ldap_user.email,
        &ldap_user.name,
        role_id,
        &ldap_user.dn,
    ).await?;
    
    // 4. Generar JWT token
    let token = generate_jwt(&username, role_id)?;
    
    // 5. Devolver sesión
    Ok(UserSession {
        user_id,
        ldap_username: username,
        email: ldap_user.email,
        name: ldap_user.name,
        role_id,
        token,
    })
}

#[tauri::command]
pub async fn verify_token(token: String) -> Result<UserSession, String> {
    use crate::cmd::jwt_auth::verify_jwt;
    
    let claims = verify_jwt(&token)?;
    
    // Aquí podrías buscar el usuario en Supabase para obtener info actualizada
    Ok(UserSession {
        user_id: claims.sub.clone(),
        ldap_username: claims.sub,
        email: "".to_string(), // Buscar en DB si necesitas
        name: "".to_string(),
        role_id: claims.role,
        token,
    })
}
