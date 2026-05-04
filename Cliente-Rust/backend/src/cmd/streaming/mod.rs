//! cmd/streaming — Streaming de video vía port-forwarding
//!
//! Este módulo contiene:
//! - stream.rs: Port-forwarding SSH, cámaras, WHEP

pub mod stream;

pub use stream::{stream_start, stream_stop, stream_list_cameras, stream_get_host, whep_exchange};
