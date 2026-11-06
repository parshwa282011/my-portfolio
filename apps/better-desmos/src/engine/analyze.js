// Turns the list of expression rows into compiled, plottable objects.
//
//   analyze(rows, { angle, P }) -> { results: Map<rowId, Result>, params: Set<string> }
//
// P is a shared, mutable object of slider values. Compiled functions read from
// it, so moving a slider never needs a recompile.

import { CALCULUS, CONSTANTS, BUILTIN_FUNCS, freeSymbols, hasHead, isArr, isSym } from "./ast.js";
import { parseLatex } from "./parse.js";
import { inline } from "./inline.js";
import { compileAst, CompileError } from "./codegen.js";
import { expandDerivs, expandNabla, hasNabla } from "./vector.js";
import { simplify } from "./simplify.js";

export const RESERVED = new Set(["x", "y", "r", "theta", "t"]);
const RESERVED_3D = new Set(["x", "y", "z", "t", "u", "v"]);
const TWO_PI = 2 * Math.PI;

const has = (ast, name) => freeSymbols(ast).has(name);

function functionDef(ast) {
  if (!isArr(ast) || ast[0] !== "Equal") return null;
  const lhs = ast[1];
  if (!isArr(lhs) || !isSym(lhs[0]) || BUILTIN_FUNCS.has(lhs[0]) || lhs[0] in CONSTANTS) return null;
  const params = lhs.slice(1);
  if (!params.length || !params.every(isSym)) return null;
  return { name: lhs[0], params, body: ast[2] };
}

function variableDef(ast, reserved) {
  if (!isArr(ast) || ast[0] !== "Equal") return null;
  const [, lhs, rhs] = ast;
  if (!isSym(lhs) || reserved.has(lhs) || lhs in CONSTANTS) return null;
  if (isArr(rhs) && rhs[0] === "$Vec") return null; // named vector field, not a number
  const fs = freeSymbols(rhs);
  if (fs.has("x") || fs.has("y") || fs.has("z")) return null;
  return { name: lhs, body: rhs };
}

const INEQ = new Set(["Less", "LessEqual", "Greater", "GreaterEqual"]);

export function analyze(rows, { angle = "rad", P = {}, mode = "2d" } = {}) {
  const results = new Map();
  const params = new Set();
  const funcs = new Map();
  const vars = new Map();
  const ctx = { funcs, vars, angle, mode };
  const reserved = mode === "3d" ? RESERVED_3D : RESERVED;

  // ---- pass 1: parse + collect definitions ----
  const parsed = rows.map((row) => {
    const p = parseLatex(row.latex);
    const out = { row, ...p };
    if (p.ast) {
      const f = functionDef(p.ast);
      const v = f ? null : variableDef(p.ast, reserved);
      const def = f || v;
      if (def) {
        const dup = funcs.has(def.name) || vars.has(def.name);
        if (dup) out.error = `${def.name} is already defined`;
        else if (f) funcs.set(f.name, f);
        else vars.set(v.name, v.body);
        out.def = f ? { type: "function", ...f } : { type: "variable", ...v };
      }
    }
    return out;
  });

  const fail = (id, message) => results.set(id, { id, status: "error", error: message, kind: "error" });

  let deps = new Set(); // slider names the row being classified depends on
  const build = (ast, args) => {
    const inl = inline(ast, ctx);
    const { fn, used } = compileAst(inl, args, P);
    for (const n of used) {
      if (!args.includes(n)) {
        params.add(n);
        deps.add(n);
      }
    }
    return { fn, used, ast: inl };
  };

  // ---- pass 2: classify + compile ----
  for (const item of parsed) {
    const { row } = item;
    const id = row.id;
    if (item.empty) {
      results.set(id, { id, status: "empty", kind: "empty" });
      continue;
    }
    if (item.error) {
      fail(id, item.error);
      continue;
    }
    deps = new Set();
    try {
      if (hasNabla(item.ast)) {
        item.ast = expandNabla(item.ast, ctx); // ∇f, ∇·F, ∇×F, ∇²f
        item.nabla = true;
      }
      const res = mode === "3d" ? classify3(item, ctx, build, row) : classify(item, ctx, build, row);
      res.deps = [...deps];
      if (item.nabla) {
        res.calc = true;
        res.exact = item.ast;
      }
      attachExact(res, item, ctx);
      results.set(id, res);
    } catch (e) {
      if (e instanceof CompileError || e instanceof Error) {
        const m = e.message || "Could not evaluate";
        if (m.startsWith("needs-symbolic:")) {
          let symAst = null;
          try {
            symAst = inline(item.ast, ctx);
          } catch {
            /* reported below */
          }
          if (symAst) results.set(id, { id, status: "needs-symbolic", kind: "symbolic", note: m.slice(15), symAst });
          else fail(id, "Could not evaluate");
        } else fail(id, m);
      }
    }
  }

  return { results, params };
}

function classify(item, ctx, build, row) {
  const { ast } = item;
  const id = row.id;
  const base = { id, status: "ok", calc: hasHead(ast, CALCULUS) };
  const head = isArr(ast) ? ast[0] : null;

  if (item.def) {
    if (item.def.type === "function") {
      // Compile once to surface errors early (params become sliders).
      const args = item.def.params;
      build(item.def.body, args.length ? args : ["x"]);
      return { ...base, kind: "function", name: item.def.name, params: args };
    }
    const b = build(item.def.body, []);
    return { ...base, kind: "variable", name: item.def.name, value: () => b.fn(), symAst: b.ast };
  }

  if (head === "$Vec" || (head === "Equal" && isSym(ast[1]) && isArr(ast[2]) && ast[2][0] === "$Vec")) {
    const named = head === "Equal";
    return fieldResult(base, named ? ast[2] : ast, named ? ast[1] : null, 2, build);
  }

  if (head === "Equal") {
    let [, l, r] = ast;
    if (isSym(r) && !isSym(l) && (r === "y" || r === "x" || r === "r")) [l, r] = [r, l];
    if (l === "y" && !has(r, "y")) {
      const b = build(r, ["x"]);
      return { ...base, kind: "explicit", axis: "y", fn: b.fn, symAst: b.ast };
    }
    if (l === "x" && !has(r, "x")) {
      const b = build(r, ["y"]);
      return { ...base, kind: "explicit", axis: "x", fn: b.fn, symAst: b.ast };
    }
    if (l === "r" && !has(r, "r")) {
      const b = build(r, ["theta"]);
      const deg = ctx.angle === "deg";
      return {
        ...base,
        kind: "polar",
        fn: b.fn,
        // θ is measured in the active angle unit; 12π rad = 2160°
        range: [row.tmin ?? 0, row.tmax ?? (deg ? 2160 : 12 * Math.PI)],
        unit: deg ? Math.PI / 180 : 1,
        symAst: b.ast,
      };
    }
    const F = ["Subtract", l, r];
    const fs = freeSymbols(F);
    if (!fs.has("x") && !fs.has("y")) {
      throw new Error("This equation has no x or y to graph");
    }
    const b = build(F, ["x", "y"]);
    return { ...base, kind: "implicit", fn: b.fn, eq: [inline(l, ctx), inline(r, ctx)] };
  }

  if (INEQ.has(head)) {
    let [, a, b2] = ast;
    let op = head;
    if (head === "Greater") [a, b2, op] = [b2, a, "Less"];
    if (head === "GreaterEqual") [a, b2, op] = [b2, a, "LessEqual"];
    const b = build(["Subtract", a, b2], ["x", "y"]);
    return { ...base, kind: "inequality", fn: b.fn, strict: op === "Less" };
  }

  if (head === "Tuple") {
    if (ast.length !== 3) throw new Error("Only 2D points are supported in 2D mode");
    const sy = freeSymbols(inline(ast, ctx));
    if (!has(ast, "t") && (sy.has("x") || sy.has("y"))) return fieldResult(base, ast, null, 2, build);
    if (has(ast, "t")) {
      const bx = build(ast[1], ["t"]);
      const by = build(ast[2], ["t"]);
      return { ...base, kind: "parametric", fx: bx.fn, fy: by.fn, range: [row.tmin ?? 0, row.tmax ?? TWO_PI] };
    }
    const bx = build(ast[1], []);
    const by = build(ast[2], []);
    return { ...base, kind: "point", fx: bx.fn, fy: by.fn };
  }

  if (head === "List") {
    const pts = ast.slice(1);
    if (pts.length && pts.every((p) => isArr(p) && p[0] === "Tuple" && p.length === 3)) {
      const items = pts.map((p) => ({ fx: build(p[1], []).fn, fy: build(p[2], []).fn }));
      return { ...base, kind: "points", items };
    }
    throw new Error("Lists are only supported as lists of points, like [(1,2),(3,4)]");
  }

  // bare expression
  const pre = freeSymbols(inline(ast, ctx));
  if (pre.has("y")) {
    // f(x, y): nothing to draw on a plane, but it is a perfectly good surface
    // for 3D mode and it can still be differentiated, simplified, etc.
    const b = build(ast, ["x", "y"]);
    return { ...base, kind: "multivar", symAst: b.ast, scalarAst: b.ast, hint: "A function of x and y: switch to 3D to see it as z = f(x, y)." };
  }
  if (pre.has("x")) {
    const b = build(ast, ["x"]);
    return { ...base, kind: "explicit", axis: "y", fn: b.fn, symAst: b.ast };
  }
  const v = build(ast, []);
  return {
    ...base,
    kind: "value",
    value: () => v.fn(),
    symAst: v.ast,
    approx: hasHead(ast, new Set(["$Int", "$Lim"])),
  };
}

// ------------------------------------------------------------------ vectors
const VEC_ARGS = { 2: ["x", "y"], 3: ["x", "y", "z"] };

// ast: ["$Vec"|"Tuple", ...comps]; dim = dimension of the space the field lives in
function fieldResult(base, ast, name, dim, build) {
  const comps = ast.slice(1);
  if (comps.length < 2 || comps.length > 3) throw new Error("A vector has 2 or 3 components");
  if (dim === 2 && comps.length === 3) throw new Error("3-component vectors need 3D mode");
  const args = VEC_ARGS[dim];
  const built = comps.map((c) => build(c, args));
  const zero = () => 0;
  return {
    ...base,
    kind: "field",
    dim,
    name,
    vars: args,
    comps: built.map((b) => b.ast),
    fx: built[0].fn,
    fy: built[1].fn,
    fz: built[2] ? built[2].fn : zero,
    planar: comps.length === 2,
  };
}

// For rows that differentiate something: the symbolic result (no SymPy needed).
function attachExact(res, item, ctx) {
  if (res.status !== "ok" || !res.calc || !hasHead(item.ast, new Set(["D"]))) return;
  try {
    const inl = inline(item.ast, ctx);
    if (isArr(inl) && inl[0] === "Equal") return;
    const ex = simplify(expandDerivs(inl));
    if (!hasHead(ex, new Set(["D"]))) res.exact = ex;
  } catch {
    /* not differentiable symbolically: the numeric path still works */
  }
}

// ------------------------------------------------------------------ 3D
function classify3(item, ctx, build, row) {
  const { ast } = item;
  const id = row.id;
  const base = { id, status: "ok", calc: hasHead(ast, CALCULUS) };
  const head = isArr(ast) ? ast[0] : null;

  if (item.def) {
    if (item.def.type === "function") {
      const args = item.def.params;
      build(item.def.body, args.length ? args : ["x"]);
      return { ...base, kind: "function", name: item.def.name, params: args };
    }
    if (freeSymbols(item.def.body).has("theta")) throw new Error("Polar equations are drawn in 2D mode");
    const b = build(item.def.body, []);
    return { ...base, kind: "variable", name: item.def.name, value: () => b.fn(), symAst: b.ast };
  }

  const S = freeSymbols(inline(ast, ctx));
  const hasS = (n) => S.has(n);

  if (head === "$Vec" || (head === "Equal" && isSym(ast[1]) && isArr(ast[2]) && ast[2][0] === "$Vec")) {
    const named = head === "Equal";
    return fieldResult(base, named ? ast[2] : ast, named ? ast[1] : null, 3, build);
  }

  if (head === "Equal") {
    let [, l, r] = ast;
    if (isSym(r) && !isSym(l) && (r === "x" || r === "y" || r === "z")) [l, r] = [r, l];
    if (l === "r") throw new Error("Polar equations are drawn in 2D mode");
    const axes = { z: ["x", "y"], y: ["x", "z"], x: ["y", "z"] };
    if (typeof l === "string" && axes[l] && !has(r, l)) {
      const args = axes[l];
      const b = build(r, args);
      return { ...base, kind: "surface", axis: l, args, fn: b.fn, symAst: b.ast, scalarAst: l === "z" ? b.ast : null };
    }
    const F = ["Subtract", l, r];
    const fs = freeSymbols(inline(F, ctx));
    if (!fs.has("x") && !fs.has("y") && !fs.has("z")) throw new Error("This equation has no x, y or z to graph");
    const b = build(F, ["x", "y", "z"]);
    return { ...base, kind: "implicit3", fn: b.fn, scalarAst: b.ast, eq: [inline(l, ctx), inline(r, ctx)] };
  }

  if (INEQ.has(head)) throw new Error("Inequalities are drawn in 2D mode only");

  if (head === "Tuple") {
    const n = ast.length - 1;
    if (n < 2 || n > 3) throw new Error("Use 2 or 3 coordinates");
    if (hasS("t")) {
      const bx = build(ast[1], ["t"]);
      const by = build(ast[2], ["t"]);
      const bz = n === 3 ? build(ast[3], ["t"]) : null;
      return {
        ...base,
        kind: "curve3",
        fx: bx.fn,
        fy: by.fn,
        fz: bz ? bz.fn : () => 0,
        range: [row.tmin ?? 0, row.tmax ?? TWO_PI],
      };
    }
    if (n === 3 && (hasS("u") || hasS("v"))) {
      const args = ["u", "v"];
      const bx = build(ast[1], args);
      const by = build(ast[2], args);
      const bz = build(ast[3], args);
      return {
        ...base,
        kind: "psurface",
        fx: bx.fn,
        fy: by.fn,
        fz: bz.fn,
        urange: [row.umin ?? 0, row.umax ?? TWO_PI],
        vrange: [row.vmin ?? 0, row.vmax ?? TWO_PI],
      };
    }
    if (hasS("x") || hasS("y") || hasS("z")) return fieldResult(base, ast, null, 3, build);
    const bx = build(ast[1], []);
    const by = build(ast[2], []);
    const bz = n === 3 ? build(ast[3], []) : null;
    return { ...base, kind: "point3", fx: bx.fn, fy: by.fn, fz: bz ? bz.fn : () => 0 };
  }

  if (head === "List") {
    const pts = ast.slice(1);
    if (pts.length && pts.every((p) => isArr(p) && p[0] === "Tuple" && p.length >= 3 && p.length <= 4)) {
      const items = pts.map((p) => ({
        fx: build(p[1], []).fn,
        fy: build(p[2], []).fn,
        fz: p[3] !== undefined ? build(p[3], []).fn : () => 0,
      }));
      return { ...base, kind: "points3", items };
    }
    throw new Error("Lists are only supported as lists of points, like [(1,2,3),(3,4,5)]");
  }

  // bare expression
  if (hasS("z")) {
    // a scalar field f(x,y,z): nothing to draw by itself, but it can be differentiated,
    // and f = c draws a level surface
    const b = build(ast, ["x", "y", "z"]);
    return {
      ...base,
      kind: "multivar",
      symAst: b.ast,
      scalarAst: b.ast,
      hint: "A function of x, y and z. Set it equal to a number (f = 1) to draw that level surface, or use ∇f.",
    };
  }
  if (hasS("x") || hasS("y")) {
    const b = build(ast, ["x", "y"]);
    return { ...base, kind: "surface", axis: "z", args: ["x", "y"], fn: b.fn, symAst: b.ast, scalarAst: b.ast };
  }
  const v = build(ast, []);
  return { ...base, kind: "value", value: () => v.fn(), symAst: v.ast, approx: hasHead(ast, new Set(["$Int", "$Lim"])) };
}
