# Fulcrum

A block-building world in the browser where what you build obeys real physics. It has two parts that can be used on their own:

- **Part 1, the block game** (`crates/voxel`, `crates/game`, `web/`): chunked world, seeded terrain (biomes by climate, caves, water, trees), greedy meshing with ambient occlusion, first-person player, break/place, day and night, six graphics quality tiers plus Auto.
- **Part 2, the physics engine** (`crates/physics`): blocks that are assembled become **rigid bodies** with mass, centre of mass and inertia computed from the blocks, colliding with the block terrain. Forces are toggleable phenomena (`crates/core/src/registry.rs`).

The game is inspired by Minecraft and by the Create family of mods, but uses an original name, original (procedural) art and its own code.

Built with Rust (compiled to WebAssembly), WebGPU and TypeScript. It runs entirely in the browser; nothing needs a server.

## Run

```bash
# once
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.130 --locked
cd apps/fulcrum/web && npm install

# develop / build (the build writes the static site to ../../../mini-proj/fulcrum)
npm run dev
npm run build

# tests (physics validation, voxel engine, gameplay)
cd .. && cargo test --workspace
```
WebGPU is required (recent Chrome, Edge or Safari).

## What works today

| Area | Status |
|---|---|
| Infinite procedural world, streaming, meshing with AO, water, trees, caves | working (generation and meshing run on the main thread for now) |
| Player: walk, jump, swim, fly, break and place blocks | working |
| **Assemble** (F): flood-fills connected assemblable blocks into a rigid body | working |
| Gravity, buoyancy (Archimedes, partial immersion), water and air drag, lifting gas, propeller thrust | working, validated |
| Helm: sit on a structure (R), throttle and steer, put it back (G) | working |
| Simple / Complex physics modes with dependency-aware toggles | working |
| Graphics tiers Potato to Ultra, Auto adjust | working (Ultra enables no extra effects yet) |
| Example builds: boat on a pool, hydrogen airship | working |

## Physics and how it is checked

`crates/validate/tests/physics.rs` compares the simulation with closed-form or reference answers:

- free fall follows ½gt²; a falling block with air drag matches a reference RK4 solution of the same ODE within 1.5%;
- a steel hull floats at the draft Archimedes predicts (to 2 cm), level and still;
- a 64-cell hydrogen balloon accelerates at the ideal-gas value (within 3%);
- a propeller's acceleration matches the analytic solution of its thrust curve;
- mass, centre of mass and inertia tensor match textbook results for cubes and bars (parallel-axis theorem);
- the simulation is deterministic (same inputs, same state hash).

`crates/game` tests assemble a boat in the real block world, float it, and put it back. Run them with `cargo test --workspace`.

### Block physics model

- 1 block is 1 m³. Each block type (see `content/blocks.json`) has a mass, a displaced volume when submerged (sealed hull vs open frame), a drag coefficient, and optional roles (propeller, helm, gas cell).
- Gas cells weigh only their skin (per exposed face) plus the gas inside; their lift is the displaced air mass. Hydrogen lifts about 1.1 kg per cell, so real airships need real volume.
- Buoyancy uses the exact immersed fraction of each block against the water surface, with a small heave damping term for waves radiated by a hull crossing the surface.
- Propeller thrust scales with medium density^(1/3) and falls linearly to zero at the propeller's pitch speed.

## Roadmap

The approved plan is a long one: kinetics and machines with real torque and RPM, aerodynamics and wings, electricity, trains and cannons, other worlds and orbits, and a server plus multiplayer. See the phases in the project plan. The next steps are moving world generation and meshing to workers, lighting, survival and crafting, and the kinetic network.
