// Resolves user definitions (functions, variables) and degree mode so the
// result only contains builtins, numbers and free parameters.
import { BUILTIN_FUNCS, INVTRIG, TRIG, isArr, isSym, substitute } from "./ast.js";

const DEG = ["Divide", "Pi", 180];
const RAD = ["Divide", 180, "Pi"];

export function inline(ast, ctx, bound = new Set(), stack = []) {
  const { funcs, vars, angle } = ctx;
  const go = (a, b = bound, s = stack) => inline(a, ctx, b, s);

  if (isSym(ast)) {
    if (bound.has(ast) || !vars.has(ast)) return ast;
    if (stack.includes(ast) || stack.length > 60) throw new Error(`Circular definition of ${ast}`);
    return go(vars.get(ast), bound, [...stack, ast]);
  }
  if (!isArr(ast)) return ast;

  const [h, ...r] = ast;

  if (h === "$Sum" || h === "$Prod" || h === "$Int") {
    const inner = new Set([...bound, ast[2]]);
    return [h, go(ast[1], inner), ast[2], ast[3] === null ? null : go(ast[3]), ast[4] === null ? null : go(ast[4])];
  }
  if (h === "$Lim") {
    return [h, go(ast[1], new Set([...bound, ast[2]])), ast[2], go(ast[3]), ast[4]];
  }
  if (h === "D") {
    return ["D", go(ast[1]), ast[2]];
  }

  if (isSym(h) && !BUILTIN_FUNCS.has(h)) {
    if (funcs.has(h) && !bound.has(h)) {
      const def = funcs.get(h);
      if (stack.includes(`${h}()`) || stack.length > 60) throw new Error(`Circular definition of ${h}`);
      if (def.params.length !== r.length) {
        throw new Error(`${h} takes ${def.params.length} argument${def.params.length === 1 ? "" : "s"}`);
      }
      const map = {};
      def.params.forEach((p, i) => (map[p] = r[i]));
      return go(substitute(def.body, map), bound, [...stack, `${h}()`]);
    }
    // `a(x+1)` with no function `a`: implicit multiplication.
    return go(["Multiply", h, ...r]);
  }

  const args = r.map((x) => go(x));
  if (angle === "deg") {
    if (TRIG.has(h)) return [h, ["Multiply", args[0], DEG]];
    if (INVTRIG.has(h) || h === "Arctan2") return ["Multiply", [h, ...args], RAD];
  }
  return [h, ...args];
}
