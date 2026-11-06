import { describe, expect, it } from "vitest";
import { analyze } from "../src/engine/analyze.js";
import { toLatex } from "../src/engine/latex.js";
import { rotation4, isIdentity4, mulMV, mulTV, sliceFunction, projector } from "../src/render3d/rot4.js";
import { marchingTets, parametricSurface4, sampleCurve4, sampleField4D, cubeBox, tube } from "../src/render3d/geometry3d.js";
import { defaultDoc, exampleRows, sanitize } from "../src/state/doc.js";

const run = (latex, P = { w: 0 }, extra = []) => {
  const rows = [...extra, latex].map((l, i) => ({ id: `r${i}`, latex: l }));
  const out = analyze(rows, { mode: "4d", P });
  return { res: out.results.get(`r${rows.length - 1}`), params: out.params };
};
const box4 = { ...cubeBox(5), w: [-5, 5] };

describe("4D rotation", () => {
  it("is orthonormal and rotates x into w at 90° in the xw plane", () => {
    const M = rotation4([90, 0, 0]);
    expect(mulMV(M, [1, 0, 0, 0]).map((v) => Math.round(v))).toEqual([0, 0, 0, 1]);
    const v = [1, 2, 3, 4];
    const back = mulTV(M, mulMV(rotation4([30, 40, 50]), v));
    expect(Math.hypot(...mulMV(rotation4([30, 40, 50]), v))).toBeCloseTo(Math.hypot(...v), 9);
    expect(back.length).toBe(4);
  });
  it("identity detection", () => {
    expect(isIdentity4([0, 0, 0])).toBe(true);
    expect(isIdentity4([0, 5, 0])).toBe(false);
  });
});

describe("4D classification", () => {
  it("w is always a slider in 4D", () => expect(run("x^2+y^2+z^2+w^2=9").params.has("w")).toBe(true));
  it("a hypersurface F(x,y,z,w)=0", () => {
    const { res } = run("x^2+y^2+z^2+w^2=9");
    expect(res.kind).toBe("implicit4");
    expect(res.fn4(1, 2, 2, 0)).toBe(0);
    expect(res.surface).toBeUndefined();
  });
  it("w = f(x,y,z) is a hypersurface, z = f(x,y,w) also has a heightfield form", () => {
    expect(run("w=x^2+y^2-z^2").res.kind).toBe("implicit4");
    const { res } = run("z=\\sin\\left(x+w\\right)", { w: 1 });
    expect(res.kind).toBe("implicit4");
    expect(res.surface.axis).toBe("z");
    expect(res.surface.fn(0.5, 0)).toBeCloseTo(Math.sin(1.5), 9);
    expect(res.deps).toContain("w");
  });
  it("4-tuples: curve, surface, point, field", () => {
    expect(run("\\left(\\cos t,\\sin t,\\cos 2t,\\sin 2t\\right)").res.kind).toBe("curve4");
    expect(run("\\left(\\cos u,\\sin u,\\cos v,\\sin v\\right)").res.kind).toBe("psurface4");
    expect(run("\\left(1,2,3,4\\right)").res.kind).toBe("point4");
    expect(run("\\left(x,y,z,w\\right)").res.kind).toBe("field");
  });
  it("4-component vectors need 4D, and 3-component ones still work there", () => {
    const { res } = run("\\left\\langle -y,x,-w,z\\right\\rangle");
    expect(res.kind).toBe("field");
    expect(res.fw(0, 0, 3, 0)).toBe(3);
    const three = run("\\left\\langle -y,x,0\\right\\rangle").res;
    expect(three.fw(1, 2, 3, 4)).toBe(0);
    const a = analyze([{ id: "a", latex: "\\left\\langle 1,2,3,4\\right\\rangle" }], { mode: "3d", P: {} });
    expect(a.results.get("a").status).toBe("error");
  });
  it("∇ takes four partials when w is involved", () => {
    const { res } = run("\\nabla f", { w: 0 }, ["f(x,y,z,w)=x^2+y^2+z^2+w^2"]);
    expect(res.kind).toBe("field");
    expect(toLatex(res.exact)).toBe("\\left\\langle 2x,2y,2z,2w\\right\\rangle");
  });
  it("divergence in four variables; curl refuses", () => {
    expect(run("\\nabla\\cdot\\left\\langle x,y,z,w\\right\\rangle").res.value()).toBe(4);
    expect(run("\\nabla\\times\\left\\langle x,y,z,w\\right\\rangle").res.status).toBe("error");
  });
  it("inequalities stay 2D only", () => expect(run("x>y").res.status).toBe("error"));
});

describe("4D geometry", () => {
  const area = (m) => {
    const p = m.positions;
    let a = 0;
    for (let i = 0; i < p.length; i += 9) {
      const u = [p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]];
      const w = [p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]];
      a += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
    }
    return a;
  };
  const F = (x, y, z, w) => x * x + y * y + z * z + w * w - 9;
  it("slices of a 3-sphere are spheres whose radius shrinks with |w|", () => {
    for (const w0 of [0, 2]) {
      const r2 = 9 - w0 * w0;
      const m = marchingTets(sliceFunction(F, rotation4([0, 0, 0]), w0), box4, 44);
      expect(Math.abs(area(m) - 4 * Math.PI * r2) / (4 * Math.PI * r2)).toBeLessThan(0.04);
    }
    expect(marchingTets(sliceFunction(F, rotation4([0, 0, 0]), 3.5), box4, 30).triangles).toBe(0);
  });
  it("rotating the slice through the xw plane changes it, and a 3-sphere stays round", () => {
    // the 3-sphere is invariant under rotation, so every slice at w'=0 is still a radius-3 sphere
    const m = marchingTets(sliceFunction(F, rotation4([37, 20, 70]), 0), box4, 44);
    expect(Math.abs(area(m) - 36 * Math.PI) / (36 * Math.PI)).toBeLessThan(0.04);
    // a non-symmetric hypersurface does change
    const G = (x, y, z, w) => x + w - 1; // a hyperplane
    const flat = marchingTets(sliceFunction(G, rotation4([0, 0, 0]), 0), box4, 30);
    const tilted = marchingTets(sliceFunction(G, rotation4([45, 0, 0]), 0), box4, 30);
    expect(Math.abs(area(flat) - area(tilted))).toBeGreaterThan(1);
  });
  it("projection colours by w' and supports perspective", () => {
    const ortho = projector(rotation4([0, 0, 0]), [-5, 5], false)([1, 2, 3, 5]);
    expect(ortho.pos).toEqual([1, 2, 3]);
    expect(ortho.t).toBe(1);
    const persp = projector(rotation4([0, 0, 0]), [-5, 5], true)([1, 2, 3, 5]);
    expect(persp.pos[0]).toBeGreaterThan(1); // closer to the eye -> larger
    expect(projector(rotation4([0, 0, 0]), [-5, 5], true)([0, 0, 0, 14])).toBeNull(); // behind the eye
  });
  it("a curve on the Clifford torus projects to one connected polyline with w' colours", () => {
    const project = projector(rotation4([0, 0, 0]), [-3, 3], false);
    const segs = sampleCurve4((t) => [3 * Math.cos(t), 3 * Math.sin(t), 3 * Math.cos(2 * t), 3 * Math.sin(2 * t)], [0, 2 * Math.PI], box4, project, 400);
    expect(segs.length).toBe(1);
    expect(segs[0].col.length).toBe(401);
    expect(Math.min(...segs[0].col)).toBeLessThan(0.05);
    expect(Math.max(...segs[0].col)).toBeGreaterThan(0.95);
    const tb = tube(Float32Array.from(segs[0].pos), 0.05, 6, Float32Array.from(segs[0].col));
    expect(tb.colorCoord.length).toBe(401 * 6);
  });
  it("a 4D surface carries a colour coordinate per vertex", () => {
    const project = projector(rotation4([0, 0, 0]), [-2, 2], false);
    const g = parametricSurface4((u, v) => [2 * Math.cos(u), 2 * Math.sin(u), 2 * Math.cos(v), 2 * Math.sin(v)], [0, 2 * Math.PI], [0, 2 * Math.PI], box4, 30, project);
    expect(g.colorCoord).toBeTruthy();
    expect(g.indices.length).toBeGreaterThan(0);
  });
  it("4D field arrows: view-rotation moves the field into w'", () => {
    const res = { fx: (x, y, z, w) => 1, fy: () => 0, fz: () => 0, fw: () => 0 };
    const none = sampleField4D(res, box4, { step: 5, len: "scaled", by: "size" }, rotation4([0, 0, 0]), 0);
    expect(none.items.every((a) => Math.abs(a.dx - 1) < 1e-9)).toBe(true);
    // rotate x into w by 90°: the arrow has no spatial part left, so nothing is drawn
    const turned = sampleField4D(res, box4, { step: 5, len: "scaled", by: "size" }, rotation4([90, 0, 0]), 0);
    expect(turned.items.length).toBe(0);
    // at 45° half of it stays in space, and colour-by-w reports the w' component
    const half = sampleField4D(res, box4, { step: 5, len: "scaled", by: "w" }, rotation4([45, 0, 0]), 0);
    expect(half.items[0].w).toBeCloseTo(Math.SQRT1_2, 6);
    expect(half.items[0].t).toBeGreaterThan(0.5);
  });
});

describe("4D document", () => {
  it("round-trips mode, view4 and the w range; rejects junk", () => {
    const d = defaultDoc();
    d.mode = "4d";
    d.rows = exampleRows("4d");
    d.view4 = { rot: [10, -20, 30], proj: "persp" };
    d.settings.box.w = [-2, 8];
    const back = sanitize(JSON.parse(JSON.stringify(d)));
    expect(back.mode).toBe("4d");
    expect(back.view4).toEqual({ rot: [10, -20, 30], proj: "persp" });
    expect(back.settings.box.w).toEqual([-2, 8]);
    const bad = sanitize({ rows: [{ latex: "x" }], mode: "5d", view4: { rot: [1, 2], proj: "x" }, settings: { box: { w: [4, 1] } } });
    expect(bad.mode).toBe("2d");
    expect(bad.view4).toEqual({ rot: [0, 0, 0], proj: "ortho" });
    expect(bad.settings.box.w).toEqual([-5, 5]);
  });
  it("every mode keeps its own rows", () => {
    const d = defaultDoc();
    d.mode = "4d";
    d.rows = exampleRows("4d");
    d.stash = { "2d": exampleRows("2d"), "3d": exampleRows("3d") };
    const back = sanitize(JSON.parse(JSON.stringify(d)));
    expect(Object.keys(back.stash).sort()).toEqual(["2d", "3d"]);
  });
  it("the 4D examples all classify", () => {
    const rows = exampleRows("4d");
    const out = analyze(rows, { mode: "4d", P: { w: 0 } });
    for (const r of rows) expect(out.results.get(r.id).status).toBe("ok");
  });
});
