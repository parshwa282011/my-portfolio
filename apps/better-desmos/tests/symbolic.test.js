import { describe, expect, it } from "vitest";
import { parseLatex } from "../src/engine/parse.js";
import { inline } from "../src/engine/inline.js";
import { toSympy } from "../src/symbolic/toSympy.js";
import { analyze } from "../src/engine/analyze.js";

const ctx = { funcs: new Map(), vars: new Map(), angle: "rad" };
const py = (latex) => {
  const p = parseLatex(latex);
  if (!p.ast) throw new Error(p.error || "empty");
  return toSympy(inline(p.ast, ctx));
};

describe("toSympy", () => {
  it("elementary expressions", () => {
    expect(py("x^2+1")).toBe('((_S("x") ** Integer(2)) + Integer(1))');
    expect(py("\\sin x")).toBe('sin(_S("x"))');
    expect(py("\\frac{1}{2}")).toBe("(Integer(1) / Integer(2))");
    expect(py("\\pi")).toBe("pi");
    expect(py("e^x")).toBe('(E ** _S("x"))');
    expect(py("\\ln x")).toBe('log(_S("x"))');
    expect(py("\\log x")).toBe('log(_S("x"), 10)');
    expect(py("0.5x")).toContain('Rational("0.5")');
  });
  it("calculus", () => {
    expect(py("\\frac{d}{dx}x^3")).toBe('Derivative((_S("x") ** Integer(3)), _S("x"))');
    expect(py("\\int_0^1 x\\,dx")).toBe('Integral(_S("x"), (_S("x"), Integer(0), Integer(1)))');
    expect(py("\\int x\\,dx")).toBe('Integral(_S("x"), _S("x"))');
    expect(py("\\lim_{x\\to0}x")).toContain("Limit(");
    expect(py("\\sum_{n=1}^{5}n")).toContain("Sum(");
    expect(py("\\int_{-\\infty}^{\\infty}e^{-x^2}dx")).toContain("oo");
  });
  it("symbol names cannot inject code", () => {
    const code = toSympy(['Add', 'x"); import os; ("', 1]);
    expect(code).toContain('_S("x\\"); import os; (\\"")');
  });
  it("rejects unsupported heads", () => {
    expect(() => toSympy(["Mystery", "x"])).toThrow();
  });
});

describe("SymPy output can be plotted again", () => {
  // strings produced by sympy.latex(..., ln_notation=True, inv_trig_style='full')
  const cases = [
    "- x^{2} \\cos{\\left(x \\right)} + 2 x \\sin{\\left(x \\right)} + 2 \\cos{\\left(x \\right)}",
    "x^{2} \\left(3 \\ln{\\left(x \\right)} + 1\\right)",
    "\\frac{x^{3}}{3}",
    "\\sqrt{4 - x^{2}}",
    "\\operatorname{atan}{\\left(x \\right)}".replace("atan", "arctan"),
    "\\frac{\\sin{\\left(x \\right)}}{x}",
    "e^{x} \\cos{\\left(x \\right)}",
  ];
  for (const latex of cases) {
    it(`y=${latex}`, () => {
      const rows = [{ id: "a", latex: `y=${latex}` }];
      const out = analyze(rows, { P: {} });
      const r = out.results.get("a");
      expect(r.status, r.error).toBe("ok");
      expect(r.kind).toBe("explicit");
      expect(Number.isFinite(r.fn(0.7))).toBe(true);
    });
  }
  it("evaluates the antiderivative correctly", () => {
    const rows = [{ id: "a", latex: "y=- x^{2} \\cos{\\left(x \\right)} + 2 x \\sin{\\left(x \\right)} + 2 \\cos{\\left(x \\right)}" }];
    const r = analyze(rows, { P: {} }).results.get("a");
    const x = 1.3;
    expect(r.fn(x)).toBeCloseTo(-x * x * Math.cos(x) + 2 * x * Math.sin(x) + 2 * Math.cos(x), 10);
  });
});
