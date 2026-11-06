import LZString from "lz-string";

export const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#ca8a04"];
const STORAGE_KEY = "betterDesmos.doc.v1";

let counter = 0;
export const uid = () => `r${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newRow(doc, latex = "") {
  const used = doc ? doc.rows.length : 0;
  return { id: uid(), latex, color: COLORS[used % COLORS.length], visible: true };
}

export function defaultDoc() {
  const doc = {
    v: 1,
    mode: "2d",
    settings: { angle: "rad", grid: true, axes: true, labels: true },
    view: { cx: 0, cy: 0, scale: 50 },
    rows: [],
    sliders: {},
  };
  const examples = [
    "y=a\\sin\\left(bx\\right)",
    "x^2+y^2=4",
    "r=1+\\sin\\theta",
    "y>x^2-3",
    "\\frac{d}{dx}x^3",
  ];
  for (const latex of examples) doc.rows.push(newRow(doc, latex));
  doc.sliders = {
    a: { value: 2, min: -5, max: 5, step: 0.1 },
    b: { value: 1, min: -5, max: 5, step: 0.1 },
  };
  return doc;
}

const isNum = (n) => typeof n === "number" && Number.isFinite(n);

// Defensive: anything from localStorage / the URL / an imported file is untrusted.
export function sanitize(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.rows)) return null;
  const base = defaultDoc();
  const doc = {
    v: 1,
    mode: "2d",
    settings: { ...base.settings },
    view: { ...base.view },
    rows: [],
    sliders: {},
  };
  const s = raw.settings || {};
  if (s.angle === "deg" || s.angle === "rad") doc.settings.angle = s.angle;
  for (const k of ["grid", "axes", "labels"]) if (typeof s[k] === "boolean") doc.settings[k] = s[k];
  const v = raw.view || {};
  if (isNum(v.cx) && isNum(v.cy) && isNum(v.scale) && v.scale > 0) doc.view = { cx: v.cx, cy: v.cy, scale: v.scale };
  const seen = new Set();
  for (const r of raw.rows.slice(0, 200)) {
    if (!r || typeof r.latex !== "string") continue;
    let id = typeof r.id === "string" && r.id && !seen.has(r.id) ? r.id : uid();
    seen.add(id);
    const row = {
      id,
      latex: r.latex.slice(0, 2000),
      color: typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : COLORS[doc.rows.length % COLORS.length],
      visible: r.visible !== false,
    };
    if (isNum(r.tmin)) row.tmin = r.tmin;
    if (isNum(r.tmax)) row.tmax = r.tmax;
    doc.rows.push(row);
  }
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
