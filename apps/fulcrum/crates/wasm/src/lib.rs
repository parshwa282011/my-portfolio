//! WebAssembly bindings: one `Engine` object the TypeScript client drives every frame.
use fulcrum_core::registry::{Registry, PHENOMENA};
use fulcrum_game::{Game, PlayerInput};
use fulcrum_voxel::ChunkMesh;
use wasm_bindgen::prelude::*;

/// A mesh handed to JavaScript. Vertices are 8 floats each (see `fulcrum_voxel::mesh`).
#[wasm_bindgen]
pub struct MeshOut {
    cx: i32,
    cy: i32,
    cz: i32,
    mesh: ChunkMesh,
}

#[wasm_bindgen]
impl MeshOut {
    #[wasm_bindgen(getter)]
    pub fn cx(&self) -> i32 {
        self.cx
    }
    #[wasm_bindgen(getter)]
    pub fn cy(&self) -> i32 {
        self.cy
    }
    #[wasm_bindgen(getter)]
    pub fn cz(&self) -> i32 {
        self.cz
    }
    pub fn opaque_vertices(&self) -> Vec<f32> {
        self.mesh.opaque.vertices.clone()
    }
    pub fn opaque_indices(&self) -> Vec<u32> {
        self.mesh.opaque.indices.clone()
    }
    pub fn fluid_vertices(&self) -> Vec<f32> {
        self.mesh.fluid.vertices.clone()
    }
    pub fn fluid_indices(&self) -> Vec<u32> {
        self.mesh.fluid.indices.clone()
    }
}

#[wasm_bindgen]
pub struct Engine {
    game: Game,
    input: PlayerInput,
    ready: Vec<MeshOut>,
}

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> Engine {
        Engine { game: Game::new(seed as u64), input: PlayerInput::default(), ready: Vec::new() }
    }

    // ----------------------------------------------------------------------------- input
    pub fn set_input(&mut self, forward: f32, strafe: f32, jump: bool, sneak: bool, sprint: bool) {
        self.input = PlayerInput { forward, strafe, jump, sneak, sprint };
    }

    pub fn look(&mut self, dyaw: f32, dpitch: f32) {
        let p = &mut self.game.player;
        p.yaw = (p.yaw + dyaw) % std::f32::consts::TAU;
        p.pitch = (p.pitch + dpitch).clamp(-1.553, 1.553);
    }

    pub fn tick(&mut self, dt: f32) {
        self.game.tick(dt, self.input);
    }

    pub fn toggle_fly(&mut self) -> bool {
        let p = &mut self.game.player;
        p.flying = !p.flying;
        p.flying
    }

    // ----------------------------------------------------------------------------- state
    /// x, y, z (eye), yaw, pitch, vx, vy, vz, on_ground, in_water, flying, riding id (0 = none), hour of day
    pub fn player_state(&self) -> Vec<f32> {
        let p = &self.game.player;
        let e = p.eye();
        vec![
            e[0], e[1], e[2], p.yaw, p.pitch, p.vel[0], p.vel[1], p.vel[2], p.on_ground as u8 as f32, p.in_water as u8 as f32, p.flying as u8 as f32,
            self.game.riding.unwrap_or(0) as f32, self.game.time_of_day,
        ]
    }

    pub fn stats(&self) -> String {
        let loaded = self.game.world.loaded_chunks().count();
        serde_json::json!({
            "loaded_chunks": loaded,
            "pending_meshes": self.game.pending_mesh_count(),
            "structures": self.game.physics.structures().len(),
            "physics_cost": self.game.physics.registry.cost_units(),
        })
        .to_string()
    }

    pub fn set_view_distance(&mut self, chunks: i32) {
        self.game.view_distance = chunks.clamp(2, 24);
    }

    pub fn set_budgets(&mut self, gen_per_tick: u32, mesh_per_tick: u32) {
        self.game.gen_budget = gen_per_tick.clamp(1, 64) as usize;
        self.game.mesh_budget = mesh_per_tick.clamp(1, 64) as usize;
    }

    // ----------------------------------------------------------------------------- world meshes
    /// Next chunk mesh ready for upload, or `undefined`.
    pub fn next_chunk_mesh(&mut self) -> Option<MeshOut> {
        if self.ready.is_empty() {
            for u in self.game.take_chunk_updates() {
                self.ready.push(MeshOut { cx: u.pos.0, cy: u.pos.1, cz: u.pos.2, mesh: u.mesh });
            }
            self.ready.reverse();
        }
        self.ready.pop()
    }

    /// Flat `[cx, cy, cz, ...]` of chunks whose meshes should be dropped.
    pub fn take_removed_chunks(&mut self) -> Vec<i32> {
        self.game.take_removed_chunks().into_iter().flat_map(|c| [c.0, c.1, c.2]).collect()
    }

    // ----------------------------------------------------------------------------- editing
    /// `[x, y, z, nx, ny, nz]` of the block under the crosshair, or an empty array.
    pub fn target_block(&self) -> Vec<i32> {
        match self.game.target() {
            Some(h) => vec![h.block[0], h.block[1], h.block[2], h.normal[0], h.normal[1], h.normal[2]],
            None => vec![],
        }
    }

    pub fn break_block(&mut self) -> bool {
        self.game.break_block().is_some()
    }

    pub fn place_block(&mut self, name: &str) -> bool {
        match self.game.block_id(name) {
            Some(id) => self.game.place_block(id),
            None => false,
        }
    }

    /// Editor tool: put any block anywhere (also used by tests). Returns false for unknown names or out-of-world positions.
    pub fn set_block(&mut self, x: i32, y: i32, z: i32, name: &str) -> bool {
        match self.game.block_id(name) {
            Some(id) => self.game.set_block(x, y, z, id),
            None => false,
        }
    }

    /// Editor tool: move the player.
    pub fn teleport(&mut self, x: f32, y: f32, z: f32) {
        self.game.player.pos = [x, y, z];
        self.game.player.vel = [0.0; 3];
    }

    pub fn set_look(&mut self, yaw: f32, pitch: f32) {
        self.game.player.yaw = yaw;
        self.game.player.pitch = pitch.clamp(-1.553, 1.553);
    }

    // ----------------------------------------------------------------------------- structures
    /// Assemble the structure under the crosshair. Returns an empty string on success, otherwise a message.
    pub fn assemble(&mut self) -> String {
        match self.game.assemble_target() {
            Ok(_) => String::new(),
            Err(e) => e,
        }
    }

    /// Put back the structure the player rides (or the nearest one). Returns "" or a message.
    pub fn disassemble(&mut self) -> String {
        let id = self.game.riding.or_else(|| self.game.board_nearest().map(|id| {
            self.game.riding = None;
            id
        }));
        match id {
            Some(id) => match self.game.disassemble(id) {
                Ok(_) => String::new(),
                Err(e) => e,
            },
            None => "No structure nearby".into(),
        }
    }

    /// Build a ready-made example in front of the player (`"boat"` or `"airship"`). Returns "" or a message.
    pub fn spawn_demo(&mut self, kind: &str) -> String {
        match self.game.build_demo(kind) {
            Ok(_) => String::new(),
            Err(e) => e,
        }
    }

    /// Sit at the helm of the nearest structure. Returns its id, or 0.
    pub fn board(&mut self) -> u32 {
        self.game.board_nearest().unwrap_or(0)
    }

    pub fn dismount(&mut self) {
        self.game.dismount();
    }

    pub fn structure_ids(&self) -> Vec<u32> {
        self.game.physics.structures().iter().map(|s| s.id).collect()
    }

    /// Structures that need their mesh (re)built.
    pub fn take_changed_structures(&mut self) -> Vec<u32> {
        self.game.take_changed_structures()
    }

    /// `[x, y, z, qx, qy, qz, qw]` of a structure's origin.
    pub fn structure_pose(&self, id: u32) -> Vec<f32> {
        self.game.physics.pose(id).map(|p| p.to_vec()).unwrap_or_default()
    }

    pub fn structure_mesh(&self, id: u32) -> Option<MeshOut> {
        self.game.structure_mesh(id).map(|m| MeshOut { cx: 0, cy: 0, cz: 0, mesh: m.mesh })
    }

    /// Speed, mass, block count and thrust of a structure, as JSON (for the HUD).
    pub fn structure_info(&self, id: u32) -> String {
        let (Some(s), Some(v)) = (self.game.physics.structure(id), self.game.physics.velocity(id)) else { return "{}".into() };
        serde_json::json!({
            "blocks": s.block_count(),
            "mass_kg": s.props.mass,
            "speed": (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt(),
            "vy": v[1],
        })
        .to_string()
    }

    // ----------------------------------------------------------------------------- content and settings
    pub fn blocks_json(&self) -> String {
        let blocks: Vec<_> = self
            .game
            .content
            .blocks
            .iter()
            .enumerate()
            .map(|(i, b)| serde_json::json!({ "id": i, "name": b.name, "color": b.color, "render": format!("{:?}", b.render).to_lowercase(), "assemblable": b.assemblable, "mass_kg": b.mass_kg, "role": b.role }))
            .collect();
        serde_json::Value::Array(blocks).to_string()
    }

    pub fn phenomena_json(&self) -> String {
        let reg = &self.game.physics.registry;
        let list: Vec<_> = PHENOMENA
            .iter()
            .map(|p| serde_json::json!({ "id": p.id, "name": p.name, "domain": p.domain, "summary": p.summary, "depends_on": p.depends_on, "enabled": reg.is_enabled(p.id) }))
            .collect();
        serde_json::Value::Array(list).to_string()
    }

    /// Switch a phenomenon on or off. Returns JSON `{ "changed": [...] }` or `{ "error": "..." }`.
    pub fn set_phenomenon(&mut self, id: &str, on: bool) -> String {
        match self.game.physics.registry.set(id, on) {
            Ok(changed) => serde_json::json!({ "changed": changed }).to_string(),
            Err(e) => serde_json::json!({ "error": e }).to_string(),
        }
    }

    /// Replace the whole set: `"simple"` or `"none"`.
    pub fn set_physics_preset(&mut self, name: &str) {
        self.game.physics.registry = if name == "none" { Registry::none() } else { Registry::simple() };
    }
}
