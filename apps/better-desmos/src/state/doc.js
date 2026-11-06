import LZString from "lz-string";

export const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#ca8a04"];
const STORAGE_KEY = "betterDesmos.doc.v1";

let counter = 0;
export const uid = () => `r${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newRow(doc, latex = "") {
  const used = doc ? doc.rows.length : 0;
  return { id: uid(), latex, color: COLORS[used % COLORS.length], visible: true };
}

export const DEFAULT_SETTINGS = {
  angle: "rad",
  grid: true,
  axes: true,
  labels: true,
  box: { x: [-5, 5], y: [-5, 5], z: [-5, 5] }, // the 3D window, per axis
  opacity3: 1,
  vf: { step: 1, len: "scaled", mag: true, style: "arrows" },
};

export const BOX_PRESETS = [2, 3, 5, 10, 20, 50, 100]; // ±N on every axis
export const VF_STEPS = [0.25, 0.5, 1, 2, 5];

// Example rows for each mode. `extra` is merged into the row (hidden, ranges, ...).
export function exampleRows(mode) {
  const sets = {
    "2d": [
      ["y=a\\sin\\left(bx\\right)"],
      ["x^2+y^2=4"],
      ["r=1+\\sin\\theta"],
      ["y>x^2-3"],
      ["\\frac{d}{dx}x^3"],
      ["\\left\\langle -y,x\\right\\rangle", { vf: { step: 1 } }],
    ],
    "3d": [
      ["z=a\\sin\\left(x\\right)\\cos\\left(y\\right)"],
      ["\\left\\langle -y,x,0.4\\right\\rangle", { vf: { step: 2 } }],
      ["\\left(3\\cos t,3\\sin t,t\\right)", { tmax: 12.566370614359172 }],
      ["x^2+y^2+z^2=9", { visible: false }],
      ["\\frac{\\partial}{\\partial x}\\left(x^2y\\right)", { visible: false }],
    ],
  };
  const rows = [];
  for (const [latex, extra] of sets[mode]) rows.push({ ...newRow({ rows }, latex), ...(extra || {}) });
  return rows;
}

export function defaultDoc() {
  return {
    v: 1,
    mode: "2d",
    settings: cloneSettings(DEFAULT_SETTINGS),
    view: { cx: 0, cy: 0, scale: 50 },
    view3: null, // 3D camera {p:[x,y,z], t:[x,y,z]}
    rows: exampleRows("2d"),
    stash: {}, // rows of the mode that is not currently active
    sliders: {
      a: { value: 2, min: -5, max: 5, step: 0.1 },
      b: { value: 1, min: -5, max: 5, step: 0.1 },
    },
  };
}

const isNum = (n) => typeof n === "number" && Number.isFinite(n);

function cloneSettings(s) {
  return { ...s, vf: { ...s.vf }, box: { x: [...s.box.x], y: [...s.box.y], z: [...s.box.z] } };
}

// A usable axis range: finite, ordered, not absurdly large or thin.
const goodRange = (r) => Array.isArray(r) && r.length === 2 && r.every(isNum) && r[0] < r[1] && r[1] - r[0] >= 1e-3 && Math.abs(r[0]) <= 1e6 && Math.abs(r[1]) <= 1e6;
const VF_LEN = new Set(["scaled", "unit"]);
const VF_STYLE = new Set(["arrows", "stream", "both"]);

function cleanVF(v, fallback = {}) {
  const out = { ...fallback };
  if (!v || typeof v !== "object") return out;
  if (isNum(v.step) && v.step >= 0.05 && v.step <= 1000) out.step = v.step;
  if (VF_LEN.has(v.len)) out.len = v.len;
  if (typeof v.mag === "boolean") out.mag = v.mag;
  if (VF_STYLE.has(v.style)) out.style = v.style;
  return out;
}

function cleanRows(list, seen) {
  const rows = [];
  for (const r of (Array.isArray(list) ? list : []).slice(0, 200)) {
    if (!r || typeof r.latex !== "string") continue;
    const id = typeof r.id === "string" && r.id && !seen.has(r.id) ? r.id : uid();
    seen.add(id);
    const row = {
      id,
      latex: r.latex.slice(0, 2000),
      color: typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : COLORS[rows.length % COLORS.length],
      visible: r.visible !== false,
    };
    for (const k of ["tmin", "tmax", "umin", "umax", "vmin", "vmax"]) if (isNum(r[k])) row[k] = r[k];
    if (r.vf && typeof r.vf === "object") row.vf = cleanVF(r.vf);
    rows.push(row);
  }
  return rows;
}

// Defensive: anything from localStorage / the URL / an imported file is untrusted.
export function sanitize(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.rows)) return null;
  const base = defaultDoc();
  const doc = {
    v: 1,
    mode: raw.mode === "3d" ? "3d" : "2d",
    settings: cloneSettings(base.settings),
    view: { ...base.view },
    view3: null,
    rows: [],
    stash: {},
    sliders: {},
  };
  const s = raw.settings || {};
  if (s.angle === "deg" || s.angle === "rad") doc.settings.angle = s.angle;
  for (const k of ["grid", "axes", "labels"]) if (typeof s[k] === "boolean") doc.settings[k] = s[k];
  if (isNum(s.range3) && s.range3 >= 0.5 && s.range3 <= 10000) {
    // older documents: one symmetric range for all three axes
    doc.settings.box = { x: [-s.range3, s.range3], y: [-s.range3, s.range3], z: [-s.range3, s.range3] };
  }
  if (s.box && typeof s.box === "object") for (const k of ["x", "y", "z"]) if (goodRange(s.box[k])) doc.settings.box[k] = [...s.box[k]];
  if (isNum(s.opacity3) && s.opacity3 >= 0.1 && s.opacity3 <= 1) doc.settings.opacity3 = s.opacity3;
  doc.settings.vf = cleanVF(s.vf, doc.settings.vf);
  const v = raw.view || {};
  if (isNum(v.cx) && isNum(v.cy) && isNum(v.scale) && v.scale > 0) doc.view = { cx: v.cx, cy: v.cy, scale: v.scale };
  const v3 = raw.view3;
  if (v3 && Array.isArray(v3.p) && Array.isArray(v3.t) && v3.p.length === 3 && v3.t.length === 3 && [...v3.p, ...v3.t].every(isNum)) {
    doc.view3 = { p: [...v3.p], t: [...v3.t] };
  }
  const seen = new Set();
  doc.rows = cleanRows(raw.rows, seen);
  const other = doc.mode === "3d" ? "2d" : "3d";
  if (raw.stash && Array.isArray(raw.stash[other])) doc.stash[other] = cleanRows(raw.stash[other], seen);
  if (raw.sliders && typeof raw.sliders === "object") {
    for (const [name, sl] of Object.entries(raw.sliders).slice(0, 100)) {
      if (!sl || !isNum(sl.value) || !isNum(sl.min) || !isNum(sl.max) || !isNum(sl.step)) continue;
      doc.sliders[name] = { value: sl.value, min: sl.min, max: sl.max, step: sl.step > 0 ? sl.step : 0.1 };
    }
  }
  return doc;
}

// ---- persistence ----
export function saveLocal(doc) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    /* storage full or blocked: ignore */
  }
}

export function loadLocal() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return text ? sanitize(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

// ---- sharing (URL hash) ----
export function encodeShare(doc) {
  return LZString.compressToEncodedURIComponent(JSON.stringify(doc));
}

export function decodeShare(text) {
  try {
    const json = LZString.decompressFromEncodedURIComponent(text);
    return json ? sanitize(JSON.parse(json)) : null;
  } catch {
    return null;
  }
}

export function shareUrl(doc) {
  const url = new URL(window.location.href);
  url.hash = `d=${encodeShare(doc)}`;
  return url.toString();
}

export function readHash() {
  const m = /^#d=(.+)$/.exec(window.location.hash);
  return m ? decodeShare(m[1]) : null;
}

// ---- files ----
export function exportJSON(doc) {
  return new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
}

export async function importJSON(file) {
  const text = await file.text();
  const doc = sanitize(JSON.parse(text));
  if (!doc) throw new Error("This file is not a Better Desmos document");
  return doc;
}
