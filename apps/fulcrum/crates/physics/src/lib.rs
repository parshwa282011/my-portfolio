//! Part 2: the physics engine. Assembled block structures become rigid bodies with real mass
//! properties; forces (gravity, buoyancy, drag, lift gas, thrust) come from toggleable phenomena.
//! Nothing here depends on the voxel crate: terrain is reached through the [`Terrain`] trait.
pub mod assembly;
pub mod massprops;
pub mod world;

pub use assembly::{assemble, AssembleError, Assembly};
pub use massprops::{mass_properties, MassProps};
pub use world::{Controls, Environment, PhysicsWorld, StructureId, Terrain};
