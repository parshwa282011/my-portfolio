//! First-person player: walking, jumping, swimming and flying with AABB-vs-voxel collision.
use fulcrum_core::units::G0;
use fulcrum_voxel::World;

pub const WIDTH: f32 = 0.6;
pub const HEIGHT: f32 = 1.8;
pub const EYE: f32 = 1.62;

#[derive(Clone, Copy, Debug, Default)]
pub struct PlayerInput {
    /// -1..1, forward is +1
    pub forward: f32,
    /// -1..1, right is +1
    pub strafe: f32,
    pub jump: bool,
    pub sneak: bool,
    pub sprint: bool,
}

#[derive(Clone, Debug)]
pub struct Player {
    /// Feet position.
    pub pos: [f32; 3],
    pub vel: [f32; 3],
    /// Radians; yaw 0 looks toward -z.
    pub yaw: f32,
    pub pitch: f32,
    pub on_ground: bool,
    pub in_water: bool,
    pub flying: bool,
}

impl Player {
    pub fn new(pos: [f32; 3]) -> Player {
        Player { pos, vel: [0.0; 3], yaw: 0.0, pitch: 0.0, on_ground: false, in_water: false, flying: false }
    }

    pub fn eye(&self) -> [f32; 3] {
        [self.pos[0], self.pos[1] + EYE, self.pos[2]]
    }

    /// Unit vector the player looks along.
    pub fn look(&self) -> [f32; 3] {
        let (sy, cy, sp, cp) = (self.yaw.sin(), self.yaw.cos(), self.pitch.sin(), self.pitch.cos());
        [-sy * cp, sp, -cy * cp]
    }

    pub fn update(&mut self, world: &World, input: PlayerInput, dt: f32) {
        let dt = dt.min(0.05);
        let (sy, cy) = (self.yaw.sin(), self.yaw.cos());
        let fwd = [-sy, -cy];
        let right = [cy, -sy];
        let speed = if self.flying { if input.sprint { 18.0 } else { 9.0 } } else if input.sprint { 5.6 } else if input.sneak { 1.8 } else { 4.3 };
        let mut wish = [(fwd[0] * input.forward + right[0] * input.strafe), (fwd[1] * input.forward + right[1] * input.strafe)];
        let len = (wish[0] * wish[0] + wish[1] * wish[1]).sqrt();
        if len > 1.0 {
            wish = [wish[0] / len, wish[1] / len];
        }
        let center_y = self.pos[1] + HEIGHT * 0.5;
        self.in_water = world.is_fluid(self.pos[0].floor() as i32, center_y.floor() as i32, self.pos[2].floor() as i32);

        // horizontal: accelerate toward the wish velocity (faster on the ground, slower in the air and water)
        let accel = if self.flying { 40.0 } else if self.on_ground { 60.0 } else if self.in_water { 12.0 } else { 14.0 };
        let target = [wish[0] * speed * if self.in_water && !self.flying { 0.6 } else { 1.0 }, wish[1] * speed * if self.in_water && !self.flying { 0.6 } else { 1.0 }];
        for (i, a) in [0usize, 2usize].into_iter().enumerate() {
            let d = target[i] - self.vel[a];
            let step = (accel * dt).min(d.abs());
            self.vel[a] += d.signum() * step;
        }

        if self.flying {
            let up = if input.jump { 1.0 } else if input.sneak { -1.0 } else { 0.0 };
            let d = up * speed - self.vel[1];
            self.vel[1] += d.signum() * (accel * dt).min(d.abs());
        } else if self.in_water {
            self.vel[1] -= G0 * 0.15 * dt;
            self.vel[1] *= 1.0 - 2.2 * dt;
            if input.jump {
                self.vel[1] = self.vel[1].max(0.0) + 14.0 * dt;
                self.vel[1] = self.vel[1].min(3.0);
            }
        } else {
            self.vel[1] -= G0 * dt;
            if input.jump && self.on_ground {
                self.vel[1] = (2.0 * G0 * 1.15).sqrt(); // clears a block-and-a-bit like a real jump
            }
        }

        // move in small steps so thin walls cannot be skipped
        let total = [self.vel[0] * dt, self.vel[1] * dt, self.vel[2] * dt];
        let n = (total.iter().fold(0.0f32, |m, v| m.max(v.abs())) / 0.25).ceil().max(1.0) as i32;
        self.on_ground = false;
        for _ in 0..n {
            for a in 0..3 {
                self.move_axis(world, a, total[a] / n as f32);
            }
        }
        if self.flying && self.on_ground {
            self.flying = false;
        }
    }

    fn move_axis(&mut self, world: &World, axis: usize, delta: f32) {
        if delta == 0.0 {
            return;
        }
        self.pos[axis] += delta;
        let hw = WIDTH * 0.5;
        let (min, max) = ([self.pos[0] - hw, self.pos[1], self.pos[2] - hw], [self.pos[0] + hw, self.pos[1] + HEIGHT, self.pos[2] + hw]);
        let (lo, hi) = ([min[0].floor() as i32, min[1].floor() as i32, min[2].floor() as i32], [(max[0] - 1e-4).floor() as i32, (max[1] - 1e-4).floor() as i32, (max[2] - 1e-4).floor() as i32]);
        for y in lo[1]..=hi[1] {
            for z in lo[2]..=hi[2] {
                for x in lo[0]..=hi[0] {
                    if world.is_solid_or_unloaded(x, y, z) {
                        let cell = [x, y, z];
                        if delta > 0.0 {
                            let edge = cell[axis] as f32;
                            let ext = if axis == 1 { HEIGHT } else { hw };
                            self.pos[axis] = self.pos[axis].min(edge - ext - 1e-4);
                        } else {
                            let edge = cell[axis] as f32 + 1.0;
                            let ext = if axis == 1 { 0.0 } else { -hw };
                            self.pos[axis] = self.pos[axis].max(edge + ext + 1e-4);
                            if axis == 1 {
                                self.on_ground = true;
                            }
                        }
                        self.vel[axis] = 0.0;
                        return self.move_axis_recheck(world, axis);
                    }
                }
            }
        }
    }

    // after a correction nothing else can overlap along this axis, so there is nothing to redo
    fn move_axis_recheck(&mut self, _world: &World, _axis: usize) {}
}

#[cfg(test)]
mod tests {
    use super::*;
    use fulcrum_core::Content;
    use std::sync::Arc;

    fn flat_world() -> World {
        let c = Arc::new(Content::builtin());
        let mut w = World::new(1, c.clone());
        let stone = c.require("stone");
        for cx in -2..=2 {
            for cz in -2..=2 {
                w.ensure_chunk((cx, 1, cz));
            }
        }
        // carve a flat floor at y = 20 and clear everything above
        for x in -30..30 {
            for z in -30..30 {
                for y in 17..40 {
                    w.set(x, y, z, if y < 20 { stone } else { 0 });
                }
            }
        }
        w
    }

    #[test]
    fn falls_lands_and_stands_on_the_floor() {
        let w = flat_world();
        let mut p = Player::new([0.5, 24.0, 0.5]);
        for _ in 0..180 {
            p.update(&w, PlayerInput::default(), 1.0 / 60.0);
        }
        assert!(p.on_ground);
        assert!((p.pos[1] - 20.0).abs() < 0.01, "feet at {}", p.pos[1]);
    }

    #[test]
    fn jump_height_is_about_a_block_and_a_bit_and_walls_stop_you() {
        let mut w = flat_world();
        let mut p = Player::new([0.5, 20.0, 0.5]);
        for _ in 0..30 {
            p.update(&w, PlayerInput::default(), 1.0 / 60.0);
        }
        let mut peak = 20.0f32;
        for i in 0..90 {
            p.update(&w, PlayerInput { jump: i == 0, ..Default::default() }, 1.0 / 60.0);
            peak = peak.max(p.pos[1]);
        }
        assert!((peak - 21.15).abs() < 0.05, "peak {peak}");
        // a wall of stone two blocks tall at x = 3
        let stone = w.content.require("stone");
        for y in 20..23 {
            for z in -5..5 {
                w.set(3, y, z, stone);
            }
        }
        let mut q = Player::new([0.5, 20.0, 0.5]);
        q.yaw = -std::f32::consts::FRAC_PI_2; // look toward +x
        for _ in 0..240 {
            q.update(&w, PlayerInput { forward: 1.0, ..Default::default() }, 1.0 / 60.0);
        }
        assert!(q.pos[0] < 3.0 - WIDTH * 0.5 + 0.01, "x = {}", q.pos[0]);
    }
}
