//! Tests básicos para la lógica de analyze_any_file y desambiguación.
use app::cmd::file_edit::analyze_any_file;

#[tokio::test]
async fn analyze_nonexistent_remote_returns_error() {
    // Sin session_id y archivo inexistente debe fallar.
    let res = analyze_any_file(None, "archivo_que_no_existe_xyz.rs".to_string(), None).await;
    assert!(res.is_err(), "Debe retornar Err para archivo inexistente local sin sesión");
}

#[tokio::test]
async fn analyze_relative_without_session_err() {
    // Nombre simple sin sesión: se intentará como ruta absoluta (fallará) y devolerá Err
    let res = analyze_any_file(None, "main.rs".to_string(), None).await;
    assert!(res.is_err());
}

// Nota: Tests más profundos de multi-match remoto requieren mock/fixture de sesión SSH.
// Podrían añadirse en el futuro con una abstracción de SFTP inyectable.
