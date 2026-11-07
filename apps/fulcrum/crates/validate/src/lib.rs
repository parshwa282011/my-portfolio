//! Validation helpers: tiny reference worlds used by the analytic benchmark tests in `tests/`.
use fulcrum_physics::Terrain;

/// A flat world: solid for `y < ground_top`, water filling up to `water_top` (if any).
pub struct FlatTerrain {
    pub ground_top: i32,
    pub water_top: Option<i32>,
}

impl Terrain for FlatTerrain {
    fn is_solid(&self, _x: i32, y: i32, _z: i32) -> bool {
        y < self.ground_top
    }
    fn water_surface(&self, _x: f32, y: f32, _z: f32) -> Option<f32> {
        let top = self.water_top?;
        if y >= self.ground_top as f32 && y < top as f32 + 2.0 {
            Some(top as f32)
        } else {
            None
        }
    }
}
