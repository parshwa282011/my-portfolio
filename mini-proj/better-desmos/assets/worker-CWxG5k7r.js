const e=`https://cdn.jsdelivr.net/pyodide/v314.0.7/full/`;let t=null;async function n(){let{loadPyodide:t}=await import(
/* @vite-ignore */
`${e}pyodide.mjs`),n=await t({indexURL:e});return await n.loadPackage(`sympy`),await n.runPythonAsync(`
from sympy import *
import json

_NS = {k: v for k, v in globals().items() if not k.startswith('__')}

def _S(name):
    return Symbol(name)

_NS['_S'] = _S

def _tex(e):
    return latex(e, ln_notation=True, inv_trig_style='full')

def _calc(payload):
    p = json.loads(payload)
    op = p['op']
    expr = eval(p['src'], _NS)
    if op == 'solve':
        rhs = eval(p['src2'], _NS)
        items = solve(Eq(expr, rhs), Symbol(p['var']))
    else:
        r = expr.doit() if hasattr(expr, 'doit') else expr
        if op in ('exact', 'simplify'):
            r = simplify(r)
        elif op == 'expand':
            r = expand(r)
        elif op == 'factor':
            r = factor(r)
        items = [r]
    free = sorted({str(s) for r in items for s in getattr(r, 'free_symbols', set())})
    numeric = None
    if len(items) == 1 and not free:
        try:
            numeric = str(N(items[0], 12))
        except Exception:
            numeric = None
    return json.dumps({
        'items': [_tex(i) for i in items],
        'plain': [str(i) for i in items],
        'free': free,
        'numeric': numeric,
    })
`),self.postMessage({type:`status`,status:`ready`}),n}self.onmessage=async e=>{let{id:r,payload:i}=e.data;try{t||=n();let e=(await t).globals.get(`_calc`)(JSON.stringify(i));self.postMessage({id:r,ok:!0,result:JSON.parse(e)})}catch(e){let t=String(e&&e.message||e).trim().split(`
`).filter(Boolean).pop()||`Failed`;self.postMessage({id:r,ok:!1,error:t})}};