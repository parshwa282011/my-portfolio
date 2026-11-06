// Pure geometry builders for the 3D view (no three.js here, so they are easy to
// test). Everything returns plain typed arrays.
import { referenceMagnitude } from "../render2d/colormap.js";
import { mulMV, mulTV } from "./rot4.js";

const LIMIT = 30; // values far outside the box are treated as "off to infinity"

// The 3D view shows an axis-aligned box:  { x:[x0,x1], y:[y0,y1], z:[z0,z1] }
export const cubeBox = (R) => ({ x: [-R, R], y: [-R, R], z: [-R, R] });
export const boxSpan = (box) => ({ x: box.x[1] - box.x[0], y: box.y[1] - box.y[0], z: box.z[1] - box.z[0] });
export const boxSize = (box) => {
  const s = boxSpan(box);
  return Math.max(s.x, s.y, s.z);
};
const reach = (box) => LIMIT * Math.max(boxSize(box), ...["x", "y", "z"].flatMap((k) => box[k].map(Math.abs)));
const lerp = (r, i, n) => r[0] + ((r[1] - r[0]) * i) / n;

// ----------------------------------------------------------------- surfaces
// Heightfield over a regular grid: axis "z" -> z=f(x,y), "y" -> y=f(x,z), "x" -> x=f(y,z).
export function heightfield(fn, axis, box, N) {
  const [ra, rb] = axis === "z" ? [box.x, box.y] : axis === "y" ? [box.x, box.z] : [box.y, box.z];
  const big = reach(box);
  return gridSurface(
    N,
    (i, j) => {
      const a = lerp(ra, i, N);
      const b = lerp(rb, j, N);
      const v = fn(a, b);
      if (!Number.isFinite(v) || Math.abs(v) > big) return null;
      return axis === "z" ? [a, b, v] : axis === "y" ? [a, v, b] : [v, a, b];
    },
    boxSpan(box)[axis] * 3 // a single cell taller than this is a jump (asymptote), not a surface
  );
}

// (u, v) -> (x, y, z)
export function parametricSurface(fx, fy, fz, [u0, u1], [v0, v1], box, N) {
  const big = reach(box);
  return gridSurface(
    N,
    (i, j) => {
      const u = u0 + ((u1 - u0) * i) / N;
      const v = v0 + ((v1 - v0) * j) / N;
      const x = fx(u, v);
      const y = fy(u, v);
      const z = fz(u, v);
      if (![x, y, z].every(Number.isFinite) || Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > big) return null;
      return [x, y, z];
    },
    Infinity
  );
}

function gridSurface(N, point, maxJump) {
  const n1 = N + 1;
  const pos = new Float32Array(n1 * n1 * 3);
  const ok = new Uint8Array(n1 * n1);
  let col = null; // a 4th component from point() is a 0..1 colour coordinate
  for (let j = 0; j < n1; j++) {
    for (let i = 0; i < n1; i++) {
      const p = point(i, j);
      const k = j * n1 + i;
      if (p) {
        pos[3 * k] = p[0];
        pos[3 * k + 1] = p[1];
        pos[3 * k + 2] = p[2];
        if (p.length > 3) (col ||= new Float32Array(n1 * n1))[k] = p[3];
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
  return { positions: pos, indices: Uint32Array.from(idx), lineIndices: Uint32Array.from(lines), colorCoord: col };
}

// (u, v) -> 4D point, rotated and projected to 3D; the 4th coordinate of each vertex
// (position along w') is returned as colorCoord.
export function parametricSurface4(f4, [u0, u1], [v0, v1], box, N, project) {
  const big = reach(box);
  return gridSurface(
    N,
    (i, j) => {
      const p = f4(u0 + ((u1 - u0) * i) / N, v0 + ((v1 - v0) * j) / N);
      if (!p.every(Number.isFinite)) return null;
      const q = project(p);
      if (!q || Math.max(...q.pos.map(Math.abs)) > big) return null;
      return [q.pos[0], q.pos[1], q.pos[2], q.t];
    },
    Infinity
  );
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

// F(x,y,z) = 0 inside the box by marching tetrahedra. Triangles are wound so that
// their front face points along +∇F, and each vertex carries the field's gradient
// as its normal (smooth shading without welding vertices).
export function marchingTets(fn, box, N) {
  // N cells along the longest side; the others follow in proportion (at least 6)
  const span = boxSpan(box);
  const h = boxSize(box) / N;
  const nx = Math.max(6, Math.round(span.x / h));
  const ny = Math.max(6, Math.round(span.y / h));
  const nz = Math.max(6, Math.round(span.z / h));
  const hx = span.x / nx;
  const hy = span.y / ny;
  const hz = span.z / nz;
  const [X0, Y0, Z0] = [box.x[0], box.y[0], box.z[0]];
  const mx = nx + 1;
  const my = ny + 1;
  const vals = new Float32Array(mx * my * (nz + 1));
  let p = 0;
  for (let k = 0; k <= nz; k++) {
    const z = Z0 + k * hz;
    for (let j = 0; j <= ny; j++) {
      const y = Y0 + j * hy;
      for (let i = 0; i <= nx; i++) vals[p++] = fn(X0 + i * hx, y, z);
    }
  }
  const at = (i, j, k) => (k * my + j) * mx + i;

  const pos = [];
  const nor = [];
  const ex = hx * 0.5;
  const ey = hy * 0.5;
  const ez = hz * 0.5;
  const gradient = (x, y, z) => {
    // scaled so each partial is per unit length, then normalised
    const gx = (fn(x + ex, y, z) - fn(x - ex, y, z)) / ex;
    const gy = (fn(x, y + ey, z) - fn(x, y - ey, z)) / ey;
    const gz = (fn(x, y, z + ez) - fn(x, y, z - ez)) / ez;
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

  for (let k = 0; k < nz && tris < MAX_TRIS; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
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
          cp[3 * c] = X0 + (i + o[0]) * hx;
          cp[3 * c + 1] = Y0 + (j + o[1]) * hy;
          cp[3 * c + 2] = Z0 + (k + o[2]) * hz;
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
export function sampleCurve(fx, fy, fz, [t0, t1], box, samples = 1200) {
  const big = reach(box);
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
    if (![x, y, z].every(Number.isFinite) || Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > big) flush();
    else cur.push(x, y, z);
  }
  flush();
  return out;
}

// t -> 4D point, projected. Returns [{ pos: [...xyz], col: [...t] }, ...] split at gaps.
export function sampleCurve4(f4, [t0, t1], box, project, samples = 1600) {
  const big = reach(box);
  const out = [];
  let cur = { pos: [], col: [] };
  const flush = () => {
    if (cur.col.length >= 2) out.push(cur);
    cur = { pos: [], col: [] };
  };
  for (let i = 0; i <= samples; i++) {
    const p = f4(t0 + ((t1 - t0) * i) / samples);
    const q = p.every(Number.isFinite) ? project(p) : null;
    if (!q || Math.max(...q.pos.map(Math.abs)) > big) flush();
    else {
      cur.pos.push(...q.pos);
      cur.col.push(q.t);
    }
  }
  flush();
  return out;
}

// Tube around a polyline (parallel-transport frames, so no twisting).
export function tube(points, radius, sides = 6, colorCoord = null) {
  const n = points.length / 3;
  const pos = new Float32Array(n * sides * 3);
  const nor = new Float32Array(n * sides * 3);
  const cc = colorCoord ? new Float32Array(n * sides) : null;
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
      if (cc) cc[i * sides + s] = colorCoord[i];
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
  return { positions: pos, normals: nor, indices: Uint32Array.from(idx), colorCoord: cc };
}

// ------------------------------------------------------------------- fields
const MAX_ARROWS_3D = 12000;

// Arrows on a grid of spacing `step` (multiples of step inside the box, or just the
// z = 0 plane for a 2-component field). Spacing is raised by an integer factor if the
// count would be unreasonable; `coarsened` says so.
export function sampleField3D(res, box, vf) {
  const planar = res.planar;
  const idx = (r, step) => {
    const lo = Math.ceil(r[0] / step - 1e-9);
    const hi = Math.floor(r[1] / step + 1e-9);
    const out = [];
    for (let i = lo; i <= hi; i++) out.push(i);
    return out;
  };
  const count = (s) => {
    const nz = planar ? (box.z[0] <= 0 && box.z[1] >= 0 ? 1 : 0) : idx(box.z, s).length;
    return idx(box.x, s).length * idx(box.y, s).length * nz;
  };
  let k = 1;
  while (count(vf.step * k) > MAX_ARROWS_3D) k++;
  const step = vf.step * k;
  const zs = planar ? (box.z[0] <= 0 && box.z[1] >= 0 ? [0] : []) : idx(box.z, step);
  const items = [];
  for (const i of idx(box.x, step)) {
    for (const j of idx(box.y, step)) {
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

// ------------------------------------------------------------- 4D fields
// Arrows on the 3D slice w' = w0 of the rotated space. The field is evaluated at the
// matching 4D world point, then rotated into view coordinates; the arrow shows the
// (x', y', z') part, and colour can say how much of the field points along w'.
export function sampleField4D(res, box, vf, M, w0) {
  const idx = (r, step) => {
    const lo = Math.ceil(r[0] / step - 1e-9);
    const hi = Math.floor(r[1] / step + 1e-9);
    const out = [];
    for (let i = lo; i <= hi; i++) out.push(i);
    return out;
  };
  const count = (s) => idx(box.x, s).length * idx(box.y, s).length * idx(box.z, s).length;
  let k = 1;
  while (count(vf.step * k) > MAX_ARROWS_3D) k++;
  const step = vf.step * k;
  const items = [];
  for (const i of idx(box.x, step)) {
    for (const j of idx(box.y, step)) {
      for (const l of idx(box.z, step)) {
        const x = i * step;
        const y = j * step;
        const z = l * step;
        const p = mulTV(M, [x, y, z, w0]);
        const F = [res.fx(...p), res.fy(...p), res.fz(...p), res.fw(...p)];
        if (!F.every(Number.isFinite)) continue;
        const v = mulMV(M, F);
        const m = Math.hypot(v[0], v[1], v[2]);
        if (m < 1e-12 * (Math.hypot(...F) || 1) || m === 0) continue;
        items.push({ x, y, z, dx: v[0] / m, dy: v[1] / m, dz: v[2] / m, m, w: v[3], full: Math.hypot(...v) });
      }
    }
  }
  const ref = referenceMagnitude(items.map((a) => a.m));
  const wref = referenceMagnitude(items.map((a) => Math.abs(a.w))) || 1;
  for (const a of items) {
    const t = Math.min(1, a.m / ref);
    a.len = vf.len === "unit" ? 0.7 * step : Math.max(0.12 * step, t * 0.9 * step);
    a.t = vf.by === "w" ? 0.5 + 0.5 * Math.max(-1, Math.min(1, a.w / wref)) : t;
  }
  return { items, step, coarsened: k > 1 };
}
