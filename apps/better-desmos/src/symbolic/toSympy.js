// Normalized + inlined MathJSON -> a Python expression string for SymPy.
// Symbols are always emitted as _S("name"), so user names can never clash with
// SymPy builtins or inject code.

import { CONSTANTS, isArr, isNum, isSym } from "../engine/ast.js";

const FN = {
  Sin: "sin", Cos: "cos", Tan: "tan", Cot: "cot", Sec: "sec", Csc: "csc",
  Arcsin: "asin", Arccos: "acos", Arctan: "atan", Arccot: "acot", Arcsec: "asec", Arccsc: "acsc",
  Sinh: "sinh", Cosh: "cosh", Tanh: "tanh", Coth: "coth", Sech: "sech", Csch: "csch",
  Arsinh: "asinh", Arcsinh: "asinh", Arcosh: "acosh", Arccosh: "acosh", Artanh: "atanh", Arctanh: "atanh",
  Exp: "exp", Ln: "log", Sqrt: "sqrt", Abs: "Abs", Floor: "floor", Ceil: "ceiling",
  Sign: "sign", Gamma: "gamma", Factorial: "factorial", Erf: "erf",
  Max: "Max", Min: "Min", Mod: "Mod", Arctan2: "atan2",
};

const CONST = { Pi: "pi", ExponentialE: "E", PositiveInfinity: "oo", NegativeInfinity: "(-oo)" };

const lit = (n) => {
  if (Number.isInteger(n)) return `Integer(${n})`;
  if (!Number.isFinite(n)) throw new Error("Unsupported number");
  return `Rational(${JSON.stringify(String(n))})`;
};

export function toSympy(a) {
  const t = toSympy;
  if (isNum(a)) return lit(a);
  if (isSym(a)) {
    if (a in CONST) return CONST[a];
    if (a in CONSTANTS) throw new Error(`Unsupported constant ${a}`);
    return `_S(${JSON.stringify(a)})`;
  }
  if (!isArr(a)) throw new Error("Unsupported expression");
  const [h, ...r] = a;
  if (FN[h]) return `${FN[h]}(${r.map(t).join(", ")})`;
  switch (h) {
    case "Add":
      return `(${r.map(t).join(" + ")})`;
    case "Subtract":
      return `(${t(r[0])} - ${t(r[1])})`;
    case "Negate":
      return `(-${t(r[0])})`;
    case "Multiply":
      return `(${r.map(t).join(" * ")})`;
    case "Divide":
      return `(${t(r[0])} / ${t(r[1])})`;
    case "Power":
      return `(${t(r[0])} ** ${t(r[1])})`;
    case "Root":
      return `real_root(${t(r[0])}, ${t(r[1])})`;
    case "Log":
      return r.length === 1 ? `log(${t(r[0])}, 10)` : `log(${t(r[0])}, ${t(r[1])})`;
    case "Lb":
      return `log(${t(r[0])}, 2)`;
    case "Lg":
      return `log(${t(r[0])}, 10)`;
    case "Round":
      return `floor(${t(r[0])} + Rational(1, 2))`;
    case "$Sum":
    case "$Prod": {
      const [, body, n, lo, hi] = a;
      if (lo === null || hi === null) throw new Error("Sums need bounds");
      return `${h === "$Sum" ? "Sum" : "Product"}(${t(body)}, (_S(${JSON.stringify(n)}), ${t(lo)}, ${t(hi)}))`;
    }
    case "$Int": {
      const [, body, v, lo, hi] = a;
      const x = `_S(${JSON.stringify(v)})`;
      return lo === null || hi === null ? `Integral(${t(body)}, ${x})` : `Integral(${t(body)}, (${x}, ${t(lo)}, ${t(hi)}))`;
    }
    case "$Lim": {
      const [, body, v, to, dir] = a;
      const d = dir > 0 ? "'+'" : dir < 0 ? "'-'" : "'+-'";
      return `Limit(${t(body)}, _S(${JSON.stringify(v)}), ${t(to)}, ${d})`;
    }
    case "D": {
      const [, body, v] = a;
      return `Derivative(${t(body)}, _S(${JSON.stringify(v)}))`;
    }
    default:
      throw new Error(`${h} is not supported by the symbolic engine`);
  }
}
