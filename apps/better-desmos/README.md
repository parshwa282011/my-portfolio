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
| Display algebra | `simplify.js`, `latex.js`, `vector.js` | Derivative results are simplified and printed as LaTeX (`∂/∂x (x²y)` → `2xy`) without SymPy; gradient, divergence and curl |
| 2D rendering | `src/render2d/` | Canvas. Adaptive curve tracing, marching squares for implicit curves, raster for inequalities, numeric roots, extrema and intersections. `field2d.js`: vector-field arrows and streamlines |
| 3D rendering | `src/render3d/` | three.js, lazy-loaded the first time 3D is opened. `geometry3d.js` is pure (heightfields, marching tetrahedra, tubes, field sampling) and unit-tested; `scene3d.js` is the scene, orbit controls and hover read-out |
| Exact math | `src/symbolic/` | SymPy in a Pyodide worker loaded from the jsDelivr CDN on first use (about 10 MB, cached). `toSympy.js` translates the same MathJSON |
| State | `src/state/doc.js` | One JSON document: localStorage autosave, share link in the URL hash (`#d=`), JSON import and export |

Row types in 2D: `y=f(x)`, `x=f(y)`, implicit `F(x,y)=G(x,y)`, inequalities, parametric `(x(t),y(t))`, polar `r=f(θ)`, points and lists of points, vector fields `⟨P,Q⟩`, `f(x)=…` definitions, `a=…` constants, and plain numeric expressions. Undefined symbols such as `a` or `k` become sliders automatically.

Row types in 3D: surfaces `z=f(x,y)` (also `y=f(x,z)`, `x=f(y,z)`), implicit surfaces `F(x,y,z)=G(x,y,z)`, space curves `(x(t),y(t),z(t))`, parametric surfaces `(x(u,v),y(u,v),z(u,v))`, points, and vector fields `⟨P,Q,R⟩`. A bare `f(x,y)` is drawn as `z=f(x,y)`. Each mode keeps its own list of rows. A free `w` already acts as a slider, which gives a 4D slice for free.

### Vector fields

Write `⟨P,Q⟩` (or `⟨P,Q,R⟩` in 3D), or any tuple that mentions `x`, `y` or `z`. Arrows sit on a grid at multiples of the spacing ("every 0.25 / 0.5 / 1 / 2 / 5"), chosen per row or as the default in Settings. If the requested spacing would be unreadably dense for the current zoom, it is raised by a whole factor and the canvas says so. Length is either proportional to the field's size (normalised to the 90th percentile so one pole cannot flatten everything) or equal for all arrows; colour optionally encodes magnitude. 2D also has evenly spaced streamlines. The ∇·F and ∇×F buttons compute divergence and curl symbolically, and ∇f gives the gradient of a scalar row.

## Planned

True 4D rotation and projection, complex domain colouring, regression and tables.
