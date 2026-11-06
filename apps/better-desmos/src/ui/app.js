import "mathlive/fonts.css";
import { MathfieldElement } from "mathlive";
import { analyze } from "../engine/analyze.js";
import { GraphCanvas } from "../render2d/canvas.js";
import { Symbolic } from "../symbolic/bridge.js";
import {
  defaultDoc,
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

  // ------------------------------------------------------------------ DOM
  root.innerHTML = `
    <aside class="sidebar" aria-label="Expressions">
      <header class="side-head">
        <a class="back" href="../../projects.html" title="Back to projects">← Projects</a>
        <h1>Better Desmos</h1>
        <button class="icon-btn" data-act="settings" title="Settings" aria-label="Settings">⚙</button>
      </header>
      <div class="insert-bar" role="toolbar" aria-label="Insert"></div>
      <div class="rows" role="list"></div>
      <button class="add-row" data-act="add">+ Add expression</button>
      <section class="params" hidden>
        <h2>Parameters</h2>
        <div class="param-list"></div>
      </section>
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
      </div>
      <div class="engine-pill" hidden></div>
    </main>
    <dialog class="settings">
      <form method="dialog">
        <h2>Settings</h2>
        <label class="field">Mode
          <select data-set="mode">
            <option value="2d">2D</option>
            <option value="3d" disabled>3D (coming soon)</option>
            <option value="4d" disabled>4D (coming soon)</option>
          </select>
        </label>
        <fieldset class="field">
          <legend>Angle unit</legend>
          <label><input type="radio" name="angle" value="rad" /> Radians</label>
          <label><input type="radio" name="angle" value="deg" /> Degrees</label>
        </fieldset>
        <label class="check"><input type="checkbox" data-set="grid" /> Grid</label>
        <label class="check"><input type="checkbox" data-set="axes" /> Axes</label>
        <label class="check"><input type="checkbox" data-set="labels" /> Axis labels</label>
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

  const graph = new GraphCanvas(canvasEl, {
    view: doc.view,
    onViewChange: () => saveSoon(),
  });

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
    const del = el("button", { className: "icon-btn del", title: "Delete", type: "button", textContent: "×" });
    del.setAttribute("aria-label", "Delete expression");

    const main = el("div", { className: "row-main" }, mf, msg, rangeBox, actions, result);
    const left = el("div", { className: "row-left" }, handle, swatch, color);
    const rootEl = el("div", { className: "row" }, left, main, del);
    rootEl.dataset.id = row.id;
    rootEl.setAttribute("role", "listitem");

    const state = { root: rootEl, mf, msg, actions, result, rangeBox, swatch, color, busy: false };
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
    graph.setItems(
      doc.rows
        .map((row) => ({ row, result: results.get(row.id) }))
        .filter((i) => i.result)
    );
  }

  function refresh() {
    const out = analyze(doc.rows, { angle: doc.settings.angle, P });
    results = out.results;

    // Reconcile sliders with the free parameters discovered in the rows.
    for (const name of out.params) {
      if (!doc.sliders[name]) doc.sliders[name] = { value: 1, min: -10, max: 10, step: 0.1 };
      P[name] = doc.sliders[name].value;
    }
    const names = [...out.params].sort();
    const key = names.join(",");
    if (key !== paramKey) {
      paramKey = key;
      renderParams(names);
    }

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

    if (res.kind === "parametric" || res.kind === "polar") {
      st.rangeBox.hidden = false;
      const sym = res.kind === "polar" ? "θ" : "t";
      const lo = numInput(res.range[0], (v) => setRange(row, "tmin", v));
      const hi = numInput(res.range[1], (v) => setRange(row, "tmax", v));
      st.rangeBox.replaceChildren(
        el("span", { textContent: `${sym} from` }),
        lo,
        el("span", { textContent: "to" }),
        hi
      );
    }

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
    if (res.eq) {
      const free = new Set();
      collectSymbols(res.eq, free);
      for (const v of ["y", "x"]) {
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
            const eq = out.op === "solve" ? `${out.prefix}${latex}` : `y=${latex}`;
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
    if (out.op === "solve") return out.free.every((s) => s === "x" || s === "y") && !/\\mathrm\{i\}|\bi\b/.test(latex) && out.free.length > 0;
    return out.free.length > 0 && out.free.every((s) => s === "x");
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
          graph.invalidate();
          updateLiveValues();
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
    $("[data-set=mode]", dialog).value = doc.mode;
    for (const r of dialog.querySelectorAll("input[name=angle]")) r.checked = r.value === doc.settings.angle;
    for (const k of ["grid", "axes", "labels"]) $(`[data-set=${k}]`, dialog).checked = doc.settings[k];
    $("[data-set=theme]", dialog).value = currentTheme();
  }

  dialog.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "angle") {
      doc.settings.angle = t.value;
      refresh();
    } else if (t.dataset.set === "theme") {
      setTheme(t.value);
      graph.invalidate();
    } else if (["grid", "axes", "labels"].includes(t.dataset.set)) {
      doc.settings[t.dataset.set] = t.checked;
      graph.setSettings(doc.settings);
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
      case "zoom-in":
        graph.view.zoomAt(graph.view.w / 2, graph.view.h / 2, 1.5);
        graph.invalidate();
        saveSoon();
        break;
      case "zoom-out":
        graph.view.zoomAt(graph.view.w / 2, graph.view.h / 2, 1 / 1.5);
        graph.invalidate();
        saveSoon();
        break;
      case "reset":
        graph.resetView();
        break;
      case "share": {
        doc.view = graph.view.toJSON();
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
        doc.view = graph.view.toJSON();
        download(exportJSON(doc), "better-desmos.json");
        break;
      case "import":
        $("[data-role=file]", root).click();
        break;
      case "png": {
        const blob = await graph.toBlob();
        if (blob) download(blob, "graph.png");
        break;
      }
      case "clear":
        if (confirm("Remove every expression?")) {
          doc.rows = [newRow(null)];
          doc.sliders = {};
          paramKey = "";
          rowEls.clear();
          symResults.clear();
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
    graph.setView(doc.view);
    graph.setSettings(doc.settings);
    renderRows();
    refresh();
  }

  // insert toolbar
  const bar = $(".insert-bar", root);
  for (const [label, latex, title] of INSERTS) {
    const b = el("button", { className: "chip small", type: "button", textContent: label, title });
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep the caret in the field
    b.addEventListener("click", () => {
      const target = lastFocused && lastFocused.isConnected ? lastFocused : rowEls.get(doc.rows[doc.rows.length - 1].id)?.mf;
      if (!target) return;
      target.focus();
      target.insert(latex, { focus: true, feedback: false, selectionMode: "placeholder" });
    });
    bar.append(b);
  }

  // ------------------------------------------------------------------ boot
  graph.setSettings(doc.settings);
  renderRows();
  refresh();
  window.addEventListener("pagehide", persist);
  document.addEventListener("themechange", () => {
    applyMathTheme();
    graph.invalidate();
  });
  applyMathTheme();
}
