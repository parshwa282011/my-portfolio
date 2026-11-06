import { describe, expect, it } from "vitest";
import { analyze } from "../src/engine/analyze.js";
import { parseLatex } from "../src/engine/parse.js";
import { simplify } from "../src/engine/simplify.js";
import { toLatex } from "../src/engine/latex.js";
import { expandDerivs, gradient, divergence, curl } from "../src/engine/vector.js";
import { heightfield, marchingTets, sampleCurve, sampleField3D, tube, cubeBox } from "../src/render3d/geometry3d.js";
import { fieldGrid } from "../src/render2d/field2d.js";
import { View } from "../src/render2d/viewport.js";
import { defaultDoc, exampleRows, sanitize } from "../src/state/doc.js";

const run = (mode, latex, P = {}) => {
  const out = analyze([{ id: "r", latex }], { mode, P });
  return out.results.get("r");
};
const deriv = (latex) => toLatex(simplify(expandDerivs(parseLatex(latex).ast)));

describe("partial derivatives", () => {
  it("∂/∂x (x²y) = 2xy", () => expect(deriv("\\frac{\\partial}{\\partial x}\\left(x^2y\\right)")).toBe("2xy"));
  it("∂/∂y (x²y) = x²", () => expect(deriv("\\frac{\\partial}{\\partial y}\\left(x^2y\\right)")).toBe("x^{2}"));
  it("mixed partial uses both variables", () => expect(deriv("\\frac{\\partial^2}{\\partial x\\partial y}\\left(x^2y^3\\right)")).toBe("6xy^{2}"));
  it("second partial in one variable", () => expect(deriv("\\frac{\\partial^2}{\\partial x^2}\\left(x^4y\\right)")).toBe("12x^{2}y"));
  it("the numeric path also honours mixed partials", () => {
    const r = run("3d", "\\frac{\\partial^2}{\\partial x\\partial y}\\left(x^2y^3\\right)");
    expect(r.fn(2, 3)).toBeCloseTo(6 * 2 * 9, 9);
  });
  it("chain rule results print sensibly", () => {
    expect(deriv("\\frac{d}{dx}\\sin\\left(x^2\\right)")).toBe("2x\\cos\\left(x^{2}\\right)");
    expect(deriv("\\frac{d}{dx}e^{2x}")).toBe("2e^{2x}");
    expect(deriv("\\frac{d}{dx}\\sqrt{x}")).toBe("\\frac{1}{2\\sqrt{x}}");
  });
  it("printed results can be read back", () => {
    const back = run("2d", `y=${deriv("\\frac{d}{dx}\\left(x\\sin x\\right)")}`);
    expect(back.status).toBe("ok");
    expect(back.fn(1.3)).toBeCloseTo(Math.sin(1.3) + 1.3 * Math.cos(1.3), 9);
  });
});

describe("vector calculus", () => {
  const F = ["$Vec", ["Negate", "y"], "x"].slice(1).map((c) => c);
  it("gradient / divergence / curl of a rotation field", () => {
    expect(divergence(F, ["x", "y"])).toBe(0);
    expect(curl(F, ["x", "y"])).toBe(2);
    expect(gradient(parseLatex("x^2y").ast, ["x", "y"]).map(toLatex)).toEqual(["2xy", "x^{2}"]);
  });
  it("3D curl of <y z, x z, x y> is zero", () => {
    const comps = [["Multiply", "y", "z"], ["Multiply", "x", "z"], ["Multiply", "x", "y"]];
    expect(curl(comps, ["x", "y", "z"])).toEqual([0, 0, 0]);
  });
});

describe("2D vector fields", () => {
  it("angle brackets", () => {
    const r = run("2d", "\\left\\langle -y,x\\right\\rangle");
    expect(r.kind).toBe("field");
    expect([r.fx(1, 2), r.fy(1, 2)]).toEqual([-2, 1]);
  });
  it("a tuple that mentions x or y is a field; plain tuples stay points", () => {
    expect(run("2d", "\\left(y,x\\right)").kind).toBe("field");
    expect(run("2d", "\\left(1,2\\right)").kind).toBe("point");
  });
  it("sliders work inside a field and are reported as dependencies", () => {
    const r = run("2d", "\\left\\langle a y,x\\right\\rangle", { a: 3 });
    expect(r.fx(0, 2)).toBe(6);
    expect(r.deps).toEqual(["a"]);
  });
  it("3 components need 3D mode", () => {
    expect(run("2d", "\\left\\langle 1,2,3\\right\\rangle").status).toBe("error");
  });
  it("grid is aligned to the requested spacing and is coarsened only when dense", () => {
    const v = new View({ cx: 0, cy: 0, scale: 50 });
    v.setSize(800, 600);
    const g = fieldGrid(v, 1);
    expect(g.step).toBe(1);
    expect(g.pts.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y))).toBe(true);
    const fine = fieldGrid(v, 0.1);
    expect(fine.coarsened).toBe(true);
    expect(fine.step).toBeGreaterThanOrEqual(0.3);
    expect(Math.abs(fine.step / 0.1 - Math.round(fine.step / 0.1))).toBeLessThan(1e-9);
  });
});

describe("3D classification", () => {
  it("z = f(x,y)", () => {
    const r = run("3d", "z=x^2+y");
    expect(r.kind).toBe("surface");
    expect(r.axis).toBe("z");
    expect(r.fn(2, 3)).toBe(7);
  });
  it("y = f(x) is a cylinder along z", () => {
    const r = run("3d", "y=x^2");
    expect(r.kind).toBe("surface");
    expect(r.axis).toBe("y");
    expect(r.fn(3, 99)).toBe(9);
  });
  it("sphere is implicit", () => {
    const r = run("3d", "x^2+y^2+z^2=9");
    expect(r.kind).toBe("implicit3");
    expect(r.fn(3, 0, 0)).toBe(0);
  });
  it("a bare f(x,y) is a surface", () => expect(run("3d", "x y").kind).toBe("surface"));
  it("space curve, parametric surface, point, field", () => {
    expect(run("3d", "\\left(\\cos t,\\sin t,t\\right)").kind).toBe("curve3");
    expect(run("3d", "\\left(u,v,uv\\right)").kind).toBe("psurface");
    expect(run("3d", "\\left(1,2,3\\right)").kind).toBe("point3");
    expect(run("3d", "\\left\\langle -y,x,0\\right\\rangle").kind).toBe("field");
  });
  it("a 2-component field is planar", () => expect(run("3d", "\\left\\langle -y,x\\right\\rangle").planar).toBe(true));
  it("inequalities and polar are 2D only", () => {
    expect(run("3d", "y>x").status).toBe("error");
    expect(run("3d", "r=1+\\sin\\theta").status).toBe("error");
  });
  it("u and v are reserved in 3D", () => {
    expect(run("3d", "u=3").kind).not.toBe("variable");
    expect(run("2d", "u=3").kind).toBe("variable");
  });
});

describe("3D geometry", () => {
  it("marching tetrahedra: a sphere has the right area and outward winding", () => {
    const m = marchingTets((x, y, z) => x * x + y * y + z * z - 9, cubeBox(5), 36);
    const p = m.positions;
    let area = 0;
    let outward = 0;
    for (let i = 0; i < p.length; i += 9) {
      const a = [p[i], p[i + 1], p[i + 2]];
      const u = [p[i + 3] - a[0], p[i + 4] - a[1], p[i + 5] - a[2]];
      const w = [p[i + 6] - a[0], p[i + 7] - a[1], p[i + 8] - a[2]];
      const c = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      area += Math.hypot(...c) / 2;
      if (c[0] * a[0] + c[1] * a[1] + c[2] * a[2] > 0) outward++;
    }
    expect(Math.abs(area - 4 * Math.PI * 9) / (4 * Math.PI * 9)).toBeLessThan(0.02);
    expect(outward / m.triangles).toBeGreaterThan(0.97);
  });
  it("a surface breaks at an asymptote instead of joining the branches", () => {
    const full = heightfield((x) => x, "z", cubeBox(5), 60);
    const tan = heightfield((x) => Math.tan(x), "z", cubeBox(5), 60);
    expect(tan.indices.length).toBeLessThan(full.indices.length);
  });
  it("curves split at undefined points; tubes have the expected size", () => {
    const parts = sampleCurve((t) => t, (t) => Math.sqrt(t), () => 0, [-1, 1], cubeBox(5), 200);
    expect(parts.length).toBe(1);
    const tb = tube(Float32Array.from(parts[0]), 0.05, 6);
    expect(tb.positions.length / 3).toBe((parts[0].length / 3) * 6);
  });
  it("field sampling follows the requested spacing and caps the count", () => {
    const res = { planar: false, fx: (x, y) => -y, fy: (x) => x, fz: () => 0 };
    const a = sampleField3D(res, cubeBox(5), { step: 1, len: "scaled" });
    expect(a.items.length).toBe(11 ** 3 - 11); // the z axis has zero magnitude
    expect(a.items.every((i) => Number.isInteger(i.x) && Number.isInteger(i.y) && Number.isInteger(i.z))).toBe(true);
    const b = sampleField3D(res, cubeBox(5), { step: 0.1, len: "scaled" });
    expect(b.coarsened).toBe(true);
    expect(b.items.length).toBeLessThan(13000);
    const flat = sampleField3D({ ...res, planar: true }, cubeBox(5), { step: 1, len: "unit" });
    expect(flat.items.every((i) => i.z === 0)).toBe(true);
    expect(flat.items[0].len).toBeCloseTo(0.7, 9);
  });
});

describe("∇ notation", () => {
  const rows = (mode, ...latex) => {
    const out = analyze(latex.map((l, i) => ({ id: `r${i}`, latex: l })), { mode, P: {} });
    return latex.map((_, i) => out.results.get(`r${i}`));
  };
  it("∇f(x,y,z) with f defined gives the gradient field", () => {
    const [, g] = rows("3d", "f(x,y,z)=x^2yz", "\\nabla f\\left(x,y,z\\right)");
    expect(g.kind).toBe("field");
    expect(toLatex(g.exact)).toBe("\\left\\langle 2xyz,x^{2}z,x^{2}y\\right\\rangle");
    expect([g.fx(1, 2, 3), g.fy(1, 2, 3), g.fz(1, 2, 3)]).toEqual([12, 3, 2]);
  });
  it("a bare function name works, and the minus sign flips it", () => {
    const [, a, b] = rows("2d", "g(x,y)=-2x^2-y^2", "\\nabla g", "-\\nabla g");
    expect([a.fx(1, 1), a.fy(1, 1)]).toEqual([-4, -2]);
    expect([b.fx(1, 1), b.fy(1, 1)]).toEqual([4, 2]);
  });
  it("divergence, curl and the Laplacian", () => {
    const [, div, curl3, lap] = rows("3d", "f(x,y,z)=x^2yz", "\\nabla\\cdot\\left\\langle x,y,z\\right\\rangle", "\\nabla\\times\\left\\langle -y,x,0\\right\\rangle", "\\nabla^2 f");
    expect(div.value()).toBe(3);
    expect(curl3.kind).toBe("field");
    expect(toLatex(curl3.exact)).toBe("\\left\\langle 0,0,2\\right\\rangle");
    expect(toLatex(lap.exact)).toBe("2yz");
    expect(lap.status).toBe("ok");
  });
  it("∇·∇f is the Laplacian", () => {
    const [, a] = rows("3d", "f(x,y,z)=x^2yz", "\\nabla\\cdot\\nabla f");
    expect(toLatex(a.exact)).toBe("2yz");
  });
  it("an undefined function is reported, not silently multiplied", () => {
    const [r] = rows("3d", "\\nabla h\\left(x,y,z\\right)");
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/not defined/);
  });
  it("a lone ∇ explains itself", () => expect(rows("2d", "\\nabla")[0].error).toMatch(/needs something/));
});

describe("non-cubic boxes", () => {
  const box = { x: [0, 10], y: [-5, 5], z: [2, 6] };
  it("surfaces cover exactly the box", () => {
    const h = heightfield((x, y) => x + y, "z", box, 40);
    const p = h.positions;
    const xs = [];
    const ys = [];
    for (let i = 0; i < p.length; i += 3) {
      xs.push(p[i]);
      ys.push(p[i + 1]);
    }
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([0, 10, -5, 5]);
  });
  it("implicit surfaces stay inside the box and keep their shape", () => {
    // sphere centred at (5, 0, 4), radius 2: fits inside 10 × 10 × 4
    const m = marchingTets((x, y, z) => (x - 5) ** 2 + y * y + (z - 4) ** 2 - 4, box, 40);
    const p = m.positions;
    let ok = true;
    let area = 0;
    for (let i = 0; i < p.length; i += 3) if (p[i] < 0 || p[i] > 10 || Math.abs(p[i + 1]) > 5 || p[i + 2] < 2 || p[i + 2] > 6) ok = false;
    for (let i = 0; i < p.length; i += 9) {
      const u = [p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]];
      const w = [p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]];
      area += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
    }
    expect(ok).toBe(true);
    expect(Math.abs(area - 16 * Math.PI) / (16 * Math.PI)).toBeLessThan(0.04);
  });
  it("vector arrows start at the first multiple of the spacing inside each range", () => {
    const res = { planar: false, fx: () => 1, fy: () => 0, fz: () => 0 };
    const a = sampleField3D(res, { x: [3, 9], y: [-1, 1], z: [0.5, 2.5] }, { step: 2, len: "scaled" });
    expect([...new Set(a.items.map((i) => i.x))].sort((p, q) => p - q)).toEqual([4, 6, 8]);
    expect([...new Set(a.items.map((i) => i.y))].sort((p, q) => p - q)).toEqual([0]);
    expect([...new Set(a.items.map((i) => i.z))]).toEqual([2]);
  });
  it("a planar field disappears when the box does not contain z = 0", () => {
    const res = { planar: true, fx: () => 1, fy: () => 1, fz: () => 0 };
    expect(sampleField3D(res, { x: [-2, 2], y: [-2, 2], z: [1, 3] }, { step: 1, len: "scaled" }).items.length).toBe(0);
  });
  it("old documents with one range keep working", () => {
    expect(sanitize({ rows: [{ latex: "x" }], settings: { range3: 8 } }).settings.box).toEqual({ x: [-8, 8], y: [-8, 8], z: [-8, 8] });
  });
});

describe("document", () => {
  it("round-trips modes, stashed rows and field options", () => {
    const d = defaultDoc();
    d.mode = "3d";
    d.rows = exampleRows("3d");
    d.stash = { "2d": exampleRows("2d") };
    d.settings.box = { x: [0, 10], y: [-5, 5], z: [-2, 20] };
    d.settings.vf = { step: 0.5, len: "unit", mag: false, style: "both" };
    const back = sanitize(JSON.parse(JSON.stringify(d)));
    expect(back.mode).toBe("3d");
    expect(back.stash["2d"].length).toBe(6);
    expect(back.settings.box).toEqual({ x: [0, 10], y: [-5, 5], z: [-2, 20] });
    expect(back.settings.vf).toEqual({ step: 0.5, len: "unit", mag: false, style: "both" });
    expect(back.rows.find((r) => r.vf)?.vf.step).toBe(2);
  });
  it("rejects hostile values", () => {
    const d = sanitize({
      rows: [{ latex: "x", vf: { step: -3, len: "evil", style: 5 }, tmin: "a" }],
      mode: "4d",
      settings: { box: { x: [3, 1], y: [0, 1e12], z: [-1, 1] }, opacity3: -1, vf: { step: 0 } },
      view3: { p: [1, 2, "x"], t: [0, 0, 0] },
      stash: { "3d": "nope" },
    });
    expect(d.mode).toBe("2d");
    expect(d.settings.box).toEqual({ x: [-5, 5], y: [-5, 5], z: [-1, 1] }); // bad axes fall back, good ones are kept
    expect(d.settings.opacity3).toBe(1);
    expect(d.settings.vf.step).toBe(1);
    expect(d.view3).toBeNull();
    expect(d.rows[0].vf).toEqual({});
    expect(d.stash).toEqual({});
  });
});
