// 2D vector fields: arrows on a regular grid ("every 0.5", "every 1", ...) and
// evenly spaced streamlines.
import { rampCSS, referenceMagnitude } from "./colormap.js";

const MIN_PX = 15; // never let arrows get closer than this on screen
const MAX_ARROWS = 7000;

// Grid aligned to multiples of the *requested* step, coarsened by an integer
// factor only when it would be unreadably dense.
export function fieldGrid(view, step) {
  let k = 1;
  if (step * view.scale < MIN_PX) k = Math.ceil(MIN_PX / (step * view.scale));
  const nx = (view.xmax - view.xmin) / step;
  const ny = (view.ymax - view.ymin) / step;
  while ((nx / k + 1) * (ny / k + 1) > MAX_ARROWS) k++;
  const eff = step * k;
  const pts = [];
  const i0 = Math.floor(view.xmin / eff) - 1;
  const i1 = Math.ceil(view.xmax / eff) + 1;
  const j0 = Math.floor(view.ymin / eff) - 1;
  const j1 = Math.ceil(view.ymax / eff) + 1;
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) pts.push([Math.round(i * 1e9) / 1e9 * eff, Math.round(j * 1e9) / 1e9 * eff]);
  return { pts, step: eff, coarsened: k > 1 };
}

const fmtNum = (v) => (Math.abs(v) < 1e-12 ? "0" : String(Number(v.toPrecision(4))));

// Returns { pts (hover targets), note }
export function drawArrows(ctx, res, color, view, vf) {
  const { pts, step, coarsened } = fieldGrid(view, vf.step);
  const samples = [];
  const mags = [];
  for (const [x, y] of pts) {
    const P = res.fx(x, y);
    const Q = res.fy(x, y);
    if (!Number.isFinite(P) || !Number.isFinite(Q)) continue;
    const m = Math.hypot(P, Q);
    if (m === 0) continue;
    samples.push({ x, y, P, Q, m });
    mags.push(m);
  }
  const ref = vf.len === "unit" ? 1 : referenceMagnitude(mags);
  const stepPx = step * view.scale;
  const BINS = 28;
  const bins = Array.from({ length: BINS }, () => []);
  const hover = [];
  for (const s of samples) {
    const t = Math.min(1, s.m / (vf.len === "unit" ? referenceMagnitude(mags) : ref));
    const len = vf.len === "unit" ? 0.7 * stepPx : Math.max(3, Math.min(1, s.m / ref) * 0.88 * stepPx);
    const ux = s.P / s.m;
    const uy = -s.Q / s.m;
    const px = view.sx(s.x);
    const py = view.sy(s.y);
    bins[vf.mag ? Math.min(BINS - 1, Math.floor(t * BINS)) : 0].push(px - (ux * len) / 2, py - (uy * len) / 2, px + (ux * len) / 2, py + (uy * len) / 2, len);
    hover.push({ x: s.x, y: s.y, px, py, label: `⟨${fmtNum(s.P)}, ${fmtNum(s.Q)}⟩` });
  }
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 1.6;
  bins.forEach((b, bi) => {
    if (!b.length) return;
    const c = vf.mag ? rampCSS((bi + 0.5) / BINS) : color;
    ctx.strokeStyle = c;
    ctx.fillStyle = c;
    ctx.beginPath();
    const heads = new Path2D();
    for (let i = 0; i < b.length; i += 5) {
      const [x0, y0, x1, y1, len] = [b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4]];
      const hs = Math.min(Math.max(len * 0.38, 4), 9);
      const dx = (x1 - x0) / len;
      const dy = (y1 - y0) / len;
      const bx = x1 - dx * hs;
      const by = y1 - dy * hs;
      if (len > hs) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(bx, by);
      }
      heads.moveTo(x1, y1);
      heads.lineTo(bx - dy * hs * 0.42, by + dx * hs * 0.42);
      heads.lineTo(bx + dy * hs * 0.42, by - dx * hs * 0.42);
      heads.closePath();
    }
    ctx.stroke();
    ctx.fill(heads);
  });
  ctx.restore();
  return { pts: hover, note: coarsened ? `spacing ${fmtNum(step)} (zoom in for ${fmtNum(vf.step)})` : null };
}

// ------------------------------------------------------------ streamlines
export function drawStreamlines(ctx, res, color, view, vf) {
  const { pts, step } = fieldGrid(view, vf.step);
  const cell = Math.max(7, Math.min(36, step * view.scale * 0.55));
  const cols = Math.ceil(view.w / cell) + 1;
  const rows = Math.ceil(view.h / cell) + 1;
  const occ = new Int32Array(cols * rows);
  const cellOf = (px, py) => {
    if (px < 0 || py < 0 || px >= view.w || py >= view.h) return -1;
    return Math.floor(py / cell) * cols + Math.floor(px / cell);
  };

  const field = (x, y) => {
    const P = res.fx(x, y);
    const Q = res.fy(x, y);
    const m = Math.hypot(P, Q);
    return Number.isFinite(m) && m > 0 ? [P / m, Q / m, m] : null;
  };
  const h = 2.6 / view.scale; // world length of one integration step (~2.6 px)
  const rk4 = (x, y, dir) => {
    const a = field(x, y);
    if (!a) return null;
    const b = field(x + (dir * h * a[0]) / 2, y + (dir * h * a[1]) / 2);
    if (!b) return null;
    const c = field(x + (dir * h * b[0]) / 2, y + (dir * h * b[1]) / 2);
    if (!c) return null;
    const d = field(x + dir * h * c[0], y + dir * h * c[1]);
    if (!d) return null;
    return [
      x + (dir * h * (a[0] + 2 * b[0] + 2 * c[0] + d[0])) / 6,
      y + (dir * h * (a[1] + 2 * b[1] + 2 * c[1] + d[1])) / 6,
      a[2],
    ];
  };

  // seeds nearest the middle of the screen first
  const cx = (view.xmin + view.xmax) / 2;
  const cy = (view.ymin + view.ymax) / 2;
  const seeds = pts.filter(([x, y]) => x >= view.xmin && x <= view.xmax && y >= view.ymin && y <= view.ymax);
  seeds.sort((p, q) => Math.hypot(p[0] - cx, p[1] - cy) - Math.hypot(q[0] - cx, q[1] - cy));

  const lines = [];
  let id = 0;
  const trace = (x, y, dir, myId, out) => {
    for (let n = 0; n < 700; n++) {
      const nx = rk4(x, y, dir);
      if (!nx) return;
      x = nx[0];
      y = nx[1];
      const px = view.sx(x);
      const py = view.sy(y);
      const c = cellOf(px, py);
      if (c < 0) return;
      if (occ[c] !== 0 && occ[c] !== myId) return;
      occ[c] = myId;
      out.push(px, py, nx[2]);
    }
  };
  for (const [sx, sy] of seeds) {
    const f = field(sx, sy);
    if (!f) continue;
    const px = view.sx(sx);
    const py = view.sy(sy);
    const c = cellOf(px, py);
    if (c < 0 || occ[c] !== 0) continue;
    id++;
    occ[c] = id;
    const back = [];
    const fwd = [];
    trace(sx, sy, -1, id, back);
    trace(sx, sy, 1, id, fwd);
    const line = [];
    for (let i = back.length - 3; i >= 0; i -= 3) line.push(back[i], back[i + 1], back[i + 2]);
    line.push(px, py, f[2]);
    line.push(...fwd);
    if (line.length >= 3 * 6) lines.push(line);
  }

  const mags = lines.flatMap((l) => l.filter((_, i) => i % 3 === 2));
  const ref = referenceMagnitude(mags);
  const BINS = 28;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.7;
  const bins = Array.from({ length: BINS }, () => new Path2D());
  const headBins = Array.from({ length: BINS }, () => new Path2D());
  const used = new Set();
  const binOf = (m) => (vf.mag ? Math.min(BINS - 1, Math.floor(Math.min(1, m / ref) * BINS)) : 0);
  for (const l of lines) {
    let since = 40;
    for (let i = 3; i < l.length; i += 3) {
      const b = binOf(l[i + 2]);
      used.add(b);
      bins[b].moveTo(l[i - 3], l[i - 2]);
      bins[b].lineTo(l[i], l[i + 1]);
      since += 2.6;
      if (since >= 90) {
        since = 0;
        const dx = l[i] - l[i - 3];
        const dy = l[i + 1] - l[i - 2];
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        const x = l[i];
        const y = l[i + 1];
        const hs = 7;
        headBins[b].moveTo(x + ux * hs * 0.6, y + uy * hs * 0.6);
        headBins[b].lineTo(x - ux * hs * 0.5 - uy * hs * 0.4, y - uy * hs * 0.5 + ux * hs * 0.4);
        headBins[b].lineTo(x - ux * hs * 0.5 + uy * hs * 0.4, y - uy * hs * 0.5 - ux * hs * 0.4);
        headBins[b].closePath();
      }
    }
  }
  for (const b of used) {
    const c = vf.mag ? rampCSS((b + 0.5) / BINS) : color;
    ctx.strokeStyle = c;
    ctx.fillStyle = c;
    ctx.stroke(bins[b]);
    ctx.fill(headBins[b]);
  }
  ctx.restore();
  return { pts: [], note: null };
}
