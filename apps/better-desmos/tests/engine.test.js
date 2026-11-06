import { describe, expect, it } from "vitest";
import { analyze } from "../src/engine/analyze.js";
import { diff } from "../src/engine/diff.js";
import { gamma, erf, integrate, limit } from "../src/engine/runtime.js";
import { toLatex } from "../src/engine/latex.js";

const run = (latexRows, opts = {}) => {
  const P = opts.P ?? {};
  const rows = latexRows.map((latex, i) => ({ id: `r${i}`, latex }));
  const out = analyze(rows, { angle: opts.angle ?? "rad", P });
  return { ...out, rows: rows.map((r) => out.results.get(r.id)), P };
};
const one = (latex, opts) => run([latex], opts).rows[0];

describe("classification", () => {
  it("explicit y=f(x)", () => {
    const r = one("y=x^2");
    expect(r.kind).toBe("explicit");
    expect(r.axis).toBe("y");
    expect(r.fn(3)).toBe(9);
  });
  it("bare expression with x is explicit", () => {
    expect(one("\\sin x").kind).toBe("explicit");
  });
  it("x=f(y)", () => {
    const r = one("x=y^2+1");
    expect(r.kind).toBe("explicit");
    expect(r.axis).toBe("x");
    expect(r.fn(2)).toBe(5);
  });
  it("implicit circle", () => {
    const r = one("x^2+y^2=1");
    expect(r.kind).toBe("implicit");
    expect(r.fn(1, 0)).toBe(0);
    expect(r.fn(0, 2)).toBe(3);
  });
  it("polar", () => {
    const r = one("r=1+\\sin\\theta");
    expect(r.kind).toBe("polar");
    expect(r.fn(0)).toBeCloseTo(1);
  });
  it("inequality", () => {
    const r = one("y>x");
    expect(r.kind).toBe("inequality");
    expect(r.strict).toBe(true);
  });
  it("parametric vs point", () => {
    expect(one("(\\cos t,\\sin t)").kind).toBe("parametric");
    expect(one("(1,2)").kind).toBe("point");
    expect(one("[(1,2),(3,4)]").kind).toBe("points");
  });
  it("value", () => {
    const r = one("2+3\\cdot 4");
    expect(r.kind).toBe("value");
    expect(r.value()).toBe(14);
  });
  it("reports parse errors per row", () => {
    expect(one("y=(").status).toBe("error");
    expect(one("   ").status).toBe("empty");
  });
});

describe("parameters", () => {
  it("collects undefined symbols as params and reads them live", () => {
    const { rows, params, P } = run(["y=a\\sin(bx)"], { P: { a: 2, b: 1 } });
    expect([...params].sort()).toEqual(["a", "b"]);
    expect(rows[0].fn(Math.PI / 2)).toBeCloseTo(2);
    P.a = 3;
    expect(rows[0].fn(Math.PI / 2)).toBeCloseTo(3);
  });
});

describe("definitions", () => {
  it("user functions and variables", () => {
    const { rows } = run(["f(x)=x^2+k", "k=5", "y=f(3)+f(1)"]);
    expect(rows[0].kind).toBe("function");
    expect(rows[1].kind).toBe("variable");
    expect(rows[2].fn(0)).toBe(14 + 6);
  });
  it("implicit multiplication of a variable and a parenthesis", () => {
    const { rows } = run(["a=3", "y=a(x+1)"]);
    expect(rows[1].fn(1)).toBe(6);
  });
  it("detects circular definitions", () => {
    const { rows } = run(["a=b", "b=a", "y=a"]);
    expect(rows[2].status).toBe("error");
  });
  it("rejects duplicate definitions", () => {
    const { rows } = run(["a=1", "a=2"]);
    expect(rows[1].status).toBe("error");
  });
  it("argument count mismatch is an error", () => {
    const { rows } = run(["f(x)=x", "y=f(1,2)"]);
    expect(rows[1].status).toBe("error");
  });
});

describe("math functions", () => {
  const val = (l, o) => one(l, o).value();
  it("basic", () => {
    expect(val("\\sqrt{16}")).toBe(4);
    expect(val("|-3|")).toBe(3);
    expect(val("2^{10}")).toBe(1024);
    expect(val("\\ln e")).toBeCloseTo(1);
    expect(val("\\log 1000")).toBeCloseTo(3);
    expect(val("\\sqrt[3]{-8}")).toBeCloseTo(-2);
    expect(val("\\frac{1}{4}")).toBe(0.25);
  });
  it("real cube root via fractional power", () => {
    const r = one("y=x^{1/3}");
    expect(r.fn(-8)).toBeCloseTo(-2);
    expect(Number.isNaN(one("y=x^{1/2}").fn(-4))).toBe(true);
  });
  it("degrees mode", () => {
    expect(val("\\sin(30)", { angle: "deg" })).toBeCloseTo(0.5);
    expect(val("\\arctan(1)", { angle: "deg" })).toBeCloseTo(45);
    expect(val("\\sin(\\pi/6)")).toBeCloseTo(0.5);
  });
  it("sums and products", () => {
    expect(val("\\sum_{n=1}^{10}n")).toBe(55);
    expect(val("\\prod_{n=1}^{5}n")).toBe(120);
    expect(val("\\sum_{k=1}^{4}k^2")).toBe(30);
  });
  it("gamma/erf", () => {
    expect(gamma(5)).toBe(24);
    expect(gamma(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 10);
    expect(erf(0.5)).toBeCloseTo(0.5204998778130465, 12);
    expect(erf(3)).toBeCloseTo(0.9999779095030014, 12);
  });
});

describe("calculus", () => {
  it("symbolic derivative compiles to a function", () => {
    const r = one("\\frac{d}{dx}x^3");
    expect(r.kind).toBe("explicit");
    expect(r.calc).toBe(true);
    expect(r.fn(2)).toBeCloseTo(12);
  });
  it("derivative of trig / product / quotient / chain", () => {
    expect(one("\\frac{d}{dx}(x\\sin x)").fn(Math.PI)).toBeCloseTo(-Math.PI, 10);
    expect(one("\\frac{d}{dx}\\frac{1}{x}").fn(2)).toBeCloseTo(-0.25);
    expect(one("\\frac{d}{dx}\\sin(x^2)").fn(1)).toBeCloseTo(2 * Math.cos(1));
    expect(one("\\frac{d}{dx}2^x").fn(3)).toBeCloseTo(8 * Math.LN2);
    expect(one("\\frac{d}{dx}x^x").fn(2)).toBeCloseTo(4 * (Math.log(2) + 1));
  });
  it("partial derivative with respect to x", () => {
    const r = one("\\frac{\\partial}{\\partial x}(x^2y)", {});
    // a function of x and y: not drawable in 2D, but the derivative is computed
    expect(r.status).toBe("ok");
    expect(r.kind).toBe("multivar");
    expect(toLatex(r.exact)).toBe("2xy");
  });
  it("derivative honours degrees", () => {
    expect(one("\\frac{d}{dx}\\sin x", { angle: "deg" }).fn(0)).toBeCloseTo(Math.PI / 180);
  });
  it("definite integral", () => {
    expect(one("\\int_0^1 x^2\\,dx").value()).toBeCloseTo(1 / 3, 9);
    expect(one("\\int_0^\\pi\\sin x\\,dx").value()).toBeCloseTo(2, 9);
    expect(one("\\int_{-\\infty}^{\\infty}e^{-x^2}dx").value()).toBeCloseTo(Math.sqrt(Math.PI), 6);
  });
  it("indefinite integral asks for the symbolic engine", () => {
    expect(one("\\int \\sin x\\,dx").status).toBe("needs-symbolic");
  });
  it("limit", () => {
    expect(one("\\lim_{x\\to0}\\frac{\\sin x}{x}").value()).toBeCloseTo(1, 6);
    expect(one("\\lim_{x\\to\\infty}\\frac{1}{x}").value()).toBeCloseTo(0, 5);
  });
  it("diff() unit", () => {
    expect(diff(["Power", "x", 3], "x")).toEqual(["Multiply", 3, ["Power", "x", 2]]);
    expect(diff(5, "x")).toBe(0);
    expect(() => diff(["Foo", "x"], "x")).toThrow();
  });
  it("runtime integrate/limit units", () => {
    expect(integrate((x) => x, 0, 2)).toBeCloseTo(2);
    expect(integrate((x) => 1 / x, 1, Math.E)).toBeCloseTo(1, 9);
    expect(limit((x) => (x * x - 1) / (x - 1), 1, 0)).toBeCloseTo(2, 5);
  });
});

describe("polar in degrees", () => {
  it("default range and unit follow the angle mode", () => {
    const r = one("r=1+\\sin\\theta", { angle: "deg" });
    expect(r.unit).toBeCloseTo(Math.PI / 180);
    expect(r.range[1]).toBe(2160);
    expect(r.fn(90)).toBeCloseTo(2);
    const rad = one("r=1+\\sin\\theta");
    expect(rad.unit).toBe(1);
  });
});
