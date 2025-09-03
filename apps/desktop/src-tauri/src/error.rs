use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("SSH: {0}")] Ssh(String),
    #[error("Not found")] NotFound,
}

pub type AppResult<T> = Result<T, AppError>;
