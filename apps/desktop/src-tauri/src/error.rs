// Tipos de error compartidos en el backend.
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    /// Error genérico del subsistema SSH
    #[error("SSH: {0}")] Ssh(String),
    /// Recurso no encontrado
    #[error("Not found")] NotFound,
}

/// Resultado conveniente para funciones que devuelven AppError.
pub type AppResult<T> = Result<T, AppError>;
