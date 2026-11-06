import { ComputeEngine } from "@cortex-js/compute-engine";
import { findError, normalize } from "./ast.js";

let ce;

// The Compute Engine has no ∇, so a leading nabla is handled here:
//   ∇f   ∇·F   ∇×F   ∇²f      (optionally with a leading minus)
// -> ["$Nabla", "'grad'|'div'|'curl'|'lap'", negated(0|1), operand]
const NABLA = /^(-?)\s*\\nabla\s*(\^\{?2\}?|\\cdot|\\times)?\s*([\s\S]*)$/;
const NABLA_OP = { "^2": "lap", "^{2}": "lap", "\\cdot": "div", "\\times": "curl" };

// LaTeX -> normalized MathJSON. Returns { empty: true } | { error } | { ast }.
export function parseLatex(latex) {
  const text = (latex ?? "").trim();
  if (!text) return { empty: true };
  const n = NABLA.exec(text);
  if (n) {
    const inner = parseLatex(n[3]);
    if (inner.empty) return { error: "∇ needs something to act on, like ∇f(x,y,z)" };
    if (inner.error) return inner;
    return { ast: ["$Nabla", `'${NABLA_OP[n[2]] || "grad"}'`, n[1] ? 1 : 0, inner.ast] };
  }
  try {
    ce ??= new ComputeEngine();
    const json = ce.parse(text).json;
    const err = findError(json);
    if (err) return { error: `Could not read this expression (${err})` };
    return { ast: normalize(json) };
  } catch (e) {
    return { error: "Could not read this expression" };
  }
}
