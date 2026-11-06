// Numeric points of interest for explicit curves y = f(x).

const finite = Number.isFinite;

function bisect(f, a, b, fa, iters = 60) {
  let lo = a;
  let hi = b;
  let flo = fa;
  for (let i = 0; i < iters; i++) {
    const m = (lo + hi) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = m;
      flo = fm;
    } else hi = m;
  }
  return (lo + hi) / 2;
}

// All roots of f on [a, b] (sign changes, poles rejected, even roots via minima of |f|).
export function findRoots(f, a, b, n = 1500) {
  const xs = [];
  const vs = [];
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    xs.push(x);
    vs.push(f(x));
  }
  const scale = Math.max(1e-300, ...vs.filter(finite).map(Math.abs).filter((v) => v < 1e12));
  const roots = [];
  for (let i = 0; i < n; i++) {
    const y0 = vs[i];
    const y1 = vs[i + 1];
    if (!finite(y0) || !finite(y1)) continue;
    if (y0 === 0) {
      roots.push(xs[i]);
      continue;
    }
    if (Math.sign(y0) !== Math.sign(y1) && y1 !== 0) {
      const r = bisect(f, xs[i], xs[i + 1], y0);
      // reject poles: |f| should vanish at a true root
      if (Math.abs(f(r)) <= 1e-6 * Math.max(1, scale)) roots.push(r);
    }
  }
  if (finite(vs[n]) && vs[n] === 0) roots.push(xs[n]);
  return dedupe(roots, (b - a) * 1e-7);
}

function dedupe(list, tol) {
  const out = [];
  for (const v of list.sort((p, q) => p - q)) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

function golden(f, a, b, sign) {
  // minimise sign * f on [a, b]
  const g = (x) => sign * f(x);
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = b - phi * (b - a);
  let d = a + phi * (b - a);
  let gc = g(c);
  let gd = g(d);
  for (let i = 0; i < 80; i++) {
    if (gc < gd) {
      b = d;
      d = c;
      gd = gc;
      c = b - phi * (b - a);
      gc = g(c);
    } else {
      a = c;
      c = d;
      gc = gd;
      d = a + phi * (b - a);
      gd = g(d);
    }
  }
  return (a + b) / 2;
}

export function findExtrema(f, a, b, n = 1500) {
  const xs = [];
  const vs = [];
  for (let i = 0; i <= n; i++) {
    xs.push(a + ((b - a) * i) / n);
    vs.push(f(xs[i]));
  }
  const out = [];
  for (let i = 1; i < n; i++) {
    const p = vs[i - 1];
    const c = vs[i];
    const q = vs[i + 1];
    if (![p, c, q].every(finite)) continue;
    // local max / min strictly inside, ignore flat runs and wild spikes
    const isMax = c > p && c >= q;
    const isMin = c < p && c <= q;
    if (!isMax && !isMin) continue;
    const x = golden(f, xs[i - 1], xs[i + 1], isMax ? -1 : 1);
    const y = f(x);
    if (!finite(y)) continue;
    // reject asymptote spikes: value must stay close to neighbours
    const span = Math.max(Math.abs(p), Math.abs(q), Math.abs(c), 1e-12);
    if (Math.abs(y) > 1e3 * span) continue;
    out.push({ kind: isMax ? "max" : "min", x, y });
  }
  return out;
}

export function explicitPOIs(f, view) {
  const a = view.xmin;
  const b = view.xmax;
  const pois = [];
  for (const x of findRoots(f, a, b)) pois.push({ kind: "root", x, y: 0 });
  for (const e of findExtrema(f, a, b)) pois.push(e);
  if (0 >= a && 0 <= b) {
    const y0 = f(0);
    if (finite(y0)) pois.push({ kind: "y-intercept", x: 0, y: y0 });
  }
  return pois.slice(0, 60);
}

export function intersections(f, g, view) {
  const h = (x) => f(x) - g(x);
  return findRoots(h, view.xmin, view.xmax).map((x) => ({ kind: "intersection", x, y: f(x) }));
}
