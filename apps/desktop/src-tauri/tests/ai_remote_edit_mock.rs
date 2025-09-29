use app::cmd::file_edit::{ai_remote_edit_file, AiRemoteEditRequest};

// Para testear ai_remote_edit_file sin llamar a la API real se requeriría introducir una
// abstracción (por ejemplo un trait HttpClient) o compilar con un feature que reemplace
// la llamada. Este archivo deja un placeholder y documentación para ese refactor.
// (No se marca como #[tokio::test] aún para no fallar el build.)

#[allow(dead_code)]
async fn placeholder_ai_edit_test() {
    let _ = AiRemoteEditRequest { session_id: "dummy".into(), path: "remote.txt".into(), instruction: "Agregar encabezado".into(), apply: false };
    // Futuro: inyectar mock que devuelva JSON fijo.
}
