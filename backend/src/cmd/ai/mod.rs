//! cmd/ai — Módulos de inteligencia artificial y agentes
//!
//! Este módulo contiene:
//! - agent.rs: Agente AI con tools y planificación
//! - ai.rs: Chat AI y comandos relacionados
//! - ai_utils.rs: Utilidades para AI (estado, pruebas de API)

pub mod agent;
pub mod ai;
pub mod ai_utils;

pub use agent::agent_plan;
pub use ai::{ai_chat, cancel_ai_chat};
pub use ai_utils::{ai_env_status, ai_test_key};
