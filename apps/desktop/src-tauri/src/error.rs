// Tipos de error compartidos en el backend.
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    /// Error genérico del subsistema SSH
    #[error("SSH: {0}")] Ssh(String),
    /// Recurso no encontrado (genérico)
    #[error("Not found: {0}")] NotFound(String),
    /// Sesión SSH no encontrada
    #[error("Session not found")] NotFoundSession,
    /// Error de variable de entorno
    #[error("Environment variable error: {0}")] EnvVar(String),
    /// Error de red/HTTP
    #[error("Network error: {0}")] Network(String),
    /// Error de API externa
    #[error("API error: {0}")] Api(String),
    /// Error de serialización/deserialización
    #[error("Serialization error: {0}")] Serialization(String),
    /// Error de I/O
    #[error("I/O error: {0}")] Io(#[from] std::io::Error),
    /// Error de proceso externo
    #[error("External process error: {0}")] External(String),
    /// Error de autorización
    #[error("Unauthorized: {0}")] Unauthorized(String),
}

/// Resultado conveniente para funciones que devuelven AppError.
pub type AppResult<T> = Result<T, AppError>;

