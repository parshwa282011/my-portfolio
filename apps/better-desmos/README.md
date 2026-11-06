# Better Desmos

Source for `mini-proj/better-desmos/`. A static, client-only graphing calculator: no server, hosted on GitHub Pages.

```bash
cd apps/better-desmos
npm install
npm run dev      # local dev server
npm test         # Vitest (parser, compiler, geometry, SymPy translation)
npm run build    # writes the site to ../../mini-proj/better-desmos (commit the output)
```

## How it works

| Layer | Where | Notes |
|---|---|---|
| Input | MathLive `<math-field>` | LaTeX in, one field per row |
| Parse | `src/engine/parse.js` | Cortex Compute Engine, LaTeX to MathJSON, then `normalize()` |
| Classify and compile | `src/engine/analyze.js`, `inline.js`, `codegen.js` | Row type detection, user functions and variables, degree mode, MathJSON to JS. Sliders live in a shared object `P`, so moving one never recompiles |
| Calculus (fast path) | `diff.js`, `runtime.js` | Symbolic derivatives, adaptive Gauss-Kronrod integrals, numeric limits |
| 2D rendering | `src/render2d/` | Canvas. Adaptive curve tracing, marching squares for implicit curves, raster for inequalities, numeric roots, extrema and intersections |
| Exact math | `src/symbolic/` | SymPy in a Pyodide worker loaded from the jsDelivr CDN on first use (about 10 MB, cached). `toSympy.js` translates the same MathJSON |
| State | `src/state/doc.js` | One JSON document: localStorage autosave, share link in the URL hash (`#d=`), JSON import and export |

Row types: `y=f(x)`, `x=f(y)`, implicit `F(x,y)=G(x,y)`, inequalities, parametric `(x(t),y(t))`, polar `r=f(θ)`, points and lists of points, `f(x)=…` definitions, `a=…` constants, and plain numeric expressions. Undefined symbols such as `a` or `k` become sliders automatically.

## Planned

3D (three.js), vector fields, and 4D slicing (`F(x,y,z,w)=0` with `w` as a slider). The document has a `mode` field and rendering sits behind `src/render2d/`, so these can be added without touching input or state.

## Notes

- Pyodide only works over `http(s)`, so test through a server, not `file://`.
- Opening a share link keeps edits in the URL and never overwrites the viewer's own saved graph.
