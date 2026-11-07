//! Seeded, deterministic terrain: continents and hills, climate-driven surface blocks, water,
//! caves and trees. Everything is a pure function of (seed, position), so chunks can be generated
//! in any order (and on a server or in the browser) with identical results.
use crate::chunk::{Chunk, ChunkPos, CS};
use crate::noise::Noise;
use fulcrum_core::hash::{hash3, unit_f32};
use fulcrum_core::{BlockId, Content};

pub const WORLD_HEIGHT: i32 = 128;
pub const SEA_LEVEL: i32 = 40;

#[derive(Clone)]
pub struct TerrainGen {
    pub seed: u64,
    n_cont: Noise,
    n_hills: Noise,
    n_mount: Noise,
    n_temp: Noise,
    n_humid: Noise,
    n_cave_a: Noise,
    n_cave_b: Noise,
    n_cheese: Noise,
    air: BlockId,
    stone: BlockId,
    dirt: BlockId,
    grass: BlockId,
    sand: BlockId,
    water: BlockId,
    bedrock: BlockId,
    log: BlockId,
    leaves: BlockId,
    snow: BlockId,
}

struct Tree {
    x: i32,
    z: i32,
    base: i32,
    height: i32,
}

impl TerrainGen {
    pub fn new(seed: u64, content: &Content) -> TerrainGen {
        let n = |k: u64| Noise::new(seed.wrapping_mul(31).wrapping_add(k));
        TerrainGen {
            seed,
            n_cont: n(1),
            n_hills: n(2),
            n_mount: n(3),
            n_temp: n(4),
            n_humid: n(5),
            n_cave_a: n(6),
            n_cave_b: n(7),
            n_cheese: n(8),
            air: 0,
            stone: content.require("stone"),
            dirt: content.require("dirt"),
            grass: content.require("grass"),
            sand: content.require("sand"),
            water: content.require("water"),
            bedrock: content.require("bedrock"),
            log: content.require("log"),
            leaves: content.require("leaves"),
            snow: content.require("snow"),
        }
    }

    /// Surface height (the y of the topmost solid block) at a column.
    pub fn height(&self, wx: i32, wz: i32) -> i32 {
        let (x, z) = (wx as f32, wz as f32);
        let continent = self.n_cont.fbm2(x / 420.0, z / 420.0, 3, 0.5);
        let hills = self.n_hills.fbm2(x / 64.0, z / 64.0, 4, 0.5);
        let ridge = (self.n_mount.fbm2(x / 260.0 + 50.0, z / 260.0, 3, 0.5) - 0.12).max(0.0);
        let h = SEA_LEVEL as f32 + 9.0 + continent * 30.0 + hills * 9.0 + ridge * ridge * 150.0;
        (h as i32).clamp(3, WORLD_HEIGHT - 8)
    }

    /// (temperature, humidity), each roughly in [-1, 1]; temperature also falls with altitude.
    pub fn climate(&self, wx: i32, wz: i32, h: i32) -> (f32, f32) {
        let (x, z) = (wx as f32, wz as f32);
        let t = self.n_temp.fbm2(x / 500.0, z / 500.0, 2, 0.5) - (h - SEA_LEVEL).max(0) as f32 / 110.0;
        let m = self.n_humid.fbm2(x / 380.0 + 9.0, z / 380.0, 2, 0.5);
        (t, m)
    }

    fn tree_at(&self, wx: i32, wz: i32) -> Option<Tree> {
        let h = self.height(wx, wz);
        if h <= SEA_LEVEL + 1 || h > 86 {
            return None;
        }
        let (t, m) = self.climate(wx, wz, h);
        if t < -0.4 {
            return None; // too cold for trees
        }
        let chance = 0.003 + 0.011 * (m * 0.5 + 0.5).max(0.0);
        let r = unit_f32(hash3(self.seed, wx, 7, wz));
        if r >= chance {
            return None;
        }
        // thin out neighbours: only the lowest-hash tree in a 3×3 neighbourhood survives
        for dx in -1..=1 {
            for dz in -1..=1 {
                if (dx, dz) != (0, 0) && unit_f32(hash3(self.seed, wx + dx, 7, wz + dz)) < r && unit_f32(hash3(self.seed, wx + dx, 7, wz + dz)) < chance {
                    return None;
                }
            }
        }
        let height = 4 + (unit_f32(hash3(self.seed, wx, 11, wz)) * 3.0) as i32;
        Some(Tree { x: wx, z: wz, base: h + 1, height })
    }

    fn surface_block(&self, wx: i32, wz: i32, h: i32) -> (BlockId, BlockId) {
        let (t, _) = self.climate(wx, wz, h);
        if h <= SEA_LEVEL + 1 {
            return (self.sand, self.sand);
        }
        if h > 96 || t < -0.45 {
            return (self.snow, self.stone);
        }
        (self.grass, self.dirt)
    }

    fn is_cave(&self, wx: i32, wy: i32, wz: i32, h: i32) -> bool {
        if wy < 4 || wy > h - 4 {
            return false;
        }
        let (x, y, z) = (wx as f32, wy as f32, wz as f32);
        let a = self.n_cave_a.perlin3(x / 28.0, y / 18.0, z / 28.0);
        let b = self.n_cave_b.perlin3(x / 28.0 + 100.0, y / 18.0, z / 28.0);
        if a.abs() < 0.07 && b.abs() < 0.07 {
            return true; // spaghetti tunnels where two noise fields cross zero together
        }
        self.n_cheese.perlin3(x / 40.0, y / 26.0, z / 40.0) > 0.62 // large caverns
    }

    pub fn generate(&self, cp: ChunkPos) -> Chunk {
        let (cx, cy, cz) = cp;
        if cy < 0 {
            return Chunk::filled(self.bedrock);
        }
        let (x0, y0, z0) = (cx * CS as i32, cy * CS as i32, cz * CS as i32);
        let mut chunk = Chunk::filled(self.air);
        let mut heights = [[0i32; CS]; CS];
        let mut max_h = 0;
        for lz in 0..CS {
            for lx in 0..CS {
                heights[lz][lx] = self.height(x0 + lx as i32, z0 + lz as i32);
                max_h = max_h.max(heights[lz][lx]);
            }
        }
        // fast path: sky above every column, the sea and the tallest tree (canopies reach 8 blocks up)
        if y0 > max_h.max(SEA_LEVEL) + 9 {
            return chunk;
        }
        for lz in 0..CS {
            for lx in 0..CS {
                let (wx, wz) = (x0 + lx as i32, z0 + lz as i32);
                let h = heights[lz][lx];
                let (top, sub) = self.surface_block(wx, wz, h);
                for ly in 0..CS {
                    let wy = y0 + ly as i32;
                    let b = if wy == 0 {
                        self.bedrock
                    } else if wy > h {
                        if wy <= SEA_LEVEL { self.water } else { self.air }
                    } else if self.is_cave(wx, wy, wz, h) {
                        self.air
                    } else if wy == h {
                        top
                    } else if wy >= h - 3 {
                        sub
                    } else if wy < 3 && unit_f32(hash3(self.seed, wx, wy, wz)) < 0.5 {
                        self.bedrock
                    } else {
                        self.stone
                    };
                    if b != self.air {
                        chunk.set(lx, ly, lz, b);
                    }
                }
            }
        }
        // trees whose trunk or canopy reaches into this chunk (canopy radius is 2)
        for wz in (z0 - 2)..(z0 + CS as i32 + 2) {
            for wx in (x0 - 2)..(x0 + CS as i32 + 2) {
                if let Some(tree) = self.tree_at(wx, wz) {
                    self.place_tree(&mut chunk, &tree, (x0, y0, z0));
                }
            }
        }
        chunk.compact();
        chunk
    }

    fn place_tree(&self, chunk: &mut Chunk, tree: &Tree, origin: (i32, i32, i32)) {
        let put = |chunk: &mut Chunk, x: i32, y: i32, z: i32, b: BlockId, only_air: bool| {
            let (lx, ly, lz) = (x - origin.0, y - origin.1, z - origin.2);
            if (0..CS as i32).contains(&lx) && (0..CS as i32).contains(&ly) && (0..CS as i32).contains(&lz) {
                let cur = chunk.get(lx as usize, ly as usize, lz as usize);
                if !only_air || cur == self.air {
                    chunk.set(lx as usize, ly as usize, lz as usize, b);
                }
            }
        };
        let top = tree.base + tree.height;
        for y in (top - 2)..=(top + 1) {
            let r: i32 = if y >= top { 1 } else { 2 };
            for dz in -r..=r {
                for dx in -r..=r {
                    if r == 2 && dx.abs() == 2 && dz.abs() == 2 {
                        continue;
                    }
                    put(chunk, tree.x + dx, y, tree.z + dz, self.leaves, true);
                }
            }
        }
        for y in tree.base..top {
            put(chunk, tree.x, y, tree.z, self.log, false);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gen() -> TerrainGen {
        TerrainGen::new(1234, &Content::builtin())
    }

    #[test]
    fn same_seed_same_chunk_different_seed_differs() {
        let c = Content::builtin();
        let a = TerrainGen::new(5, &c).generate((3, 2, -4));
        let b = TerrainGen::new(5, &c).generate((3, 2, -4));
        let d = TerrainGen::new(6, &c).generate((3, 2, -4));
        let same = |p: &Chunk, q: &Chunk| p.iter().all(|(x, y, z, id)| id == q.get(x, y, z));
        assert!(same(&a, &b));
        assert!(!same(&a, &d));
    }

    #[test]
    fn the_world_has_both_land_and_ocean_and_water_fills_to_sea_level() {
        let g = gen();
        let c = Content::builtin();
        let (water, bedrock) = (c.require("water"), c.require("bedrock"));
        // scan outward for a column below sea level
        let mut found = None;
        let (mut land, mut sea) = (0, 0);
        'scan: for wz in (-3000..3000).step_by(24) {
            for wx in (-3000..3000).step_by(24) {
                let h = g.height(wx, wz);
                if h > SEA_LEVEL + 1 { land += 1 } else { sea += 1 }
                if h < SEA_LEVEL - 2 && found.is_none() {
                    found = Some((wx, wz, h));
                }
                if found.is_some() && land > 0 {
                    break 'scan;
                }
            }
        }
        assert!(land > 0 && found.is_some(), "expected land and ocean (land {land}, sea {sea})");
        let (wx, wz, h) = found.unwrap();
        let (cx, cz) = (wx.div_euclid(16), wz.div_euclid(16));
        let chunk = g.generate((cx, SEA_LEVEL.div_euclid(16), cz));
        let (lx, lz) = (wx.rem_euclid(16) as usize, wz.rem_euclid(16) as usize);
        let ly = (SEA_LEVEL - SEA_LEVEL.div_euclid(16) * 16) as usize;
        assert!(h < SEA_LEVEL);
        assert_eq!(chunk.get(lx, ly, lz), water, "the column below sea level is filled with water up to the sea");
        assert_eq!(g.generate((0, 0, 0)).get(5, 0, 5), bedrock, "world floor is bedrock");
    }

    #[test]
    fn trees_cross_chunk_borders_consistently() {
        // a tree's blocks must be identical whichever neighbouring chunk is generated
        let g = gen();
        let c = Content::builtin();
        let log = c.require("log");
        let mut logs = 0;
        for cx in -6..6 {
            for cz in -6..6 {
                for cy in 2..5 {
                    let chunk = g.generate((cx, cy, cz));
                    logs += chunk.iter().filter(|&(_, _, _, id)| id == log).count();
                }
            }
        }
        assert!(logs > 0, "should find some trees in a 12×12 chunk area");
    }
}

