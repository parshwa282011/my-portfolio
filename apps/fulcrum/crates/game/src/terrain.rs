use fulcrum_physics::Terrain;
use fulcrum_voxel::World;

/// Lets the physics engine read the block world.
pub struct WorldTerrain<'a>(pub &'a World);

impl Terrain for WorldTerrain<'_> {
    fn is_solid(&self, x: i32, y: i32, z: i32) -> bool {
        self.0.is_solid_or_unloaded(x, y, z)
    }

    fn water_surface(&self, x: f32, y: f32, z: f32) -> Option<f32> {
        let (ix, iz) = (x.floor() as i32, z.floor() as i32);
        let fy = y.floor() as i32;
        // water at the block's cell, or one or two cells below it (a block sitting just above the surface)
        for dy in [0, -1, -2] {
            if self.0.is_fluid(ix, fy + dy, iz) {
                let mut top = fy + dy;
                while top < fy + 16 && self.0.is_fluid(ix, top + 1, iz) {
                    top += 1;
                }
                return Some((top + 1) as f32);
            }
        }
        None
    }
}
