// Pure geometry generators. Everything is computed in screen pixels so the
// renderer only has to stroke what these return.

const MAX_DEPTH = 10;
const MAXD_EDGE = 8;
const CLAMP = 1e6;
const clamp = (v) => (v > CLAMP ? CLAMP : v < -CLAMP ? -CLAMP : v);

// Adaptive polyline tracer.
//   point(t) -> [px, py] | null  (null = undefined at t)
//   returns array of paths, each a flat [x0,y0,x1,y1,...] array
export function tracePaths(point, t0, t1, n, { jump = 40, refine = 3 } = {}) {
  const paths = [];
  let cur = null;

  const emit = (p) => {
    if (!cur) {
      cur = [];
      paths.push(cur);
    }
    cur.push(clamp(p[0]), clamp(p[1]));
  };
  const cut = () => {
    cur = null;
  };
  const finite = (p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

  const seg = (ta, pa, tb, pb, depth) => {
    const fa = finite(pa);
    const fb = finite(pb);
    if (!fa && !fb) {
      cut();
      return;
    }
    if (fa !== fb) {
      if (depth >= MAXD_EDGE) {
        // domain edge: extend to the finite end only
        if (fa) emit(pa);
        else {
          cut();
          emit(pb);
        }
        if (fa) cut();
        return;
      }
    } else {
      const d = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      if (d <= refine) {
        emit(pa);
        emit(pb);
        return;
      }
      if (depth >= MAX_DEPTH) {
        if (d > jump) {
          emit(pa);
          cut();
          emit(pb);
        } else {
          emit(pa);
          emit(pb);
        }
        return;
      }
    }
    const tm = (ta + tb) / 2;
    const pm = point(tm);
    seg(ta, pa, tm, pm, depth + 1);
    seg(tm, pm, tb, pb, depth + 1);
  };
  let tPrev = t0;
  let pPrev = point(t0);
  for (let i = 1; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const p = point(t);
    seg(tPrev, pPrev, t, p, 0);
    tPrev = t;
    pPrev = p;
  }
  // de-duplicate consecutive identical points (cheap pass)
  return paths
    .map((flat) => {
      const out = [flat[0], flat[1]];
      for (let i = 2; i < flat.length; i += 2) {
        if (flat[i] !== out[out.length - 2] || flat[i + 1] !== out[out.length - 1]) out.push(flat[i], flat[i + 1]);
      }
      return out;
    })
    .filter((p) => p.length >= 4);
}

export function explicitPaths(fn, view, axis) {
  if (axis === "x") {
    return tracePaths(
      (y) => {
        const x = fn(y);
        return [view.sx(x), view.sy(y)];
      },
      view.ymax,
      view.ymin,
      Math.ceil(view.h)
    );
  }
  return tracePaths(
    (x) => {
      const y = fn(x);
      return [view.sx(x), view.sy(y)];
    },
    view.xmin,
    view.xmax,
    Math.ceil(view.w)
  );
}

export function parametricPaths(fx, fy, view, [t0, t1], samples = 3000) {
  return tracePaths((t) => [view.sx(fx(t)), view.sy(fy(t))], t0, t1, samples, { jump: 120 });
}

// `unit` converts the parameter to radians (pi/180 when θ is in degrees)
export function polarPaths(fr, view, [t0, t1], samples = 6000, unit = 1) {
  return tracePaths(
    (t) => {
      const r = fr(t);
      return [view.sx(r * Math.cos(t * unit)), view.sy(r * Math.sin(t * unit))];
    },
    t0,
    t1,
    samples,
    { jump: 120 }
  );
}

// Marching squares. F(x, y) in world units. Returns flat [x1,y1,x2,y2,...] in px.
export function implicitSegments(F, view, cell = 4) {
  const cols = Math.ceil(view.w / cell) + 1;
  const rows = Math.ceil(view.h / cell) + 1;
  const stride = cols + 1;
  const vals = new Float64Array(stride * (rows + 1));
  const xs = new Float64Array(cols + 1);
  const ys = new Float64Array(rows + 1);
  for (let i = 0; i <= cols; i++) xs[i] = view.wx(i * cell);
  for (let j = 0; j <= rows; j++) ys[j] = view.wy(j * cell);
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) vals[j * stride + i] = F(xs[i], ys[j]);
  }

  const out = [];
  const pos = (v) => v >= 0;

  // corner order: 0 TL, 1 TR, 2 BR, 3 BL; edge order: 0 top, 1 right, 2 bottom, 3 left
  const cornerOf = [
    [0, 1],
    [1, 2],
    [3, 2],
    [0, 3],
  ];

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v = [vals[j * stride + i], vals[j * stride + i + 1], vals[(j + 1) * stride + i + 1], vals[(j + 1) * stride + i]];
      if (!Number.isFinite(v[0]) || !Number.isFinite(v[1]) || !Number.isFinite(v[2]) || !Number.isFinite(v[3])) continue;
      const s = v.map(pos);
      if (s[0] === s[1] && s[1] === s[2] && s[2] === s[3]) continue;
      const cx = [i, i + 1, i + 1, i];
      const cy = [j, j, j + 1, j + 1];

      const crossings = [];
      let bad = false;
      for (let e = 0; e < 4; e++) {
        const [a, b] = cornerOf[e];
        if (s[a] === s[b]) {
          crossings.push(null);
          continue;
        }
        const va = v[a];
        const vb = v[b];
        const t = va / (va - vb);
        const wx = xs[cx[a]] + (xs[cx[b]] - xs[cx[a]]) * t;
        const wy = ys[cy[a]] + (ys[cy[b]] - ys[cy[a]]) * t;
        // reject sign flips caused by poles (|F| grows instead of vanishing)
        const fm = F(wx, wy);
        if (!(Math.abs(fm) <= Math.max(Math.abs(va), Math.abs(vb)))) {
          bad = true;
          break;
        }
        crossings.push([(cx[a] + (cx[b] - cx[a]) * t) * cell, (cy[a] + (cy[b] - cy[a]) * t) * cell]);
      }
      if (bad) continue;
      const idx = crossings.map((c, e) => (c ? e : -1)).filter((e) => e >= 0);
      const link = (e1, e2) => out.push(crossings[e1][0], crossings[e1][1], crossings[e2][0], crossings[e2][1]);
      if (idx.length === 2) link(idx[0], idx[1]);
      else if (idx.length === 4) {
        const center = (v[0] + v[1] + v[2] + v[3]) / 4;
        if (pos(center) === s[0]) {
          link(0, 1);
          link(2, 3);
        } else {
          link(0, 3);
          link(1, 2);
        }
      }
    }
  }
  return out;
}

// Row runs for shading inequalities. Returns [x, y, w, h] rects in px.
export function inequalityRects(F, strict, view, block = 4) {
  const rects = [];
  const cols = Math.ceil(view.w / block);
  const rows = Math.ceil(view.h / block);
  for (let j = 0; j < rows; j++) {
    const y = view.wy((j + 0.5) * block);
    let start = -1;
    for (let i = 0; i <= cols; i++) {
      let inside = false;
      if (i < cols) {
        const v = F(view.wx((i + 0.5) * block), y);
        inside = strict ? v < 0 : v <= 0;
      }
      if (inside && start < 0) start = i;
      if (!inside && start >= 0) {
        rects.push([start * block, j * block, (i - start) * block, block]);
        start = -1;
      }
    }
  }
  return rects;
}

// Nearest point on a set of polylines (flat arrays) to (px, py).
export function nearestOnPaths(paths, px, py) {
  let best = null;
  let bestD = Infinity;
  for (const path of paths) {
    for (let i = 0; i + 3 < path.length; i += 2) {
      const x1 = path[i];
      const y1 = path[i + 1];
      const x2 = path[i + 2];
      const y2 = path[i + 3];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
      const qx = x1 + t * dx;
      const qy = y1 + t * dy;
      const d = (px - qx) ** 2 + (py - qy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = [qx, qy];
      }
    }
  }
  return best ? { x: best[0], y: best[1], dist: Math.sqrt(bestD) } : null;
}

// For implicit segments: flat [x1,y1,x2,y2,...] (4 numbers per segment).
export function nearestOnSegments(segs, px, py) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < segs.length; i += 4) {
    const x1 = segs[i];
    const y1 = segs[i + 1];
    const dx = segs[i + 2] - x1;
    const dy = segs[i + 3] - y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    const qx = x1 + t * dx;
    const qy = y1 + t * dy;
    const d = (px - qx) ** 2 + (py - qy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = [qx, qy];
    }
  }
  return best ? { x: best[0], y: best[1], dist: Math.sqrt(bestD) } : null;
}
