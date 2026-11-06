import { ComputeEngine } from "@cortex-js/compute-engine";
import { findError, normalize } from "./ast.js";

let ce;

// LaTeX -> normalized MathJSON. Returns { empty: true } | { error } | { ast }.
export function parseLatex(latex) {
  const text = (latex ?? "").trim();
  if (!text) return { empty: true };
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
