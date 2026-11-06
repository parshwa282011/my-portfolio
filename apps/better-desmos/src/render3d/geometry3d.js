// Pure geometry builders for the 3D view (no three.js here, so they are easy to
// test). Everything returns plain typed arrays.
import { referenceMagnitude } from "../render2d/colormap.js";

const LIMIT = 30; // values beyond ±LIMIT·R are treated as "off to infinity"

// ----------------------------------------------------------------- surfaces
// Heightfield over a regular grid: axis "z" -> z=f(x,y), "y" -> y=f(x,z), "x" -> x=f(y,z).
export function heightfield(fn, axis, R, N) {
  return gridSurface(
    N,
    (i, j) => {
      const a = -R + (2 * R * i) / N;
      const b = -R + (2 * R * j) / N;
      const v = fn(a, b);
      if (!Number.isFinite(v) || Math.abs(v) > LIMIT * R) return null;
      return axis === "z" ? [a, b, v] : axis === "y" ? [a, v, b] : [v, a, b];
    },
    R * 3 // a single cell taller than this is a jump (asymptote), not a surface
  );
}

// (u, v) -> (x, y, z)
export function parametricSurface(fx, fy, fz, [u0, u1], [v0, v1], R, N) {
  return gridSurface(
    N,
    (i, j) => {
      const u = u0 + ((u1 - u0) * i) / N;
      const v = v0 + ((v1 - v0) * j) / N;
      const x = fx(u, v);
      const y = fy(u, v);
      const z = fz(u, v);
      if (![x, y, z].every(Number.isFinite) || Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > LIMIT * R) return null;
      return [x, y, z];
    },
    Infinity
  );
}

function gridSurface(N, point, maxJump) {
  const n1 = N + 1;
  const pos = new Float32Array(n1 * n1 * 3);
  const ok = new Uint8Array(n1 * n1);
  for (let j = 0; j < n1; j++) {
    for (let i = 0; i < n1; i++) {
      const p = point(i, j);
      const k = j * n1 + i;
      if (p) {
        pos[3 * k] = p[0];
        pos[3 * k + 1] = p[1];
        pos[3 * k + 2] = p[2];
        ok[k] = 1;
      }
    }
  }
  const idx = [];
  const lines = []; // every 4th grid line, for the "mesh" look
  const LINE_EVERY = Math.max(2, Math.round(N / 24));
  const dist = (a, b) => Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * n1 + i;
      const b = a + 1;
      const c = a + n1;
      const d = c + 1;
      if (!(ok[a] && ok[b] && ok[c] && ok[d])) continue;
      if (maxJump !== Infinity && Math.max(dist(a, b), dist(a, c), dist(b, d), dist(c, d)) > maxJump) continue;
      idx.push(a, b, d, a, d, c);
      if (i % LINE_EVERY === 0) lines.push(a, c);
      if (j % LINE_EVERY === 0) lines.push(a, b);
    }
  }
  return { positions: pos, indices: Uint32Array.from(idx), lineIndices: Uint32Array.from(lines) };
}

// ------------------------------------------------------- implicit surfaces
const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
// six tetrahedra sharing the 0–6 diagonal
const TETS = [
  [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6],
];
const MAX_TRIS = 450000;

// F(x,y,z) = 0 inside [-R,R]^3 by marching tetrahedra. Triangles are wound so that
// their front face points along +∇F, and each vertex carries the field's gradient
// as its normal (smooth shading without welding vertices).
export function marchingTets(fn, R, N) {
  const n1 = N + 1;
  const h = (2 * R) / N;
  const vals = new Float32Array(n1 * n1 * n1);
  let p = 0;
  for (let k = 0; k < n1; k++) {
    const z = -R + k * h;
    for (let j = 0; j < n1; j++) {
      const y = -R + j * h;
      for (let i = 0; i < n1; i++) vals[p++] = fn(-R + i * h, y, z);
    }
  }
  const at = (i, j, k) => (k * n1 + j) * n1 + i;

  const pos = [];
  const nor = [];
  const eps = h * 0.5;
  const gradient = (x, y, z) => {
    const gx = fn(x + eps, y, z) - fn(x - eps, y, z);
    const gy = fn(x, y + eps, z) - fn(x, y - eps, z);
    const gz = fn(x, y, z + eps) - fn(x, y, z - eps);
    const m = Math.hypot(gx, gy, gz);
    return Number.isFinite(m) && m > 0 ? [gx / m, gy / m, gz / m] : null;
  };

  const cv = new Float64Array(8);
  const cp = new Float64Array(24);
  let tris = 0;

  const emit = (A, B, C) => {
    const nA = gradient(A[0], A[1], A[2]);
    const nB = gradient(B[0], B[1], B[2]);
    const nC = gradient(C[0], C[1], C[2]);
    // geometric normal
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const ref = nA || nB || nC;
    let [P1, P2, N1, N2] = [B, C, nB, nC];
    if (ref && gx * ref[0] + gy * ref[1] + gz * ref[2] < 0) [P1, P2, N1, N2] = [C, B, nC, nB];
    const gl = Math.hypot(gx, gy, gz) || 1;
    const geo = [gx / gl, gy / gl, gz / gl];
    const pushV = (P, Nn) => {
      pos.push(P[0], P[1], P[2]);
      const m = Nn || geo;
      nor.push(m[0], m[1], m[2]);
    };
    pushV(A, nA);
    pushV(P1, N1);
    pushV(P2, N2);
    tris++;
  };

  const edge = (a, b) => {
    const va = cv[a];
    const vb = cv[b];
    const t = va / (va - vb);
    return [
      cp[3 * a] + (cp[3 * b] - cp[3 * a]) * t,
      cp[3 * a + 1] + (cp[3 * b + 1] - cp[3 * a + 1]) * t,
      cp[3 * a + 2] + (cp[3 * b + 2] - cp[3 * a + 2]) * t,
    ];
  };

  for (let k = 0; k < N && tris < MAX_TRIS; k++) {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        let lo = Infinity;
        let hi = -Infinity;
        let bad = false;
        for (let c = 0; c < 8; c++) {
          const o = CORNERS[c];
          const v = vals[at(i + o[0], j + o[1], k + o[2])];
          if (!Number.isFinite(v)) {
            bad = true;
            break;
          }
          cv[c] = v;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        if (bad || lo > 0 || hi < 0) continue;
        for (let c = 0; c < 8; c++) {
          const o = CORNERS[c];
          cp[3 * c] = -R + (i + o[0]) * h;
          cp[3 * c + 1] = -R + (j + o[1]) * h;
          cp[3 * c + 2] = -R + (k + o[2]) * h;
        }
        for (const t of TETS) {
          const ins = [];
          const out = [];
          for (const c of t) (cv[c] < 0 ? ins : out).push(c);
          if (!ins.length || !out.length) continue;
          if (ins.length === 1) {
            const o = ins[0];
            emit(edge(o, out[0]), edge(o, out[1]), edge(o, out[2]));
          } else if (out.length === 1) {
            const o = out[0];
            emit(edge(o, ins[0]), edge(o, ins[1]), edge(o, ins[2]));
          } else {
            const p0 = edge(ins[0], out[0]);
            const p1 = edge(ins[0], out[1]);
            const p2 = edge(ins[1], out[1]);
            const p3 = edge(ins[1], out[0]);
            emit(p0, p1, p2);
            emit(p0, p2, p3);
          }
        }
      }
    }
  }
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor), triangles: tris };
}

// ------------------------------------------------------------------- curves
// Samples t -> (x,y,z); breaks the curve at NaNs / escapes. Returns arrays of xyz.
export function sampleCurve(fx, fy, fz, [t0, t1], R, samples = 1200) {
  const out = [];
  let cur = [];
  const flush = () => {
    if (cur.length >= 6) out.push(cur);
    cur = [];
  };
  for (let i = 0; i <= samples; i++) {
    const t = t0 + ((t1 - t0) * i) / samples;
    const x = fx(t);
    const y = fy(t);
    const z = fz(t);
    if (![x, y, z].every(Number.isFinite) || Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > LIMIT * R) flush();
    else cur.push(x, y, z);
  }
  flush();
  return out;
}

// Tube around a polyline (parallel-transport frames, so no twisting).
export function tube(points, radius, sides = 6) {
  const n = points.length / 3;
  const pos = new Float32Array(n * sides * 3);
  const nor = new Float32Array(n * sides * 3);
  const T = (i) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const x = points[3 * b] - points[3 * a];
    const y = points[3 * b + 1] - points[3 * a + 1];
    const z = points[3 * b + 2] - points[3 * a + 2];
    const m = Math.hypot(x, y, z) || 1;
    return [x / m, y / m, z / m];
  };
  let t = T(0);
  // any vector not parallel to t
  let nrm = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => {
    const m = Math.hypot(...a) || 1;
    return [a[0] / m, a[1] / m, a[2] / m];
  };
  nrm = norm(cross(cross(t, nrm), t));
  for (let i = 0; i < n; i++) {
    t = T(i);
    const d = nrm[0] * t[0] + nrm[1] * t[1] + nrm[2] * t[2];
    nrm = norm([nrm[0] - d * t[0], nrm[1] - d * t[1], nrm[2] - d * t[2]]);
    const bin = cross(t, nrm);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const nx = nrm[0] * c + bin[0] * sn;
      const ny = nrm[1] * c + bin[1] * sn;
      const nz = nrm[2] * c + bin[2] * sn;
      const o = (i * sides + s) * 3;
      pos[o] = points[3 * i] + nx * radius;
      pos[o + 1] = points[3 * i + 1] + ny * radius;
      pos[o + 2] = points[3 * i + 2] + nz * radius;
      nor[o] = nx;
      nor[o + 1] = ny;
      nor[o + 2] = nz;
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const a = i * sides + s;
      const b = i * sides + ((s + 1) % sides);
      const c = a + sides;
      const d = b + sides;
      idx.push(a, c, b, b, c, d);
    }
  }
  return { positions: pos, normals: nor, indices: Uint32Array.from(idx) };
}

// ------------------------------------------------------------------- fields
const MAX_ARROWS_3D = 12000;

// Arrows on a grid of spacing `step` (multiples of step inside [-R,R]^3, or just the
// z=0 plane for a 2-component field). Spacing is raised by an integer factor if the
// count would be unreasonable; `coarsened` says so.
export function sampleField3D(res, R, vf) {
  const planar = res.planar;
  let k = 1;
  const count = (s) => {
    const per = Math.floor((2 * R) / s) + 1;
    return planar ? per * per : per * per * per;
  };
  while (count(vf.step * k) > MAX_ARROWS_3D) k++;
  const step = vf.step * k;
  const lim = Math.floor(R / step + 1e-9);
  const zs = planar ? [0] : range(-lim, lim);
  const items = [];
  for (const i of range(-lim, lim)) {
    for (const j of range(-lim, lim)) {
      for (const l of zs) {
        const x = i * step;
        const y = j * step;
        const z = l * step;
        const P = res.fx(x, y, z);
        const Q = res.fy(x, y, z);
        const S = res.fz(x, y, z);
        if (![P, Q, S].every(Number.isFinite)) continue;
        const m = Math.hypot(P, Q, S);
        if (m === 0) continue;
        items.push({ x, y, z, dx: P / m, dy: Q / m, dz: S / m, m });
      }
    }
  }
  const ref = referenceMagnitude(items.map((a) => a.m));
  for (const a of items) {
    const t = Math.min(1, a.m / ref);
    a.t = t;
    a.len = vf.len === "unit" ? 0.7 * step : Math.max(0.12 * step, t * 0.9 * step);
  }
  return { items, step, coarsened: k > 1 };
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}
