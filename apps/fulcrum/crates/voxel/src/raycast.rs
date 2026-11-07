//! Voxel ray traversal (Amanatides & Woo).

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hit {
    /// The solid block that was hit.
    pub block: [i32; 3],
    /// Face normal of the hit (points back toward the ray origin), so `block + normal` is the cell to place into.
    pub normal: [i32; 3],
    pub distance: f32,
}

pub fn raycast(origin: [f32; 3], dir: [f32; 3], max_dist: f32, mut solid: impl FnMut(i32, i32, i32) -> bool) -> Option<Hit> {
    let len = (dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]).sqrt();
    if len == 0.0 || !len.is_finite() {
        return None;
    }
    let d = [dir[0] / len, dir[1] / len, dir[2] / len];
    let mut cell = [origin[0].floor() as i32, origin[1].floor() as i32, origin[2].floor() as i32];
    let mut step = [0i32; 3];
    let mut t_max = [f32::INFINITY; 3];
    let mut t_delta = [f32::INFINITY; 3];
    for a in 0..3 {
        if d[a] > 0.0 {
            step[a] = 1;
            t_delta[a] = 1.0 / d[a];
            t_max[a] = (cell[a] as f32 + 1.0 - origin[a]) / d[a];
        } else if d[a] < 0.0 {
            step[a] = -1;
            t_delta[a] = -1.0 / d[a];
            t_max[a] = (origin[a] - cell[a] as f32) / -d[a];
        }
    }
    if solid(cell[0], cell[1], cell[2]) {
        return Some(Hit { block: cell, normal: [0, 0, 0], distance: 0.0 });
    }
    let mut dist = 0.0;
    while dist <= max_dist {
        let a = if t_max[0] < t_max[1] && t_max[0] < t_max[2] { 0 } else if t_max[1] < t_max[2] { 1 } else { 2 };
        dist = t_max[a];
        cell[a] += step[a];
        t_max[a] += t_delta[a];
        if dist > max_dist {
            break;
        }
        if solid(cell[0], cell[1], cell[2]) {
            let mut normal = [0; 3];
            normal[a] = -step[a];
            return Some(Hit { block: cell, normal, distance: dist });
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hits_the_first_block_with_the_right_face() {
        let solid = |x: i32, y: i32, z: i32| (x, y, z) == (5, 0, 0);
        let h = raycast([0.5, 0.5, 0.5], [1.0, 0.0, 0.0], 20.0, solid).unwrap();
        assert_eq!(h.block, [5, 0, 0]);
        assert_eq!(h.normal, [-1, 0, 0]);
        assert!((h.distance - 4.5).abs() < 1e-4);
    }

    #[test]
    fn misses_beyond_range_and_handles_negative_directions() {
        let solid = |x: i32, y: i32, _z: i32| (x, y) == (-3, 0);
        assert!(raycast([0.5, 0.5, 0.5], [1.0, 0.0, 0.0], 20.0, solid).is_none());
        let h = raycast([0.5, 0.5, 0.5], [-1.0, 0.0, 0.0], 20.0, solid).unwrap();
        assert_eq!(h.block, [-3, 0, 0]);
        assert_eq!(h.normal, [1, 0, 0]);
        assert!(raycast([0.5, 0.5, 0.5], [-1.0, 0.0, 0.0], 2.0, solid).is_none());
    }

    #[test]
    fn diagonal_ray_hits_floor_from_above() {
        let solid = |_x: i32, y: i32, _z: i32| y <= 0;
        let h = raycast([0.5, 5.5, 0.5], [0.3, -1.0, 0.2], 50.0, solid).unwrap();
        assert_eq!(h.block[1], 0);
        assert_eq!(h.normal, [0, 1, 0]);
    }
}
