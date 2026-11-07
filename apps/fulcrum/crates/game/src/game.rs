use crate::player::{Player, PlayerInput};
use crate::terrain::WorldTerrain;
use fulcrum_core::registry::Registry;
use fulcrum_core::{BlockId, Content};
use fulcrum_physics::{assemble, AssembleError, Environment, PhysicsWorld, StructureId};
use fulcrum_voxel::{mesh_grid, raycast, ChunkMesh, ChunkPos, Grid, Hit, World, CS, SEA_LEVEL, WORLD_HEIGHT};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

pub struct ChunkUpdate {
    pub pos: ChunkPos,
    pub mesh: ChunkMesh,
}

pub struct StructureMesh {
    pub id: StructureId,
    pub mesh: ChunkMesh,
}

/// Most blocks one structure may contain (keeps a single body affordable in the browser).
pub const MAX_STRUCTURE_BLOCKS: usize = 4096;
pub const REACH: f32 = 6.0;

pub struct Game {
    pub content: Arc<Content>,
    pub world: World,
    pub physics: PhysicsWorld,
    pub player: Player,
    pub riding: Option<StructureId>,
    /// Horizontal view distance in chunks.
    pub view_distance: i32,
    /// Hours, 0..24.
    pub time_of_day: f32,
    /// Chunks generated per tick and chunk meshes built per tick.
    pub gen_budget: usize,
    pub mesh_budget: usize,
    mesh_pending: HashSet<ChunkPos>,
    removed: Vec<ChunkPos>,
    changed_structures: Vec<StructureId>,
    tick_count: u64,
}

fn horizontal_dist(a: ChunkPos, b: ChunkPos) -> i32 {
    (a.0 - b.0).abs().max((a.2 - b.2).abs())
}

impl Game {
    pub fn new(seed: u64) -> Game {
        let content = Arc::new(Content::builtin());
        let world = World::new(seed, content.clone());
        let env = Environment { sea_level: SEA_LEVEL as f32, ..Environment::default() };
        let physics = PhysicsWorld::new(content.clone(), env, Registry::simple());
        let mut g = Game {
            content,
            world,
            physics,
            player: Player::new([0.5, 80.0, 0.5]),
            riding: None,
            view_distance: 6,
            time_of_day: 9.0,
            gen_budget: 8,
            mesh_budget: 6,
            mesh_pending: HashSet::new(),
            removed: Vec::new(),
            changed_structures: Vec::new(),
            tick_count: 0,
        };
        g.spawn();
        g
    }

    /// Put the player on dry land near the origin and make sure the ground under them exists.
    pub fn spawn(&mut self) {
        let mut best = (0, 0);
        'search: for r in 0..60i32 {
            for dx in -r..=r {
                for dz in -r..=r {
                    let (dx, dz): (i32, i32) = (dx, dz);
                    if dx.abs().max(dz.abs()) != r {
                        continue;
                    }
                    let (x, z) = (dx * 4, dz * 4);
                    if self.world.gen.height(x, z) > SEA_LEVEL + 2 {
                        best = (x, z);
                        break 'search;
                    }
                }
            }
        }
        let h = self.world.gen.height(best.0, best.1);
        for dx in -1..=1 {
            for dz in -1..=1 {
                for cy in 0..(WORLD_HEIGHT / CS as i32) {
                    self.world.ensure_chunk(((best.0).div_euclid(16) + dx, cy, (best.1).div_euclid(16) + dz));
                }
            }
        }
        self.player = Player::new([best.0 as f32 + 0.5, (h + 2) as f32, best.1 as f32 + 0.5]);
    }

    pub fn block_id(&self, name: &str) -> Option<BlockId> {
        self.content.id_of(name)
    }

    // -------------------------------------------------------------------------- simulation
    pub fn tick(&mut self, dt: f32, input: PlayerInput) {
        self.tick_count += 1;
        if let Some(id) = self.riding {
            if let Some(s) = self.physics.structure_mut(id) {
                s.controls.throttle = input.forward;
                s.controls.steer = input.strafe;
            }
            if let Some(p) = self.seat_position(id) {
                self.player.pos = p;
                self.player.vel = [0.0; 3];
            }
        } else {
            self.player.update(&self.world, input, dt);
        }
        self.physics.step(dt, &WorldTerrain(&self.world));
        self.time_of_day = (self.time_of_day + dt / 50.0) % 24.0;
        self.stream();
    }

    /// Foreground chunk streaming: generate what is missing near the player and near every structure
    /// (a ship must never meet an unloaded border), drop what is far from all of them.
    fn stream(&mut self) {
        let pc = self.player_chunk();
        let mut foci: Vec<(ChunkPos, i32)> = vec![(pc, self.view_distance + 1)];
        for s in self.physics.structures() {
            if let Some(c) = self.physics.center_of_mass(s.id) {
                foci.push((((c[0].floor() as i32).div_euclid(16), 0, (c[2].floor() as i32).div_euclid(16)), 4));
            }
        }
        let mut wanted: Vec<(i32, ChunkPos)> = Vec::new();
        for &(c, r) in &foci {
            for dx in -r..=r {
                for dz in -r..=r {
                    for cy in 0..(WORLD_HEIGHT / CS as i32) {
                        let cp = (c.0 + dx, cy, c.2 + dz);
                        if !self.world.is_loaded(cp) {
                            wanted.push((dx.abs().max(dz.abs()) * 100 + (cy - c.1.max(2)).abs(), cp));
                        }
                    }
                }
            }
        }
        wanted.sort();
        wanted.dedup_by_key(|w| w.1);
        for (_, cp) in wanted.into_iter().take(self.gen_budget) {
            self.world.ensure_chunk(cp);
        }
        for cp in self.world.take_dirty() {
            self.mesh_pending.insert(cp);
        }
        if self.tick_count % 120 == 0 {
            let far: Vec<ChunkPos> = self
                .world
                .loaded_chunks()
                .copied()
                .filter(|&cp| foci.iter().all(|&(c, r)| horizontal_dist(cp, c) > r + 3))
                .collect();
            for cp in far {
                self.world.unload_chunk(cp);
                self.mesh_pending.remove(&cp);
                self.removed.push(cp);
            }
        }
    }

    fn player_chunk(&self) -> ChunkPos {
        ((self.player.pos[0].floor() as i32).div_euclid(16), (self.player.pos[1].floor() as i32).div_euclid(16), (self.player.pos[2].floor() as i32).div_euclid(16))
    }

    fn neighbours_ready(&self, cp: ChunkPos) -> bool {
        for dx in -1..=1 {
            for dy in -1..=1 {
                for dz in -1..=1 {
                    let n = (cp.0 + dx, cp.1 + dy, cp.2 + dz);
                    let in_range = n.1 >= 0 && n.1 * CS as i32 + 1 <= WORLD_HEIGHT;
                    if in_range && !self.world.is_loaded(n) {
                        return false;
                    }
                }
            }
        }
        true
    }

    /// Meshes ready for upload (closest to the player first).
    pub fn take_chunk_updates(&mut self) -> Vec<ChunkUpdate> {
        let pc = self.player_chunk();
        let mut ready: Vec<ChunkPos> = self.mesh_pending.iter().copied().filter(|&cp| self.world.is_loaded(cp) && self.neighbours_ready(cp)).collect();
        ready.sort_by_key(|&cp| (horizontal_dist(cp, pc), (cp.1 - pc.1).abs(), cp));
        ready.truncate(self.mesh_budget);
        let mut out = Vec::new();
        for cp in ready {
            self.mesh_pending.remove(&cp);
            out.push(ChunkUpdate { pos: cp, mesh: self.world.mesh_chunk(cp) });
        }
        out
    }

    pub fn take_removed_chunks(&mut self) -> Vec<ChunkPos> {
        std::mem::take(&mut self.removed)
    }

    pub fn pending_mesh_count(&self) -> usize {
        self.mesh_pending.len()
    }

    // -------------------------------------------------------------------------- editing
    pub fn target(&self) -> Option<Hit> {
        let e = self.player.eye();
        raycast(e, self.player.look(), REACH, |x, y, z| self.world.is_solid(x, y, z))
    }

    /// Editor tool: set a block anywhere in the world.
    pub fn set_block(&mut self, x: i32, y: i32, z: i32, id: BlockId) -> bool {
        let ok = self.world.set(x, y, z, id);
        if ok {
            self.physics.invalidate_terrain();
        }
        ok
    }

    pub fn break_block(&mut self) -> Option<BlockId> {
        let hit = self.target()?;
        let id = self.world.get(hit.block[0], hit.block[1], hit.block[2]);
        if self.content.get(id).hardness >= 1000.0 {
            return None; // bedrock
        }
        self.world.set(hit.block[0], hit.block[1], hit.block[2], 0);
        self.physics.invalidate_terrain();
        Some(id)
    }

    pub fn place_block(&mut self, id: BlockId) -> bool {
        let Some(hit) = self.target() else { return false };
        if hit.normal == [0, 0, 0] {
            return false;
        }
        let p = [hit.block[0] + hit.normal[0], hit.block[1] + hit.normal[1], hit.block[2] + hit.normal[2]];
        if self.content.is_solid(id) && self.player_overlaps(p) {
            return false;
        }
        let existing = self.world.get(p[0], p[1], p[2]);
        if self.content.is_solid(existing) {
            return false;
        }
        let ok = self.world.set(p[0], p[1], p[2], id);
        if ok {
            self.physics.invalidate_terrain();
        }
        ok
    }

    fn player_overlaps(&self, cell: [i32; 3]) -> bool {
        let hw = crate::player::WIDTH * 0.5;
        let (p, h) = (self.player.pos, crate::player::HEIGHT);
        (cell[0] as f32) < p[0] + hw && (cell[0] + 1) as f32 > p[0] - hw && (cell[1] as f32) < p[1] + h && (cell[1] + 1) as f32 > p[1] && (cell[2] as f32) < p[2] + hw && (cell[2] + 1) as f32 > p[2] - hw
    }

    // -------------------------------------------------------------------------- structures
    /// Assemble everything connected to the block under the crosshair into a physics structure.
    pub fn assemble_target(&mut self) -> Result<StructureId, String> {
        let hit = self.target().ok_or("Look at a block of the structure you want to assemble")?;
        let world = &self.world;
        let result = assemble(&self.content, hit.block, |x, y, z| world.get(x, y, z), MAX_STRUCTURE_BLOCKS);
        let assembly = match result {
            Ok(a) => a,
            Err(AssembleError::NotAssemblable) => return Err("That block cannot be assembled (terrain stays put)".into()),
            Err(AssembleError::TooLarge { limit }) => return Err(format!("Too many blocks: the limit is {limit}")),
        };
        for (p, _) in &assembly.blocks {
            self.world.set(p[0], p[1], p[2], 0);
        }
        self.physics.invalidate_terrain();
        // propellers push along the way the player faced when assembling (snapped to an axis)
        let look = self.player.look();
        let forward = if look[0].abs() > look[2].abs() { [look[0].signum() as i32, 0, 0] } else { [0, 0, look[2].signum() as i32] };
        let id = self.physics.add_structure(&assembly.blocks, forward);
        self.changed_structures.push(id);
        Ok(id)
    }

    /// Put a structure back into the block world (it must be roughly axis-aligned and have room).
    pub fn disassemble(&mut self, id: StructureId) -> Result<usize, String> {
        let pose = self.physics.pose(id).ok_or("No such structure")?;
        let s = self.physics.structure(id).ok_or("No such structure")?;
        let (t, q) = ([pose[0], pose[1], pose[2]], [pose[3], pose[4], pose[5], pose[6]]);
        let rot = quat_to_mat(q);
        // snap the rotation to the nearest axis permutation; refuse if it is tilted
        let mut snapped = [[0i32; 3]; 3];
        for c in 0..3 {
            let col = [rot[0][c], rot[1][c], rot[2][c]];
            let (axis, v) = col.iter().enumerate().max_by(|a, b| a.1.abs().partial_cmp(&b.1.abs()).unwrap()).unwrap();
            if v.abs() < 0.9 {
                return Err("Level the structure before disassembling (it is tilted)".into());
            }
            snapped[axis][c] = v.signum() as i32;
        }
        let mut placements = Vec::new();
        for (p, &bid) in s.blocks() {
            let c = [p[0] as f32 + 0.5, p[1] as f32 + 0.5, p[2] as f32 + 0.5];
            let w = [
                t[0] + rot[0][0] * c[0] + rot[0][1] * c[1] + rot[0][2] * c[2],
                t[1] + rot[1][0] * c[0] + rot[1][1] * c[1] + rot[1][2] * c[2],
                t[2] + rot[2][0] * c[0] + rot[2][1] * c[1] + rot[2][2] * c[2],
            ];
            placements.push(([w[0].floor() as i32, w[1].floor() as i32, w[2].floor() as i32], bid));
        }
        if placements.iter().any(|(p, _)| self.world.is_solid(p[0], p[1], p[2])) {
            return Err("Something solid is in the way".into());
        }
        let count = placements.len();
        let _ = snapped;
        if self.riding == Some(id) {
            self.riding = None;
        }
        self.physics.remove_structure(id);
        for (p, bid) in placements {
            self.world.set(p[0], p[1], p[2], bid);
        }
        self.physics.invalidate_terrain();
        Ok(count)
    }

    /// Build a ready-made example in front of the player: `"boat"` (on a small pool) or `"airship"`.
    pub fn build_demo(&mut self, kind: &str) -> Result<StructureId, String> {
        let look = self.player.look();
        let (dx, dz) = if look[0].abs() > look[2].abs() { (look[0].signum() as i32, 0) } else { (0, look[2].signum() as i32) };
        let (px, pz) = (self.player.pos[0].floor() as i32, self.player.pos[2].floor() as i32);
        let (cx, cz) = (px + dx * 16, pz + dz * 16);
        let ground = (-8..=8).flat_map(|x| (-8..=8).map(move |z| (x, z))).map(|(x, z)| self.world.gen.height(cx + x, cz + z)).max().unwrap_or(60);
        let c = |name: &str| self.content.require(name);
        let (hull, planks, frame, helm, prop, gas, stone, water) = (c("hull_steel"), c("planks"), c("frame"), c("helm"), c("propeller"), c("gas_cell"), c("stone"), c("water"));
        let mut blocks: Vec<([i32; 3], BlockId)> = Vec::new();
        let origin: [i32; 3];
        // clear trees and anything else in the way of the build volume (bedrock stays)
        let (wide, deep) = if kind == "boat" { (15, 12) } else { (9, 7) };
        for x in -wide..=wide {
            for z in -deep..=deep {
                for y in (ground + 1)..(ground + 24) {
                    if self.content.is_solid(self.world.get(cx + x, y, cz + z)) {
                        self.world.set(cx + x, y, cz + z, 0);
                    }
                }
            }
        }
        match kind {
            "boat" => {
                // a raised pool: stone floor, a rim, three metres of water
                let y0 = ground + 1;
                for x in -12..=12 {
                    for z in -8..=8 {
                        self.world.set(cx + x, y0, cz + z, stone);
                        for y in 1..=3 {
                            let rim = x.abs() == 12 || z.abs() == 8;
                            self.world.set(cx + x, y0 + y, cz + z, if rim && y == 3 { stone } else if rim { stone } else { water });
                        }
                        for y in 4..=8 {
                            self.world.set(cx + x, y0 + y, cz + z, 0);
                        }
                    }
                }
                let surface = y0 + 4; // water fills y0+1 ..= y0+3, so the surface is at y0 + 4
                origin = [cx - 3, surface, cz - 1];
                for x in 0..7 {
                    for z in 0..3 {
                        blocks.push(([origin[0] + x, origin[1], origin[2] + z], hull));
                    }
                }
                for x in 0..7 {
                    for z in [0, 2] {
                        blocks.push(([origin[0] + x, origin[1] + 1, origin[2] + z], planks));
                    }
                }
                blocks.push(([origin[0] + 3, origin[1] + 1, origin[2] + 1], helm));
                // the propeller hangs below the stern so it works in the water
                blocks.push(([origin[0] - 1, origin[1], origin[2] + 1], frame));
                blocks.push(([origin[0] - 1, origin[1] - 1, origin[2] + 1], prop));
                for y in 1..=4 {
                    blocks.push(([origin[0] + 5, origin[1] + y, origin[2] + 1], frame));
                }
            }
            "airship" => {
                origin = [cx - 5, ground + 3, cz - 2];
                for x in 0..10 {
                    for y in 0..5 {
                        for z in 0..5 {
                            blocks.push(([origin[0] + x, origin[1] + y + 1, origin[2] + z], gas));
                        }
                    }
                }
                for x in 3..7 {
                    blocks.push(([origin[0] + x, origin[1], origin[2] + 2], frame));
                }
                blocks.push(([origin[0] + 4, origin[1] - 1, origin[2] + 2], helm));
                blocks.push(([origin[0] + 2, origin[1], origin[2] + 2], prop));
                blocks.push(([origin[0] + 7, origin[1], origin[2] + 2], prop));
            }
            _ => return Err(format!("unknown demo '{kind}'")),
        }
        self.physics.invalidate_terrain();
        // the ship's "forward" is +x for both demos
        let id = self.physics.add_structure(&blocks, [1, 0, 0]);
        self.changed_structures.push(id);
        // let the player see it: stand a little way back, looking at it
        let eye_y = (origin[1] + 6) as f32;
        self.player.pos = [(cx - dx * 11) as f32 + 0.5, eye_y, (cz - dz * 11) as f32 + 0.5];
        self.player.flying = true;
        Ok(id)
    }

    /// Mesh of a structure in its own local coordinates (draw it with the body's pose).
    pub fn structure_mesh(&self, id: StructureId) -> Option<StructureMesh> {
        let s = self.physics.structure(id)?;
        let blocks: HashMap<[i32; 3], BlockId> = s.blocks().map(|(p, b)| (*p, *b)).collect();
        let mut n = [1usize; 3];
        for p in blocks.keys() {
            for a in 0..3 {
                n[a] = n[a].max(p[a] as usize + 1);
            }
        }
        let grid = Grid::new(n, |x, y, z| *blocks.get(&[x, y, z]).unwrap_or(&0));
        Some(StructureMesh { id, mesh: mesh_grid(&grid, &self.content) })
    }

    pub fn take_changed_structures(&mut self) -> Vec<StructureId> {
        std::mem::take(&mut self.changed_structures)
    }

    fn seat_position(&self, id: StructureId) -> Option<[f32; 3]> {
        let s = self.physics.structure(id)?;
        let pose = self.physics.pose(id)?;
        let helm = s.blocks().find(|(_, &b)| self.content.get(b).role == "helm").map(|(p, _)| *p);
        let local = match helm {
            Some(p) => [p[0] as f32 + 0.5, p[1] as f32 + 1.0, p[2] as f32 + 0.5],
            None => {
                let c = s.props.com;
                [c[0] as f32, c[1] as f32 + 1.0, c[2] as f32]
            }
        };
        let rot = quat_to_mat([pose[3], pose[4], pose[5], pose[6]]);
        Some([
            pose[0] + rot[0][0] * local[0] + rot[0][1] * local[1] + rot[0][2] * local[2],
            pose[1] + rot[1][0] * local[0] + rot[1][1] * local[1] + rot[1][2] * local[2] - 0.2,
            pose[2] + rot[2][0] * local[0] + rot[2][1] * local[1] + rot[2][2] * local[2],
        ])
    }

    /// Sit at the helm of the nearest structure within reach.
    pub fn board_nearest(&mut self) -> Option<StructureId> {
        let p = self.player.pos;
        let mut best: Option<(f32, StructureId)> = None;
        for s in self.physics.structures() {
            if let Some(c) = self.physics.center_of_mass(s.id) {
                let d = ((c[0] - p[0]).powi(2) + (c[1] - p[1]).powi(2) + (c[2] - p[2]).powi(2)).sqrt();
                if d < 24.0 && best.map(|b| d < b.0).unwrap_or(true) {
                    best = Some((d, s.id));
                }
            }
        }
        let id = best?.1;
        self.riding = Some(id);
        Some(id)
    }

    pub fn dismount(&mut self) {
        if let Some(id) = self.riding.take() {
            if let Some(s) = self.physics.structure_mut(id) {
                s.controls = Default::default();
            }
            self.player.pos[1] += 1.0;
        }
    }
}

fn quat_to_mat(q: [f32; 4]) -> [[f32; 3]; 3] {
    let [x, y, z, w] = q;
    [
        [1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y - z * w), 2.0 * (x * z + y * w)],
        [2.0 * (x * y + z * w), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z - x * w)],
        [2.0 * (x * z - y * w), 2.0 * (y * z + x * w), 1.0 - 2.0 * (x * x + y * y)],
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A calm pool: stone floor, water above it, in a region far from the generated terrain's features.
    fn pool_game() -> Game {
        let mut g = Game::new(7);
        let stone = g.content.require("stone");
        let water = g.content.require("water");
        for x in -25..25 {
            for z in -25..25 {
                for y in 40..70 {
                    let id = if y < 50 { stone } else if y < 58 { water } else { 0 };
                    g.world.set(x, y, z, id);
                }
            }
        }
        g.physics.invalidate_terrain();
        g.player = Player::new([0.5, 60.0, 0.5]);
        g.player.flying = true;
        g
    }

    #[test]
    fn spawns_on_dry_land_with_solid_ground_loaded() {
        let g = Game::new(42);
        let p = g.player.pos;
        assert!(g.world.is_solid(p[0].floor() as i32, (p[1] - 2.0).floor() as i32, p[2].floor() as i32) || g.world.is_solid(p[0].floor() as i32, (p[1] - 1.0).floor() as i32, p[2].floor() as i32));
        assert!(g.world.gen.height(p[0] as i32, p[2] as i32) > SEA_LEVEL);
    }

    #[test]
    fn breaking_and_placing_blocks_through_the_crosshair() {
        let mut g = Game::new(3);
        let p = g.player.pos;
        g.player.pos = [p[0], p[1] + 0.0, p[2]];
        for _ in 0..120 {
            g.tick(1.0 / 60.0, PlayerInput::default());
        }
        g.player.pitch = -1.45; // look at the ground
        let before = g.target().expect("ground in reach");
        let id = g.break_block().unwrap();
        assert!(id != 0);
        assert!(!g.world.is_solid(before.block[0], before.block[1], before.block[2]));
        let hit = g.target().expect("a block to place against");
        assert!(g.place_block(g.content.require("planks")), "placing against {hit:?}");
        let (px, py, pz) = (hit.block[0] + hit.normal[0], hit.block[1] + hit.normal[1], hit.block[2] + hit.normal[2]);
        assert_eq!(g.world.get(px, py, pz), g.content.require("planks"));
    }

    #[test]
    fn the_demo_boat_floats_level_at_its_archimedes_draft() {
        let mut g = Game::new(11);
        g.player.yaw = 0.0;
        let id = g.build_demo("boat").unwrap();
        let mass = g.physics.structure(id).unwrap().props.mass;
        for _ in 0..60 * 20 {
            g.tick(1.0 / 60.0, PlayerInput::default());
        }
        let n = g.physics.structure(id).unwrap().block_count();
        assert!(n > 30);
        let pose = g.physics.pose(id).unwrap();
        // 7×3 hull blocks give a 21 m² waterplane; the rim, mast, and helm sit above the water
        // the hull's 21 m² waterplane plus the stern propeller block (0.1 m³ of displacement) carry the weight
        let draft = (mass as f32 / 1000.0 - 0.1) / 21.0;
        assert!(pose[3].abs() < 0.02 && pose[5].abs() < 0.02, "tilted: {pose:?}");
        assert!(g.physics.velocity(id).unwrap().iter().all(|v| v.abs() < 0.03), "still moving: {:?}", g.physics.velocity(id));
        // the water surface is exactly where the hull bottom started
        let start_bottom = pose[1] + 1.0 + draft; // origin is the propeller's level, one block below the hull bottom
        let surface_y = start_bottom.round();
        assert!((start_bottom - surface_y).abs() < 0.04, "bottom {} draft {draft}", pose[1]);
    }

    #[test]
    fn the_demo_airship_rises_gently() {
        let mut g = Game::new(11);
        g.player.yaw = 0.0;
        let id = g.build_demo("airship").unwrap();
        let y0 = g.physics.pose(id).unwrap()[1];
        for _ in 0..60 * 4 {
            g.tick(1.0 / 60.0, PlayerInput::default());
        }
        let y1 = g.physics.pose(id).unwrap()[1];
        let vy = g.physics.velocity(id).unwrap()[1];
        assert!(y1 > y0 + 1.0, "it should rise: {y0} -> {y1}");
        assert!(vy > 0.5 && vy < 12.0, "vy {vy}");
    }

    #[test]
    fn an_assembled_boat_floats_at_its_archimedes_draft_and_can_be_disassembled() {
        let mut g = pool_game();
        let hull = g.content.require("hull_steel");
        // a 4×1×4 hull resting on the pool floor? build it floating just above the surface instead
        for x in 0..4 {
            for z in 0..4 {
                g.world.set(x, 59, z, hull);
            }
        }
        g.player = Player::new([1.5, 62.0, -2.0]);
        g.player.pitch = -0.6;
        g.player.yaw = 0.0; // looking toward -z: aim at the hull instead
        // aim straight down at a hull block
        g.player.pos = [1.5, 59.0 + 1.0 - crate::player::EYE + 1.5, 1.5];
        g.player.pitch = -std::f32::consts::FRAC_PI_2;
        let id = g.assemble_target().expect("assemble");
        assert_eq!(g.physics.structure(id).unwrap().block_count(), 16);
        g.riding = None;
        // let it settle: 16 blocks × 220 kg = 3520 kg on a 16 m² waterplane => draft 0.22 m
        for _ in 0..60 * 25 {
            g.tick(1.0 / 60.0, PlayerInput::default());
        }
        let y = g.physics.pose(id).unwrap()[1];
        assert!((y - (58.0 - 0.22)).abs() < 0.03, "bottom at {y}");
        // park it back into the world
        let n = g.disassemble(id).expect("disassemble");
        assert_eq!(n, 16);
        assert!(g.world.is_solid(1, 57, 1) || g.world.is_solid(1, 58, 1) || g.world.get(1, 57, 1) != 0);
    }
}
