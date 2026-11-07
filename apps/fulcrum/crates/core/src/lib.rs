//! Shared foundations: block content, the phenomenon registry, deterministic hashing and SI constants.
pub mod content;
pub mod hash;
pub mod registry;
pub mod units;

pub use content::{BlockDef, BlockId, Content, Render};
