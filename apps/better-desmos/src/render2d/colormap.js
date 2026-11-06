// Magnitude -> colour. Readable on both the light and the dark canvas.
const STOPS = ["#3b4cc0", "#2f86c8", "#1f9d7a", "#7fb02e", "#e09b00", "#d6452f"].map((h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
});

export function rampRGB(t) {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export const rampCSS = (t) => {
  const [r, g, b] = rampRGB(t);
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
};

export const rampHex = (t) => {
  const [r, g, b] = rampRGB(t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

// 90th percentile magnitude: one huge value (a pole) must not flatten the rest.
export function referenceMagnitude(mags) {
  const v = mags.filter((m) => Number.isFinite(m) && m > 0).sort((a, b) => a - b);
  if (!v.length) return 1;
  return v[Math.min(v.length - 1, Math.floor(v.length * 0.9))];
}

export const DEFAULT_VF = { step: 1, len: "scaled", mag: true, style: "arrows" };

export function vfOptions(globalVF, rowVF) {
  const o = { ...DEFAULT_VF, ...(globalVF || {}), ...(rowVF || {}) };
  if (!(o.step > 0)) o.step = 1;
  return o;
}
