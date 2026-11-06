import "mathlive/fonts.css";
import { MathfieldElement } from "mathlive";
import { analyze } from "../engine/analyze.js";
import { GraphCanvas } from "../render2d/canvas.js";
import { Symbolic } from "../symbolic/bridge.js";
import { toLatex } from "../engine/latex.js";
import { divergence, curl, gradient } from "../engine/vector.js";
import { vfOptions } from "../render2d/colormap.js";
import {
  defaultDoc,
  exampleRows,
  BOX_PRESETS,
  VF_STEPS,
  newRow,
  loadLocal,
  saveLocal,
  readHash,
  shareUrl,
  exportJSON,
  importJSON,
} from "../state/doc.js";
import { initTheme, setTheme, currentTheme, applyMathTheme } from "./theme.js";

MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) node.append(c);
  return node;
};

const fmtNum = (v) => {
  if (typeof v !== "number") return String(v);
  if (Number.isNaN(v)) return "undefined";
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "−∞";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e9 || a < 1e-6) return v.toExponential(6).replace(/\.?0+e/, "e");
  return String(Number(v.toPrecision(10)));
};

const INSERTS = [
  ["d/dx", "\\frac{d}{dx}\\left(#?\\right)", "Derivative"],
  ["∂/∂x", "\\frac{\\partial}{\\partial x}\\left(#?\\right)", "Partial derivative"],
  ["∫ dx", "\\int #?\\,dx", "Indefinite integral (exact engine)"],
  ["∫ₐᵇ", "\\int_{#?}^{#?}#?\\,dx", "Definite integral"],
  ["lim", "\\lim_{x\\to #?}#?", "Limit"],
  ["Σ", "\\sum_{n=#?}^{#?}#?", "Sum"],
  ["Π", "\\prod_{n=#?}^{#?}#?", "Product"],
  ["√", "\\sqrt{#?}", "Square root"],
  ["|x|", "\\left|#?\\right|", "Absolute value"],
  ["π", "\\pi", "Pi"],
  ["θ", "\\theta", "Theta"],
  ["(x,y)", "\\left(#?,#?\\right)", "Point"],
  ["∇", "\\nabla #?", "Gradient ∇f(x,y,z), divergence ∇·F, curl ∇×F, Laplacian ∇²f"],
  ["⟨ ⟩", (mode) => (mode === "4d" ? "\\left\\langle #?,#?,#?,#?\\right\\rangle" : mode === "3d" ? "\\left\\langle #?,#?,#?\\right\\rangle" : "\\left\\langle #?,#?\\right\\rangle"), "Vector field  ⟨P, Q⟩ — drawn as arrows"],
];

export function startApp(root) {
  initTheme();

  // ------------------------------------------------------------------ state
  // A shared link (#d=...) is a self-contained document: edits go back into the
  // URL, so opening someone's link never overwrites your own saved graph.
  const hashDoc = readHash();
  const useHash = !!hashDoc;
  let doc = hashDoc || loadLocal() || defaultDoc();
  const P = {}; // slider values shared with compiled functions
  let results = new Map();
  let paramKey = "";
  let lastFocused = null;
  const rowEls = new Map(); // id -> { root, mf, msg, actions, result }
  const symResults = new Map(); // id -> last symbolic result
  let animating = null; // { name, dir, last }

  const symbolic = new Symbolic();
  let graph3 = null; // three.js view, loaded the first time 3D is used
  let graph3Loading = null;
  const opsResults = new Map(); // id -> [{ label, latex, add }] (div / curl / gradient)

  // ------------------------------------------------------------------ DOM
  root.innerHTML = `
    <aside class="sidebar" aria-label="Expressions">
      <header class="side-head">
        <a class="back" href="../../projects.html" title="Back to projects">← Projects</a>
        <h1>Better Desmos</h1>
        <div class="seg" role="group" aria-label="Dimension">
          <button type="button" data-act="mode" data-mode="2d">2D</button>
          <button type="button" data-act="mode" data-mode="3d">3D</button>
          <button type="button" data-act="mode" data-mode="4d" title="3D slices of 4D shapes: a w slider and 4D rotation">4D</button>
        </div>
        <button class="icon-btn" data-act="settings" title="Settings" aria-label="Settings">⚙</button>
      </header>
      <div class="insert-bar" role="toolbar" aria-label="Insert"></div>
      <div class="side-scroll">
        <div class="rows" role="list"></div>
        <button class="add-row" data-act="add">+ Add expression</button>
      </div>
      <details class="params" open hidden>
        <summary>Parameters</summary>
        <div class="param-list"></div>
      </details>
      <footer class="side-foot">
        <button class="chip" data-act="share" title="Copy a link to this graph">Share link</button>
        <button class="chip" data-act="export" title="Download as JSON">Export</button>
        <button class="chip" data-act="import" title="Load from JSON">Import</button>
        <button class="chip" data-act="png" title="Save graph as an image">PNG</button>
        <input type="file" accept="application/json,.json" hidden data-role="file" />
      </footer>
    </aside>
    <main class="graph">
      <canvas aria-label="Graph"></canvas>
      <div class="graph-controls">
        <button class="icon-btn" data-act="zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
        <button class="icon-btn" data-act="zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
        <button class="icon-btn" data-act="reset" aria-label="Reset view" title="Reset view">⌂</button>
        <button class="icon-btn only3d" data-act="spin" aria-label="Auto-rotate" title="Auto-rotate">↻</button>
      </div>
      <div class="gl-note" hidden></div>
      <div class="four-bar" hidden>
        <div class="fb-row">
          <span class="fb-name">w</span>
          <input type="range" data-fb="w" aria-label="w slice position" />
          <input class="num" type="number" step="any" data-fb="wnum" aria-label="w value" />
          <button type="button" class="icon-btn" data-fb="wplay" title="Animate w">▶</button>
        </div>
        <details class="fb-rot">
          <summary>Rotate in 4D</summary>
          <div class="fb-row"><span class="fb-name">xw</span><input type="range" min="-180" max="180" step="1" data-rot="0" aria-label="rotate xw" /><output></output><button type="button" class="icon-btn" data-rotplay="0" title="Spin">▶</button></div>
          <div class="fb-row"><span class="fb-name">yw</span><input type="range" min="-180" max="180" step="1" data-rot="1" aria-label="rotate yw" /><output></output><button type="button" class="icon-btn" data-rotplay="1" title="Spin">▶</button></div>
          <div class="fb-row"><span class="fb-name">zw</span><input type="range" min="-180" max="180" step="1" data-rot="2" aria-label="rotate zw" /><output></output><button type="button" class="icon-btn" data-rotplay="2" title="Spin">▶</button></div>
          <div class="fb-row foot">
            <select data-fb="proj" class="mini-select" aria-label="Projection for curves and surfaces">
              <option value="ortho">orthographic</option>
              <option value="persp">perspective</option>
            </select>
            <button type="button" class="chip small" data-fb="rotreset">Reset rotation</button>
          </div>
        </details>
      </div>
      <div class="engine-pill" hidden></div>
    </main>
    <dialog class="settings">
      <form method="dialog">
        <h2>Settings</h2>
        <fieldset class="field">
          <legend>Angle unit</legend>
          <label><input type="radio" name="angle" value="rad" /> Radians</label>
          <label><input type="radio" name="angle" value="deg" /> Degrees</label>
        </fieldset>
        <label class="check"><input type="checkbox" data-set="grid" /> Grid</label>
        <label class="check"><input type="checkbox" data-set="axes" /> Axes</label>
        <label class="check"><input type="checkbox" data-set="labels" /> Axis labels</label>
        <fieldset class="field group">
          <legend>3D view</legend>
          <div class="box-grid">
            <span></span><span class="hd">from</span><span class="hd">to</span>
            <label class="ax" for="box-x0">x</label><input class="num" type="number" step="any" id="box-x0" data-box="x0" /><input class="num" type="number" step="any" data-box="x1" aria-label="x to" />
            <label class="ax" for="box-y0">y</label><input class="num" type="number" step="any" id="box-y0" data-box="y0" /><input class="num" type="number" step="any" data-box="y1" aria-label="y to" />
            <label class="ax" for="box-z0">z</label><input class="num" type="number" step="any" id="box-z0" data-box="z0" /><input class="num" type="number" step="any" data-box="z1" aria-label="z to" />
            <label class="ax only4" for="box-w0">w</label><input class="num only4" type="number" step="any" id="box-w0" data-box="w0" /><input class="num only4" type="number" step="any" data-box="w1" aria-label="w to" />
          </div>
          <label>Preset (same on every axis)
            <select data-set="boxpreset"></select>
          </label>
          <label>Surface opacity
            <select data-set="opacity3">
              <option value="1">Solid</option>
              <option value="0.8">80%</option>
              <option value="0.6">60%</option>
              <option value="0.4">40%</option>
            </select>
          </label>
        </fieldset>
        <fieldset class="field group">
          <legend>Vector fields (defaults)</legend>
          <label>Arrow every
            <select data-set="vf-step"></select>
          </label>
          <label>Arrow length
            <select data-set="vf-len">
              <option value="scaled">Proportional to size</option>
              <option value="unit">All the same</option>
            </select>
          </label>
          <label>2D style
            <select data-set="vf-style">
              <option value="arrows">Arrows</option>
              <option value="stream">Streamlines</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label class="check"><input type="checkbox" data-set="vf-mag" /> Colour by magnitude</label>
        </fieldset>
        <label class="field">Theme
          <select data-set="theme">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <div class="dialog-actions">
          <button type="button" class="chip" data-act="clear">Clear all</button>
          <button class="primary">Done</button>
        </div>
      </form>
    </dialog>
    <div class="toast" role="status" aria-live="polite"></div>
  `;

  const rowsEl = $(".rows", root);
  const paramsEl = $(".params", root);
  const paramList = $(".param-list", root);
  const canvasEl = $("canvas", root);
  const dialog = $("dialog.settings", root);
  const toastEl = $(".toast", root);
  const pill = $(".engine-pill", root);

  const graphEl = $(".graph", root);
  const glNote = $(".gl-note", root);
  const graph = new GraphCanvas(canvasEl, {
    view: doc.view,
    onViewChange: () => saveSoon(),
  });
  const invalidate = () => (doc.mode !== "2d" ? graph3?.invalidate() : graph.invalidate());
  const settings3 = () => ({ ...doc.settings, mode4: doc.mode === "4d", view4: doc.view4 });
  const pushSettings = () => {
    graph.setSettings(doc.settings);
    graph3?.setSettings(settings3());
  };

  // ------------------------------------------------------------------ helpers
  let toastTimer = 0;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  };

  let saveTimer = 0;
  const saveSoon = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 300);
  };

  function persist() {
    doc.view = graph.view.toJSON();
    if (graph3) doc.view3 = graph3.getView();
    if (useHash) history.replaceState(null, "", shareUrl(doc));
    else saveLocal(doc);
  }

  const download = (blob, name) => {
    const a = el("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ------------------------------------------------------------------ rows
  function buildRow(row) {
    const swatch = el("button", { className: "swatch", title: "Show / hide", type: "button" });
    swatch.setAttribute("aria-label", "Toggle visibility");
    const color = el("input", { type: "color", className: "color-pick", title: "Change color" });
    color.setAttribute("aria-label", "Row color");
    const handle = el("span", { className: "handle", title: "Drag to reorder", textContent: "⋮⋮" });
    const mf = new MathfieldElement();
    mf.className = "mf";
    applyMathTheme(mf);
    mf.value = row.latex;
    mf.mathVirtualKeyboardPolicy = "auto";
    mf.setAttribute("aria-label", "Expression");
    const msg = el("div", { className: "row-msg" });
    const rangeBox = el("div", { className: "row-range", hidden: true });
    const actions = el("div", { className: "row-actions" });
    const result = el("div", { className: "row-result", hidden: true });
    const auto = el("div", { className: "row-auto", hidden: true });
    const del = el("button", { className: "icon-btn del", title: "Delete", type: "button", textContent: "×" });
    del.setAttribute("aria-label", "Delete expression");

    const main = el("div", { className: "row-main" }, mf, msg, rangeBox, actions, auto, result);
    const left = el("div", { className: "row-left" }, handle, swatch, color);
    const rootEl = el("div", { className: "row" }, left, main, del);
    rootEl.dataset.id = row.id;
    rootEl.setAttribute("role", "listitem");

    const state = { root: rootEl, mf, msg, actions, result, auto, rangeBox, swatch, color, busy: false };
    rowEls.set(row.id, state);
    paintSwatch(row, state);

    swatch.addEventListener("click", () => {
      row.visible = !row.visible;
      paintSwatch(row, state);
      pushItems();
      saveSoon();
    });
    color.value = row.color;
    color.addEventListener("input", () => {
      row.color = color.value;
      paintSwatch(row, state);
      pushItems();
      saveSoon();
    });
    del.addEventListener("click", () => removeRow(row.id));

    mf.addEventListener("input", () => {
      row.latex = mf.value;
      symResults.delete(row.id);
      opsResults.delete(row.id);
      state.result.hidden = true;
      scheduleRefresh();
    });
    mf.addEventListener("focus", () => {
      lastFocused = mf;
      rootEl.scrollIntoView({ block: "nearest" });
    });
    mf.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          addRow("", row.id);
        } else if (e.key === "Backspace" && mf.value === "" && doc.rows.length > 1) {
          e.preventDefault();
          e.stopPropagation();
          const i = doc.rows.findIndex((r) => r.id === row.id);
          removeRow(row.id);
          const prev = doc.rows[Math.max(0, i - 1)];
          rowEls.get(prev.id)?.mf.focus();
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          // leave the row only when the caret cannot move further
          const i = doc.rows.findIndex((r) => r.id === row.id);
          const target = doc.rows[i + (e.key === "ArrowUp" ? -1 : 1)];
          if (target && (mf.position === (e.key === "ArrowUp" ? 0 : mf.lastOffset))) {
            e.preventDefault();
            rowEls.get(target.id)?.mf.focus();
          }
        }
      },
      true
    );

    // drag to reorder
    handle.addEventListener("pointerdown", () => {
      rootEl.draggable = true;
    });
    rootEl.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", row.id);
      e.dataTransfer.effectAllowed = "move";
      rootEl.classList.add("dragging");
    });
    rootEl.addEventListener("dragend", () => {
      rootEl.draggable = false;
      rootEl.classList.remove("dragging");
    });
    rootEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    rootEl.addEventListener("drop", (e) => {
      e.preventDefault();
      const fromId = e.dataTransfer.getData("text/plain");
      if (!fromId || fromId === row.id) return;
      const from = doc.rows.findIndex((r) => r.id === fromId);
      const to = doc.rows.findIndex((r) => r.id === row.id);
      if (from < 0 || to < 0) return;
      const [moved] = doc.rows.splice(from, 1);
      doc.rows.splice(to, 0, moved);
      renderRows();
      pushItems();
      saveSoon();
    });
    return state;
  }

  function paintSwatch(row, state) {
    state.swatch.style.setProperty("--c", row.color);
    state.swatch.classList.toggle("off", !row.visible);
    state.swatch.setAttribute("aria-pressed", String(row.visible));
  }

  function renderRows() {
    const focusedId = [...rowEls].find(([, s]) => s.mf === lastFocused && document.activeElement === s.mf)?.[0];
    for (const [id] of rowEls) if (!doc.rows.some((r) => r.id === id)) rowEls.delete(id);
    rowsEl.replaceChildren(
      ...doc.rows.map((row) => {
        const st = rowEls.get(row.id) || buildRow(row);
        return st.root;
      })
    );
    if (focusedId) rowEls.get(focusedId)?.mf.focus();
  }

  function addRow(latex = "", afterId = null) {
    const row = newRow(doc, latex);
    const i = afterId ? doc.rows.findIndex((r) => r.id === afterId) + 1 : doc.rows.length;
    doc.rows.splice(i, 0, row);
    renderRows();
    scheduleRefresh();
    saveSoon();
    requestAnimationFrame(() => rowEls.get(row.id)?.mf.focus());
    return row;
  }

  function removeRow(id) {
    doc.rows = doc.rows.filter((r) => r.id !== id);
    rowEls.delete(id);
    symResults.delete(id);
    opsResults.delete(id);
    if (!doc.rows.length) doc.rows.push(newRow(doc));
    renderRows();
    scheduleRefresh();
    saveSoon();
  }

  // ------------------------------------------------------------------ analysis
  let refreshTimer = 0;
  const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 120);
  };

  function pushItems() {
    const items = doc.rows.map((row) => ({ row, result: results.get(row.id) })).filter((i) => i.result);
    if (doc.mode !== "2d") graph3?.setItems(items);
    else graph.setItems(items);
  }

  function refresh() {
    const out = analyze(doc.rows, { angle: doc.settings.angle, P, mode: doc.mode });
    results = out.results;

    // Reconcile sliders with the free parameters discovered in the rows.
    for (const name of out.params) {
      if (!doc.sliders[name]) {
        doc.sliders[name] =
          name === "w" && doc.mode === "4d"
            ? { value: 0, min: doc.settings.box.w[0], max: doc.settings.box.w[1], step: 0.05 }
            : { value: 1, min: -10, max: 10, step: 0.1 };
      }
      P[name] = doc.sliders[name].value;
    }
    const names = [...out.params].sort();
    const key = names.join(",");
    if (key !== paramKey) {
      paramKey = key;
      renderParams(names);
    }
    syncFourBar();

    for (const row of doc.rows) updateRowUI(row);
    pushItems();
    saveSoon();
  }

  function updateRowUI(row) {
    const st = rowEls.get(row.id);
    const res = results.get(row.id);
    if (!st || !res) return;
    st.msg.className = "row-msg";
    st.msg.textContent = "";
    st.actions.replaceChildren();
    st.rangeBox.hidden = true;

    if (res.status === "error") {
      st.msg.classList.add("error");
      st.msg.textContent = res.error;
      st.root.classList.add("has-error");
      return;
    }
    st.root.classList.remove("has-error");
    if (res.status === "needs-symbolic") {
      st.msg.classList.add("note");
      st.msg.textContent = `${res.note} needs the exact engine.`;
    }
    updateLiveValue(row.id);

    if (res.kind === "parametric" || res.kind === "polar" || res.kind === "curve3" || res.kind === "curve4") {
      st.rangeBox.hidden = false;
      const sym = res.kind === "polar" ? "θ" : "t";
      st.rangeBox.replaceChildren(...rangeInputs(sym, res.range, row, "tmin", "tmax"));
    } else if (res.kind === "psurface" || res.kind === "psurface4") {
      st.rangeBox.hidden = false;
      st.rangeBox.replaceChildren(
        ...rangeInputs("u", res.urange, row, "umin", "umax"),
        el("span", { className: "gap" }),
        ...rangeInputs("v", res.vrange, row, "vmin", "vmax")
      );
    } else if (res.kind === "field") {
      st.rangeBox.hidden = false;
      st.rangeBox.replaceChildren(...fieldControls(row, res));
    } else if (res.kind === "multivar") {
      st.msg.classList.add("note");
      st.msg.textContent = res.hint;
    }

    renderAuto(row, res);

    // symbolic actions
    const add = (label, title, fn, primary = false) => {
      const b = el("button", { className: `chip small${primary ? " primary-chip" : ""}`, type: "button", textContent: label, title });
      b.addEventListener("click", fn);
      st.actions.append(b);
    };
    if (res.symAst) {
      const calcRow = res.calc || res.status === "needs-symbolic";
      add("Exact", "Compute exactly with SymPy", () => runSymbolic(row, "exact", res), calcRow);
      if (res.kind !== "variable") {
        add("Simplify", "Simplify", () => runSymbolic(row, "simplify", res));
        add("Expand", "Expand", () => runSymbolic(row, "expand", res));
        add("Factor", "Factor", () => runSymbolic(row, "factor", res));
      }
    }
    // gradient / divergence / curl
    const opBtn = (label, title, fn) => add(label, title, fn);
    if (res.kind === "field") {
      opBtn("∇·F", "Divergence", () => runOp(row, res, "div"));
      if (res.comps.length < 4) opBtn("∇×F", res.comps.length === 3 ? "Curl (a vector)" : "Curl (a scalar, ∂Q/∂x − ∂P/∂y)", () => runOp(row, res, "curl"));
    } else if (res.scalarAst) {
      opBtn("∇f", "Gradient: add it as a vector field", () => runOp(row, res, "grad"));
    }
    if (res.eq) {
      const free = new Set();
      collectSymbols(res.eq, free);
      for (const v of ["z", "y", "x"]) {
        if (free.has(v)) add(`Solve for ${v}`, `Solve the equation for ${v}`, () => runSolve(row, res, v));
      }
    }
    st.actions.classList.toggle("always", !!(res.calc || res.status === "needs-symbolic"));
    const saved = symResults.get(row.id);
    if (saved) showSymbolic(row, saved);
  }

  const collectSymbols = (ast, set) => {
    if (typeof ast === "string" && !ast.startsWith("'")) set.add(ast);
    else if (Array.isArray(ast)) ast.forEach((a) => collectSymbols(a, set));
  };

  function rangeInputs(sym, range, row, kmin, kmax) {
    return [
      el("span", { textContent: `${sym} from` }),
      numInput(range[0], (v) => setRange(row, kmin, v)),
      el("span", { textContent: "to" }),
      numInput(range[1], (v) => setRange(row, kmax, v)),
    ];
  }

  function select(options, value, onChange, label) {
    const sel = el("select", { className: "mini-select" });
    sel.setAttribute("aria-label", label);
    for (const [v, text] of options) sel.append(el("option", { value: String(v), textContent: text }));
    if (![...sel.options].some((o) => o.value === String(value))) sel.prepend(el("option", { value: String(value), textContent: String(value) }));
    sel.value = String(value);
    sel.addEventListener("change", () => onChange(sel.value));
    return sel;
  }

  // Per-row vector field options (fall back to the defaults in Settings).
  function fieldControls(row, res) {
    const vf = vfOptions(doc.settings.vf, row.vf);
    const set = (key, value) => {
      row.vf = { ...(row.vf || {}), [key]: value };
      invalidate();
      saveSoon();
    };
    const out = [
      el("span", { textContent: "Arrow every" }),
      select(VF_STEPS.map((v) => [v, String(v)]), vf.step, (v) => set("step", Number(v)), "Arrow spacing"),
      select([["scaled", "size ∝ field"], ["unit", "equal length"]], vf.len, (v) => set("len", v), "Arrow length"),
    ];
    if (doc.mode === "2d") out.push(select([["arrows", "arrows"], ["stream", "streamlines"], ["both", "both"]], vf.style, (v) => set("style", v), "Field style"));
    const mag = el("input", { type: "checkbox", checked: vf.mag });
    mag.addEventListener("change", () => set("mag", mag.checked));
    out.push(el("label", { className: "check inline" }, mag, document.createTextNode(" colour by")));
    if (doc.mode === "4d") out.push(select([["size", "size"], ["w", "w-direction"]], vf.by, (v) => set("by", v), "Colour arrows by"));
    else out.push(el("span", { textContent: "size" }));
    if (res.planar && doc.mode === "3d") out.push(el("span", { className: "note", textContent: "drawn in the z = 0 plane" }));
    return out;
  }

  const mathOut = (latex) => {
    const mf = new MathfieldElement();
    mf.readOnly = true;
    mf.className = "mf result-mf";
    applyMathTheme(mf);
    mf.value = latex;
    return mf;
  };

  function addAutoLine(st, label, latex, add) {
    st.auto.hidden = false;
    const line = el("div", { className: "auto-line" });
    if (label) line.append(el("span", { className: "auto-label", textContent: label }));
    line.append(mathOut(latex));
    if (add) {
      const b = el("button", { className: "chip small", type: "button", textContent: add.text, title: add.title });
      b.addEventListener("click", add.fn);
      line.append(b);
    }
    st.auto.append(line);
  }

  // ---- vector calculus on a row (all symbolic, instant)
  function runOp(row, res, op) {
    try {
      let list;
      if (op === "grad") {
        const syms = new Set();
        collectSymbols(res.scalarAst, syms);
        const vars =
          syms.has("w") || (doc.mode === "4d" && res.kind === "implicit4")
            ? ["x", "y", "z", "w"]
            : doc.mode !== "2d" && (res.kind === "implicit3" || res.kind === "implicit4" || syms.has("z"))
              ? ["x", "y", "z"]
              : ["x", "y"];
        const g = gradient(res.scalarAst, vars);
        list = [{ label: "∇f", latex: toLatex(["$Vec", ...g]), add: { text: "Add as field", title: "Add as a new vector field", latex: toLatex(["$Vec", ...g]) } }];
      } else if (op === "div") {
        const d = divergence(res.comps, res.vars);
        list = [{ label: "∇·F", latex: toLatex(d), add: { text: "Plot", title: "Add as a new row", latex: toLatex(d) } }];
      } else {
        const c = curl(res.comps, res.vars);
        list = res.comps.length === 3
          ? [{ label: "∇×F", latex: toLatex(["$Vec", ...c]), add: { text: "Add as field", title: "Add as a new vector field", latex: toLatex(["$Vec", ...c]) } }]
          : [{ label: "∇×F", latex: toLatex(c), add: { text: "Plot", title: "Add as a new row", latex: toLatex(c) } }];
      }
      const keep = (opsResults.get(row.id) || []).filter((o) => !o.error && !list.some((n) => n.label === o.label));
      opsResults.set(row.id, [...keep, ...list]);
    } catch (e) {
      opsResults.set(row.id, [{ error: e.message || "Could not compute that" }]);
    }
    renderAuto(row, res);
  }

  // Results that need no SymPy: a derivative's closed form (∂/∂x (x²y) = 2xy) and
  // the gradient / divergence / curl buttons.
  function renderAuto(row, res) {
    const st = rowEls.get(row.id);
    st.auto.replaceChildren();
    st.auto.hidden = true;
    if (res.exact !== undefined) addAutoLine(st, "=", toLatex(res.exact));
    for (const o of opsResults.get(row.id) || []) {
      if (o.error) {
        st.auto.hidden = false;
        st.auto.append(el("div", { className: "auto-line error", textContent: o.error }));
        continue;
      }
      addAutoLine(st, `${o.label} =`, o.latex, o.add && { text: o.add.text, title: o.add.title, fn: () => addRow(o.add.latex, row.id) });
    }
  }

  function numInput(value, onChange) {
    const input = el("input", { type: "number", className: "num", value: String(Number(value.toPrecision(8))), step: "any" });
    input.addEventListener("change", () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) onChange(v);
    });
    return input;
  }

  function setRange(row, key, value) {
    row[key] = value;
    scheduleRefresh();
  }

  function updateLiveValue(id) {
    const st = rowEls.get(id);
    const res = results.get(id);
    if (!st || !res || res.status !== "ok") return;
    if (res.kind === "value") {
      st.msg.className = "row-msg value";
      st.msg.textContent = `= ${fmtNum(res.value())}${res.approx ? "  (numeric)" : ""}`;
    } else if (res.kind === "variable") {
      st.msg.className = "row-msg value";
      st.msg.textContent = `${res.name} = ${fmtNum(res.value())}`;
    } else if (res.kind === "function") {
      st.msg.className = "row-msg note";
      st.msg.textContent = `defines ${res.name}(${res.params.join(", ")})`;
    }
  }

  const updateLiveValues = () => {
    for (const row of doc.rows) updateLiveValue(row.id);
  };

  // ------------------------------------------------------------------ symbolic
  async function runSymbolic(row, op, res) {
    const st = rowEls.get(row.id);
    st.busy = true;
    showBusy(st, symbolic.status === "idle" ? "Loading the math engine (about 10 MB, cached after the first time)…" : "Working…");
    try {
      const out = await symbolic.compute(op, res.symAst);
      const entry = { ...out, op, prefix: "" };
      symResults.set(row.id, entry);
      showSymbolic(row, entry);
    } catch (e) {
      showError(st, e.message);
    } finally {
      st.busy = false;
    }
  }

  async function runSolve(row, res, variable) {
    const st = rowEls.get(row.id);
    st.busy = true;
    showBusy(st, symbolic.status === "idle" ? "Loading the math engine (about 10 MB, cached after the first time)…" : "Solving…");
    try {
      const out = await symbolic.solve(res.eq[0], res.eq[1], variable);
      const entry = { ...out, op: "solve", prefix: `${variable}=`, variable };
      symResults.set(row.id, entry);
      showSymbolic(row, entry);
    } catch (e) {
      showError(st, e.message);
    } finally {
      st.busy = false;
    }
  }

  function showBusy(st, text) {
    st.result.hidden = false;
    st.result.dataset.state = "busy";
    st.result.replaceChildren(el("span", { className: "spinner" }), el("span", { textContent: text }));
  }

  function showError(st, message) {
    st.result.hidden = false;
    st.result.dataset.state = "error";
    st.result.replaceChildren(el("span", { textContent: message }));
  }

  function showSymbolic(row, out) {
    const st = rowEls.get(row.id);
    st.result.hidden = false;
    st.result.dataset.state = "done";
    const nodes = [];
    if (!out.items.length) {
      nodes.push(el("span", { textContent: "No solution found." }));
    } else {
      out.items.forEach((latex, i) => {
        const mf = new MathfieldElement();
        mf.readOnly = true;
        mf.className = "mf result-mf";
        applyMathTheme(mf);
        mf.value = out.op === "solve" ? `${out.prefix}${latex}` : `=${latex}`;
        nodes.push(mf);
        if (canPlot(out, latex)) {
          const b = el("button", { className: "chip small", type: "button", textContent: "Plot", title: "Add as a new row" });
          b.addEventListener("click", () => {
            const eq = out.op === "solve" ? `${out.prefix}${latex}` : `${doc.mode !== "2d" ? "z" : "y"}=${latex}`;
            addRow(eq, row.id);
          });
          nodes.push(b);
        }
        if (i < out.items.length - 1) nodes.push(el("span", { className: "sep", textContent: "," }));
      });
      if (out.numeric && out.op !== "solve") nodes.push(el("span", { className: "approx", textContent: `≈ ${out.numeric}` }));
    }
    st.result.replaceChildren(...nodes);
  }

  const canPlot = (out, latex) => {
    const three = doc.mode !== "2d";
    if (out.op === "solve") {
      const ok = doc.mode === "4d" ? ["x", "y", "z", "w"] : three ? ["x", "y", "z"] : ["x", "y"];
      return out.free.every((s) => ok.includes(s) && s !== out.variable) && !/\\mathrm\{i\}|\bi\b/.test(latex) && out.free.length > 0;
    }
    return out.free.length > 0 && out.free.every((s) => (three ? s === "x" || s === "y" : s === "x"));
  };

  symbolic.onStatus = (status) => {
    root.dataset.engine = status;
    pill.hidden = status !== "loading";
    pill.textContent = "Loading math engine…";
  };

  // ------------------------------------------------------------------ params
  function renderParams(names) {
    paramsEl.hidden = names.length === 0;
    paramList.replaceChildren(
      ...names.map((name) => {
        const s = doc.sliders[name];
        const label = el("span", { className: "pname", textContent: name });
        const val = el("input", { type: "number", className: "num pval", value: String(s.value), step: "any" });
        val.setAttribute("aria-label", `${name} value`);
        const range = el("input", { type: "range", min: s.min, max: s.max, step: s.step, value: s.value });
        range.setAttribute("aria-label", `${name} slider`);
        const play = el("button", { className: "icon-btn play", type: "button", textContent: "▶", title: "Animate" });
        play.setAttribute("aria-label", `Animate ${name}`);
        const min = numInput(s.min, (v) => setBounds(name, "min", v));
        const max = numInput(s.max, (v) => setBounds(name, "max", v));
        const step = numInput(s.step, (v) => v > 0 && setBounds(name, "step", v));
        const bounds = el(
          "details",
          { className: "bounds" },
          el("summary", { textContent: "range" }),
          el("label", { textContent: "min " }, min),
          el("label", { textContent: "max " }, max),
          el("label", { textContent: "step " }, step)
        );
        const wrap = el("div", { className: "param" }, el("div", { className: "param-top" }, label, val, play), range, bounds);
        wrap.dataset.name = name;

        const apply = (v) => {
          if (!Number.isFinite(v)) return;
          s.value = v;
          P[name] = v;
          range.value = String(v);
          if (document.activeElement !== val) val.value = String(Number(v.toPrecision(8)));
          invalidate();
          updateLiveValues();
          if (name === "w") syncFourBar();
          saveSoon();
        };
        range.addEventListener("input", () => apply(Number(range.value)));
        val.addEventListener("input", () => apply(Number(val.value)));
        play.addEventListener("click", () => {
          if (animating?.name === name) stopAnimation();
          else startAnimation(name, play);
        });
        wrap._apply = apply;
        wrap._range = range;
        return wrap;
      })
    );
  }

  function setBounds(name, key, value) {
    const s = doc.sliders[name];
    s[key] = value;
    if (s.min > s.max) [s.min, s.max] = [s.max, s.min];
    const wrap = paramList.querySelector(`[data-name="${CSS.escape(name)}"]`);
    if (wrap) {
      wrap._range.min = s.min;
      wrap._range.max = s.max;
      wrap._range.step = s.step;
    }
    saveSoon();
  }

  function startAnimation(name, button) {
    stopAnimation();
    animating = { name, dir: 1, last: performance.now(), button };
    button.textContent = "❚❚";
    const tick = (now) => {
      if (!animating || animating.name !== name) return;
      const s = doc.sliders[name];
      const span = s.max - s.min || 1;
      let v = s.value + animating.dir * ((now - animating.last) / 1000) * (span / 6);
      animating.last = now;
      if (v >= s.max) {
        v = s.max;
        animating.dir = -1;
      } else if (v <= s.min) {
        v = s.min;
        animating.dir = 1;
      }
      const wrap = paramList.querySelector(`[data-name="${CSS.escape(name)}"]`);
      if (!wrap) return stopAnimation();
      wrap._apply(v);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function stopAnimation() {
    if (animating?.button) animating.button.textContent = "▶";
    animating = null;
  }

  // ------------------------------------------------------------------ settings
  function syncSettingsUI() {
    for (const r of dialog.querySelectorAll("input[name=angle]")) r.checked = r.value === doc.settings.angle;
    syncBoxUI();
    fillSelect($("[data-set=vf-step]", dialog), VF_STEPS, doc.settings.vf.step);
    $("[data-set=opacity3]", dialog).value = String(doc.settings.opacity3);
    $("[data-set=vf-len]", dialog).value = doc.settings.vf.len;
    $("[data-set=vf-style]", dialog).value = doc.settings.vf.style;
    $("[data-set=vf-mag]", dialog).checked = doc.settings.vf.mag;
    for (const k of ["grid", "axes", "labels"]) $(`[data-set=${k}]`, dialog).checked = doc.settings[k];
    $("[data-set=theme]", dialog).value = currentTheme();
  }

  function syncBoxUI() {
    for (const input of dialog.querySelectorAll("[data-box]")) {
      input.value = String(doc.settings.box[input.dataset.box[0]][Number(input.dataset.box[1])]);
    }
    // the preset shows a value only when all three axes are the same ±R
    const { x, y, z } = doc.settings.box;
    const R = x[1];
    const sym = [x, y, z, doc.settings.box.w].every((r) => r[0] === -R && r[1] === R) ? R : "";
    const sel = $("[data-set=boxpreset]", dialog);
    sel.replaceChildren(el("option", { value: "", textContent: "custom" }), ...BOX_PRESETS.map((v) => el("option", { value: String(v), textContent: `±${v}` })));
    sel.value = String(sym);
  }

  function fillSelect(sel, values, current) {
    const list = values.includes(current) ? values : [...values, current].sort((a, b) => a - b);
    sel.replaceChildren(...list.map((v) => el("option", { value: String(v), textContent: String(v) })));
    sel.value = String(current);
  }

  dialog.addEventListener("change", (e) => {
    const t = e.target;
    const key = t.dataset.set;
    if (t.name === "angle") {
      doc.settings.angle = t.value;
      refresh();
    } else if (key === "theme") {
      setTheme(t.value);
      invalidate();
    } else if (["grid", "axes", "labels"].includes(key)) {
      doc.settings[key] = t.checked;
      pushSettings();
    } else if (key === "boxpreset") {
      const R = Number(t.value);
      if (R > 0) {
        doc.settings.box = { x: [-R, R], y: [-R, R], z: [-R, R], w: [-R, R] };
        syncBoxUI();
        pushSettings();
        graph3?.resetView();
        syncWSlider();
      }
    } else if (t.dataset.box) {
      const [axis, end] = [t.dataset.box[0], Number(t.dataset.box[1])];
      const v = Number(t.value);
      const r = [...doc.settings.box[axis]];
      r[end] = v;
      if (Number.isFinite(v) && r[0] < r[1] && r[1] - r[0] >= 1e-3 && Math.abs(v) <= 1e6) {
        doc.settings.box = { ...doc.settings.box, [axis]: r };
        pushSettings();
        graph3?.resetView();
        syncBoxUI();
        syncWSlider();
      } else {
        toast("Each axis needs a start below its end");
        syncBoxUI();
      }
    } else if (key === "opacity3") {
      doc.settings.opacity3 = Number(t.value);
      pushSettings();
    } else if (key?.startsWith("vf-")) {
      const k = key.slice(3);
      doc.settings.vf = { ...doc.settings.vf, [k]: k === "step" ? Number(t.value) : k === "mag" ? t.checked : t.value };
      pushSettings();
    }
    saveSoon();
  });

  // ------------------------------------------------------------------ actions
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    switch (btn.dataset.act) {
      case "add":
        addRow();
        break;
      case "settings":
        syncSettingsUI();
        dialog.showModal();
        break;
      case "mode":
        setMode(btn.dataset.mode);
        break;
      case "zoom-in":
      case "zoom-out": {
        const f = btn.dataset.act === "zoom-in" ? 1.5 : 1 / 1.5;
        if (doc.mode !== "2d") graph3?.zoom(f);
        else {
          graph.view.zoomAt(graph.view.w / 2, graph.view.h / 2, f);
          graph.invalidate();
        }
        saveSoon();
        break;
      }
      case "reset":
        if (doc.mode !== "2d") graph3?.resetView();
        else graph.resetView();
        break;
      case "spin":
        spinning = !spinning;
        btn.classList.toggle("on", spinning);
        graph3?.setAutoRotate(spinning);
        break;
      case "share": {
        persistView();
        const url = shareUrl(doc);
        try {
          await navigator.clipboard.writeText(url);
          toast("Link copied to clipboard");
        } catch {
          window.prompt("Copy this link", url);
        }
        break;
      }
      case "export":
        persistView();
        download(exportJSON(doc), "better-desmos.json");
        break;
      case "import":
        $("[data-role=file]", root).click();
        break;
      case "png": {
        const blob = await (doc.mode !== "2d" && graph3 ? graph3.toBlob() : graph.toBlob());
        if (blob) download(blob, "graph.png");
        break;
      }
      case "clear":
        if (confirm("Remove every expression?")) {
          doc.rows = [newRow(null)];
          doc.stash = {};
          doc.sliders = {};
          paramKey = "";
          rowEls.clear();
          symResults.clear();
          opsResults.clear();
          renderRows();
          refresh();
          dialog.close();
        }
        break;
      default:
        break;
    }
  });

  $("[data-role=file]", root).addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      loadDoc(await importJSON(file));
      toast("Imported");
    } catch (err) {
      toast(err.message || "Could not import that file");
    }
  });

  function loadDoc(next) {
    doc = next;
    if (!doc.rows.length) doc.rows.push(newRow(doc));
    for (const k of Object.keys(P)) delete P[k];
    paramKey = "";
    rowEls.clear();
    symResults.clear();
    opsResults.clear();
    graph.setView(doc.view);
    pushSettings();
    if (graph3 && doc.view3) graph3.setView(doc.view3);
    applyModeUI();
    renderRows();
    refresh();
  }

  function persistView() {
    doc.view = graph.view.toJSON();
    if (graph3) doc.view3 = graph3.getView();
  }

  // ------------------------------------------------------------------ 4D controls
  const fourBar = $(".four-bar", root);
  const rotSpin = [false, false, false];
  let rotRaf = 0;
  let rotLast = 0;
  const push3 = () => graph3?.setSettings(settings3());

  function syncFourBar() {
    fourBar.hidden = doc.mode !== "4d";
    if (doc.mode !== "4d") return;
    const s = doc.sliders.w;
    const wr = $("[data-fb=w]", fourBar);
    const wnum = $("[data-fb=wnum]", fourBar);
    if (s) {
      wr.min = s.min;
      wr.max = s.max;
      wr.step = s.step;
      wr.value = s.value;
      if (document.activeElement !== wnum) wnum.value = String(Number(s.value.toPrecision(5)));
    }
    $("[data-fb=wplay]", fourBar).textContent = animating?.name === "w" ? "❚❚" : "▶";
    fourBar.querySelectorAll("[data-rot]").forEach((r) => {
      const i = Number(r.dataset.rot);
      r.value = doc.view4.rot[i];
      r.nextElementSibling.textContent = `${Math.round(doc.view4.rot[i])}°`;
      r.parentElement.querySelector("[data-rotplay]").textContent = rotSpin[i] ? "❚❚" : "▶";
    });
    $("[data-fb=proj]", fourBar).value = doc.view4.proj;
  }

  const setW = (v) => {
    if (!Number.isFinite(v)) return;
    const wrap = paramList.querySelector('[data-name="w"]');
    if (wrap) wrap._apply(v);
    else if (doc.sliders.w) {
      doc.sliders.w.value = v;
      P.w = v;
      invalidate();
    }
  };

  // keep the w slider's range equal to the w range in Settings
  function syncWSlider() {
    if (doc.mode !== "4d" || !doc.sliders.w) return;
    const s = doc.sliders.w;
    [s.min, s.max] = doc.settings.box.w;
    s.value = Math.min(s.max, Math.max(s.min, s.value));
    P.w = s.value;
    paramKey = "";
    refresh();
    syncFourBar();
  }

  fourBar.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.fb === "w") setW(Number(t.value));
    else if (t.dataset.fb === "wnum") setW(Number(t.value));
    else if (t.dataset.rot !== undefined) {
      doc.view4.rot[Number(t.dataset.rot)] = Number(t.value);
      t.nextElementSibling.textContent = `${Math.round(Number(t.value))}°`;
      push3();
      saveSoon();
    }
  });
  fourBar.addEventListener("change", (e) => {
    if (e.target.dataset.fb === "proj") {
      doc.view4.proj = e.target.value;
      push3();
      saveSoon();
    }
  });
  fourBar.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.fb === "wplay") paramList.querySelector('[data-name="w"] .play')?.click();
    else if (b.dataset.fb === "rotreset") {
      rotSpin.fill(false);
      doc.view4.rot = [0, 0, 0];
      push3();
      syncFourBar();
      saveSoon();
    } else if (b.dataset.rotplay !== undefined) {
      const i = Number(b.dataset.rotplay);
      rotSpin[i] = !rotSpin[i];
      if (rotSpin.some(Boolean) && !rotRaf) {
        rotLast = performance.now();
        rotRaf = requestAnimationFrame(rotTick);
      }
      syncFourBar();
    }
  });

  function rotTick(now) {
    const dt = Math.min(0.1, (now - rotLast) / 1000);
    rotLast = now;
    if (!rotSpin.some(Boolean) || doc.mode !== "4d") {
      rotRaf = 0;
      return;
    }
    rotSpin.forEach((on, i) => {
      if (!on) return;
      let a = doc.view4.rot[i] + dt * 40;
      if (a > 180) a -= 360;
      doc.view4.rot[i] = a;
    });
    push3();
    syncFourBar();
    saveSoon();
    rotRaf = requestAnimationFrame(rotTick);
  }

  // ------------------------------------------------------------------ 2D / 3D
  let spinning = false;

  async function ensureGraph3() {
    if (graph3) return graph3;
    graph3Loading ||= import("../render3d/scene3d.js").then(({ Graph3D }) => {
      graph3 = new Graph3D(graphEl, {
        view: doc.view3,
        P,
        onViewChange: () => saveSoon(),
        onNotes: (notes) => {
          glNote.hidden = !notes.length;
          glNote.textContent = notes.join(" · ");
        },
      });
      graph3.setSettings(settings3());
      return graph3;
    });
    try {
      return await graph3Loading;
    } catch (e) {
      graph3Loading = null;
      throw e;
    }
  }

  function applyModeUI() {
    const three = doc.mode !== "2d";
    root.dataset.mode = doc.mode;
    for (const b of root.querySelectorAll("[data-act=mode]")) b.setAttribute("aria-pressed", String(b.dataset.mode === doc.mode));
    canvasEl.hidden = three;
    if (!three) {
      glNote.hidden = true;
      graph.resize();
      graph.invalidate();
    }
    document.title = `Better Desmos · ${doc.mode.toUpperCase()}`;
    refreshInsertBar();
    syncFourBar();
    if (three) {
      pill.hidden = false;
      pill.textContent = graph3 ? "" : "Loading 3D…";
      ensureGraph3().then(
        (g) => {
          if (doc.mode === "2d") return;
          pill.hidden = symbolic.status !== "loading";
          g.resize();
          g.setSettings(settings3());
          pushItems();
        },
        () => {
          toast("3D needs WebGL, which this browser has turned off.");
          pill.hidden = true;
          if (doc.mode !== "2d") setMode("2d");
        }
      );
    }
  }

  function setMode(next) {
    if (next === doc.mode || !["2d", "3d", "4d"].includes(next)) return;
    stopAnimation();
    rotSpin.fill(false);
    doc.stash = { ...(doc.stash || {}), [doc.mode]: doc.rows };
    doc.mode = next;
    doc.rows = doc.stash[next] || exampleRows(next);
    delete doc.stash[next];
    rowEls.clear();
    symResults.clear();
    opsResults.clear();
    paramKey = "";
    applyModeUI();
    renderRows();
    refresh();
  }

  // insert toolbar
  const bar = $(".insert-bar", root);
  function refreshInsertBar() {
    bar.replaceChildren(
      ...INSERTS.map(([label, latex, title]) => {
        const b = el("button", { className: "chip small", type: "button", textContent: label, title });
        b.addEventListener("mousedown", (e) => e.preventDefault()); // keep the caret in the field
        b.addEventListener("click", () => {
          const target = lastFocused && lastFocused.isConnected ? lastFocused : rowEls.get(doc.rows[doc.rows.length - 1].id)?.mf;
          if (!target) return;
          target.focus();
          target.insert(typeof latex === "function" ? latex(doc.mode) : latex, { focus: true, feedback: false, selectionMode: "placeholder" });
        });
        return b;
      })
    );
  }

  // ------------------------------------------------------------------ boot
  graph.setSettings(doc.settings);
  applyModeUI();
  renderRows();
  refresh();
  window.addEventListener("pagehide", persist);
  document.addEventListener("themechange", () => {
    applyMathTheme();
    graph.invalidate();
    graph3?.invalidate();
  });
  applyMathTheme();
}
