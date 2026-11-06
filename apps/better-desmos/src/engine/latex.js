// Normalized MathJSON -> LaTeX that MathLive displays and the Compute Engine
// can read back (so results can be re-plotted).
import { isArr, isNum, isSym } from "./ast.js";

const GREEK = new Set([
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda",
  "mu", "nu", "xi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
]);

const FUNC = {
  Sin: "\\sin", Cos: "\\cos", Tan: "\\tan", Cot: "\\cot", Sec: "\\sec", Csc: "\\csc",
  Arcsin: "\\arcsin", Arccos: "\\arccos", Arctan: "\\arctan",
  Sinh: "\\sinh", Cosh: "\\cosh", Tanh: "\\tanh", Coth: "\\coth",
  Ln: "\\ln", Lg: "\\lg", Lb: "\\operatorname{lb}",
  Arsinh: "\\operatorname{arsinh}", Arcsinh: "\\operatorname{arsinh}",
  Arcosh: "\\operatorname{arcosh}", Arccosh: "\\operatorname{arcosh}",
  Artanh: "\\operatorname{artanh}", Arctanh: "\\operatorname{artanh}",
  Sign: "\\operatorname{sign}", Erf: "\\operatorname{erf}", Gamma: "\\Gamma",
  Round: "\\operatorname{round}", Max: "\\max", Min: "\\min",
};

const num = (n) => {
  if (n === Infinity) return "\\infty";
  if (n === -Infinity) return "-\\infty";
  if (Number.isNaN(n)) return "\\mathrm{undefined}";
  if (Number.isInteger(n)) return String(n);
  const s = String(Number(n.toPrecision(10)));
  return s.includes("e") ? s.replace(/e([+-]?)(\d+)/, "\\times10^{$1$2}").replace("^{+", "^{") : s;
};

const sym = (s) => {
  if (s === "Pi") return "\\pi";
  if (s === "ExponentialE") return "e";
  if (GREEK.has(s)) return `\\${s}`;
  if (s.length === 1) return s;
  return `\\operatorname{${s}}`;
};

const isAtom = (a) => isSym(a) || (isNum(a) && a >= 0);
const paren = (s) => `\\left(${s}\\right)`;
const startsDigit = (s) => /^[0-9.]/.test(s);
const endsDigit = (s) => /[0-9]$/.test(s);

function p(a) {
  if (isNum(a)) return num(a);
  if (isSym(a)) return sym(a);
  if (!isArr(a)) return "";
  const [h, ...r] = a;
  switch (h) {
    case "Add": {
      let out = "";
      r.forEach((t, i) => {
        if (isArr(t) && t[0] === "Negate") out += ` - ${wrapAdd(t[1])}`;
        else if (isNum(t) && t < 0) out += ` - ${num(-t)}`;
        else out += (i ? " + " : "") + p(t);
      });
      return out.replace(/^ - /, "-");
    }
    case "Subtract":
      return `${p(r[0])} - ${wrapAdd(r[1])}`;
    case "Negate":
      return `-${wrapAdd(r[0])}`;
    case "Multiply": {
      let out = "";
      r.forEach((f, i) => {
        const s = isArr(f) && (f[0] === "Add" || f[0] === "Subtract") ? paren(p(f)) : p(f);
        if (i && ((isNum(r[i - 1]) || endsDigit(out)) && startsDigit(s))) out += "\\cdot ";
        else if (/\\[a-zA-Z]+$/.test(out) && /^[a-zA-Z]/.test(s)) out += " ";
        out += s;
      });
      return out;
    }
    case "Divide":
      return `\\frac{${p(r[0])}}{${p(r[1])}}`;
    case "Power": {
      const b = r[0];
      const bs = isAtom(b) ? p(b) : paren(p(b));
      return `${bs}^{${p(r[1])}}`;
    }
    case "Sqrt":
      return `\\sqrt{${p(r[0])}}`;
    case "Root":
      return `\\sqrt[${p(r[1])}]{${p(r[0])}}`;
    case "Exp":
      return `e^{${p(r[0])}}`;
    case "Abs":
      return `\\left|${p(r[0])}\\right|`;
    case "Floor":
      return `\\lfloor ${p(r[0])}\\rfloor`;
    case "Ceil":
      return `\\lceil ${p(r[0])}\\rceil`;
    case "Log":
      return r.length > 1 ? `\\log_{${p(r[1])}}${paren(p(r[0]))}` : `\\log${paren(p(r[0]))}`;
    case "Factorial":
      return `${isAtom(r[0]) ? p(r[0]) : paren(p(r[0]))}!`;
    case "Mod":
      return `\\operatorname{mod}${paren(r.map(p).join(","))}`;
    case "Arctan2":
      return `\\operatorname{atan2}${paren(r.map(p).join(","))}`;
    case "Tuple":
      return paren(r.map(p).join(","));
    case "List":
      return `\\left[${r.map(p).join(",")}\\right]`;
    case "$Vec":
      return `\\left\\langle ${r.map(p).join(",")}\\right\\rangle`;
    case "D":
      return `\\frac{d}{d${sym(r[1])}}${paren(p(r[0]))}`;
    case "$Sum":
    case "$Prod":
      return `\\${h === "$Sum" ? "sum" : "prod"}_{${sym(r[1])}=${p(r[2])}}^{${p(r[3])}}${wrapAdd(r[0])}`;
    case "$Int":
      return r[2] === null
        ? `\\int ${p(r[0])}\\,d${sym(r[1])}`
        : `\\int_{${p(r[2])}}^{${p(r[3])}}${p(r[0])}\\,d${sym(r[1])}`;
    case "$Lim":
      return `\\lim_{${sym(r[1])}\\to ${p(r[2])}}${wrapAdd(r[0])}`;
    default:
      if (FUNC[h]) return `${FUNC[h]}${paren(r.map(p).join(","))}`;
      return `\\operatorname{${h}}${paren(r.map(p).join(","))}`;
  }
}

const wrapAdd = (a) => (isArr(a) && (a[0] === "Add" || a[0] === "Subtract") ? paren(p(a)) : p(a));

export const toLatex = (ast) => p(ast);
