// Vector calculus on component ASTs (all symbolic, no SymPy needed).
import { BUILTIN_FUNCS, CONSTANTS, freeSymbols, hasHead, isArr, isSym } from "./ast.js";
import { inline } from "./inline.js";
import { diff } from "./diff.js";
import { simplify } from "./simplify.js";

// Replace every D(...) node by its derivative. Throws if one cannot be taken.
export function expandDerivs(ast) {
  if (!isArr(ast)) return ast;
  if (ast[0] === "D") return diff(expandDerivs(ast[1]), ast[2]);
  return [ast[0], ...ast.slice(1).map((x) => (isArr(x) ? expandDerivs(x) : x))];
}

const sum = (terms) => simplify(terms.length === 1 ? terms[0] : ["Add", ...terms]);

export const gradient = (f, vars) => vars.map((v) => simplify(diff(f, v)));

export const divergence = (comps, vars) => sum(comps.map((c, i) => diff(c, vars[i])));

// 2 components -> scalar (∂Q/∂x − ∂P/∂y); 3 components -> vector
export function curl(comps, vars) {
  if (comps.length === 2) {
    const [P, Q] = comps;
    return simplify(["Subtract", diff(Q, vars[0]), diff(P, vars[1])]);
  }
  const [P, Q, Rr] = comps;
  const [x, y, z] = vars;
  return [
    simplify(["Subtract", diff(Rr, y), diff(Q, z)]),
    simplify(["Subtract", diff(P, z), diff(Rr, x)]),
    simplify(["Subtract", diff(Q, x), diff(P, y)]),
  ];
}

// ------------------------------------------------------------------ ∇ operators
const NABLA_HEAD = new Set(["$Nabla"]);

// Replaces every ["$Nabla", op, negated, operand] by the symbolic result.
// ctx: { funcs, vars, angle, mode }.  The result is fully inlined.
export function expandNabla(ast, ctx) {
  if (!isArr(ast)) return ast;
  if (ast[0] !== "$Nabla") return [ast[0], ...ast.slice(1).map((x) => (isArr(x) ? expandNabla(x, ctx) : x))];

  const op = String(ast[1]).replace(/'/g, "");
  const negated = ast[2] === 1;
  let arg = expandNabla(ast[3], ctx); // ∇·∇f, ∇×∇f, ...
  checkDefined(arg, ctx);
  // "∇f" where f is a function name: call it with x, y, (z)
  if (isSym(arg) && ctx.funcs.has(arg)) {
    const n = ctx.funcs.get(arg).params.length;
    arg = [arg, ...["x", "y", "z", "w"].slice(0, n)];
  }
  arg = inline(arg, ctx);

  const free = freeSymbols(arg);
  const vars = ctx.mode === "4d" || free.has("w") ? ["x", "y", "z", "w"] : ctx.mode === "3d" || free.has("z") ? ["x", "y", "z"] : ["x", "y"];
  const neg = (a) => (negated ? simplify(["Negate", a]) : a);
  const comps = isArr(arg) && (arg[0] === "$Vec" || arg[0] === "Tuple") ? arg.slice(1) : null;

  try {
    if (op === "grad") {
      if (comps) throw new Error("∇ of a vector: use ∇·F for divergence or ∇×F for curl");
      return ["$Vec", ...gradient(arg, vars).map(neg)];
    }
    if (op === "lap") {
      if (comps) throw new Error("∇² needs a scalar function");
      return neg(simplify(["Add", ...vars.map((v) => diff(diff(arg, v), v))]));
    }
    if (!comps) throw new Error(`∇${op === "div" ? "·" : "×"} needs a vector, like ⟨P,Q,R⟩`);
    if (comps.length < 2 || comps.length > 4) throw new Error("A vector has 2, 3 or 4 components");
    const vs = ["x", "y", "z", "w"].slice(0, comps.length);
    if (op === "div") return neg(divergence(comps, vs));
    if (comps.length === 4) throw new Error("Curl needs 2 or 3 components");
    const c = curl(comps, vs);
    return comps.length === 3 ? ["$Vec", ...c.map(neg)] : neg(c);
  } catch (e) {
    if (/Cannot differentiate/.test(e.message)) throw new Error(`${e.message} (∇ needs a closed form)`);
    throw e;
  }
}

export const hasNabla = (ast) => hasHead(ast, NABLA_HEAD);

// `∇f(x,y,z)` with no f defined would silently become f·x·y·z: say so instead.
function checkDefined(arg, ctx) {
  const undefinedName = (name) => new Error(`${name} is not defined yet. Add a row like ${name}(x,y,z)=…`);
  if (isSym(arg) && arg.length === 1 && !"xyz".includes(arg) && !ctx.funcs.has(arg) && !ctx.vars.has(arg) && !(arg in CONSTANTS)) throw undefinedName(arg);
  if (isArr(arg) && isSym(arg[0]) && !BUILTIN_FUNCS.has(arg[0]) && !(arg[0] in CONSTANTS) && !ctx.funcs.has(arg[0])) throw undefinedName(arg[0]);
}
