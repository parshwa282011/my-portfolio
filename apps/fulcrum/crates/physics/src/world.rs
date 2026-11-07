//! The physics world: structures (rigid bodies built from blocks), a terrain collider that follows
//! them, and the force modules (gravity, buoyancy, drag, lifting gas, thrust).
use crate::massprops::{eigen_symmetric, face_dirs, mass_properties, MassProps};
use fulcrum_core::registry::Registry;
use fulcrum_core::units::{air_density, RHO_WATER};
use fulcrum_core::{BlockId, Content};
use rapier3d::math::{IVector, Pose, Rotation, Vector};
use rapier3d::prelude as rp;
use std::collections::BTreeMap;
use std::sync::Arc;

/// Fixed physics step (the world is stepped at 120 Hz regardless of frame rate).
pub const SUBSTEP: f32 = 1.0 / 120.0;

/// How the physics engine sees the block world.
pub trait Terrain {
    fn is_solid(&self, x: i32, y: i32, z: i32) -> bool;
    /// Height of the water surface in the column containing `(x, z)` if there is water at or just below `y`.
    fn water_surface(&self, x: f32, y: f32, z: f32) -> Option<f32>;
}

#[derive(Clone, Debug)]
pub struct Environment {
    /// Surface gravity (m/s²).
    pub gravity: f32,
    /// World y of sea level (air density is measured from here).
    pub sea_level: f32,
    pub water_density: f32,
    pub wind: [f32; 3],
}

impl Default for Environment {
    fn default() -> Self {
        Environment { gravity: fulcrum_core::units::G0, sea_level: 0.0, water_density: RHO_WATER, wind: [0.0; 3] }
    }
}

/// Player input for a structure: forward thrust and turning.
#[derive(Clone, Copy, Debug, Default)]
pub struct Controls {
    /// -1 (reverse) .. 1 (full ahead)
    pub throttle: f32,
    /// -1 (left) .. 1 (right)
    pub steer: f32,
}

pub type StructureId = u32;

struct Face {
    center: Vector, // local
    normal: Vector, // local, unit axis
    cd: f32,
    area: f32,
}

struct Part {
    center: Vector, // local block centre
    displace: f32,  // displaced volume (m³) when fully immersed
    thrust: f32,
}

pub struct Structure {
    pub id: StructureId,
    body: rp::RigidBodyHandle,
    collider: rp::ColliderHandle,
    blocks: BTreeMap<[i32; 3], BlockId>,
    /// Local-space integer origin of the structure in the world at creation time.
    pub origin: [i32; 3],
    pub props: MassProps,
    pub controls: Controls,
    /// Local axis the propellers push along.
    pub forward: [i32; 3],
    parts: Vec<Part>,
    faces: Vec<Face>,
    max_thrust: f32,
}

impl Structure {
    pub fn blocks(&self) -> impl Iterator<Item = (&[i32; 3], &BlockId)> {
        self.blocks.iter()
    }
    pub fn block_count(&self) -> usize {
        self.blocks.len()
    }
}

pub struct PhysicsWorld {
    pub rp: rp::PhysicsWorld,
    pub registry: Registry,
    pub env: Environment,
    content: Arc<Content>,
    structures: Vec<Structure>,
    terrain_body: rp::RigidBodyHandle,
    terrain_collider: Option<rp::ColliderHandle>,
    terrain_region: Option<([i32; 3], [i32; 3])>,
    terrain_version: u64,
    built_version: u64,
    accum: f32,
    next_id: StructureId,
    pub time: f64,
}

const TERRAIN_MARGIN: i32 = 20;

impl PhysicsWorld {
    pub fn new(content: Arc<Content>, env: Environment, registry: Registry) -> PhysicsWorld {
        let mut rp = rp::PhysicsWorld::default();
        rp.integration_parameters.dt = SUBSTEP;
        let terrain_body = rp.bodies.insert(rp::RigidBodyBuilder::fixed());
        PhysicsWorld {
            rp,
            registry,
            env,
            content,
            structures: Vec::new(),
            terrain_body,
            terrain_collider: None,
            terrain_region: None,
            terrain_version: 1,
            built_version: 0,
            accum: 0.0,
            next_id: 1,
            time: 0.0,
        }
    }

    /// Call after any terrain edit so the collider is rebuilt.
    pub fn invalidate_terrain(&mut self) {
        self.terrain_version += 1;
    }

    pub fn structures(&self) -> &[Structure] {
        &self.structures
    }

    pub fn structure(&self, id: StructureId) -> Option<&Structure> {
        self.structures.iter().find(|s| s.id == id)
    }

    pub fn structure_mut(&mut self, id: StructureId) -> Option<&mut Structure> {
        self.structures.iter_mut().find(|s| s.id == id)
    }

    /// Turn `blocks` (world coordinates) into a rigid body at rest where they stand.
    /// `forward` is the local axis along which propellers push.
    pub fn add_structure(&mut self, blocks: &[([i32; 3], BlockId)], forward: [i32; 3]) -> StructureId {
        assert!(!blocks.is_empty(), "a structure needs at least one block");
        let mut origin = [i32::MAX; 3];
        for (p, _) in blocks {
            for a in 0..3 {
                origin[a] = origin[a].min(p[a]);
            }
        }
        let local: BTreeMap<[i32; 3], BlockId> = blocks.iter().map(|(p, id)| ([p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]], *id)).collect();
        let id = self.next_id;
        self.next_id += 1;
        let mut s = self.build_structure(id, local, origin, forward);
        let coords: Vec<IVector> = s.blocks.keys().map(|p| IVector::new(p[0], p[1], p[2])).collect();
        let pose = Pose::from_translation(Vector::new(origin[0] as f32, origin[1] as f32, origin[2] as f32));
        let body = rp::RigidBodyBuilder::dynamic().pose(pose).additional_mass_properties(mass_props_to_rapier(&s.props)).can_sleep(false);
        let collider = rp::ColliderBuilder::new(rp::SharedShape::voxels(Vector::ONE, &coords)).density(0.0).friction(0.6).restitution(0.05);
        let (bh, ch) = self.rp.insert(body, collider);
        s.body = bh;
        s.collider = ch;
        self.structures.push(s);
        id
    }

    fn build_structure(&self, id: StructureId, blocks: BTreeMap<[i32; 3], BlockId>, origin: [i32; 3], forward: [i32; 3]) -> Structure {
        let props = mass_properties(&self.content, &blocks);
        let mut parts = Vec::new();
        let mut faces = Vec::new();
        let mut max_thrust = 0.0;
        for (&p, &bid) in &blocks {
            let def = self.content.get(bid);
            let center = Vector::new(p[0] as f32 + 0.5, p[1] as f32 + 0.5, p[2] as f32 + 0.5);
            parts.push(Part { center, displace: def.displace, thrust: def.thrust_n });
            max_thrust += def.thrust_n;
            for d in face_dirs() {
                let n = [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
                if !blocks.contains_key(&n) {
                    let normal = Vector::new(d[0] as f32, d[1] as f32, d[2] as f32);
                    faces.push(Face { center: center + normal * 0.5, normal, cd: def.drag_cd, area: 1.0 });
                }
            }
        }
        // handles are filled in by the caller once the body exists
        Structure {
            id,
            body: rp::RigidBodyHandle::invalid(),
            collider: rp::ColliderHandle::invalid(),
            blocks,
            origin,
            props,
            controls: Controls::default(),
            forward,
            parts,
            faces,
            max_thrust,
        }
    }

    pub fn remove_structure(&mut self, id: StructureId) {
        if let Some(i) = self.structures.iter().position(|s| s.id == id) {
            let s = self.structures.remove(i);
            self.rp.remove_body(s.body);
        }
    }

    /// Position and orientation of a structure's local origin: `(x, y, z, qx, qy, qz, qw)`.
    pub fn pose(&self, id: StructureId) -> Option<[f32; 7]> {
        let s = self.structure(id)?;
        let p = self.rp.bodies[s.body].position();
        let (t, q) = (p.translation, p.rotation);
        Some([t.x, t.y, t.z, q.x, q.y, q.z, q.w])
    }

    pub fn velocity(&self, id: StructureId) -> Option<[f32; 3]> {
        let s = self.structure(id)?;
        let v = self.rp.bodies[s.body].linvel();
        Some([v.x, v.y, v.z])
    }

    /// World position of the centre of mass.
    pub fn center_of_mass(&self, id: StructureId) -> Option<[f32; 3]> {
        let s = self.structure(id)?;
        let c = self.rp.bodies[s.body].center_of_mass();
        Some([c.x, c.y, c.z])
    }

    /// Hash of every body's pose and velocity, for determinism checks.
    pub fn state_hash(&self) -> u64 {
        let mut h = fulcrum_core::hash::StateHasher::default();
        for s in &self.structures {
            let b = &self.rp.bodies[s.body];
            let p = b.position();
            for v in [p.translation.x, p.translation.y, p.translation.z, p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w] {
                h.write_f32(v);
            }
            let (l, a) = (b.linvel(), b.angvel());
            for v in [l.x, l.y, l.z, a.x, a.y, a.z] {
                h.write_f32(v);
            }
        }
        h.finish()
    }

    // ------------------------------------------------------------------ stepping
    pub fn step(&mut self, dt: f32, terrain: &dyn Terrain) {
        self.accum += dt.clamp(0.0, 0.1);
        while self.accum >= SUBSTEP {
            self.accum -= SUBSTEP;
            self.substep(terrain);
        }
    }

    fn substep(&mut self, terrain: &dyn Terrain) {
        self.update_terrain_collider(terrain);
        let g = if self.registry.is_enabled("gravity") { self.env.gravity } else { 0.0 };
        self.rp.gravity = Vector::new(0.0, -g, 0.0);
        self.rp.integration_parameters.dt = SUBSTEP;
        self.apply_forces(terrain);
        self.rp.step();
        self.time += SUBSTEP as f64;
    }

    fn update_terrain_collider(&mut self, terrain: &dyn Terrain) {
        if self.structures.is_empty() {
            return;
        }
        let (mut lo, mut hi) = ([i32::MAX; 3], [i32::MIN; 3]);
        for s in &self.structures {
            let aabb = self.rp.colliders[s.collider].compute_aabb();
            let v = self.rp.bodies[s.body].linvel();
            let look = [v.x * 0.75, v.y * 0.75, v.z * 0.75];
            for a in 0..3 {
                let (mn, mx) = match a {
                    0 => (aabb.mins.x, aabb.maxs.x),
                    1 => (aabb.mins.y, aabb.maxs.y),
                    _ => (aabb.mins.z, aabb.maxs.z),
                };
                lo[a] = lo[a].min((mn + look[a].min(0.0)).floor() as i32);
                hi[a] = hi[a].max((mx + look[a].max(0.0)).ceil() as i32);
            }
        }
        let inner = 4; // rebuild when a structure gets within this many blocks of the region edge
        let needs = match self.terrain_region {
            None => true,
            Some((rlo, rhi)) => (0..3).any(|a| lo[a] - inner < rlo[a] || hi[a] + inner > rhi[a]),
        } || self.built_version != self.terrain_version;
        if !needs {
            return;
        }
        let rlo = [lo[0] - TERRAIN_MARGIN, (lo[1] - TERRAIN_MARGIN).max(-2), lo[2] - TERRAIN_MARGIN];
        let rhi = [hi[0] + TERRAIN_MARGIN, hi[1] + TERRAIN_MARGIN, hi[2] + TERRAIN_MARGIN];
        let mut coords = Vec::new();
        for y in rlo[1]..=rhi[1] {
            for z in rlo[2]..=rhi[2] {
                for x in rlo[0]..=rhi[0] {
                    if terrain.is_solid(x, y, z) {
                        let exposed = !terrain.is_solid(x + 1, y, z)
                            || !terrain.is_solid(x - 1, y, z)
                            || !terrain.is_solid(x, y + 1, z)
                            || !terrain.is_solid(x, y - 1, z)
                            || !terrain.is_solid(x, y, z + 1)
                            || !terrain.is_solid(x, y, z - 1);
                        if exposed {
                            coords.push(IVector::new(x, y, z));
                        }
                    }
                }
            }
        }
        if let Some(old) = self.terrain_collider.take() {
            self.rp.remove_collider(old);
        }
        if !coords.is_empty() {
            let collider = rp::ColliderBuilder::new(rp::SharedShape::voxels(Vector::ONE, &coords)).friction(0.8).restitution(0.0).build();
            let h = self.rp.insert_collider(collider, Some(self.terrain_body));
            self.terrain_collider = Some(h);
        }
        self.terrain_region = Some((rlo, rhi));
        self.built_version = self.terrain_version;
    }

    fn apply_forces(&mut self, terrain: &dyn Terrain) {
        let g = if self.registry.is_enabled("gravity") { self.env.gravity } else { 0.0 };
        let buoyancy = self.registry.is_enabled("buoyancy");
        let hydro_drag = self.registry.is_enabled("hydro_drag");
        let atmosphere = self.registry.is_enabled("atmosphere");
        let gas_lift = self.registry.is_enabled("gas_lift");
        let air_drag = self.registry.is_enabled("air_drag");
        let propulsion = self.registry.is_enabled("propulsion");
        let rho_w = self.env.water_density;
        let sea = self.env.sea_level;
        let wind = Vector::new(self.env.wind[0], self.env.wind[1], self.env.wind[2]);

        for s in &self.structures {
            let body = &mut self.rp.bodies[s.body];
            body.reset_forces(true);
            body.reset_torques(true);
            let pose = *body.position();
            let (rot, trans) = (pose.rotation, pose.translation);
            let to_world = |p: Vector| rot * p + trans;
            // projected half extent of a unit cube along world up, for the partially-immersed fraction
            let up_local = rot.inverse() * Vector::Y;
            let half_extent = 0.5 * (up_local.x.abs() + up_local.y.abs() + up_local.z.abs());

            // ---- buoyancy of water, and of air (lifting gas) -------------------------------------------
            if buoyancy || gas_lift {
                for part in &s.parts {
                    if part.displace <= 0.0 {
                        continue;
                    }
                    let c = to_world(part.center);
                    let level = if buoyancy { terrain.water_surface(c.x, c.y, c.z) } else { None };
                    let (bottom, top) = (c.y - half_extent, c.y + half_extent);
                    let frac_w = match level {
                        Some(l) => ((l - bottom) / (top - bottom)).clamp(0.0, 1.0),
                        None => 0.0,
                    };
                    let rho_air = if gas_lift && atmosphere { air_density(c.y - sea) } else { 0.0 };
                    let vol = part.displace;
                    let f_water = g * vol * rho_w * frac_w;
                    let f_air = g * vol * rho_air * (1.0 - frac_w);
                    if f_water > 0.0 {
                        // acts at the centroid of the immersed slab
                        let l = level.unwrap_or(bottom);
                        let y = bottom + (l.min(top) - bottom) * 0.5;
                        body.add_force_at_point(Vector::new(0.0, f_water, 0.0), Vector::new(c.x, y, c.z), true);
                    }
                    if f_air > 0.0 {
                        body.add_force_at_point(Vector::new(0.0, f_air, 0.0), c, true);
                    }
                    // Heave damping of a hull crossing the surface: the wave it radiates carries energy away.
                    // c = 0.3 ρ_w A √(g L) per square metre of waterplane (A = L² = 1 m²) gives a damping ratio
                    // of about 0.3 for a hull as dense as steel plating; it is zero for fully submerged parts.
                    if hydro_drag && frac_w > 0.0 && frac_w < 1.0 {
                        let vy = body.velocity_at_point(c).y;
                        body.add_force_at_point(Vector::new(0.0, -0.3 * rho_w * g.sqrt() * vy, 0.0), c, true);
                    }
                }
            }

            // ---- drag on exposed faces ------------------------------------------------------------------
            if (hydro_drag && buoyancy) || (air_drag && atmosphere) {
                let n_faces = s.faces.len().max(1) as f32;
                let mass = s.props.mass as f32;
                for f in &s.faces {
                    let p = to_world(f.center);
                    let n = rot * f.normal;
                    let in_water = hydro_drag && terrain.water_surface(p.x, p.y, p.z).map(|l| p.y < l).unwrap_or(false);
                    let (rho, medium_v) = if in_water {
                        (rho_w, Vector::ZERO)
                    } else if air_drag && atmosphere {
                        (air_density(p.y - sea), wind)
                    } else {
                        continue;
                    };
                    let v = body.velocity_at_point(p) - medium_v;
                    let vn = v.dot(n);
                    if vn <= 0.0 {
                        continue; // only faces moving into the medium feel pressure drag
                    }
                    let mut force = 0.5 * rho * f.cd * f.area * vn * vn;
                    // never remove more momentum in one step than this face's share of the structure has
                    force = force.min(mass * vn / (n_faces * SUBSTEP));
                    body.add_force_at_point(-n * force, p, true);
                }
            }

            // ---- propulsion -------------------------------------------------------------------------------
            if propulsion && (s.controls.throttle != 0.0 || s.controls.steer != 0.0) {
                let fwd = rot * Vector::new(s.forward[0] as f32, s.forward[1] as f32, s.forward[2] as f32);
                for part in &s.parts {
                    if part.thrust <= 0.0 {
                        continue;
                    }
                    let c = to_world(part.center);
                    let in_water = terrain.water_surface(c.x, c.y, c.z).map(|l| c.y < l).unwrap_or(false);
                    let rho = if in_water { rho_w } else if atmosphere { air_density(c.y - sea) } else { 0.0 };
                    if rho <= 0.0 {
                        continue;
                    }
                    let along = body.velocity_at_point(c).dot(fwd);
                    let pitch_speed = if in_water { 18.0 } else { 50.0 };
                    let speed_factor = (1.0 - along * s.controls.throttle.signum() / pitch_speed).clamp(0.0, 1.0);
                    let density_factor = (rho / 1.225).cbrt();
                    let t = s.controls.throttle.clamp(-1.0, 1.0) * part.thrust * density_factor * speed_factor;
                    body.add_force_at_point(fwd * t, c, true);
                }
                if s.controls.steer != 0.0 && s.max_thrust > 0.0 {
                    let up = rot * Vector::Y;
                    body.add_torque(up * (-s.controls.steer.clamp(-1.0, 1.0) * s.max_thrust * 1.5), true);
                }
            }
        }
    }
}

fn mass_props_to_rapier(p: &MassProps) -> rp::MassProperties {
    let (vals, vecs) = eigen_symmetric(p.inertia);
    // columns of `vecs` are principal axes; make sure they form a right-handed frame
    let col = |i: usize| Vector::new(vecs[0][i] as f32, vecs[1][i] as f32, vecs[2][i] as f32);
    let (a, b, mut c) = (col(0), col(1), col(2));
    if a.cross(b).dot(c) < 0.0 {
        c = -c;
    }
    let frame = Rotation::from_mat3(&rapier3d::glamx::Mat3::from_cols(a, b, c));
    rp::MassProperties::with_principal_inertia_frame(
        Vector::new(p.com[0] as f32, p.com[1] as f32, p.com[2] as f32),
        p.mass as f32,
        Vector::new(vals[0] as f32, vals[1] as f32, vals[2] as f32),
        frame,
    )
}
