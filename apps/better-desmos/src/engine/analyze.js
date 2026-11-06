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

export const RESERVED = new Set(["x", "y", "r", "theta", "t"]);
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

function variableDef(ast) {
  if (!isArr(ast) || ast[0] !== "Equal") return null;
  const [, lhs, rhs] = ast;
  if (!isSym(lhs) || RESERVED.has(lhs) || lhs in CONSTANTS) return null;
  const fs = freeSymbols(rhs);
  if (fs.has("x") || fs.has("y")) return null;
  return { name: lhs, body: rhs };
}

const INEQ = new Set(["Less", "LessEqual", "Greater", "GreaterEqual"]);

export function analyze(rows, { angle = "rad", P = {} } = {}) {
  const results = new Map();
  const params = new Set();
  const funcs = new Map();
  const vars = new Map();
  const ctx = { funcs, vars, angle };

  // ---- pass 1: parse + collect definitions ----
  const parsed = rows.map((row) => {
    const p = parseLatex(row.latex);
    const out = { row, ...p };
    if (p.ast) {
      const f = functionDef(p.ast);
      const v = f ? null : variableDef(p.ast);
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

  const build = (ast, args) => {
    const inl = inline(ast, ctx);
    const { fn, used } = compileAst(inl, args, P);
    for (const n of used) if (!args.includes(n)) params.add(n);
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
    try {
      results.set(id, classify(item, ctx, build, row));
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
  if (pre.has("y")) throw new Error("Write this as an equation, like y = …");
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
