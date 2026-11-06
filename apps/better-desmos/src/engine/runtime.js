// Numeric helpers referenced by generated code (as RT.*).

const G = 7;
const LG = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function gamma(z) {
  if (Number.isNaN(z)) return NaN;
  if (z === Infinity) return Infinity;
  if (Number.isInteger(z)) {
    if (z <= 0) return NaN;
    if (z < 171) {
      let r = 1;
      for (let i = 2; i < z; i++) r *= i;
      return r;
    }
    return Infinity;
  }
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  let x = LG[0];
  for (let i = 1; i < G + 2; i++) x += LG[i] / (z + i);
  const t = z + G + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

export function erf(x) {
  if (Number.isNaN(x)) return NaN;
  const ax = Math.abs(x);
  if (ax > 6) return Math.sign(x);
  if (ax < 2.5) {
    let sum = ax;
    let term = ax;
    for (let n = 1; n < 80; n++) {
      term *= (-ax * ax) / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
    }
    return Math.sign(x) * (2 / Math.sqrt(Math.PI)) * sum;
  }
  // continued fraction for erfc, evaluated bottom-up
  let f = ax;
  for (let k = 60; k >= 1; k--) f = ax + k / 2 / f;
  const erfc = Math.exp(-ax * ax) / Math.sqrt(Math.PI) / f;
  return Math.sign(x) * (1 - erfc);
}

export function pow(a, b) {
  if (a >= 0 || Number.isInteger(b) || Number.isNaN(a) || Number.isNaN(b)) return Math.pow(a, b);
  // real roots of negative numbers: x^(p/q) with odd q
  for (const q of [3, 5, 7, 9, 11]) {
    const p = b * q;
    const pr = Math.round(p);
    if (Math.abs(p - pr) < 1e-12) return (pr % 2 === 0 ? 1 : -1) * Math.pow(-a, b);
  }
  return NaN;
}

export function root(x, n) {
  return pow(x, 1 / n);
}

export const mod = (a, b) => (b === 0 ? NaN : a - b * Math.floor(a / b));
export const factorial = (n) => gamma(n + 1);
export const round = (x) => Math.floor(x + 0.5);
export const sign = (x) => (Number.isNaN(x) ? NaN : x > 0 ? 1 : x < 0 ? -1 : 0);
export const cot = (x) => 1 / Math.tan(x);
export const sec = (x) => 1 / Math.cos(x);
export const csc = (x) => 1 / Math.sin(x);
export const arccot = (x) => Math.PI / 2 - Math.atan(x);
export const arcsec = (x) => Math.acos(1 / x);
export const arccsc = (x) => Math.asin(1 / x);
export const coth = (x) => 1 / Math.tanh(x);
export const sech = (x) => 1 / Math.cosh(x);
export const csch = (x) => 1 / Math.sinh(x);
export const log = (x, base) => Math.log(x) / Math.log(base);

// ---- series / products (bounded) ----
export function sum(lo, hi, f) {
  if (!(hi - lo < 5e6)) return NaN;
  let s = 0;
  for (let k = Math.ceil(lo); k <= hi; k++) s += f(k);
  return s;
}
export function product(lo, hi, f) {
  if (!(hi - lo < 5e6)) return NaN;
  let p = 1;
  for (let k = Math.ceil(lo); k <= hi; k++) p *= f(k);
  return p;
}

// ---- numeric calculus ----
export function nderiv(f, x) {
  const h = 1e-4 * Math.max(1, Math.abs(x));
  const d = (hh) => (f(x + hh) - f(x - hh)) / (2 * hh);
  // Richardson extrapolation
  return (4 * d(h / 2) - d(h)) / 3;
}

const XGK = [
  0.991455371120812639206854697526329, 0.949107912342758524526189684047851,
  0.864864423359769072789712788640926, 0.741531185599394439863864773280788,
  0.586087235467691130294144838258730, 0.405845151377397166906606412076961,
  0.207784955007898467600689403773245, 0.0,
];
const WGK = [
  0.022935322010529224963732008058970, 0.063092092629978553290700663189204,
  0.104790010322250183839876322541518, 0.140653259715525918745189590510238,
  0.169004726639267902826583426598550, 0.190350578064785409913256402421014,
  0.204432940075298892414161999234649, 0.209482141084727828012999174891714,
];
const WG = [
  0.129484966168869693270611432679082, 0.279705391489276667901467771423780,
  0.381830050505118944950369775488975, 0.417959183673469387755102040816327,
];

function gk15(f, a, b) {
  const c = (a + b) / 2;
  const h = (b - a) / 2;
  const fc = f(c);
  let resK = fc * WGK[7];
  let resG = fc * WG[3];
  for (let j = 0; j < 7; j++) {
    const dx = h * XGK[j];
    const s = f(c - dx) + f(c + dx);
    resK += WGK[j] * s;
    if (j % 2 === 1) resG += WG[(j - 1) / 2] * s;
  }
  return [resK * h, Math.abs((resK - resG) * h)];
}

function adaptive(f, a, b, tol, depth) {
  const [v, err] = gk15(f, a, b);
  if (err <= tol || depth <= 0 || !Number.isFinite(v)) return v;
  const m = (a + b) / 2;
  return adaptive(f, a, m, tol / 2, depth - 1) + adaptive(f, m, b, tol / 2, depth - 1);
}

export function integrate(f, a, b) {
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  if (a === b) return 0;
  if (a > b) return -integrate(f, b, a);
  const tol = 1e-10;
  if (Number.isFinite(a) && Number.isFinite(b)) return adaptive(f, a, b, tol, 24);
  // improper: substitute x = t / (1 - t^2) on (-1, 1)
  const g = (t) => {
    const d = 1 - t * t;
    return f(t / d) * (1 + t * t) / (d * d);
  };
  const toT = (x) => (x === 0 ? 0 : (-1 + Math.sqrt(1 + 4 * x * x)) / (2 * x));
  const lo = a === -Infinity ? -1 : toT(a);
  const hi = b === Infinity ? 1 : toT(b);
  const eps = 1e-12;
  return adaptive(g, lo + (a === -Infinity ? eps : 0), hi - (b === Infinity ? eps : 0), tol, 24);
}

export function limit(f, to, dir) {
  const probe = (sgn) => {
    const vals = [];
    for (const k of [6, 7, 8]) {
      const h = Math.pow(10, -k);
      const x = Number.isFinite(to) ? to + sgn * h : Math.sign(to) * Math.pow(10, k);
      vals.push(f(x));
    }
    return vals;
  };
  const near = (a, b) => Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(a), Math.abs(b));
  const side = (sgn) => {
    const v = probe(sgn);
    if (v.every((n) => n === Infinity)) return Infinity;
    if (v.every((n) => n === -Infinity)) return -Infinity;
    if (v.some((n) => !Number.isFinite(n))) return NaN;
    return near(v[1], v[2]) && near(v[0], v[2]) ? v[2] : NaN;
  };
  if (!Number.isFinite(to)) return side(1);
  if (dir > 0) return side(1);
  if (dir < 0) return side(-1);
  const l = side(-1);
  const r = side(1);
  return Object.is(l, r) || near(l, r) ? r : NaN;
}
