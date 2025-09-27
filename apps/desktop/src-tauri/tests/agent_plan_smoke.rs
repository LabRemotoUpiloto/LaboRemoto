// Pruebas de humo para agent_plan (compila y ejecuta lógica síncrona mediante tokio)
use app::cmd::agent::{agent_plan, AgentPlanRequest};

#[tokio::test]
async fn test_search_intent_basic() {
    let req = AgentPlanRequest { session_id: None, user_message: "¿Dónde está el archivo Cargo.toml?".into(), workspace_root: None, limit: Some(5) };
    let resp = agent_plan(req).await.expect("agent_plan ok");
    assert_eq!(resp.intent, "search");
}

#[tokio::test]
async fn test_open_intent_basic() {
    let req = AgentPlanRequest { session_id: None, user_message: "abre el archivo Cargo.toml".into(), workspace_root: None, limit: Some(5) };
    let resp = agent_plan(req).await.expect("agent_plan ok");
    assert!(resp.intent == "open");
}

#[tokio::test]
async fn test_grep_intent_basic() {
    let req = AgentPlanRequest { session_id: None, user_message: "buscar texto \"package\" en archivos".into(), workspace_root: None, limit: Some(10) };
    let resp = agent_plan(req).await.expect("agent_plan ok");
    assert!(resp.intent == "grep");
}
