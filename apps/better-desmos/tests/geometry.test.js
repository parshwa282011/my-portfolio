import { describe, expect, it } from "vitest";
import { View, niceStep } from "../src/render2d/viewport.js";
import { explicitPaths, implicitSegments, inequalityRects, parametricPaths } from "../src/render2d/geometry.js";
import { findRoots, findExtrema, explicitPOIs, intersections } from "../src/render2d/poi.js";

const view = () => {
  const v = new View({ cx: 0, cy: 0, scale: 50 });
  v.setSize(800, 600);
  return v;
};

describe("viewport", () => {
  it("round-trips coordinates", () => {
    const v = view();
    expect(v.wx(v.sx(3.25))).toBeCloseTo(3.25);
    expect(v.wy(v.sy(-1.5))).toBeCloseTo(-1.5);
  });
  it("zoomAt keeps the cursor point fixed", () => {
    const v = view();
    const before = v.wx(200);
    v.zoomAt(200, 100, 2);
    expect(v.wx(200)).toBeCloseTo(before);
  });
  it("niceStep returns 1-2-5 values", () => {
    expect(niceStep(1.7)).toBe(2);
    expect(niceStep(0.03)).toBe(0.05);
    expect(niceStep(430)).toBe(500);
  });
});

describe("explicit paths", () => {
  it("draws a parabola as one continuous path", () => {
    const paths = explicitPaths((x) => x * x, view(), "y");
    expect(paths.length).toBe(1);
  });
  it("breaks tan(x) at its asymptotes", () => {
    const paths = explicitPaths(Math.tan, view(), "y");
    // x range is [-8, 8]: asymptotes at +-pi/2, +-3pi/2, +-5pi/2 -> 6 branches
    expect(paths.length).toBeGreaterThanOrEqual(5);
  });
  it("breaks 1/x at 0", () => {
    expect(explicitPaths((x) => 1 / x, view(), "y").length).toBe(2);
  });
  it("breaks sqrt(x) domain gap but not the curve", () => {
    const paths = explicitPaths(Math.sqrt, view(), "y");
    expect(paths.length).toBe(1);
    expect(paths[0][0]).toBeGreaterThanOrEqual(view().sx(0) - 2);
  });
  it("keeps a steep smooth curve connected", () => {
    expect(explicitPaths((x) => x ** 7, view(), "y").length).toBe(1);
  });
  it("x = f(y) mode", () => {
    expect(explicitPaths((y) => y * y, view(), "x").length).toBe(1);
  });
  it("handles step discontinuities (floor)", () => {
    expect(explicitPaths(Math.floor, view(), "y").length).toBeGreaterThan(4);
  });
});

describe("parametric", () => {
  it("circle is one closed path", () => {
    const p = parametricPaths(Math.cos, Math.sin, view(), [0, 2 * Math.PI]);
    expect(p.length).toBe(1);
  });
});

describe("implicit", () => {
  it("circle segments lie on the circle", () => {
    const v = view();
    const segs = implicitSegments((x, y) => x * x + y * y - 4, v, 4);
    expect(segs.length).toBeGreaterThan(100);
    for (let i = 0; i < segs.length; i += 2) {
      const r = Math.hypot(v.wx(segs[i]), v.wy(segs[i + 1]));
      expect(Math.abs(r - 2)).toBeLessThan(0.03);
    }
  });
  it("rejects pole artifacts", () => {
    // tan(x) = y has legitimate branches but 1/x - y has a pole at x=0 only
    const segs = implicitSegments((x, y) => 1 / x - y, view(), 4);
    const v = view();
    for (let i = 0; i < segs.length; i += 2) {
      const x = v.wx(segs[i]);
      const y = v.wy(segs[i + 1]);
      if (Math.abs(x) > 0.2) expect(Math.abs(1 / x - y)).toBeLessThan(0.3);
    }
  });
});

describe("inequality", () => {
  it("shades the right half-plane", () => {
    const v = view();
    const rects = inequalityRects((x) => -x, false, v, 4); // -x <= 0  -> x >= 0
    expect(rects.length).toBeGreaterThan(0);
    for (const [x] of rects) expect(x).toBeGreaterThanOrEqual(v.sx(0) - 4);
  });
});

describe("points of interest", () => {
  it("roots of sin on [-7, 7]", () => {
    const r = findRoots(Math.sin, -7, 7);
    expect(r.length).toBe(5);
    expect(r[2]).toBeCloseTo(0, 6);
  });
  it("ignores poles of 1/x", () => {
    expect(findRoots((x) => 1 / x, -5, 5)).toEqual([]);
  });
  it("tan has roots but no extrema", () => {
    expect(findRoots(Math.tan, -7, 7).length).toBe(5);
    expect(findExtrema(Math.tan, -7, 7).length).toBe(0);
  });
  it("extrema of x^3 - 3x", () => {
    const e = findExtrema((x) => x ** 3 - 3 * x, -4, 4);
    expect(e.map((p) => [p.kind, Math.round(p.x)])).toEqual([["max", -1], ["min", 1]]);
  });
  it("explicit POIs include the y-intercept", () => {
    const p = explicitPOIs((x) => x * x - 1, view());
    expect(p.some((q) => q.kind === "y-intercept" && q.y === -1)).toBe(true);
    expect(p.filter((q) => q.kind === "root").length).toBe(2);
  });
  it("intersections", () => {
    const hits = intersections((x) => x * x, (x) => x + 2, view());
    expect(hits.map((h) => Math.round(h.x)).sort()).toEqual([-1, 2]);
  });
});
