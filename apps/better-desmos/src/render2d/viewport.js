export class View {
  constructor({ cx = 0, cy = 0, scale = 50 } = {}) {
    this.cx = cx;
    this.cy = cy;
    this.scale = scale; // pixels per unit
    this.w = 800;
    this.h = 600;
  }
  setSize(w, h) {
    this.w = w;
    this.h = h;
  }
  sx(x) { return this.w / 2 + (x - this.cx) * this.scale; }
  sy(y) { return this.h / 2 - (y - this.cy) * this.scale; }
  wx(px) { return this.cx + (px - this.w / 2) / this.scale; }
  wy(py) { return this.cy - (py - this.h / 2) / this.scale; }
  get xmin() { return this.wx(0); }
  get xmax() { return this.wx(this.w); }
  get ymin() { return this.wy(this.h); }
  get ymax() { return this.wy(0); }
  panBy(dxPx, dyPx) {
    this.cx -= dxPx / this.scale;
    this.cy += dyPx / this.scale;
  }
  zoomAt(px, py, factor) {
    const wx = this.wx(px);
    const wy = this.wy(py);
    this.scale = Math.min(1e9, Math.max(1e-7, this.scale * factor));
    this.cx = wx - (px - this.w / 2) / this.scale;
    this.cy = wy + (py - this.h / 2) / this.scale;
  }
  toJSON() {
    return { cx: this.cx, cy: this.cy, scale: this.scale };
  }
}

// 1-2-5 step >= raw
export function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return nice * p;
}

export function formatTick(v, step) {
  if (Math.abs(v) < step * 1e-9) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e6 || abs < 1e-4) {
    return v.toExponential(Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)) + 0))).replace(/\.?0+e/, "e").replace("e+", "e");
  }
  const decimals = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
  return v.toFixed(Math.min(decimals, 10));
}
