// 4D helpers. World coordinates are (x, y, z, w). The 4D view rotates the world by
// M (a rotation in the xw, yw and zw planes) and then shows the 3D slice w' = w0
// of the rotated space, so  world point = Mᵀ · (x', y', z', w0).
import { rampHex } from "../render2d/colormap.js";

const RAD = Math.PI / 180;

// angles in degrees: [xw, yw, zw]
export function rotation4([a = 0, b = 0, c = 0] = []) {
  const plane = (i, j, deg) => {
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const co = Math.cos(deg * RAD);
    const si = Math.sin(deg * RAD);
    m[i * 4 + i] = co;
    m[i * 4 + j] = -si;
    m[j * 4 + i] = si;
    m[j * 4 + j] = co;
    return m;
  };
  const mul = (A, B) => {
    const out = new Array(16).fill(0);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) for (let c2 = 0; c2 < 4; c2++) out[r * 4 + c2] += A[r * 4 + k] * B[k * 4 + c2];
    return out;
  };
  return mul(plane(2, 3, c), mul(plane(1, 3, b), plane(0, 3, a)));
}

export const isIdentity4 = (angles) => !angles || angles.every((a) => Math.abs(a) < 1e-9);

// M · v   and   Mᵀ · v
export const mulMV = (M, [x, y, z, w]) => [
  M[0] * x + M[1] * y + M[2] * z + M[3] * w,
  M[4] * x + M[5] * y + M[6] * z + M[7] * w,
  M[8] * x + M[9] * y + M[10] * z + M[11] * w,
  M[12] * x + M[13] * y + M[14] * z + M[15] * w,
];
export const mulTV = (M, [x, y, z, w]) => [
  M[0] * x + M[4] * y + M[8] * z + M[12] * w,
  M[1] * x + M[5] * y + M[9] * z + M[13] * w,
  M[2] * x + M[6] * y + M[10] * z + M[14] * w,
  M[3] * x + M[7] * y + M[11] * z + M[15] * w,
];

// F(x,y,z,w) restricted to the slice w' = w0 of the rotated space, as a function of (x',y',z').
export function sliceFunction(F4, M, w0) {
  return (x, y, z) => {
    const p = mulTV(M, [x, y, z, w0]);
    return F4(p[0], p[1], p[2], p[3]);
  };
}

// 4D point -> { pos: [x', y', z'], t } after rotation and (optionally perspective) projection.
// t in [0,1] says where the point sits along w' (used for colour).
export function projector(M, wRange, perspective) {
  const [w0, w1] = wRange;
  const half = Math.max(Math.abs(w0), Math.abs(w1), 1e-9);
  const D = 3 * half; // eye distance along w' for the perspective view
  return (p) => {
    const v = mulMV(M, p);
    let k = 1;
    if (perspective) {
      const gap = D - v[3];
      if (gap < 0.15 * D) return null;
      k = D / gap;
    }
    const t = w1 > w0 ? Math.min(1, Math.max(0, (v[3] - w0) / (w1 - w0))) : 0.5;
    return { pos: [v[0] * k, v[1] * k, v[2] * k], t };
  };
}

export { rampHex };
