// MathJSON helpers. Everything downstream works on the "normalized" form
// produced by normalize(): wrappers stripped, calculus binders flattened to
//   ["$Sum"|"$Prod", body, index, lo, hi]
//   ["$Int", body, variable, lo|null, hi|null]
//   ["$Lim", body, variable, to, direction]
//   ["D", body, variable]          (higher / mixed partials are nested D's)
//   ["$Vec", ...components]        (angle-bracket vector  <P, Q, R>)

export const CONSTANTS = {
  Pi: Math.PI,
  ExponentialE: Math.E,
  PositiveInfinity: Infinity,
  NegativeInfinity: -Infinity,
  Nothing: NaN,
};

export const isArr = Array.isArray;
export const isNum = (a) => typeof a === "number";
export const isSym = (a) => typeof a === "string" && !a.startsWith("'");
export const head = (a) => (isArr(a) ? a[0] : null);

// Heads that are language builtins (not user functions / implicit products).
export const BUILTIN_FUNCS = new Set([
  "Add", "Subtract", "Negate", "Multiply", "Divide", "Power", "Sqrt", "Root",
  "Sin", "Cos", "Tan", "Cot", "Sec", "Csc",
  "Arcsin", "Arccos", "Arctan", "Arctan2", "Arccot", "Arcsec", "Arccsc",
  "Sinh", "Cosh", "Tanh", "Coth", "Sech", "Csch",
  "Arsinh", "Arcosh", "Artanh", "Arcsinh", "Arccosh", "Arctanh",
  "Exp", "Ln", "Log", "Lb", "Lg", "Abs", "Floor", "Ceil", "Round", "Sign",
  "Max", "Min", "Mod", "Gamma", "Factorial", "Erf", "Square",
  "$Sum", "$Prod", "$Int", "$Lim", "$Vec", "$Nabla", "D", "Tuple", "List", "Equal", "Less",
  "LessEqual", "Greater", "GreaterEqual",
]);

export const TRIG = new Set(["Sin", "Cos", "Tan", "Cot", "Sec", "Csc"]);
export const INVTRIG = new Set(["Arcsin", "Arccos", "Arctan", "Arccot", "Arcsec", "Arccsc"]);

const limitsOf = (lim) => {
  // ["Limits", n, lo, hi]  (canonical) or ["Tuple", n, lo, hi]
  if (isArr(lim) && (lim[0] === "Limits" || lim[0] === "Tuple")) {
    const [, n, lo, hi] = lim;
    return [n, lo === "Nothing" || lo === undefined ? null : lo, hi === "Nothing" || hi === undefined ? null : hi];
  }
  return [lim, null, null];
};

export function normalize(a) {
  if (!isArr(a)) {
    if (a && typeof a === "object") {
      if ("num" in a) return Number(a.num);
      if ("sym" in a) return a.sym;
      if ("str" in a) return `'${a.str}'`;
    }
    return a;
  }
  const [h, ...r] = a;
  switch (h) {
    case "Function":
    case "Block":
      return normalize(r[0]);
    case "Delimiter": {
      const inner = r[0];
      if (isArr(inner) && inner[0] === "Sequence") return normalize(["Tuple", ...inner.slice(1)]);
      return normalize(inner);
    }
    case "Rational":
      return ["Divide", normalize(r[0]), normalize(r[1])];
    case "Square":
      return ["Power", normalize(r[0]), 2];
    case "Sum":
    case "Product": {
      const [n, lo, hi] = limitsOf(r[1]);
      return [h === "Sum" ? "$Sum" : "$Prod", normalize(r[0]), n, lo === null ? null : normalize(lo), hi === null ? null : normalize(hi)];
    }
    case "Integrate": {
      const [v, lo, hi] = limitsOf(r[1]);
      return ["$Int", normalize(r[0]), v, lo === null ? null : normalize(lo), hi === null ? null : normalize(hi)];
    }
    case "Limit": {
      const fn = r[0];
      const v = isArr(fn) && fn[0] === "Function" ? fn[2] : "x";
      return ["$Lim", normalize(fn), v, normalize(r[1]), r[2] === undefined ? 0 : normalize(r[2])];
    }
    case "D": {
      // d²/dxdy f  ->  D(D(f, y), x)
      let out = normalize(r[0]);
      for (const v of r.slice(1)) out = ["D", out, v];
      return out;
    }
    case "AngleBracket":
      return ["$Vec", ...r.map(normalize)];
    case "Error":
      return a; // surfaced by findError
    default:
      return [h, ...r.map(normalize)];
  }
}

export function findError(a) {
  if (!isArr(a)) return null;
  if (a[0] === "Error") {
    const code = a[1];
    const text = isArr(code) ? String(code[1] ?? "").replace(/'/g, "") : String(code ?? "").replace(/'/g, "");
    return text || "Syntax error";
  }
  for (let i = 1; i < a.length; i++) {
    const e = findError(a[i]);
    if (e) return e;
  }
  return null;
}

// Symbols that appear free in `a` (binder variables excluded, constants excluded).
export function freeSymbols(a, bound = new Set(), out = new Set()) {
  if (isSym(a)) {
    if (!(a in CONSTANTS) && !bound.has(a)) out.add(a);
    return out;
  }
  if (!isArr(a)) return out;
  const h = a[0];
  if (h === "$Sum" || h === "$Prod") {
    freeSymbols(a[3], bound, out);
    freeSymbols(a[4], bound, out);
    freeSymbols(a[1], new Set([...bound, a[2]]), out);
  } else if (h === "$Int") {
    freeSymbols(a[3], bound, out);
    freeSymbols(a[4], bound, out);
    freeSymbols(a[1], new Set([...bound, a[2]]), out);
  } else if (h === "$Lim") {
    freeSymbols(a[3], bound, out);
    freeSymbols(a[1], new Set([...bound, a[2]]), out);
  } else {
    // function-call heads that are symbols (user funcs / implicit products)
    if (isSym(h) && !BUILTIN_FUNCS.has(h) && !(h in CONSTANTS) && !bound.has(h)) out.add(h);
    for (let i = 1; i < a.length; i++) freeSymbols(a[i], bound, out);
  }
  return out;
}

export function substitute(a, map) {
  if (isSym(a)) return a in map ? map[a] : a;
  if (!isArr(a)) return a;
  const h = a[0];
  if (h === "$Sum" || h === "$Prod" || h === "$Int") {
    const inner = { ...map };
    delete inner[a[2]];
    return [h, substitute(a[1], inner), a[2], a[3] === null ? null : substitute(a[3], map), a[4] === null ? null : substitute(a[4], map)];
  }
  if (h === "$Lim") {
    const inner = { ...map };
    delete inner[a[2]];
    return [h, substitute(a[1], inner), a[2], substitute(a[3], map), a[4]];
  }
  return [h, ...a.slice(1).map((x) => substitute(x, map))];
}

export const hasHead = (a, names) => {
  if (!isArr(a)) return false;
  if (names.has(a[0])) return true;
  for (let i = 1; i < a.length; i++) if (hasHead(a[i], names)) return true;
  return false;
};

export const CALCULUS = new Set(["D", "$Int", "$Lim", "$Sum", "$Prod", "$Nabla"]);
