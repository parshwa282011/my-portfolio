//! Gameplay glue: the player, chunk streaming, the link between the block world and the physics world.
pub mod game;
pub mod player;
pub mod terrain;

pub use game::{ChunkUpdate, Game, StructureMesh};
pub use player::{Player, PlayerInput};
