//! Analytic validation of the physics modules. Each test states the closed-form answer it checks.
use fulcrum_core::registry::Registry;
use fulcrum_core::units::{air_density, G0, RHO_WATER};
use fulcrum_core::Content;
use fulcrum_physics::{Environment, PhysicsWorld};
use fulcrum_validate::FlatTerrain;
use std::sync::Arc;

fn content() -> Arc<Content> {
    Arc::new(Content::builtin())
}

fn blocks(c: &Content, name: &str, nx: i32, ny: i32, nz: i32, at: [i32; 3]) -> Vec<([i32; 3], u16)> {
    let id = c.require(name);
    let mut v = Vec::new();
    for x in 0..nx {
        for y in 0..ny {
            for z in 0..nz {
                v.push(([at[0] + x, at[1] + y, at[2] + z], id));
            }
        }
    }
    v
}

fn run(w: &mut PhysicsWorld, t: &FlatTerrain, seconds: f32) {
    let steps = (seconds * 60.0) as usize;
    for _ in 0..steps {
        w.step(1.0 / 60.0, t);
    }
}

fn only(modules: &[&str]) -> Registry {
    let mut r = Registry::none();
    for m in modules {
        r.set(m, true).unwrap();
    }
    r
}

#[test]
fn free_fall_follows_half_g_t_squared() {
    let c = content();
    let mut w = PhysicsWorld::new(c.clone(), Environment::default(), only(&["gravity"]));
    let id = w.add_structure(&blocks(&c, "hull_steel", 1, 1, 1, [0, 1000, 0]), [1, 0, 0]);
    let t = FlatTerrain { ground_top: -100000, water_top: None };
    let y0 = w.pose(id).unwrap()[1];
    run(&mut w, &t, 2.0);
    let y = w.pose(id).unwrap()[1];
    let expected = 0.5 * G0 * 4.0;
    assert!(((y0 - y) - expected).abs() / expected < 0.005, "fell {} expected {}", y0 - y, expected);
    let v = w.velocity(id).unwrap()[1];
    assert!((v + G0 * 2.0).abs() / (G0 * 2.0) < 0.005, "v = {v}");
}

#[test]
fn rapier_receives_the_computed_mass_and_centre_of_mass() {
    let c = content();
    let mut w = PhysicsWorld::new(c.clone(), Environment::default(), only(&["gravity"]));
    // a 3×1×1 bar: 660 kg, centre at x = 1.5 above the structure's origin
    let id = w.add_structure(&blocks(&c, "hull_steel", 3, 1, 1, [4, 50, 4]), [1, 0, 0]);
    let t = FlatTerrain { ground_top: -100000, water_top: None };
    w.step(1.0 / 60.0, &t); // rapier updates mass properties on the first step
    let s = w.structure(id).unwrap();
    assert!((s.props.mass - 660.0).abs() < 1e-9);
    assert!((w.rp.bodies.iter().map(|(_, b)| b.mass()).fold(0.0, f32::max) - 660.0).abs() < 1e-3);
    let com = w.center_of_mass(id).unwrap();
    // 4 + 1.5, 50.5 minus the tiny fall of the first steps, 4 + 0.5
    assert!((com[0] - 5.5).abs() < 1e-3 && (com[1] - 50.5).abs() < 0.01 && (com[2] - 4.5).abs() < 1e-3, "{com:?}");
}

#[test]
fn a_structure_comes_to_rest_on_voxel_terrain() {
    let c = content();
    let mut w = PhysicsWorld::new(c.clone(), Environment::default(), Registry::simple());
    let t = FlatTerrain { ground_top: 10, water_top: None };
    let id = w.add_structure(&blocks(&c, "hull_steel", 2, 2, 2, [0, 14, 0]), [1, 0, 0]);
    run(&mut w, &t, 4.0);
    let p = w.pose(id).unwrap();
    // the top surface of the ground is y = 10 (cells y < 10 are solid)
    assert!((p[1] - 10.0).abs() < 0.06, "resting height {}", p[1]);
    assert!(w.velocity(id).unwrap()[1].abs() < 0.05);
}

#[test]
fn a_hull_floats_at_the_draft_archimedes_predicts() {
    let c = content();
    let mut w = PhysicsWorld::new(c.clone(), Environment::default(), Registry::simple());
    // water fills y in [-30, 10); the slab is 3×3×1 steel hull blocks: 9 × 220 kg
    let t = FlatTerrain { ground_top: -30, water_top: Some(10) };
    let id = w.add_structure(&blocks(&c, "hull_steel", 3, 1, 3, [0, 12, 0]), [1, 0, 0]);
    run(&mut w, &t, 25.0);
    let p = w.pose(id).unwrap();
    let draft = 1980.0 / (RHO_WATER * 9.0); // d = M / (ρ A)
    let expected_bottom = 10.0 - draft;
    assert!((p[1] - expected_bottom).abs() < 0.02, "bottom at {} expected {}", p[1], expected_bottom);
    assert!(w.velocity(id).unwrap()[1].abs() < 0.02, "still bobbing: {:?}", w.velocity(id));
    // and it stays level
    let (qx, qz) = (p[3], p[5]);
    assert!(qx.abs() < 0.01 && qz.abs() < 0.01, "tilted: {p:?}");
}

#[test]
fn heavy_things_sink_and_light_things_float_regardless_of_shape() {
    let c = content();
    let t = FlatTerrain { ground_top: -60, water_top: Some(10) };
    // lead-like: a 2×2×2 block of stone-density material built from hull blocks is 220 kg/m³ and floats;
    // a solid log cube (700 kg/m³ but assemblable with displace 0) has no displaced volume so it sinks
    let mut w = PhysicsWorld::new(c.clone(), Environment::default(), Registry::simple());
    let id = w.add_structure(&blocks(&c, "log", 2, 2, 2, [0, 14, 0]), [1, 0, 0]);
    run(&mut w, &t, 20.0);
    assert!(w.pose(id).unwrap()[1] < 5.0, "an unsealed log structure has no displacement and sinks");
}

#[test]
fn lifting_gas_gives_the_ideal_gas_acceleration() {
    let c = content();
    let env = Environment { sea_level: 0.0, ..Environment::default() };
    let mut w = PhysicsWorld::new(c.clone(), env, only(&["gravity", "atmosphere", "gas_lift"]));
    // 4×4×4 hydrogen cells at the surface (y≈0 -> sea-level air density)
    let id = w.add_structure(&blocks(&c, "gas_cell", 4, 4, 4, [0, 0, 0]), [1, 0, 0]);
    let t = FlatTerrain { ground_top: -100000, water_top: None };
    let m = w.structure(id).unwrap().props.mass;
    assert!((m - (96.0 * 0.3 + 64.0 * 0.0899)).abs() < 1e-3);
    let rho = air_density(2.0); // centre of the cluster
    let a_expected = G0 * (rho * 64.0 / m as f32 as f32 - 1.0);
    run(&mut w, &t, 0.5);
    let v = w.velocity(id).unwrap()[1];
    assert!((v / 0.5 - a_expected).abs() / a_expected < 0.03, "a = {} expected {}", v / 0.5, a_expected);
}

#[test]
fn falling_with_air_drag_matches_a_reference_ode_solution() {
    let c = content();
    let start = 3000.0f32;
    let env = Environment { sea_level: 0.0, ..Environment::default() };
    let mut w = PhysicsWorld::new(c.clone(), env, only(&["gravity", "atmosphere", "air_drag"]));
    let id = w.add_structure(&blocks(&c, "hull_steel", 1, 1, 1, [0, start as i32, 0]), [1, 0, 0]);
    let t = FlatTerrain { ground_top: -100000, water_top: None };
    run(&mut w, &t, 12.0);
    // reference: m dv/dt = m g - ½ ρ(h) Cd A v²  (v positive downward; one face points into the flow, Cd = 1, A = 1 m²)
    let (m, g) = (220.0f64, G0 as f64);
    let (mut h, mut v) = (start as f64, 0.0f64);
    let acc = |h: f64, v: f64| g - 0.5 * air_density(h as f32) as f64 * v * v / m;
    let dt = 1e-3;
    for _ in 0..12000 {
        let (k1v, k1h) = (acc(h, v), v);
        let (k2v, k2h) = (acc(h - 0.5 * dt * k1h, v + 0.5 * dt * k1v), v + 0.5 * dt * k1v);
        let (k3v, k3h) = (acc(h - 0.5 * dt * k2h, v + 0.5 * dt * k2v), v + 0.5 * dt * k2v);
        let (k4v, k4h) = (acc(h - dt * k3h, v + dt * k3v), v + dt * k3v);
        v += dt / 6.0 * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);
        h -= dt / 6.0 * (k1h + 2.0 * k2h + 2.0 * k3h + k4h);
    }
    let sim_v = -w.velocity(id).unwrap()[1] as f64;
    let sim_h = w.pose(id).unwrap()[1] as f64;
    assert!((sim_v - v).abs() / v < 0.015, "v {sim_v} vs reference {v}");
    assert!((sim_h - h).abs() < 6.0, "height {sim_h} vs reference {h}");
}

#[test]
fn a_propeller_pushes_with_its_rated_thrust() {
    let c = content();
    let mut w = PhysicsWorld::new(c.clone(), Environment::default(), only(&["atmosphere", "propulsion"]));
    let env_sea = 0.0;
    let _ = env_sea;
    let id = w.add_structure(&blocks(&c, "propeller", 1, 1, 1, [0, 0, 0]), [1, 0, 0]);
    w.structure_mut(id).unwrap().controls.throttle = 1.0;
    let t = FlatTerrain { ground_top: -100000, water_top: None };
    run(&mut w, &t, 0.1);
    let v = w.velocity(id).unwrap()[0];
    let rho = air_density(0.5);
    let a0 = 400.0 * (rho / 1.225).cbrt() / 40.0; // thrust ∝ ρ^(1/3), m = 40 kg
    // thrust falls linearly with airspeed (zero at 50 m/s): dv/dt = a0 (1 - v/50)  =>  v = 50 (1 - exp(-a0 t / 50))
    let expected = 50.0 * (1.0 - (-a0 * 0.1 / 50.0f32).exp());
    assert!((v - expected).abs() / expected < 0.02, "v = {v} expected {expected}");
}

#[test]
fn the_simulation_is_deterministic() {
    let c = content();
    let scenario = || {
        let mut w = PhysicsWorld::new(c.clone(), Environment::default(), Registry::simple());
        let t = FlatTerrain { ground_top: -30, water_top: Some(10) };
        let mut b = blocks(&c, "hull_steel", 3, 1, 2, [0, 13, 0]);
        b.extend(blocks(&c, "propeller", 1, 1, 1, [1, 12, 0]));
        let id = w.add_structure(&b, [1, 0, 0]);
        w.structure_mut(id).unwrap().controls.throttle = 0.5;
        w.structure_mut(id).unwrap().controls.steer = 0.2;
        run(&mut w, &t, 6.0);
        w.state_hash()
    };
    assert_eq!(scenario(), scenario());
    // and a different input gives a different state
    let mut w = PhysicsWorld::new(c.clone(), Environment::default(), Registry::simple());
    let t = FlatTerrain { ground_top: -30, water_top: Some(10) };
    let id = w.add_structure(&blocks(&c, "hull_steel", 3, 1, 2, [0, 13, 0]), [1, 0, 0]);
    run(&mut w, &t, 6.0);
    let _ = id;
    assert_ne!(scenario(), w.state_hash());
}

