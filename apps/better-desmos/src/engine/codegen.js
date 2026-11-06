// Normalized + inlined MathJSON -> JavaScript function.
import { CONSTANTS, isArr, isNum, isSym } from "./ast.js";
import { diff } from "./diff.js";
import * as RT from "./runtime.js";

const id = (name) => `v_${name.replace(/[^A-Za-z0-9_]/g, (c) => `$${c.charCodeAt(0)}`)}`;
const num = (n) => (Number.isNaN(n) ? "NaN" : n === Infinity ? "Infinity" : n === -Infinity ? "-Infinity" : n < 0 ? `(${n})` : String(n));

const SIMPLE = {
  Sin: "Math.sin", Cos: "Math.cos", Tan: "Math.tan",
  Cot: "RT.cot", Sec: "RT.sec", Csc: "RT.csc",
  Arcsin: "Math.asin", Arccos: "Math.acos", Arctan: "Math.atan",
  Arccot: "RT.arccot", Arcsec: "RT.arcsec", Arccsc: "RT.arccsc",
  Sinh: "Math.sinh", Cosh: "Math.cosh", Tanh: "Math.tanh",
  Coth: "RT.coth", Sech: "RT.sech", Csch: "RT.csch",
  Arsinh: "Math.asinh", Arcsinh: "Math.asinh",
  Arcosh: "Math.acosh", Arccosh: "Math.acosh",
  Artanh: "Math.atanh", Arctanh: "Math.atanh",
  Exp: "Math.exp", Ln: "Math.log", Lb: "Math.log2", Lg: "Math.log10",
  Sqrt: "Math.sqrt", Abs: "Math.abs", Floor: "Math.floor", Ceil: "Math.ceil",
  Round: "RT.round", Sign: "RT.sign", Gamma: "RT.gamma", Factorial: "RT.factorial",
  Erf: "RT.erf",
};

class CompileError extends Error {}

// scope: Set of locally bound names. `used` collects free parameter names.
function gen(a, scope, used) {
  if (isNum(a)) return num(a);
  if (isSym(a)) {
    if (a in CONSTANTS) return num(CONSTANTS[a]);
    if (scope.has(a)) return id(a);
    used.add(a);
    return `P[${JSON.stringify(a)}]`;
  }
  if (!isArr(a)) throw new CompileError("Unsupported expression");
  const [h, ...r] = a;
  const g = (x, s = scope) => gen(x, s, used);

  if (SIMPLE[h]) {
    if (r.length !== 1) throw new CompileError(`${h} takes one argument`);
    return `${SIMPLE[h]}(${g(r[0])})`;
  }
  switch (h) {
    case "Add":
      return `(${r.map((x) => g(x)).join(" + ")})`;
    case "Subtract":
      return `(${g(r[0])} - ${g(r[1])})`;
    case "Negate":
      return `(-${g(r[0])})`;
    case "Multiply":
      return `(${r.map((x) => g(x)).join(" * ")})`;
    case "Divide":
      return `(${g(r[0])} / ${g(r[1])})`;
    case "Power": {
      const e = r[1];
      if (e === 2) return `((t) => t * t)(${g(r[0])})`;
      return `RT.pow(${g(r[0])}, ${g(e)})`;
    }
    case "Root":
      return `RT.root(${g(r[0])}, ${g(r[1])})`;
    case "Log":
      return r.length === 1 ? `Math.log10(${g(r[0])})` : `RT.log(${g(r[0])}, ${g(r[1])})`;
    case "Mod":
      return `RT.mod(${g(r[0])}, ${g(r[1])})`;
    case "Max":
      return `Math.max(${r.map((x) => g(x)).join(", ")})`;
    case "Min":
      return `Math.min(${r.map((x) => g(x)).join(", ")})`;
    case "Arctan2":
      return `Math.atan2(${g(r[0])}, ${g(r[1])})`;
    case "$Sum":
    case "$Prod": {
      const [, body, n, lo, hi] = a;
      if (lo === null || hi === null) throw new CompileError("Sums need lower and upper bounds");
      const fn = h === "$Sum" ? "sum" : "product";
      return `RT.${fn}(${g(lo)}, ${g(hi)}, (${id(n)}) => ${g(body, new Set([...scope, n]))})`;
    }
    case "$Int": {
      const [, body, v, lo, hi] = a;
      if (lo === null || hi === null) throw new CompileError("needs-symbolic:Indefinite integral");
      return `RT.integrate((${id(v)}) => ${g(body, new Set([...scope, v]))}, ${g(lo)}, ${g(hi)})`;
    }
    case "$Lim": {
      const [, body, v, to, dir] = a;
      return `RT.limit((${id(v)}) => ${g(body, new Set([...scope, v]))}, ${g(to)}, ${typeof dir === "number" ? dir : 0})`;
    }
    case "D": {
      const [, body, v] = a;
      try {
        return g(diff(body, v));
      } catch {
        return `RT.nderiv((${id(v)}) => ${g(body, new Set([...scope, v]))}, ${g(v)})`;
      }
    }
    default:
      throw new CompileError(`Unknown function ${h}`);
  }
}

// Returns { fn, used } where fn(...args) -> number, reading parameters from P.
export function compileAst(ast, argNames, P) {
  const used = new Set();
  const scope = new Set(argNames);
  const body = gen(ast, scope, used);
  const src = `"use strict"; return function (${argNames.map(id).join(", ")}) { return ${body}; };`;
  // eslint-disable-next-line no-new-func
  const fn = new Function("P", "RT", src)(P, RT);
  return { fn, used };
}

export { CompileError };
