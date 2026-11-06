import { toSympy } from "./toSympy.js";

// Thin promise wrapper around the SymPy worker. The worker (and the ~10 MB
// Pyodide download) is only created on the first symbolic request.
export class Symbolic {
  constructor(onStatus = () => {}) {
    this.onStatus = onStatus;
    this.status = "idle"; // idle | loading | ready
    this.worker = null;
    this.pending = new Map();
    this.nextId = 1;
  }

  _setStatus(s) {
    this.status = s;
    this.onStatus(s);
  }

  _spawn() {
    this.worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "status") {
        this._setStatus(m.status);
        return;
      }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.ok) p.resolve(m.result);
      else p.reject(new Error(m.error));
    };
    this.worker.onerror = () => {
      this._reset(new Error("The math engine failed to load. Check your connection."));
    };
    this._setStatus("loading");
  }

  _reset(err) {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
    this._setStatus("idle");
  }

  _request(payload, timeoutMs) {
    if (!this.worker) this._spawn();
    // The first request also pays for downloading Pyodide + SymPy.
    if (this.status !== "ready") timeoutMs += 180000;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // SymPy cannot be interrupted: drop the worker, a new one starts next time.
        this._reset(new Error("Took too long, so I stopped it. Try a simpler expression."));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, payload });
    });
  }

  // op: exact | simplify | expand | factor, on a normalized+inlined AST
  compute(op, ast, timeoutMs = 60000) {
    return this._request({ op, src: toSympy(ast) }, timeoutMs);
  }

  // Solve lhs = rhs for `variable`
  solve(lhs, rhs, variable, timeoutMs = 60000) {
    return this._request({ op: "solve", src: toSympy(lhs), src2: toSympy(rhs), var: variable }, timeoutMs);
  }
}
