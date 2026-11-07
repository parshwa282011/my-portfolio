//! Greedy meshing with baked ambient occlusion.
//!
//! A `Grid` is a box of blocks plus a one-block border (so faces on the edge know their neighbours).
//! Chunks and assembled structures are meshed with the same code.
//!
//! Vertex layout (8 floats): x, y, z, u, v, normal_id, ao, block_id.
//!   normal_id: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z     ao: 0 (dark) .. 3 (open)
use fulcrum_core::{BlockId, Content, Render};

pub const FLOATS_PER_VERTEX: usize = 8;

#[derive(Default, Clone)]
pub struct MeshData {
    pub vertices: Vec<f32>,
    pub indices: Vec<u32>,
}

impl MeshData {
    pub fn is_empty(&self) -> bool {
        self.indices.is_empty()
    }
    pub fn quad_count(&self) -> usize {
        self.indices.len() / 6
    }
}

#[derive(Default, Clone)]
pub struct ChunkMesh {
    pub opaque: MeshData,
    pub fluid: MeshData,
}

/// Blocks in `0..n` on each axis, with a border of one block on every side.
pub struct Grid {
    pub n: [usize; 3],
    data: Vec<BlockId>,
}

impl Grid {
    pub fn new(n: [usize; 3], fill: impl Fn(i32, i32, i32) -> BlockId) -> Grid {
        let (sx, sy, sz) = (n[0] + 2, n[1] + 2, n[2] + 2);
        let mut data = vec![0; sx * sy * sz];
        for y in 0..sy {
            for z in 0..sz {
                for x in 0..sx {
                    data[x + z * sx + y * sx * sz] = fill(x as i32 - 1, y as i32 - 1, z as i32 - 1);
                }
            }
        }
        Grid { n, data }
    }

    #[inline]
    pub fn get(&self, x: i32, y: i32, z: i32) -> BlockId {
        let (sx, sz) = (self.n[0] + 2, self.n[2] + 2);
        self.data[(x + 1) as usize + (z + 1) as usize * sx + (y + 1) as usize * sx * sz]
    }
}

#[inline]
fn renders(c: &Content, id: BlockId) -> bool {
    c.get(id).render != Render::None
}

#[inline]
fn opaque(c: &Content, id: BlockId) -> bool {
    matches!(c.get(id).render, Render::Opaque | Render::Cutout)
}

/// Is the face of `a` that looks toward `b` visible?
#[inline]
fn face_visible(c: &Content, a: BlockId, b: BlockId) -> bool {
    if !renders(c, a) {
        return false;
    }
    if opaque(c, a) {
        // an opaque face shows unless the neighbour is opaque too
        !opaque(c, b) || (c.get(b).render == Render::Cutout && c.get(a).render != Render::Cutout)
    } else {
        // a fluid face shows toward anything that is not the same fluid and not opaque
        a != b && !opaque(c, b)
    }
}

/// Which grid cells darken a face (solid, light-blocking, not fluid).
#[inline]
fn occludes(c: &Content, id: BlockId) -> bool {
    opaque(c, id)
}

pub fn mesh_grid(grid: &Grid, content: &Content) -> ChunkMesh {
    let mut out = ChunkMesh::default();
    for d in 0..3usize {
        let (u, v) = ((d + 1) % 3, (d + 2) % 3);
        let (nu, nv, nd) = (grid.n[u] as i32, grid.n[v] as i32, grid.n[d] as i32);
        for &sign in &[1i32, -1i32] {
            for k in 0..nd {
                // 0 = no face; otherwise (1<<31) | ao<<16 | block id
                let mut mask = vec![0u32; (nu * nv) as usize];
                for j in 0..nv {
                    for i in 0..nu {
                        let mut p = [0i32; 3];
                        p[d] = k;
                        p[u] = i;
                        p[v] = j;
                        let mut q = p;
                        q[d] += sign;
                        let a = grid.get(p[0], p[1], p[2]);
                        let b = grid.get(q[0], q[1], q[2]);
                        if !face_visible(content, a, b) {
                            continue;
                        }
                        let ao = if opaque(content, a) { face_ao(grid, content, q, u, v) } else { 0b11_11_11_11 };
                        mask[(j * nu + i) as usize] = (1 << 31) | ((ao as u32) << 16) | a as u32;
                    }
                }
                emit_greedy(&mut out, content, &mask, nu, nv, d, u, v, sign, k);
            }
        }
    }
    out
}

/// Ambient occlusion for the four corners of the face whose outside cell is `q`.
/// Corner order is (u0,v0) (u1,v0) (u1,v1) (u0,v1), two bits each.
fn face_ao(grid: &Grid, c: &Content, q: [i32; 3], u: usize, v: usize) -> u8 {
    let solid = |du: i32, dv: i32| {
        let mut p = q;
        p[u] += du;
        p[v] += dv;
        occludes(c, grid.get(p[0], p[1], p[2])) as i32
    };
    let corner = |su: i32, sv: i32| -> u8 {
        let (s1, s2, cn) = (solid(su, 0), solid(0, sv), solid(su, sv));
        if s1 == 1 && s2 == 1 { 0 } else { (3 - (s1 + s2 + cn)) as u8 }
    };
    corner(-1, -1) | (corner(1, -1) << 2) | (corner(1, 1) << 4) | (corner(-1, 1) << 6)
}

#[allow(clippy::too_many_arguments)]
fn emit_greedy(out: &mut ChunkMesh, content: &Content, mask: &[u32], nu: i32, nv: i32, d: usize, u: usize, v: usize, sign: i32, k: i32) {
    let mut done = vec![false; mask.len()];
    for j in 0..nv {
        let mut i = 0;
        while i < nu {
            let key = mask[(j * nu + i) as usize];
            if key == 0 || done[(j * nu + i) as usize] {
                i += 1;
                continue;
            }
            // grow right, then down, over identical faces
            let mut w = 1;
            while i + w < nu && mask[(j * nu + i + w) as usize] == key && !done[(j * nu + i + w) as usize] {
                w += 1;
            }
            let mut h = 1;
            'grow: while j + h < nv {
                for x in 0..w {
                    let m = (j + h) * nu + i + x;
                    if mask[m as usize] != key || done[m as usize] {
                        break 'grow;
                    }
                }
                h += 1;
            }
            for y in 0..h {
                for x in 0..w {
                    done[((j + y) * nu + i + x) as usize] = true;
                }
            }
            let block = (key & 0xffff) as BlockId;
            let ao = ((key >> 16) & 0xff) as u8;
            let fluid = content.get(block).render == Render::Fluid;
            let target = if fluid { &mut out.fluid } else { &mut out.opaque };
            push_quad(target, d, u, v, sign, k, i, j, w, h, ao, block);
            i += w;
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn push_quad(m: &mut MeshData, d: usize, u: usize, v: usize, sign: i32, k: i32, i: i32, j: i32, w: i32, h: i32, ao: u8, block: BlockId) {
    let plane = (k + if sign > 0 { 1 } else { 0 }) as f32;
    let corners = [(i, j), (i + w, j), (i + w, j + h), (i, j + h)];
    let normal = (d * 2 + if sign > 0 { 0 } else { 1 }) as f32;
    let base = (m.vertices.len() / FLOATS_PER_VERTEX) as u32;
    let mut aos = [0u8; 4];
    for c in 0..4 {
        aos[c] = (ao >> (2 * c)) & 3;
    }
    // for a negative-facing quad the winding is reversed, so walk the corners the other way
    let order: [usize; 4] = if sign > 0 { [0, 1, 2, 3] } else { [0, 3, 2, 1] };
    for &c in &order {
        let (cu, cv) = corners[c];
        let mut p = [0f32; 3];
        p[d] = plane;
        p[u] = cu as f32;
        p[v] = cv as f32;
        m.vertices.extend_from_slice(&[p[0], p[1], p[2], cu as f32, cv as f32, normal, aos[c] as f32, block as f32]);
    }
    // split along the diagonal that keeps AO smooth (indices refer to the emitted order)
    let a = |c: usize| aos[order[c]] as i32;
    if a(0) + a(2) >= a(1) + a(3) {
        m.indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    } else {
        m.indices.extend_from_slice(&[base + 1, base + 2, base + 3, base + 1, base + 3, base]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn content() -> Content {
        Content::builtin()
    }

    #[test]
    fn single_block_has_six_faces() {
        let c = content();
        let stone = c.require("stone");
        let g = Grid::new([1, 1, 1], |x, y, z| if (x, y, z) == (0, 0, 0) { stone } else { 0 });
        let m = mesh_grid(&g, &c);
        assert_eq!(m.opaque.quad_count(), 6);
        assert_eq!(m.opaque.vertices.len(), 24 * FLOATS_PER_VERTEX);
        assert!(m.fluid.is_empty());
    }

    #[test]
    fn shared_faces_are_culled_and_coplanar_faces_merge() {
        let c = content();
        let stone = c.require("stone");
        // a 4×1×1 bar: both ends + 4 long sides, each merged into one quad
        let g = Grid::new([4, 1, 1], |x, y, z| if (0..4).contains(&x) && y == 0 && z == 0 { stone } else { 0 });
        assert_eq!(mesh_grid(&g, &c).opaque.quad_count(), 6);
        // a full 16×16 slab: one quad on top, one below, four sides
        let slab = Grid::new([16, 1, 16], |x, y, z| if (0..16).contains(&x) && y == 0 && (0..16).contains(&z) { stone } else { 0 });
        assert_eq!(mesh_grid(&slab, &c).opaque.quad_count(), 6);
    }

    #[test]
    fn hidden_faces_between_solid_blocks_never_appear() {
        let c = content();
        let stone = c.require("stone");
        let g = Grid::new([3, 3, 3], |x, y, z| if (0..3).contains(&x) && (0..3).contains(&y) && (0..3).contains(&z) { stone } else { 0 });
        // only the outer surface of the 3×3×3 cube: six merged quads
        assert_eq!(mesh_grid(&g, &c).opaque.quad_count(), 6);
    }

    #[test]
    fn water_faces_go_to_the_fluid_pass_and_hide_against_solids() {
        let c = content();
        let (stone, water) = (c.require("stone"), c.require("water"));
        let g = Grid::new([2, 2, 1], |x, y, z| match (x, y, z) {
            (0..=1, 0, 0) => stone,
            (0..=1, 1, 0) => water,
            _ => 0,
        });
        let m = mesh_grid(&g, &c);
        // water: top, four sides (the bottom touches stone); stone: all outer faces except where water sits on top
        assert_eq!(m.fluid.quad_count(), 5);
        assert!(m.opaque.quad_count() >= 5);
    }

    #[test]
    fn ambient_occlusion_darkens_an_inner_corner_and_winding_faces_outward() {
        let c = content();
        let stone = c.require("stone");
        // an L: floor with one block on it; the floor face next to the block is occluded
        let g = Grid::new([3, 2, 1], |x, y, z| match (x, y, z) {
            (0..=2, 0, 0) => stone,
            (1, 1, 0) => stone,
            _ => 0,
        });
        let m = mesh_grid(&g, &c).opaque;
        let ao_values: Vec<f32> = m.vertices.chunks(FLOATS_PER_VERTEX).map(|v| v[6]).collect();
        assert!(ao_values.iter().any(|&a| a < 3.0), "some vertex should be shaded");
        // every triangle must wind counter-clockwise seen from outside, i.e. its geometric normal matches normal_id
        let normals = [[1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, -1.0, 0.0], [0.0, 0.0, 1.0], [0.0, 0.0, -1.0f32]];
        for tri in m.indices.chunks(3) {
            let p: Vec<&[f32]> = tri.iter().map(|&i| &m.vertices[i as usize * FLOATS_PER_VERTEX..][..FLOATS_PER_VERTEX]).collect();
            let e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
            let e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
            let cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
            let n = normals[p[0][5] as usize];
            assert!(cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0.0, "triangle winds the wrong way");
        }
    }
}
