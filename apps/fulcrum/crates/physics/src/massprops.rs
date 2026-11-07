//! Mass, centre of mass and inertia tensor of a block structure.
use fulcrum_core::{BlockId, Content};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy)]
pub struct MassProps {
    pub mass: f64,
    /// Centre of mass in structure-local coordinates (block `(i,j,k)` occupies `[i,i+1]×[j,j+1]×[k,k+1]`).
    pub com: [f64; 3],
    /// Inertia tensor about the centre of mass (row-major 3×3).
    pub inertia: [[f64; 3]; 3],
}

/// Mass of one block: its material mass, the lifting gas inside it, and skin on faces it does not share
/// with a block of the same type.
pub fn block_mass(content: &Content, blocks: &BTreeMap<[i32; 3], BlockId>, pos: [i32; 3], id: BlockId) -> f64 {
    let def = content.get(id);
    let mut m = def.mass_kg as f64 + def.gas_density as f64; // 1 m³ of gas
    if def.face_mass_kg > 0.0 {
        let open = face_dirs().iter().filter(|d| blocks.get(&[pos[0] + d[0], pos[1] + d[1], pos[2] + d[2]]) != Some(&id)).count();
        m += def.face_mass_kg as f64 * open as f64;
    }
    m
}

pub fn face_dirs() -> [[i32; 3]; 6] {
    [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
}

/// Compute mass properties by summing each block as a uniform unit cube (I = m/6 about its own axes)
/// and applying the parallel-axis theorem.
pub fn mass_properties(content: &Content, blocks: &BTreeMap<[i32; 3], BlockId>) -> MassProps {
    let mut mass = 0.0;
    let mut weighted = [0.0; 3];
    let masses: Vec<([f64; 3], f64)> = blocks
        .iter()
        .map(|(&p, &id)| ([p[0] as f64 + 0.5, p[1] as f64 + 0.5, p[2] as f64 + 0.5], block_mass(content, blocks, p, id)))
        .collect();
    for (c, m) in &masses {
        mass += m;
        for a in 0..3 {
            weighted[a] += m * c[a];
        }
    }
    let com = if mass > 0.0 { [weighted[0] / mass, weighted[1] / mass, weighted[2] / mass] } else { [0.5; 3] };
    let mut inertia = [[0.0; 3]; 3];
    for (c, m) in &masses {
        let r = [c[0] - com[0], c[1] - com[1], c[2] - com[2]];
        let r2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
        for i in 0..3 {
            for j in 0..3 {
                inertia[i][j] += m * ((if i == j { r2 } else { 0.0 }) - r[i] * r[j]);
            }
            inertia[i][i] += m / 6.0; // the cube's own inertia
        }
    }
    MassProps { mass, com, inertia }
}

/// Eigen-decomposition of a symmetric 3×3 matrix (cyclic Jacobi). Returns eigenvalues and the
/// matrix whose *columns* are the corresponding unit eigenvectors.
pub fn eigen_symmetric(m: [[f64; 3]; 3]) -> ([f64; 3], [[f64; 3]; 3]) {
    let mut a = m;
    let mut v = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
    for _ in 0..60 {
        let off = a[0][1].abs() + a[0][2].abs() + a[1][2].abs();
        if off < 1e-14 * (a[0][0].abs() + a[1][1].abs() + a[2][2].abs()).max(1e-30) {
            break;
        }
        for (p, q) in [(0, 1), (0, 2), (1, 2)] {
            if a[p][q].abs() < 1e-300 {
                continue;
            }
            let theta = (a[q][q] - a[p][p]) / (2.0 * a[p][q]);
            let t = theta.signum() / (theta.abs() + (theta * theta + 1.0).sqrt());
            let t = if theta == 0.0 { 1.0 } else { t };
            let c = 1.0 / (t * t + 1.0).sqrt();
            let s = t * c;
            for k in 0..3 {
                let (akp, akq) = (a[k][p], a[k][q]);
                a[k][p] = c * akp - s * akq;
                a[k][q] = s * akp + c * akq;
            }
            for k in 0..3 {
                let (apk, aqk) = (a[p][k], a[q][k]);
                a[p][k] = c * apk - s * aqk;
                a[q][k] = s * apk + c * aqk;
            }
            for k in 0..3 {
                let (vkp, vkq) = (v[k][p], v[k][q]);
                v[k][p] = c * vkp - s * vkq;
                v[k][q] = s * vkp + c * vkq;
            }
        }
    }
    ([a[0][0], a[1][1], a[2][2]], v)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn blocks(list: &[([i32; 3], &str)], c: &Content) -> BTreeMap<[i32; 3], BlockId> {
        list.iter().map(|&(p, n)| (p, c.require(n))).collect()
    }

    #[test]
    fn single_cube_matches_the_textbook_inertia() {
        let c = Content::builtin();
        let b = blocks(&[([0, 0, 0], "hull_steel")], &c);
        let m = mass_properties(&c, &b);
        assert!((m.mass - 220.0).abs() < 1e-9);
        assert_eq!(m.com, [0.5, 0.5, 0.5]);
        // solid cube side 1: I = m a²/6 about any axis through the centre
        for i in 0..3 {
            assert!((m.inertia[i][i] - 220.0 / 6.0).abs() < 1e-9);
        }
        assert!(m.inertia[0][1].abs() < 1e-12);
    }

    #[test]
    fn two_cube_bar_matches_parallel_axis() {
        let c = Content::builtin();
        let b = blocks(&[([0, 0, 0], "hull_steel"), ([1, 0, 0], "hull_steel")], &c);
        let m = mass_properties(&c, &b);
        assert_eq!(m.com, [1.0, 0.5, 0.5]);
        // a 2×1×1 box of mass M: I_x = M(1+1)/12, I_y = I_z = M(4+1)/12
        let total = 440.0;
        assert!((m.inertia[0][0] - total * 2.0 / 12.0).abs() < 1e-9);
        assert!((m.inertia[1][1] - total * 5.0 / 12.0).abs() < 1e-9);
        assert!((m.inertia[2][2] - total * 5.0 / 12.0).abs() < 1e-9);
    }

    #[test]
    fn gas_cells_get_skin_only_on_exposed_faces_and_count_the_gas() {
        let c = Content::builtin();
        // two adjacent gas cells share a face: 10 exposed faces of skin plus 2 m³ of hydrogen
        let b = blocks(&[([0, 0, 0], "gas_cell"), ([1, 0, 0], "gas_cell")], &c);
        let m = mass_properties(&c, &b);
        assert!((m.mass - (10.0 * 0.3 + 2.0 * 0.0899)).abs() < 1e-5);
    }

    #[test]
    fn jacobi_recovers_known_eigenvalues() {
        let (vals, vecs) = eigen_symmetric([[2.0, 1.0, 0.0], [1.0, 2.0, 0.0], [0.0, 0.0, 5.0]]);
        let mut v = vals;
        v.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert!((v[0] - 1.0).abs() < 1e-9 && (v[1] - 3.0).abs() < 1e-9 && (v[2] - 5.0).abs() < 1e-9);
        // columns are orthonormal
        for i in 0..3 {
            let n: f64 = (0..3).map(|k| vecs[k][i] * vecs[k][i]).sum();
            assert!((n - 1.0).abs() < 1e-9);
        }
    }
}
