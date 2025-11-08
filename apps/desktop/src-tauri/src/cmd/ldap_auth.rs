use anyhow::{Context, Result};
use ldap3::{LdapConn, Scope, SearchEntry};
use serde::{Deserialize, Serialize};
use std::env;

/// Información del usuario extraída desde LDAP
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LdapUser {
    pub username: String,
    pub email: String,
    pub name: String,
    pub groups: Vec<String>,
    pub role_id: i16,
}

/// Configuración LDAP desde variables de entorno
#[derive(Debug, Clone)]
pub struct LdapConfig {
    pub url: String,
    pub base_dn: String,
    pub user_dn_pattern: String,
    pub search_base: String,
    pub user_attributes: Vec<String>,
    pub group_students: String,
    pub group_professors: String,
    pub group_admins: String,
}

impl LdapConfig {
    /// Carga la configuración desde variables de entorno
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            url: env::var("LDAP_URL")
                .unwrap_or_else(|_| "ldap://localhost:389".to_string()),
            base_dn: env::var("LDAP_BASE_DN")
                .unwrap_or_else(|_| "dc=universidad,dc=edu".to_string()),
            user_dn_pattern: env::var("LDAP_USER_DN_PATTERN")
                .unwrap_or_else(|_| "uid={username},ou=users,dc=universidad,dc=edu".to_string()),
            search_base: env::var("LDAP_SEARCH_BASE")
                .unwrap_or_else(|_| "ou=users,dc=universidad,dc=edu".to_string()),
            user_attributes: env::var("LDAP_USER_ATTRIBUTES")
                .unwrap_or_else(|_| "uid,mail,cn,displayName,memberOf".to_string())
                .split(',')
                .map(|s| s.trim().to_string())
                .collect(),
            group_students: env::var("LDAP_GROUP_STUDENTS")
                .unwrap_or_else(|_| "cn=students,ou=groups,dc=universidad,dc=edu".to_string()),
            group_professors: env::var("LDAP_GROUP_PROFESSORS")
                .unwrap_or_else(|_| "cn=professors,ou=groups,dc=universidad,dc=edu".to_string()),
            group_admins: env::var("LDAP_GROUP_ADMINS")
                .unwrap_or_else(|_| "cn=admins,ou=groups,dc=universidad,dc=edu".to_string()),
        })
    }

    /// Construye el DN completo del usuario
    fn build_user_dn(&self, username: &str) -> String {
        self.user_dn_pattern.replace("{username}", username)
    }

    /// Mapea los grupos LDAP a un role_id
    fn map_groups_to_role(&self, groups: &[String]) -> i16 {
        // Prioridad: admin > professor > student
        for group in groups {
            if group.contains(&self.group_admins) || group.to_lowercase().contains("admin") {
                return 3; // Admin
            }
        }
        for group in groups {
            if group.contains(&self.group_professors) 
                || group.to_lowercase().contains("professor")
                || group.to_lowercase().contains("teacher") {
                return 2; // Professor
            }
        }
        1 // Default: Student
    }
}

/// Autentica un usuario contra el servidor LDAP
pub async fn authenticate_ldap(username: &str, password: &str) -> Result<LdapUser> {
    let config = LdapConfig::from_env()?;
    
    // Ejecutar en un thread bloqueante porque ldap3 no es async
    let username = username.to_string();
    let password = password.to_string();
    
    tokio::task::spawn_blocking(move || {
        authenticate_ldap_sync(&username, &password, &config)
    })
    .await
    .context("Error al ejecutar autenticación LDAP")?
}

/// Autenticación LDAP síncrona
fn authenticate_ldap_sync(username: &str, password: &str, config: &LdapConfig) -> Result<LdapUser> {
    // 1. Conectar al servidor LDAP
    let mut ldap = LdapConn::new(&config.url)
        .context("No se pudo conectar al servidor LDAP")?;

    // 2. Construir el DN del usuario
    let user_dn = config.build_user_dn(username);

    // 3. Intentar autenticar (bind) con las credenciales del usuario
    ldap.simple_bind(&user_dn, password)
        .context("Credenciales inválidas o usuario no existe")?;

    // 4. Buscar información adicional del usuario
    let search_filter = format!("(uid={})", username);
    let (rs, _res) = ldap
        .search(
            &config.search_base,
            Scope::Subtree,
            &search_filter,
            config.user_attributes.clone(),
        )
        .context("Error al buscar información del usuario")?
        .success()
        .context("La búsqueda LDAP no devolvió resultados")?;

    // 5. Parsear el resultado
    if let Some(entry) = rs.into_iter().next() {
        let entry = SearchEntry::construct(entry);

        // Extraer atributos
        let email = entry
            .attrs
            .get("mail")
            .and_then(|v| v.first())
            .cloned()
            .unwrap_or_else(|| format!("{}@universidad.edu", username));

        let name = entry
            .attrs
            .get("cn")
            .or_else(|| entry.attrs.get("displayName"))
            .and_then(|v| v.first())
            .cloned()
            .unwrap_or_else(|| username.to_string());

        let groups = entry
            .attrs
            .get("memberOf")
            .cloned()
            .unwrap_or_default();

        // Mapear grupos a rol
        let role_id = config.map_groups_to_role(&groups);

        Ok(LdapUser {
            username: username.to_string(),
            email,
            name,
            groups,
            role_id,
        })
    } else {
        anyhow::bail!("Usuario no encontrado en LDAP")
    }
}

/// Para testing: simula autenticación LDAP (cuando no hay servidor disponible)
#[cfg(test)]
pub async fn authenticate_ldap_mock(username: &str, password: &str) -> Result<LdapUser> {
    // Simular delay de red
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    // Credenciales de prueba
    if password == "test123" {
        let (role_id, groups) = match username {
            "admin" => (3, vec!["cn=admins,ou=groups,dc=universidad,dc=edu".to_string()]),
            "profesor" | "teacher" => (2, vec!["cn=professors,ou=groups,dc=universidad,dc=edu".to_string()]),
            _ => (1, vec!["cn=students,ou=groups,dc=universidad,dc=edu".to_string()]),
        };

        Ok(LdapUser {
            username: username.to_string(),
            email: format!("{}@universidad.edu", username),
            name: format!("Usuario {}", username),
            groups,
            role_id,
        })
    } else {
        anyhow::bail!("Credenciales inválidas")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_auth_student() {
        let result = authenticate_ldap_mock("estudiante1", "test123").await;
        assert!(result.is_ok());
        let user = result.unwrap();
        assert_eq!(user.role_id, 1);
    }

    #[tokio::test]
    async fn test_mock_auth_professor() {
        let result = authenticate_ldap_mock("profesor", "test123").await;
        assert!(result.is_ok());
        let user = result.unwrap();
        assert_eq!(user.role_id, 2);
    }

    #[tokio::test]
    async fn test_mock_auth_admin() {
        let result = authenticate_ldap_mock("admin", "test123").await;
        assert!(result.is_ok());
        let user = result.unwrap();
        assert_eq!(user.role_id, 3);
    }

    #[tokio::test]
    async fn test_mock_auth_invalid() {
        let result = authenticate_ldap_mock("usuario", "wrongpass").await;
        assert!(result.is_err());
    }
}
