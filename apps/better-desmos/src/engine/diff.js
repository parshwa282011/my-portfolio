// Symbolic differentiation over normalized MathJSON. Radians only: the degree
// handling happens earlier, in inline.js, by rewriting trig arguments.
import { isArr, isNum, isSym, freeSymbols } from "./ast.js";

const mul = (a, b) => {
  if (a === 0 || b === 0) return 0;
  if (a === 1) return b;
  if (b === 1) return a;
  if (isNum(a) && isNum(b)) return a * b;
  return ["Multiply", a, b];
};
const add = (a, b) => {
  if (a === 0) return b;
  if (b === 0) return a;
  if (isNum(a) && isNum(b)) return a + b;
  return ["Add", a, b];
};
const neg = (a) => (a === 0 ? 0 : isNum(a) ? -a : ["Negate", a]);
const div = (a, b) => (a === 0 ? 0 : b === 1 ? a : ["Divide", a, b]);
const pow = (a, n) => (n === 1 ? a : n === 0 ? 1 : ["Power", a, n]);
const call = (h, ...args) => [h, ...args];

const dependsOn = (a, v) => freeSymbols(a).has(v);

export function diff(a, v) {
  if (isNum(a)) return 0;
  if (isSym(a)) return a === v ? 1 : 0;
  if (!isArr(a)) return 0;
  if (!dependsOn(a, v)) return 0;
  const [h, ...r] = a;
  const u = r[0];
  const du = () => diff(u, v);
  switch (h) {
    case "Add":
      return r.map((t) => diff(t, v)).reduce(add, 0);
    case "Subtract":
      return add(diff(r[0], v), neg(diff(r[1], v)));
    case "Negate":
      return neg(du());
    case "Multiply": {
      let total = 0;
      for (let i = 0; i < r.length; i++) {
        const term = r.reduce((acc, f, j) => mul(acc, j === i ? diff(f, v) : f), 1);
        total = add(total, term);
      }
      return total;
    }
    case "Divide": {
      const [p, q] = r;
      return div(add(mul(diff(p, v), q), neg(mul(p, diff(q, v)))), pow(q, 2));
    }
    case "Power": {
      const [b, e] = r;
      if (!dependsOn(e, v)) return mul(mul(e, call("Power", b, isNum(e) ? e - 1 : ["Subtract", e, 1])), diff(b, v));
      if (!dependsOn(b, v)) return mul(mul(a, call("Ln", b)), diff(e, v));
      return mul(a, add(mul(diff(e, v), call("Ln", b)), div(mul(e, diff(b, v)), b)));
    }
    case "Sqrt":
      return div(du(), mul(2, a));
    case "Root": {
      const n = r[1];
      return mul(div(a, mul(n, u)), du());
    }
    case "Exp":
      return mul(a, du());
    case "Ln":
      return div(du(), u);
    case "Log": {
      const base = r[1];
      const ln = base === undefined ? call("Ln", 10) : call("Ln", base);
      return div(du(), mul(u, ln));
    }
    case "Lb":
      return div(du(), mul(u, call("Ln", 2)));
    case "Lg":
      return div(du(), mul(u, call("Ln", 10)));
    case "Sin":
      return mul(call("Cos", u), du());
    case "Cos":
      return neg(mul(call("Sin", u), du()));
    case "Tan":
      return div(du(), pow(call("Cos", u), 2));
    case "Cot":
      return neg(div(du(), pow(call("Sin", u), 2)));
    case "Sec":
      return mul(mul(call("Sec", u), call("Tan", u)), du());
    case "Csc":
      return neg(mul(mul(call("Csc", u), call("Cot", u)), du()));
    case "Arcsin":
      return div(du(), call("Sqrt", ["Subtract", 1, pow(u, 2)]));
    case "Arccos":
      return neg(div(du(), call("Sqrt", ["Subtract", 1, pow(u, 2)])));
    case "Arctan":
      return div(du(), ["Add", 1, pow(u, 2)]);
    case "Sinh":
      return mul(call("Cosh", u), du());
    case "Cosh":
      return mul(call("Sinh", u), du());
    case "Tanh":
      return div(du(), pow(call("Cosh", u), 2));
    case "Arsinh":
    case "Arcsinh":
      return div(du(), call("Sqrt", ["Add", pow(u, 2), 1]));
    case "Arcosh":
    case "Arccosh":
      return div(du(), call("Sqrt", ["Subtract", pow(u, 2), 1]));
    case "Artanh":
    case "Arctanh":
      return div(du(), ["Subtract", 1, pow(u, 2)]);
    case "Abs":
      return mul(call("Sign", u), du());
    case "Erf":
      return mul(div(2, call("Sqrt", "Pi")), mul(call("Exp", neg(pow(u, 2))), du()));
    case "Max":
    case "Min":
    case "Floor":
    case "Ceil":
    case "Round":
    case "Sign":
    case "Mod":
      return 0; // piecewise constant (a.e.)
    default:
      throw new Error(`Cannot differentiate ${h} symbolically`);
  }
}
