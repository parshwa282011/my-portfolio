// A small algebraic simplifier for DISPLAY purposes (derivative results etc.).
// It is never used for plotting, so a conservative rewrite is fine.
//
//   Multiply: flatten, merge equal bases (x·x² -> x³), gather numeric coefficient
//   Add:      flatten, combine like terms, fold constants
//   Power:    x^1 -> x, x^0 -> 1, (x^a)^n -> x^(a·n)
//
// Output uses only Add / Multiply / Divide / Negate / Power plus the input's
// function heads, with negative terms expressed as Negate(term).
import { isArr, isNum, isSym } from "./ast.js";

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const key = (a) => JSON.stringify(a);

// rational coefficient: { n, d } (ints) or { f } (float fallback)
const R = (n, d = 1) => {
  const g = gcd(n, d) || 1;
  return d < 0 ? { n: -n / g, d: -d / g } : { n: n / g, d: d / g };
};
const rmul = (a, b) => {
  if (a.f !== undefined || b.f !== undefined) return { f: val(a) * val(b) };
  return R(a.n * b.n, a.d * b.d);
};
const val = (r) => (r.f !== undefined ? r.f : r.n / r.d);
const fromNum = (x) => (Number.isInteger(x) && Math.abs(x) < 2 ** 40 ? R(x) : { f: x });

export function simplify(a) {
  if (!isArr(a)) return a;
  const [h, ...r] = a;
  switch (h) {
    case "Negate":
      return mulN([-1, simplify(r[0])]);
    case "Subtract":
      return addN([simplify(r[0]), mulN([-1, simplify(r[1])])]);
    case "Add":
      return addN(r.map(simplify));
    case "Multiply":
      return mulN(r.map(simplify));
    case "Divide":
      return mulN([["Divide", simplify(r[0]), simplify(r[1])]]);
    case "Power":
      return powN(simplify(r[0]), simplify(r[1]));
    case "Sqrt": {
      const x = simplify(r[0]);
      return isNum(x) && x >= 0 && Number.isInteger(Math.sqrt(x)) ? Math.sqrt(x) : ["Sqrt", x];
    }
    case "Exp": {
      const x = simplify(r[0]);
      return x === 0 ? 1 : ["Exp", x];
    }
    case "Sin":
    case "Tan": {
      const x = simplify(r[0]);
      return x === 0 ? 0 : [h, x];
    }
    case "Cos": {
      const x = simplify(r[0]);
      return x === 0 ? 1 : ["Cos", x];
    }
    case "Ln": {
      const x = simplify(r[0]);
      return x === 1 ? 0 : x === "ExponentialE" ? 1 : ["Ln", x];
    }
    default:
      return [h, ...r.map((x) => (isArr(x) ? simplify(x) : x))];
  }
}

// ---------------------------------------------------------------- power
function powN(b, e) {
  if (isNum(e)) {
    if (e === 0) return 1;
    if (e === 1) return b;
    if (isNum(b)) {
      if (Number.isInteger(e) && e > 0 && Math.abs(b) ** e < 2 ** 40) return b ** e;
      return ["Power", b, e];
    }
    if (isArr(b) && b[0] === "Power" && isNum(b[2]) && Number.isInteger(e)) return powN(b[1], b[2] * e);
  }
  if (b === 1) return 1;
  return ["Power", b, e];
}

// ---------------------------------------------------------------- multiply
// -> { coef: rational, factors: Map<key, {base, exp}> }
const rinv = (r) => (r.f !== undefined ? { f: 1 / r.f } : r.n === 0 ? { f: Infinity } : R(r.d, r.n));

function collect(list, state, inv = false) {
  const times = (c) => (state.coef = rmul(state.coef, inv ? rinv(c) : c));
  for (const f of list) {
    if (isNum(f)) {
      times(fromNum(f));
    } else if (isArr(f) && f[0] === "Multiply") {
      collect(f.slice(1), state, inv);
    } else if (isArr(f) && f[0] === "Negate") {
      times(R(-1));
      collect([f[1]], state, inv);
    } else if (isArr(f) && f[0] === "Divide") {
      collect([f[1]], state, inv);
      collect([f[2]], state, !inv);
    } else {
      let [base, exp] = isArr(f) && f[0] === "Power" && isNum(f[2]) ? [f[1], f[2]] : [f, 1];
      if (inv) exp = -exp;
      if (isNum(base) && Number.isInteger(base) && Number.isInteger(exp) && Math.abs(base) ** Math.abs(exp) < 2 ** 40 && base !== 0) {
        state.coef = rmul(state.coef, exp >= 0 ? R(base ** exp) : R(1, base ** -exp));
        continue;
      }
      const k = key(base);
      const cur = state.factors.get(k);
      if (cur) cur.exp += exp;
      else state.factors.set(k, { base, exp });
    }
  }
}

function mulN(list) {
  const st = { coef: R(1), factors: new Map() };
  collect(list, st);
  return build(st.coef, [...st.factors.values()]);
}

function build(coef, facs) {
  if (val(coef) === 0) return 0;
  facs = facs.filter((f) => f.exp !== 0);
  // symbols first (alphabetical), then everything else in the order met
  const rank = (f) => (isSym(f.base) ? 0 : 1);
  facs = facs
    .map((f, i) => ({ ...f, i }))
    .sort((p, q) => rank(p) - rank(q) || (rank(p) === 0 ? (p.base < q.base ? -1 : p.base > q.base ? 1 : 0) : p.i - q.i));
  const numer = [];
  const denom = [];
  for (const f of facs) {
    if (f.exp > 0) numer.push(f.exp === 1 ? f.base : ["Power", f.base, f.exp]);
    else denom.push(f.exp === -1 ? f.base : ["Power", f.base, -f.exp]);
  }
  const neg = val(coef) < 0;
  let top;
  let bottom;
  let cn;
  let cd = 1;
  if (coef.f !== undefined) {
    cn = Math.abs(coef.f);
  } else {
    cn = Math.abs(coef.n);
    cd = coef.d;
  }
  const mk = (c, xs) => {
    const parts = c !== 1 || !xs.length ? [c, ...xs] : xs;
    return parts.length === 1 ? parts[0] : ["Multiply", ...parts];
  };
  top = mk(cn, numer);
  bottom = cd !== 1 || denom.length ? mk(cd, denom) : null;
  let out = bottom === null ? top : ["Divide", top, bottom];
  if (neg) out = isNum(out) ? -out : ["Negate", out];
  return out;
}

// ---------------------------------------------------------------- add
function splitTerm(t) {
  // -> { coef (float), rest (ast | null) }
  if (isNum(t)) return { coef: t, rest: null };
  if (isArr(t) && t[0] === "Negate") {
    const s = splitTerm(t[1]);
    return { coef: -s.coef, rest: s.rest };
  }
  if (isArr(t) && t[0] === "Divide" && isNum(t[2])) {
    const s = splitTerm(t[1]);
    return { coef: s.coef / t[2], rest: s.rest, den: t[2], numCoef: s.coef };
  }
  if (isArr(t) && t[0] === "Multiply" && isNum(t[1])) {
    const restList = t.slice(2);
    return { coef: t[1], rest: restList.length === 1 ? restList[0] : ["Multiply", ...restList] };
  }
  return { coef: 1, rest: t };
}

function addN(list) {
  const flat = [];
  const walk = (x) => {
    if (isArr(x) && x[0] === "Add") x.slice(1).forEach(walk);
    else flat.push(x);
  };
  list.forEach(walk);
  const order = [];
  const map = new Map();
  let constant = 0;
  for (const t of flat) {
    const { coef, rest } = splitTerm(t);
    if (rest === null) {
      constant += coef;
      continue;
    }
    const k = key(rest);
    if (map.has(k)) map.get(k).coef += coef;
    else {
      const e = { coef, rest };
      map.set(k, e);
      order.push(e);
    }
  }
  const terms = [];
  for (const { coef, rest } of order) {
    if (Math.abs(coef) < 1e-12) continue;
    const st = { coef: fromNum(coef), factors: new Map() };
    collect([rest], st);
    terms.push(build(st.coef, [...st.factors.values()]));
  }
  if (Math.abs(constant) > 1e-12) terms.push(Number(constant.toPrecision(12)));
  if (!terms.length) return 0;
  // lead with a positive term when there is one:  1 - x²  rather than  -x² + 1
  const isNeg = (t) => (isNum(t) ? t < 0 : isArr(t) && t[0] === "Negate");
  if (terms.length > 1 && isNeg(terms[0])) {
    const i = terms.findIndex((t) => !isNeg(t));
    if (i > 0) terms.unshift(...terms.splice(i, 1));
  }
  return terms.length === 1 ? terms[0] : ["Add", ...terms];
}
