import { View, niceStep, formatTick } from "./viewport.js";
import {
  explicitPaths,
  parametricPaths,
  polarPaths,
  implicitSegments,
  inequalityRects,
  nearestOnPaths,
  nearestOnSegments,
} from "./geometry.js";
import { explicitPOIs, intersections } from "./poi.js";
import { drawArrows, drawStreamlines } from "./field2d.js";
import { vfOptions } from "./colormap.js";

const css = (el, name, fallback) => getComputedStyle(el).getPropertyValue(name).trim() || fallback;

const fmt = (v) => {
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) < 1e-12) return "0";
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(3);
  return String(Number(v.toPrecision(5)));
};

export class GraphCanvas {
  constructor(canvas, { view, onViewChange } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.base = document.createElement("canvas");
    this.baseCtx = this.base.getContext("2d");
    this.view = new View(view);
    this.onViewChange = onViewChange || (() => {});
    this.items = [];
    this.settings = { grid: true, axes: true, labels: true, vf: null };
    this.notes = [];
    this.hover = null;
    this.selectedId = null;
    this.pois = [];
    this.interacting = false;
    this.dpr = 1;
    this._raf = 0;
    this._baseDirty = true;
    this._pointers = new Map();
    this._bindEvents();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement || canvas);
    this.resize();
  }

  setItems(items) {
    this.items = items;
    if (this.selectedId && !items.some((i) => i.row.id === this.selectedId)) this.selectedId = null;
    this.invalidate();
  }

  setSettings(s) {
    this.settings = { ...this.settings, ...s };
    this.invalidate();
  }

  setView(v) {
    this.view.cx = v.cx;
    this.view.cy = v.cy;
    this.view.scale = v.scale;
    this.invalidate();
  }

  resetView() {
    this.setView({ cx: 0, cy: 0, scale: 50 });
    this.onViewChange(this.view.toJSON());
  }

  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const w = Math.max(1, Math.floor(parent.clientWidth));
    const h = Math.max(1, Math.floor(parent.clientHeight));
    this.dpr = window.devicePixelRatio || 1;
    for (const c of [this.canvas, this.base]) {
      c.width = Math.floor(w * this.dpr);
      c.height = Math.floor(h * this.dpr);
    }
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.view.setSize(w, h);
    this.invalidate();
  }

  invalidate() {
    this._baseDirty = true;
    this.schedule();
  }

  schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      if (this._baseDirty) this._drawBase();
      this._paint();
    });
  }

  // ---------------------------------------------------------------- events
  _bindEvents() {
    const c = this.canvas;
    c.style.touchAction = "none";
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      this._pointers.set(e.pointerId, { x, y, sx: x, sy: y, moved: false });
      this.interacting = true;
    });

    c.addEventListener("pointermove", (e) => {
      const [x, y] = pos(e);
      const p = this._pointers.get(e.pointerId);
      if (!p) {
        this._updateHover(x, y);
        return;
      }
      const dx = x - p.x;
      const dy = y - p.y;
      if (Math.hypot(x - p.sx, y - p.sy) > 4) p.moved = true;
      if (this._pointers.size === 1) {
        if (p.moved) {
          this.view.panBy(dx, dy);
          this.hover = null;
          this.invalidate();
        }
      } else if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = x;
        p.y = y;
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        if (before > 0) this.view.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, after / before);
        this.invalidate();
        return;
      }
      p.x = x;
      p.y = y;
    });

    const end = (e) => {
      const p = this._pointers.get(e.pointerId);
      this._pointers.delete(e.pointerId);
      if (!this._pointers.size) {
        this.interacting = false;
        if (p && !p.moved) this._click(p.x, p.y);
        else this.onViewChange(this.view.toJSON());
        this.invalidate();
      }
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", () => {
      if (!this._pointers.size && this.hover) {
        this.hover = null;
        this.schedule();
      }
    });

    let wheelTimer = 0;
    c.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const [x, y] = pos(e);
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        this.view.zoomAt(x, y, Math.exp(-dy * 0.0015));
        this.interacting = true;
        this.hover = null;
        this.invalidate();
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => {
          this.interacting = false;
          this.onViewChange(this.view.toJSON());
          this.invalidate();
        }, 150);
      },
      { passive: false }
    );

    c.addEventListener("dblclick", (e) => {
      const [x, y] = pos(e);
      this.view.zoomAt(x, y, 1.6);
      this.onViewChange(this.view.toJSON());
      this.invalidate();
    });
  }

  _nearest(px, py, maxDist = 12) {
    let best = null;
    for (const item of this.items) {
      const cache = item.cache;
      if (!cache) continue;
      let hit = null;
      if (cache.paths) hit = nearestOnPaths(cache.paths, px, py);
      else if (cache.segs) hit = nearestOnSegments(cache.segs, px, py);
      else if (cache.pts) {
        for (const p of cache.pts) {
          const d = Math.hypot(px - p.px, py - p.py);
          if (!hit || d < hit.dist) hit = { x: p.px, y: p.py, dist: d, wx: p.x, wy: p.y, label: p.label };
        }
      }
      if (hit && hit.dist <= maxDist && (!best || hit.dist < best.hit.dist)) best = { item, hit };
    }
    return best;
  }

  _updateHover(px, py) {
    const best = this._nearest(px, py);
    const next = best
      ? {
          id: best.item.row.id,
          color: best.item.row.color,
          px: best.hit.x,
          py: best.hit.y,
          x: best.hit.wx ?? this.view.wx(best.hit.x),
          y: best.hit.wy ?? this.view.wy(best.hit.y),
          label: best.hit.label,
        }
      : null;
    const changed = (next?.px !== this.hover?.px || next?.py !== this.hover?.py) && (next || this.hover);
    this.hover = next;
    this.canvas.style.cursor = next ? "pointer" : "grab";
    if (changed) this.schedule();
  }

  _click(px, py) {
    const best = this._nearest(px, py);
    this.selectedId = best ? best.item.row.id : null;
    this.hover = null;
    this._baseDirty = true;
  }

  // ---------------------------------------------------------------- drawing
  _drawBase() {
    this._baseDirty = false;
    const ctx = this.baseCtx;
    const v = this.view;
    const el = this.canvas;
    const colors = {
      bg: css(el, "--graph-bg", "#ffffff"),
      grid: css(el, "--graph-grid", "#e5e7eb"),
      minor: css(el, "--graph-grid-minor", "#f1f5f9"),
      axis: css(el, "--graph-axis", "#334155"),
      text: css(el, "--graph-text", "#475569"),
    };
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, v.w, v.h);

    this._drawGrid(ctx, colors);

    const quality = this.interacting ? 2 : 1;

    // 1) shaded regions
    for (const item of this.items) {
      item.cache = null;
      const { row, result } = item;
      if (!row.visible || result.status !== "ok") continue;
      if (result.kind === "inequality") {
        ctx.fillStyle = withAlpha(row.color, 0.2);
        for (const [x, y, w, h] of inequalityRects(result.fn, result.strict, v, 4 * quality)) ctx.fillRect(x, y, w, h);
      }
    }

    // 2) curves and boundaries
    this.notes = [];
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const item of this.items) {
      const { row, result } = item;
      if (!row.visible || result.status !== "ok") continue;
      ctx.strokeStyle = row.color;
      ctx.lineWidth = this.selectedId === row.id ? 3.4 : 2.4;
      ctx.setLineDash([]);
      let paths = null;
      switch (result.kind) {
        case "explicit":
          paths = explicitPaths(result.fn, v, result.axis);
          break;
        case "parametric":
          paths = parametricPaths(result.fx, result.fy, v, result.range, this.interacting ? 1200 : 3000);
          break;
        case "polar":
          paths = polarPaths(result.fn, v, result.range, this.interacting ? 2500 : 6000, result.unit);
          break;
        case "implicit":
        case "inequality": {
          const segs = implicitSegments(result.fn, v, 4 * quality);
          if (result.kind === "inequality") {
            ctx.lineWidth = 1.8;
            if (result.strict) ctx.setLineDash([7, 6]);
          }
          ctx.beginPath();
          for (let i = 0; i < segs.length; i += 4) {
            ctx.moveTo(segs[i], segs[i + 1]);
            ctx.lineTo(segs[i + 2], segs[i + 3]);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          item.cache = { segs };
          break;
        }
        case "point":
        case "points": {
          const list = result.kind === "point" ? [result] : result.items;
          const pts = [];
          for (const p of list) {
            const x = p.fx();
            const y = p.fy();
            if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y, px: v.sx(x), py: v.sy(y) });
          }
          ctx.fillStyle = row.color;
          ctx.strokeStyle = colors.bg;
          ctx.lineWidth = 2;
          for (const p of pts) {
            ctx.beginPath();
            ctx.arc(p.px, p.py, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          item.cache = { pts };
          break;
        }
        case "field": {
          const vf = vfOptions(this.settings.vf, row.vf);
          const hoverPts = [];
          if (vf.style === "stream" || vf.style === "both") drawStreamlines(ctx, result, row.color, v, vf);
          if (vf.style !== "stream") {
            const out = drawArrows(ctx, result, row.color, v, vf);
            hoverPts.push(...out.pts);
            if (out.note) this.notes.push(out.note);
          }
          item.cache = { pts: hoverPts };
          break;
        }
        default:
          break;
      }
      if (paths) {
        ctx.beginPath();
        for (const path of paths) {
          ctx.moveTo(path[0], path[1]);
          for (let i = 2; i < path.length; i += 2) ctx.lineTo(path[i], path[i + 1]);
        }
        ctx.stroke();
        item.cache = { paths };
      }
    }

    // 3) points of interest for the selected curve
    this.pois = [];
    const sel = this.items.find((i) => i.row.id === this.selectedId);
    if (sel && sel.result.status === "ok" && sel.result.kind === "explicit" && sel.result.axis === "y" && !this.interacting) {
      try {
        this.pois = explicitPOIs(sel.result.fn, v);
        for (const other of this.items) {
          if (other === sel || !other.row.visible) continue;
          if (other.result.status === "ok" && other.result.kind === "explicit" && other.result.axis === "y") {
            this.pois.push(...intersections(sel.result.fn, other.result.fn, v));
          }
        }
      } catch {
        this.pois = [];
      }
    }
  }

  _drawGrid(ctx, c) {
    const v = this.view;
    const { grid, axes, labels } = this.settings;
    const step = niceStep(90 / v.scale);
    const minor = step / 5;
    ctx.font = "11px 'Space Grotesk', system-ui, sans-serif";
    ctx.textBaseline = "top";

    if (grid) {
      if (minor * v.scale >= 9) {
        ctx.strokeStyle = c.minor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = Math.ceil(v.xmin / minor) * minor; x <= v.xmax; x += minor) {
          const px = Math.round(v.sx(x)) + 0.5;
          ctx.moveTo(px, 0);
          ctx.lineTo(px, v.h);
        }
        for (let y = Math.ceil(v.ymin / minor) * minor; y <= v.ymax; y += minor) {
          const py = Math.round(v.sy(y)) + 0.5;
          ctx.moveTo(0, py);
          ctx.lineTo(v.w, py);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = c.grid;
      ctx.beginPath();
      for (let x = Math.ceil(v.xmin / step) * step; x <= v.xmax; x += step) {
        const px = Math.round(v.sx(x)) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, v.h);
      }
      for (let y = Math.ceil(v.ymin / step) * step; y <= v.ymax; y += step) {
        const py = Math.round(v.sy(y)) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(v.w, py);
      }
      ctx.stroke();
    }

    const ax = Math.min(Math.max(v.sx(0), 0), v.w);
    const ay = Math.min(Math.max(v.sy(0), 0), v.h);
    if (axes) {
      ctx.strokeStyle = c.axis;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(ay) + 0.5);
      ctx.lineTo(v.w, Math.round(ay) + 0.5);
      ctx.moveTo(Math.round(ax) + 0.5, 0);
      ctx.lineTo(Math.round(ax) + 0.5, v.h);
      ctx.stroke();
    }

    if (labels) {
      ctx.fillStyle = c.text;
      ctx.textAlign = "center";
      const labelY = Math.min(Math.max(ay + 5, 4), v.h - 16);
      for (let x = Math.ceil(v.xmin / step) * step; x <= v.xmax; x += step) {
        if (Math.abs(x) < step * 1e-9) continue;
        ctx.fillText(formatTick(x, step), v.sx(x), labelY);
      }
      const onRight = ax > v.w - 44;
      ctx.textAlign = onRight ? "left" : "right";
      const labelX = onRight ? ax + 6 : Math.max(ax - 6, 38);
      ctx.textBaseline = "middle";
      for (let y = Math.ceil(v.ymin / step) * step; y <= v.ymax; y += step) {
        if (Math.abs(y) < step * 1e-9) continue;
        ctx.fillText(formatTick(y, step), labelX, v.sy(y));
      }
      ctx.textBaseline = "top";
      ctx.textAlign = "right";
      if (ax >= 0 && ax <= v.w && ay >= 0 && ay <= v.h) ctx.fillText("0", ax - 5, ay + 5);
    }
  }

  _paint() {
    const ctx = this.ctx;
    const v = this.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const el = this.canvas;
    const bg = css(el, "--graph-bg", "#ffffff");
    const text = css(el, "--graph-text", "#0f172a");

    if (this.notes.length) {
      ctx.font = "12px 'Space Grotesk', system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = text;
      ctx.globalAlpha = 0.75;
      this.notes.forEach((n, i) => ctx.fillText(`Field ${n}`, 14, v.h - 14 - i * 16));
      ctx.globalAlpha = 1;
    }

    const selected = this.items.find((i) => i.row.id === this.selectedId);
    this._labelRects = [];
    for (const p of this.pois) {
      const px = v.sx(p.x);
      const py = v.sy(p.y);
      if (px < -20 || px > v.w + 20 || py < -20 || py > v.h + 20) continue;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = p.kind === "intersection" ? "#7c3aed" : selected?.row.color || "#2563eb";
      ctx.fill();
      ctx.strokeStyle = bg;
      ctx.lineWidth = 2;
      ctx.stroke();
      this._label(ctx, `(${fmt(p.x)}, ${fmt(p.y)})`, px, py, bg, text, true);
    }

    if (this.hover) {
      const h = this.hover;
      ctx.beginPath();
      ctx.arc(h.px, h.py, 6, 0, Math.PI * 2);
      ctx.fillStyle = h.color;
      ctx.fill();
      ctx.strokeStyle = bg;
      ctx.lineWidth = 2;
      ctx.stroke();
      this._label(ctx, h.label ? `(${fmt(h.x)}, ${fmt(h.y)})  ${h.label}` : `(${fmt(h.x)}, ${fmt(h.y)})`, h.px, h.py, bg, text);
    }
  }

  // avoidOverlap: skip the label when it would sit on top of an earlier one
  _label(ctx, text, px, py, bg, fg, avoidOverlap = false) {
    ctx.font = "12px 'Space Grotesk', system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(text).width + 12;
    let x = px + 10;
    let y = py - 16;
    if (x + w > this.view.w - 4) x = px - 10 - w;
    if (y < 14) y = py + 18;
    if (avoidOverlap) {
      const clash = this._labelRects.some((r) => x < r[0] + r[2] && x + w > r[0] && y - 11 < r[1] + r[3] && y + 11 > r[1]);
      if (clash) return;
      this._labelRects.push([x, y - 11, w, 22]);
    }
    ctx.fillStyle = bg;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.roundRect(x, y - 11, w, 22, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(100,116,139,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.fillText(text, x + 6, y);
  }

  toBlob() {
    return new Promise((resolve) => {
      if (this._baseDirty) this._drawBase();
      this._paint();
      this.canvas.toBlob(resolve, "image/png");
    });
  }
}

function withAlpha(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
