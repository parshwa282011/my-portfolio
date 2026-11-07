use crate::chunk::{Chunk, ChunkPos, CS};
use crate::mesh::{mesh_grid, ChunkMesh, Grid};
use crate::terrain::{TerrainGen, WORLD_HEIGHT};
use fulcrum_core::{BlockId, Content};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

pub struct World {
    pub content: Arc<Content>,
    pub gen: TerrainGen,
    chunks: HashMap<ChunkPos, Chunk>,
    dirty: HashSet<ChunkPos>,
    bedrock: BlockId,
}

fn split(v: i32) -> (i32, usize) {
    (v.div_euclid(CS as i32), v.rem_euclid(CS as i32) as usize)
}

impl World {
    pub fn new(seed: u64, content: Arc<Content>) -> World {
        let gen = TerrainGen::new(seed, &content);
        let bedrock = content.require("bedrock");
        World { content, gen, chunks: HashMap::new(), dirty: HashSet::new(), bedrock }
    }

    pub fn is_loaded(&self, cp: ChunkPos) -> bool {
        self.chunks.contains_key(&cp)
    }

    pub fn loaded_chunks(&self) -> impl Iterator<Item = &ChunkPos> {
        self.chunks.keys()
    }

    /// Generate the chunk if it does not exist yet. Returns true if it was created.
    pub fn ensure_chunk(&mut self, cp: ChunkPos) -> bool {
        if cp.1 < 0 || cp.1 * CS as i32 >= WORLD_HEIGHT || self.chunks.contains_key(&cp) {
            return false;
        }
        let chunk = self.gen.generate(cp);
        self.chunks.insert(cp, chunk);
        self.mark_dirty_around(cp);
        true
    }

    pub fn unload_chunk(&mut self, cp: ChunkPos) {
        self.chunks.remove(&cp);
        self.dirty.remove(&cp);
    }

    /// Block at a world position, or `None` if its chunk has not been generated.
    pub fn get_opt(&self, x: i32, y: i32, z: i32) -> Option<BlockId> {
        if y < 0 {
            return Some(self.bedrock);
        }
        if y >= WORLD_HEIGHT {
            return Some(0);
        }
        let ((cx, lx), (cy, ly), (cz, lz)) = (split(x), split(y), split(z));
        self.chunks.get(&(cx, cy, cz)).map(|c| c.get(lx, ly, lz))
    }

    /// Block at a world position; ungenerated chunks read as air (use `get_opt` to tell the difference).
    pub fn get(&self, x: i32, y: i32, z: i32) -> BlockId {
        self.get_opt(x, y, z).unwrap_or(0)
    }

    pub fn is_solid(&self, x: i32, y: i32, z: i32) -> bool {
        self.content.is_solid(self.get(x, y, z))
    }

    /// For collision: ground that has not loaded yet counts as solid so nothing falls through the world.
    pub fn is_solid_or_unloaded(&self, x: i32, y: i32, z: i32) -> bool {
        match self.get_opt(x, y, z) {
            Some(b) => self.content.is_solid(b),
            None => true,
        }
    }

    pub fn is_fluid(&self, x: i32, y: i32, z: i32) -> bool {
        self.content.is_fluid(self.get(x, y, z))
    }

    /// Set a block (generating its chunk if needed). Returns false if the position is outside the world.
    pub fn set(&mut self, x: i32, y: i32, z: i32, id: BlockId) -> bool {
        if !(0..WORLD_HEIGHT).contains(&y) {
            return false;
        }
        let ((cx, lx), (cy, ly), (cz, lz)) = (split(x), split(y), split(z));
        let cp = (cx, cy, cz);
        self.ensure_chunk(cp);
        let Some(chunk) = self.chunks.get_mut(&cp) else { return false };
        chunk.set(lx, ly, lz, id);
        self.dirty.insert(cp);
        // faces and ambient occlusion on the neighbouring chunks depend on border blocks
        let edge = |l: usize| if l == 0 { -1 } else if l == CS - 1 { 1 } else { 0 };
        for dx in [0, edge(lx)] {
            for dy in [0, edge(ly)] {
                for dz in [0, edge(lz)] {
                    if (dx, dy, dz) != (0, 0, 0) {
                        let n = (cx + dx, cy + dy, cz + dz);
                        if self.chunks.contains_key(&n) {
                            self.dirty.insert(n);
                        }
                    }
                }
            }
        }
        true
    }

    fn mark_dirty_around(&mut self, cp: ChunkPos) {
        for dx in -1..=1 {
            for dy in -1..=1 {
                for dz in -1..=1 {
                    let n = (cp.0 + dx, cp.1 + dy, cp.2 + dz);
                    if self.chunks.contains_key(&n) {
                        self.dirty.insert(n);
                    }
                }
            }
        }
    }

    /// Chunks whose mesh is stale. Drains the set.
    pub fn take_dirty(&mut self) -> Vec<ChunkPos> {
        let mut v: Vec<_> = self.dirty.drain().collect();
        v.sort();
        v
    }

    pub fn mesh_chunk(&self, cp: ChunkPos) -> ChunkMesh {
        let (x0, y0, z0) = (cp.0 * CS as i32, cp.1 * CS as i32, cp.2 * CS as i32);
        let grid = Grid::new([CS; 3], |x, y, z| self.get(x0 + x, y0 + y, z0 + z));
        mesh_grid(&grid, &self.content)
    }

    pub fn chunk(&self, cp: ChunkPos) -> Option<&Chunk> {
        self.chunks.get(&cp)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn world() -> World {
        World::new(99, Arc::new(Content::builtin()))
    }

    #[test]
    fn edit_round_trip_and_dirty_neighbours() {
        let mut w = world();
        for cx in -1..=1 {
            for cz in -1..=1 {
                for cy in 0..4 {
                    w.ensure_chunk((cx, cy, cz));
                }
            }
        }
        w.take_dirty();
        let stone = w.content.require("stone");
        assert!(w.set(15, 20, 15, stone)); // a corner block marks the 8 surrounding chunks too
        assert_eq!(w.get(15, 20, 15), stone);
        let dirty = w.take_dirty();
        assert!(dirty.contains(&(0, 1, 0)) && dirty.contains(&(1, 1, 1)) && dirty.contains(&(1, 1, 0)));
        assert!(w.take_dirty().is_empty());
        assert!(!w.set(0, -1, 0, stone) && !w.set(0, 200, 0, stone));
    }

    #[test]
    fn negative_coordinates_map_to_the_right_chunk() {
        let mut w = world();
        let sand = w.content.require("sand");
        w.set(-1, 5, -1, sand);
        assert_eq!(w.get(-1, 5, -1), sand);
        assert!(w.is_loaded((-1, 0, -1)));
        w.ensure_chunk((0, 0, 0));
        assert_ne!(w.get(0, 5, 0), sand);
    }

    #[test]
    fn unloaded_ground_is_solid_for_collisions_but_air_for_reads() {
        let w = world();
        assert!(w.is_solid_or_unloaded(500, 10, 500));
        assert!(!w.is_solid(500, 10, 500));
        assert_eq!(w.get_opt(500, 10, 500), None);
    }

    #[test]
    fn chunk_meshes_are_nonempty_at_the_surface() {
        let mut w = world();
        let h = w.gen.height(8, 8);
        let cp = (0, h.div_euclid(16), 0);
        for dx in -1..=1 {
            for dz in -1..=1 {
                for dy in -1..=1 {
                    w.ensure_chunk((dx, cp.1 + dy, dz));
                }
            }
        }
        assert!(!w.mesh_chunk(cp).opaque.is_empty());
    }
}
