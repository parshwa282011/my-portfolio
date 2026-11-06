// Shares the portfolio's theme preference (localStorage key "siteTheme").
const KEY = "siteTheme";

export function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  document.dispatchEvent(new Event("themechange"));
}

export function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    /* ignore */
  }
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = saved === "dark" || saved === "light" ? saved : prefersDark ? "dark" : "light";
}

// MathLive themes its menus, keyboard and fields from a `theme` attribute (or the
// OS preference). Mirror the site theme onto it so they never disagree.
export function applyMathTheme(...fields) {
  const t = currentTheme();
  document.body?.setAttribute("theme", t);
  const list = fields.length ? fields : document.querySelectorAll("math-field");
  for (const f of list) f.setAttribute("theme", t);
}
