use app::cmd::file_edit::analyze_any_file;

// Este test simula el caso de ambigüedad: como no tenemos una sesión SSH real ni
// infraestructura para inyectar resultados remotos, aprovechamos que analyze_any_file
// entra en la rama de disambiguación únicamente cuando la búsqueda remota retorna >1
// coincidencia. Para aislar la lógica, podríamos extraer una función pura; mientras,
// aquí verificamos que cuando no hay sesión devuelve error y que con nombre genérico
// sin sesión no provoca pánico (comportamiento estable). Un test más completo requeriría
// refactor para inyectar un trait de búsqueda remota.

#[tokio::test]
async fn test_analyze_file_no_session_err() {
    let res = analyze_any_file(None, "noExiste_Archivo.xyz".into(), None).await;
    assert!(res.is_err());
}
