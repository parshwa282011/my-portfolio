// Vector calculus on component ASTs (all symbolic, no SymPy needed).
import { isArr } from "./ast.js";
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
