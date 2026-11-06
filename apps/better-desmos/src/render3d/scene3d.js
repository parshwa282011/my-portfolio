import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  heightfield,
  parametricSurface,
  parametricSurface4,
  marchingTets,
  sampleCurve,
  sampleCurve4,
  tube,
  sampleField3D,
  sampleField4D,
  cubeBox,
  boxSize,
} from "./geometry3d.js";
import { rotation4, isIdentity4, sliceFunction, projector, mulTV } from "./rot4.js";
import { rampHex, vfOptions } from "../render2d/colormap.js";
import { niceStep } from "../render2d/viewport.js";

const css = (el, name, fallback) => getComputedStyle(el).getPropertyValue(name).trim() || fallback;

const KINDS_3D = new Set(["surface", "implicit3", "psurface", "curve3", "point3", "points3", "field", "implicit4", "curve4", "point4", "points4", "psurface4"]);

const fmt = (v) => {
  if (Math.abs(v) < 1e-9) return "0";
  const a = Math.abs(v);
  return a >= 1e5 || a < 1e-3 ? v.toExponential(2) : String(Number(v.toPrecision(4)));
};

// 1-2-5 step that gives about ten ticks across the box
const tickStep = (span) => niceStep(span / 10);
const clamp0 = (r) => Math.min(Math.max(0, r[0]), r[1]); // where the axis crosses: the origin, or the nearest edge
const centre = (box) => [(box.x[0] + box.x[1]) / 2, (box.y[0] + box.y[1]) / 2, (box.z[0] + box.z[1]) / 2];

function labelSprite(text, color, size) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d");
  g.font = "600 38px 'Space Grotesk', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(text, 64, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(size * 2, size, 1);
  sp.renderOrder = 10;
  return sp;
}

let ARROW = null;
function arrowGeometry() {
  if (ARROW) return ARROW;
  // along +Y, centred on the origin, 1 unit long
  const shaft = new THREE.CylinderGeometry(0.035, 0.035, 0.68, 8);
  shaft.translate(0, -0.16, 0);
  const head = new THREE.ConeGeometry(0.11, 0.32, 12);
  head.translate(0, 0.34, 0);
  ARROW = mergeGeometries([shaft, head]);
  return ARROW;
}

export class Graph3D {
  constructor(container, { view, P, onViewChange, onNotes } = {}) {
    this.container = container;
    this.P = P || {};
    this.onViewChange = onViewChange || (() => {});
    this.onNotes = onNotes || (() => {});
    this.items = [];
    this.settings = { grid: true, axes: true, labels: true, box: { ...cubeBox(5), w: [-5, 5] }, opacity3: 1, vf: null, mode4: false, view4: { rot: [0, 0, 0], proj: "ortho" } };
    this.objs = new Map(); // rowId -> { sig, group }
    this.pickables = [];
    this._raf = 0;
    this._rebuild = true;
    this._frameSig = "";
    this._spin = 0;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "gl-canvas";
    container.prepend(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.localClippingEnabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.frame = new THREE.Group();
    this.scene.add(this.frame);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 1000);
    this.camera.up.set(0, 0, 1);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa7b8, 1.7));
    const headlight = new THREE.DirectionalLight(0xffffff, 2.1);
    headlight.position.set(0.4, 0.3, 1);
    this.camera.add(headlight);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener("change", () => this._requestRender());
    this.controls.addEventListener("end", () => this.onViewChange(this.getView()));

    this.raycaster = new THREE.Raycaster();
    this.tip = document.createElement("div");
    this.tip.className = "gl-tip";
    this.tip.hidden = true;
    container.append(this.tip);
    this.canvas.addEventListener("pointermove", (e) => this._hover(e));
    this.canvas.addEventListener("pointerleave", () => (this.tip.hidden = true));
    this.canvas.addEventListener("pointerdown", () => (this.tip.hidden = true));

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.resize();
    if (view) this.setView(view);
    else this.resetView();
  }

  // ------------------------------------------------------------ public API
  setItems(items) {
    this.items = items;
    this.invalidate();
  }

  setSettings(s) {
    const before = JSON.stringify(this.settings.box);
    this.settings = { ...this.settings, ...s };
    if (before !== JSON.stringify(this.settings.box)) this._applyRange();
    this.invalidate();
  }

  invalidate() {
    this._rebuild = true;
    this._requestRender();
  }

  _requestRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      if (this._rebuild) {
        this._rebuild = false;
        this._build();
      }
      this.renderer.render(this.scene, this.camera);
    });
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._requestRender();
  }

  _applyRange() {
    const S = boxSize(this.settings.box);
    this.camera.near = S * 0.005;
    this.camera.far = S * 50;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = S * 0.12;
    this.controls.maxDistance = S * 20;
  }

  resetView() {
    const S = boxSize(this.settings.box);
    const c = centre(this.settings.box);
    this._applyRange();
    this.camera.position.set(c[0] + S * 1.0, c[1] - S * 1.22, c[2] + S * 0.8);
    this.controls.target.set(...c);
    this.controls.update();
    this._requestRender();
    this.onViewChange(this.getView());
  }

  getView() {
    const p = this.camera.position;
    const t = this.controls.target;
    return { p: [p.x, p.y, p.z], t: [t.x, t.y, t.z] };
  }

  setView(v) {
    if (!v || !Array.isArray(v.p) || !Array.isArray(v.t)) return this.resetView();
    this._applyRange();
    this.camera.position.set(...v.p);
    this.controls.target.set(...v.t);
    this.controls.update();
    this._requestRender();
  }

  zoom(factor) {
    const dir = this.camera.position.clone().sub(this.controls.target);
    dir.multiplyScalar(1 / factor);
    this.camera.position.copy(this.controls.target).add(dir);
    this.controls.update();
    this._requestRender();
    this.onViewChange(this.getView());
  }

  setAutoRotate(on) {
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 2.2;
    cancelAnimationFrame(this._spin);
    if (!on) return;
    const tick = () => {
      if (!this.controls.autoRotate) return;
      this.controls.update();
      this._spin = requestAnimationFrame(tick);
    };
    tick();
  }

  toBlob() {
    return new Promise((resolve) => {
      if (this._rebuild) {
        this._rebuild = false;
        this._build();
      }
      this.renderer.render(this.scene, this.camera);
      this.canvas.toBlob(resolve, "image/png");
    });
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    this.controls.dispose();
    this._clearGroup(this.world);
    this._clearGroup(this.frame);
    this.renderer.dispose();
    this.canvas.remove();
    this.tip.remove();
  }

  // ------------------------------------------------------------ building
  _clearGroup(g) {
    for (const child of [...g.children]) {
      g.remove(child);
      child.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
        o.dispose?.();
      });
    }
  }

  _clipPlanes(box) {
    const { x, y, z } = box;
    return [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -x[0]),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), x[1]),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -y[0]),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), y[1]),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -z[0]),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), z[1]),
    ];
  }

  _build() {
    const box = this.settings.box;
    const theme = {
      bg: css(this.container, "--graph-bg", "#ffffff"),
      grid: css(this.container, "--graph-grid", "#d9e0ea"),
      axis: css(this.container, "--graph-axis", "#334155"),
      text: css(this.container, "--graph-text", "#475569"),
    };
    this.scene.background = new THREE.Color(theme.bg);

    const { grid, axes, labels } = this.settings;
    const frameSig = JSON.stringify([box, grid, axes, labels, theme]);
    if (frameSig !== this._frameSig) {
      this._frameSig = frameSig;
      this._buildFrame(box, theme);
    }

    const planes = this._clipPlanes(box);
    const notes = [];
    const four = this.settings.mode4;
    const v4 = this.settings.view4;
    const w0 = this.P.w ?? 0;
    const ctx4 = four
      ? { M: rotation4(v4.rot), w0, ident: isIdentity4(v4.rot), perspective: v4.proj === "persp", wRange: box.w }
      : null;
    if (four) {
      notes.push(`w = ${fmt(w0)}`);
      if (!ctx4.ident) notes.push(`rotated  xw ${fmt(v4.rot[0])}°  yw ${fmt(v4.rot[1])}°  zw ${fmt(v4.rot[2])}°`);
    }
    const seen = new Set();
    this.pickables = [];
    for (const item of this.items) {
      const { row, result } = item;
      seen.add(row.id);
      const visible = row.visible && result.status === "ok" && KINDS_3D.has(result.kind);
      let entry = this.objs.get(row.id);
      if (!visible) {
        if (entry) entry.group.visible = false;
        continue;
      }
      const vf = result.kind === "field" ? vfOptions(this.settings.vf, row.vf) : null;
      const sig = JSON.stringify([
        row.color,
        box,
        this.settings.opacity3,
        vf,
        row.tmin, row.tmax, row.umin, row.umax, row.vmin, row.vmax,
        (result.deps || []).map((n) => this.P[n]),
        four ? [v4, w0, box.w] : null,
      ]);
      if (!entry || entry.result !== result || entry.sig !== sig) {
        if (entry) {
          this.world.remove(entry.group);
          this._clearGroup(entry.group);
        }
        const group = new THREE.Group();
        const info = this._buildRow(group, row, result, box, planes, vf, ctx4);
        this.world.add(group);
        entry = { sig, result, group, info };
        this.objs.set(row.id, entry);
      }
      entry.group.visible = true;
      if (entry.info?.note) notes.push(entry.info.note);
      for (const m of entry.info?.pick || []) this.pickables.push(m);
    }
    for (const [id, entry] of [...this.objs]) {
      if (!seen.has(id)) {
        this.world.remove(entry.group);
        this._clearGroup(entry.group);
        this.objs.delete(id);
      }
    }
    this.onNotes(notes);
  }

  _buildFrame(box, theme) {
    this._clearGroup(this.frame);
    const { grid, axes, labels } = this.settings;
    const S = boxSize(box);
    const [x0, x1] = box.x;
    const [y0, y1] = box.y;
    const [z0, z1] = box.z;
    const stepX = tickStep(x1 - x0);
    const stepY = tickStep(y1 - y0);
    const stepZ = tickStep(z1 - z0);
    const ticks = (lo, hi, step) => {
      const out = [];
      for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + 1e-9; i++) out.push(Math.round(i * 1e9 * step) / 1e9);
      return out;
    };
    const gridColor = new THREE.Color(theme.grid);
    const [cx, cy, cz] = [clamp0(box.x), clamp0(box.y), clamp0(box.z)]; // where the axes cross
    if (grid) {
      const pts = [];
      for (const v of ticks(x0, x1, stepX)) pts.push(v, y0, cz, v, y1, cz);
      for (const v of ticks(y0, y1, stepY)) pts.push(x0, v, cz, x1, v, cz);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      this.frame.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: gridColor, transparent: true, opacity: 0.9 })));
    }
    if (axes) {
      const edges = [];
      for (const y of [y0, y1]) for (const z of [z0, z1]) edges.push(x0, y, z, x1, y, z);
      for (const x of [x0, x1]) for (const z of [z0, z1]) edges.push(x, y0, z, x, y1, z);
      for (const x of [x0, x1]) for (const y of [y0, y1]) edges.push(x, y, z0, x, y, z1);
      const bg = new THREE.BufferGeometry();
      bg.setAttribute("position", new THREE.Float32BufferAttribute(edges, 3));
      this.frame.add(new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: gridColor, transparent: true, opacity: 0.55 })));

      const colors = [0xe0524f, 0x3fae5d, 0x4a7de0];
      const lines = [
        [x0, cy, cz, x1, cy, cz],
        [cx, y0, cz, cx, y1, cz],
        [cx, cy, z0, cx, cy, z1],
      ];
      lines.forEach((l, i) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(l, 3));
        this.frame.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: colors[i] })));
      });
      const names = ["x", "y", "z"];
      const css3 = ["#e0524f", "#3fae5d", "#4a7de0"];
      const ends = [
        [x1 + S * 0.035, cy, cz],
        [cx, y1 + S * 0.035, cz],
        [cx, cy, z1 + S * 0.035],
      ];
      ends.forEach((e, i) => {
        const sp = labelSprite(names[i], css3[i], S * 0.045);
        sp.position.set(...e);
        this.frame.add(sp);
      });
    }
    if (labels) {
      const size = S * 0.03;
      const add = (v, x, y, z) => {
        const sp = labelSprite(fmt(v), theme.text, size);
        sp.position.set(x, y, z);
        this.frame.add(sp);
      };
      const off = S * 0.044;
      for (const v of ticks(x0, x1, stepX)) if (Math.abs(v) > stepX * 1e-6) add(v, v, y0 - off, cz);
      for (const v of ticks(y0, y1, stepY)) if (Math.abs(v) > stepY * 1e-6) add(v, x0 - off, v, cz);
      for (const v of ticks(z0, z1, stepZ)) if (Math.abs(v) > stepZ * 1e-6) add(v, x0 - off, y0 - off, v);
    }
  }

  // Returns { pick: [meshes], note }
  _buildRow(group, row, result, box, planes, vf, ctx4) {
    const S = boxSize(box);
    const color = new THREE.Color(row.color);
    const opacity = this.settings.opacity3;
    const surfMat = (vertexColors = false) =>
      new THREE.MeshStandardMaterial({
        color: vertexColors ? 0xffffff : color,
        vertexColors,
        side: THREE.DoubleSide,
        roughness: 0.55,
        metalness: 0.05,
        clippingPlanes: planes,
        transparent: opacity < 1,
        opacity,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
    const lineMat = () =>
      new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(0.55), transparent: true, opacity: 0.4, clippingPlanes: planes });
    const pick = [];

    const addGrid = (g) => {
      const mesh = new THREE.Mesh(g.geo, surfMat(g.colored));
      group.add(mesh);
      pick.push(mesh);
      if (g.lineIndices?.length) {
        const lg = new THREE.BufferGeometry();
        lg.setAttribute("position", g.geo.getAttribute("position"));
        lg.setIndex(new THREE.BufferAttribute(g.lineIndices, 1));
        group.add(new THREE.LineSegments(lg, lineMat()));
      }
    };
    const rgb = (coords) => {
      const out = new Float32Array(coords.length * 3);
      const c = new THREE.Color();
      for (let i = 0; i < coords.length; i++) {
        c.setHex(rampHex(coords[i]));
        out.set([c.r, c.g, c.b], i * 3);
      }
      return new THREE.BufferAttribute(out, 3);
    };
    const fromGrid = (s) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(s.positions, 3));
      if (s.colorCoord) geo.setAttribute("color", rgb(s.colorCoord));
      geo.setIndex(new THREE.BufferAttribute(s.indices, 1));
      geo.computeVertexNormals();
      return { geo, lineIndices: s.lineIndices, colored: !!s.colorCoord };
    };

    switch (result.kind) {
      case "surface":
        addGrid(fromGrid(heightfield(result.fn, result.axis, box, 140)));
        break;
      case "psurface":
        addGrid(fromGrid(parametricSurface(result.fx, result.fy, result.fz, result.urange, result.vrange, box, 120)));
        break;
      case "implicit3": {
        const m = marchingTets(result.fn, box, 56);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
        geo.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
        const mesh = new THREE.Mesh(geo, surfMat());
        group.add(mesh);
        pick.push(mesh);
        break;
      }
      case "implicit4": {
        if (ctx4.ident && result.surface) {
          // z = f(x,y,w) and friends: a heightfield at the current w beats marching cubes
          addGrid(fromGrid(heightfield(result.surface.fn, result.surface.axis, box, 140)));
        } else {
          const m = marchingTets(sliceFunction(result.fn4, ctx4.M, ctx4.w0), box, 56);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
          geo.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
          const mesh = new THREE.Mesh(geo, surfMat());
          group.add(mesh);
          pick.push(mesh);
        }
        break;
      }
      case "psurface4": {
        const project = projector(ctx4.M, ctx4.wRange, ctx4.perspective);
        addGrid(fromGrid(parametricSurface4(result.f4, result.urange, result.vrange, box, 120, project)));
        break;
      }
      case "curve4": {
        const project = projector(ctx4.M, ctx4.wRange, ctx4.perspective);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, clippingPlanes: planes });
        for (const seg of sampleCurve4(result.f4, result.range, box, project, 1600)) {
          const t = tube(Float32Array.from(seg.pos), S * 0.0055, 6, Float32Array.from(seg.col));
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(t.positions, 3));
          geo.setAttribute("normal", new THREE.BufferAttribute(t.normals, 3));
          geo.setAttribute("color", rgb(t.colorCoord));
          geo.setIndex(new THREE.BufferAttribute(t.indices, 1));
          group.add(new THREE.Mesh(geo, mat));
        }
        break;
      }
      case "point4":
      case "points4": {
        const project = projector(ctx4.M, ctx4.wRange, ctx4.perspective);
        const list = result.kind === "point4" ? [result.f4] : result.items;
        const geo = new THREE.SphereGeometry(S * 0.011, 20, 14);
        for (const f of list) {
          const q = project(f());
          if (!q || !q.pos.every(Number.isFinite)) continue;
          const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: rampHex(q.t), roughness: 0.35 }));
          m.position.set(...q.pos);
          group.add(m);
        }
        break;
      }
      case "curve3": {
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, clippingPlanes: planes });
        for (const seg of sampleCurve(result.fx, result.fy, result.fz, result.range, box, 1600)) {
          const t = tube(Float32Array.from(seg), S * 0.0055, 6);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(t.positions, 3));
          geo.setAttribute("normal", new THREE.BufferAttribute(t.normals, 3));
          geo.setIndex(new THREE.BufferAttribute(t.indices, 1));
          group.add(new THREE.Mesh(geo, mat));
        }
        break;
      }
      case "point3":
      case "points3": {
        const list = result.kind === "point3" ? [result] : result.items;
        const geo = new THREE.SphereGeometry(S * 0.011, 20, 14);
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35 });
        for (const p of list) {
          const x = p.fx();
          const y = p.fy();
          const z = p.fz();
          if (![x, y, z].every(Number.isFinite)) continue;
          const m = new THREE.Mesh(geo, mat);
          m.position.set(x, y, z);
          group.add(m);
        }
        break;
      }
      case "field": {
        const s = ctx4 ? sampleField4D(result, box, vf, ctx4.M, ctx4.w0) : sampleField3D(result, box, vf);
        const n = s.items.length;
        if (n) {
          const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.05 });
          const mesh = new THREE.InstancedMesh(arrowGeometry(), mat, n);
          const m4 = new THREE.Matrix4();
          const q = new THREE.Quaternion();
          const up = new THREE.Vector3(0, 1, 0);
          const dir = new THREE.Vector3();
          const pos = new THREE.Vector3();
          const sc = new THREE.Vector3();
          const c = new THREE.Color();
          const thick = s.step * 0.42;
          s.items.forEach((a, i) => {
            dir.set(a.dx, a.dy, a.dz);
            q.setFromUnitVectors(up, dir);
            pos.set(a.x, a.y, a.z);
            const th = Math.min(thick, Math.max(a.len * 0.55, thick * 0.35));
            sc.set(th, a.len, th);
            m4.compose(pos, q, sc);
            mesh.setMatrixAt(i, m4);
            if (vf.mag) c.setHex(rampHex(a.t));
            else c.copy(color);
            mesh.setColorAt(i, c);
          });
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          mesh.frustumCulled = false;
          group.add(mesh);
        }
        const fmtS = (v) => String(Number(v.toPrecision(3)));
        return { pick, note: s.coarsened ? `Field spacing ${fmtS(s.step)} (limit reached for ${fmtS(vf.step)})` : null };
      }
      default:
        break;
    }
    return { pick, note: null };
  }

  // ------------------------------------------------------------ hover
  _hover(e) {
    if (e.buttons || !this.pickables.length) {
      this.tip.hidden = true;
      return;
    }
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    const B = this.settings.box;
    const eps = boxSize(B) * 1e-6;
    const inside = (p) => p.x >= B.x[0] - eps && p.x <= B.x[1] + eps && p.y >= B.y[0] - eps && p.y <= B.y[1] + eps && p.z >= B.z[0] - eps && p.z <= B.z[1] + eps;
    const hit = this.raycaster.intersectObjects(this.pickables, false).find(
      (h) => inside(h.point)
    );
    if (!hit) {
      this.tip.hidden = true;
      return;
    }
    const p = hit.point;
    if (this.settings.mode4) {
      // report the true 4D point (undo the view rotation)
      const q = mulTV(rotation4(this.settings.view4.rot), [p.x, p.y, p.z, this.P.w ?? 0]);
      this.tip.textContent = `(${q.map(fmt).join(", ")})`;
    } else this.tip.textContent = `(${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)})`;
    this.tip.style.left = `${e.clientX - r.left + 14}px`;
    this.tip.style.top = `${e.clientY - r.top + 14}px`;
    this.tip.hidden = false;
  }
}
