(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))n(r);new MutationObserver(r=>{for(const a of r)if(a.type==="childList")for(const i of a.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&n(i)}).observe(document,{childList:!0,subtree:!0});function e(r){const a={};return r.integrity&&(a.integrity=r.integrity),r.referrerPolicy&&(a.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?a.credentials="include":r.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function n(r){if(r.ep)return;r.ep=!0;const a=e(r);fetch(r.href,a)}})();class Le{__destroy_into_raw(){const t=this.__wbg_ptr;return this.__wbg_ptr=0,Be.unregister(this),t}free(){const t=this.__destroy_into_raw();o.__wbg_engine_free(t,0)}assemble(){let t,e;try{const n=o.engine_assemble(this.__wbg_ptr);return t=n[0],e=n[1],O(n[0],n[1])}finally{o.__wbindgen_free(t,e,1)}}blocks_json(){let t,e;try{const n=o.engine_blocks_json(this.__wbg_ptr);return t=n[0],e=n[1],O(n[0],n[1])}finally{o.__wbindgen_free(t,e,1)}}board(){return o.engine_board(this.__wbg_ptr)>>>0}break_block(){return o.engine_break_block(this.__wbg_ptr)!==0}disassemble(){let t,e;try{const n=o.engine_disassemble(this.__wbg_ptr);return t=n[0],e=n[1],O(n[0],n[1])}finally{o.__wbindgen_free(t,e,1)}}dismount(){o.engine_dismount(this.__wbg_ptr)}look(t,e){o.engine_look(this.__wbg_ptr,t,e)}constructor(t){const e=o.engine_new(t);return this.__wbg_ptr=e,Be.register(this,this.__wbg_ptr,this),this}next_chunk_mesh(){const t=o.engine_next_chunk_mesh(this.__wbg_ptr);return t===0?void 0:Y.__wrap(t)}phenomena_json(){let t,e;try{const n=o.engine_phenomena_json(this.__wbg_ptr);return t=n[0],e=n[1],O(n[0],n[1])}finally{o.__wbindgen_free(t,e,1)}}place_block(t){const e=ne(t,o.__wbindgen_malloc,o.__wbindgen_realloc),n=W;return o.engine_place_block(this.__wbg_ptr,e,n)!==0}player_state(){const t=o.engine_player_state(this.__wbg_ptr);var e=ye(t[0],t[1]).slice();return o.__wbindgen_free(t[0],t[1]*4,4),e}set_block(t,e,n,r){const a=+t,i=+e,u=+n,d=ne(r,o.__wbindgen_malloc,o.__wbindgen_realloc),l=W;return o.engine_set_block(this.__wbg_ptr,a,i,u,d,l)!==0}set_budgets(t,e){o.engine_set_budgets(this.__wbg_ptr,t,e)}set_input(t,e,n,r,a){o.engine_set_input(this.__wbg_ptr,t,e,n,r,a)}set_look(t,e){o.engine_set_look(this.__wbg_ptr,t,e)}set_phenomenon(t,e){let n,r;try{const a=+e,i=ne(t,o.__wbindgen_malloc,o.__wbindgen_realloc),u=W,d=o.engine_set_phenomenon(this.__wbg_ptr,i,u,a);return n=d[0],r=d[1],O(d[0],d[1])}finally{o.__wbindgen_free(n,r,1)}}set_physics_preset(t){const e=ne(t,o.__wbindgen_malloc,o.__wbindgen_realloc),n=W;o.engine_set_physics_preset(this.__wbg_ptr,e,n)}set_view_distance(t){o.engine_set_view_distance(this.__wbg_ptr,t)}spawn_demo(t){let e,n;try{const r=ne(t,o.__wbindgen_malloc,o.__wbindgen_realloc),a=W,i=o.engine_spawn_demo(this.__wbg_ptr,r,a);return e=i[0],n=i[1],O(i[0],i[1])}finally{o.__wbindgen_free(e,n,1)}}stats(){let t,e;try{const n=o.engine_stats(this.__wbg_ptr);return t=n[0],e=n[1],O(n[0],n[1])}finally{o.__wbindgen_free(t,e,1)}}structure_ids(){const t=o.engine_structure_ids(this.__wbg_ptr);var e=we(t[0],t[1]).slice();return o.__wbindgen_free(t[0],t[1]*4,4),e}structure_info(t){let e,n;try{const r=o.engine_structure_info(this.__wbg_ptr,t);return e=r[0],n=r[1],O(r[0],r[1])}finally{o.__wbindgen_free(e,n,1)}}structure_mesh(t){const e=o.engine_structure_mesh(this.__wbg_ptr,t);return e===0?void 0:Y.__wrap(e)}structure_pose(t){const e=o.engine_structure_pose(this.__wbg_ptr,t);var n=ye(e[0],e[1]).slice();return o.__wbindgen_free(e[0],e[1]*4,4),n}take_changed_structures(){const t=o.engine_take_changed_structures(this.__wbg_ptr);var e=we(t[0],t[1]).slice();return o.__wbindgen_free(t[0],t[1]*4,4),e}take_removed_chunks(){const t=o.engine_take_removed_chunks(this.__wbg_ptr);var e=ze(t[0],t[1]).slice();return o.__wbindgen_free(t[0],t[1]*4,4),e}target_block(){const t=o.engine_target_block(this.__wbg_ptr);var e=ze(t[0],t[1]).slice();return o.__wbindgen_free(t[0],t[1]*4,4),e}teleport(t,e,n){o.engine_teleport(this.__wbg_ptr,t,e,n)}tick(t){o.engine_tick(this.__wbg_ptr,t)}toggle_fly(){return o.engine_toggle_fly(this.__wbg_ptr)!==0}}Symbol.dispose&&(Le.prototype[Symbol.dispose]=Le.prototype.free);class Y{static __wrap(t){const e=Object.create(Y.prototype);return e.__wbg_ptr=t,qe.register(e,e.__wbg_ptr,e),e}__destroy_into_raw(){const t=this.__wbg_ptr;return this.__wbg_ptr=0,qe.unregister(this),t}free(){const t=this.__destroy_into_raw();o.__wbg_meshout_free(t,0)}get cx(){return o.meshout_cx(this.__wbg_ptr)}get cy(){return o.meshout_cy(this.__wbg_ptr)}get cz(){return o.meshout_cz(this.__wbg_ptr)}fluid_indices(){const t=o.meshout_fluid_indices(this.__wbg_ptr);var e=we(t[0],t[1]).slice();return o.__wbindgen_free(t[0],t[1]*4,4),e}fluid_vertices(){const t=o.meshout_fluid_vertices(this.__wbg_ptr);var e=ye(t[0],t[1]).slice();return o.__wbindgen_free(t[0],t[1]*4,4),e}opaque_indices(){const t=o.meshout_opaque_indices(this.__wbg_ptr);var e=we(t[0],t[1]).slice();return o.__wbindgen_free(t[0],t[1]*4,4),e}opaque_vertices(){const t=o.meshout_opaque_vertices(this.__wbg_ptr);var e=ye(t[0],t[1]).slice();return o.__wbindgen_free(t[0],t[1]*4,4),e}}Symbol.dispose&&(Y.prototype[Symbol.dispose]=Y.prototype.free);function Ge(){return{__proto__:null,"./fulcrum_wasm_bg.js":{__proto__:null,__wbg___wbindgen_throw_4c88d8bf264fd984:function(t,e){throw new Error(O(t,e))},__wbindgen_init_externref_table:function(){const t=o.__wbindgen_externrefs;t.set(0,void 0),t.set(1024,void 0),t.set(1025,null),t.set(1026,!0),t.set(1027,!1)}}}}const Be=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(s=>o.__wbg_engine_free(s,1)),qe=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(s=>o.__wbg_meshout_free(s,1));function ye(s,t){return s=s>>>0,De().subarray(s/4,s/4+t)}function ze(s,t){return s=s>>>0,Ie().subarray(s/4,s/4+t)}function we(s,t){return s=s>>>0,We().subarray(s/4,s/4+t)}let ie=null;function De(){return(ie===null||ie.byteLength===0)&&(ie=new Float32Array(o.memory.buffer)),ie}let oe=null;function Ie(){return(oe===null||oe.byteLength===0)&&(oe=new Int32Array(o.memory.buffer)),oe}function O(s,t){return s=s>>>0,je(me().subarray(s,s+t))}let ae=null;function We(){return(ae===null||ae.byteLength===0)&&(ae=new Uint32Array(o.memory.buffer)),ae}let ce=null;function me(){return(ce===null||ce.byteLength===0)&&(ce=new Uint8Array(o.memory.buffer)),ce}function ne(s,t,e){if(e===void 0){const u=le.encode(s),d=t(u.length,1)>>>0;return me().subarray(d,d+u.length).set(u),W=u.length,d}let n=s.length,r=t(n,1)>>>0;const a=me();let i=0;for(;i<n;i++){const u=s.charCodeAt(i);if(u>127)break;a[r+i]=u}if(i!==n){i!==0&&(s=s.slice(i)),r=e(r,n,n=i+s.length*3,1)>>>0;const u=me().subarray(r+i,r+n),d=le.encodeInto(s,u);i+=d.written,r=e(r,n,i,1)>>>0}return W=i,r}let be=new TextDecoder("utf-8",{ignoreBOM:!0});be.decode();const Ve=2146435072;let Se=0;function je(s){return Se+=s.length,Se>=Ve&&(be=new TextDecoder("utf-8",{ignoreBOM:!0}),be.decode(),Se=s.length),be.decode(s)}const le=new TextEncoder;"encodeInto"in le||(le.encodeInto=function(s,t){const e=le.encode(s);return t.set(e),{read:s.length,written:e.length}});let W=0,o;function Ke(s,t){return o=s.exports,ie=null,oe=null,ae=null,ce=null,o.__wbindgen_start(),o}async function He(s,t){if(typeof Response=="function"&&s instanceof Response){if(!s.ok)throw new Error(`failed to fetch Wasm: ${s.status} ${s.statusText} fetching '${s.url}'`);if(typeof WebAssembly.instantiateStreaming=="function")try{return await WebAssembly.instantiateStreaming(s,t)}catch(r){if(e(s.type)&&s.headers.get("Content-Type")!=="application/wasm")console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n",r);else throw r}const n=await s.arrayBuffer();return await WebAssembly.instantiate(n,t)}else{const n=await WebAssembly.instantiate(s,t);return n instanceof WebAssembly.Instance?{instance:n,module:s}:n}function e(n){switch(n){case"basic":case"cors":case"default":return!0}return!1}}let se;async function Je(s){return o!==void 0?o:(se===void 0&&(se=Xe(s),se.catch(()=>{se=void 0})),se)}async function Xe(s){s!==void 0&&(Object.getPrototypeOf(s)===Object.prototype?{module_or_path:s}=s:console.warn("using deprecated parameters for the initialization function; pass a single object instead")),s===void 0&&(s=new URL(""+new URL("fulcrum_wasm_bg-wjIyxU8E.wasm",import.meta.url).href,import.meta.url));const t=Ge();(typeof s=="string"||typeof Request=="function"&&s instanceof Request||typeof URL=="function"&&s instanceof URL)&&(s=fetch(s));const{instance:e,module:n}=await He(await s,t);return Ke(e)}const Ye=`
struct Globals {
  view_proj : mat4x4<f32>,
  inv_view_proj : mat4x4<f32>,
  cam_pos : vec4<f32>,      // xyz, w = time (s)
  sun_dir : vec4<f32>,      // xyz toward the sun, w = daylight 0..1
  sky : vec4<f32>,          // horizon colour (linear)
  zenith : vec4<f32>,
  params : vec4<f32>,       // x fog start, y fog end, z ao strength, w detail (0/1)
  dirt : vec4<f32>,
  palette : array<vec4<f32>, 128>,  // rgb linear, w = pattern kind
};
struct Model { m : mat4x4<f32> };

@group(0) @binding(0) var<uniform> g : Globals;
@group(1) @binding(0) var<uniform> model : Model;

struct VIn {
  @location(0) pos : vec3<f32>,
  @location(1) uv : vec2<f32>,
  @location(2) data : vec3<f32>,   // normal id, ao, block id
};
struct VOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) world : vec3<f32>,
  @location(1) ao : f32,
  @location(2) @interpolate(flat) nid : u32,
  @location(3) @interpolate(flat) block : u32,
  @location(4) local : vec3<f32>,
};

const NORMALS = array<vec3<f32>, 6>(
  vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(-1.0, 0.0, 0.0),
  vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(0.0, -1.0, 0.0),
  vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(0.0, 0.0, -1.0));

@vertex fn vs(v : VIn) -> VOut {
  var o : VOut;
  let w = model.m * vec4<f32>(v.pos, 1.0);
  o.clip = g.view_proj * w;
  o.world = w.xyz;
  o.ao = v.data.y;
  o.nid = u32(v.data.x);
  o.block = u32(v.data.z);
  o.local = v.pos;
  return o;
}

fn hash3(p : vec3<f32>) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

fn world_normal(nid : u32) -> vec3<f32> {
  let n = NORMALS[nid];
  return normalize((model.m * vec4<f32>(n, 0.0)).xyz);
}

// colour of the block surface at a point; 'ab' are face-local coordinates in 0..1
fn surface(kind : u32, base : vec3<f32>, local : vec3<f32>, nid : u32, h : f32) -> vec3<f32> {
  var c = base * (0.9 + 0.2 * h);
  let n = NORMALS[nid];
  let f = fract(local + n * 0.002 + 8.0);
  var ab = vec2<f32>(f.x, f.z);
  if (abs(n.x) > 0.5) { ab = vec2<f32>(f.z, f.y); }
  else if (abs(n.z) > 0.5) { ab = vec2<f32>(f.x, f.y); }
  let edge = min(min(ab.x, 1.0 - ab.x), min(ab.y, 1.0 - ab.y));
  if (g.params.w < 0.5) { return c; }
  switch (kind) {
    case 1u: { // grass
      if (nid == 2u) { c = base * (0.85 + 0.3 * h); }
      else if (nid == 3u) { c = g.dirt.rgb * (0.9 + 0.2 * h); }
      else if (f.y > 0.8 - 0.1 * h) { c = base * (0.85 + 0.3 * h); }
      else { c = g.dirt.rgb * (0.9 + 0.2 * h); }
    }
    case 4u: { // planks
      let plank = floor(ab.y * 4.0);
      c = base * (0.92 + 0.12 * hash3(vec3<f32>(plank, f32(nid), 3.0)));
      if (fract(ab.y * 4.0) < 0.07) { c = c * 0.68; }
      if (abs(fract(ab.x * 2.0 + plank * 0.37) - 0.5) > 0.47) { c = c * 0.85; }
    }
    case 5u: { // hull plating
      if (edge < 0.06) { c = c * 0.62; }
      let rivet = min(length(ab - vec2<f32>(0.16, 0.16)), min(length(ab - vec2<f32>(0.84, 0.16)), min(length(ab - vec2<f32>(0.16, 0.84)), length(ab - vec2<f32>(0.84, 0.84)))));
      if (rivet < 0.045) { c = c * 1.25; }
    }
    case 6u: { // frame: cross-braced lattice
      if (abs(ab.x - ab.y) < 0.07 || abs(ab.x + ab.y - 1.0) < 0.07 || edge < 0.09) { c = c * 0.55; }
    }
    case 7u: { // fabric weave
      let wv = (floor(ab.x * 8.0) + floor(ab.y * 8.0)) % 2.0;
      c = base * (0.94 + 0.08 * wv);
      if (edge < 0.04) { c = c * 0.82; }
    }
    case 8u: { // propeller housing
      if (edge < 0.08) { c = c * 0.6; }
      let r = length(ab - vec2<f32>(0.5, 0.5));
      if (r < 0.26 && r > 0.2) { c = c * 1.4; }
    }
    case 9u: { // helm
      let r = length(ab - vec2<f32>(0.5, 0.5));
      if (r < 0.34 && r > 0.26) { c = vec3<f32>(0.18, 0.12, 0.08); }
      if (edge < 0.05) { c = c * 0.7; }
    }
    case 10u: { // log
      if (nid == 2u || nid == 3u) {
        let r = length(ab - vec2<f32>(0.5, 0.5));
        c = base * (0.75 + 0.35 * (0.5 + 0.5 * sin(r * 34.0)));
        if (r > 0.47) { c = base * 0.55; }
      } else {
        c = base * (0.7 + 0.3 * hash3(vec3<f32>(floor(ab.x * 6.0), 1.0, f32(nid))));
      }
    }
    default: { }
  }
  return c;
}

fn sky_color(dir : vec3<f32>) -> vec3<f32> {
  let day = g.sun_dir.w;
  let t = clamp(dir.y, 0.0, 1.0);
  var col = mix(g.sky.rgb, g.zenith.rgb, pow(t, 0.55));
  if (dir.y < 0.0) { col = mix(g.sky.rgb, g.sky.rgb * 0.5, clamp(-dir.y * 3.0, 0.0, 1.0)); }
  let sd = max(dot(dir, g.sun_dir.xyz), 0.0);
  col += vec3<f32>(1.0, 0.8, 0.5) * pow(sd, 90.0) * 1.2 * day;
  col += vec3<f32>(1.0, 0.55, 0.25) * pow(sd, 6.0) * 0.18 * day;
  if (sd > 0.9994) { col = vec3<f32>(3.0, 2.8, 2.2); }
  if (day < 0.6 && dir.y > 0.0) {
    let s = hash3(floor(dir * 260.0));
    if (s > 0.9965) { col += vec3<f32>(0.9) * (1.0 - day / 0.6); }
  }
  return col;
}

fn tonemap(c : vec3<f32>) -> vec4<f32> {
  let m = c / (1.0 + c * 0.35);
  return vec4<f32>(pow(max(m, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2)), 1.0);
}

@fragment fn fs_opaque(i : VOut) -> @location(0) vec4<f32> {
  let pal = g.palette[min(i.block, 127u)];
  let kind = u32(pal.w);
  let texel = floor((i.local + NORMALS[i.nid] * 0.002) * 8.0);
  let h = hash3(texel + vec3<f32>(f32(i.nid), 0.0, 0.0));
  if (kind == 2u && h < 0.2) { discard; }
  let albedo = surface(kind, pal.rgb, i.local, i.nid, h);
  let n = world_normal(i.nid);
  let day = g.sun_dir.w;
  let ao = mix(1.0, 0.35 + 0.65 * (i.ao / 3.0), g.params.z);
  let sun = max(dot(n, g.sun_dir.xyz), 0.0) * day;
  let hemi = mix(vec3<f32>(0.10, 0.09, 0.08), g.zenith.rgb * 1.2 + vec3<f32>(0.08), n.y * 0.5 + 0.5);
  let amb = hemi * (0.35 + 0.65 * day) + vec3<f32>(0.02, 0.025, 0.04);
  let lit = albedo * (amb * ao + vec3<f32>(1.0, 0.95, 0.85) * sun * 1.25 * (0.55 + 0.45 * ao));
  let to = i.world - g.cam_pos.xyz;
  let d = length(to);
  let fog = clamp((d - g.params.x) / max(g.params.y - g.params.x, 1.0), 0.0, 1.0);
  return tonemap(mix(lit, sky_color(to / max(d, 0.001)), fog * fog));
}

@fragment fn fs_water(i : VOut) -> @location(0) vec4<f32> {
  let pal = g.palette[min(i.block, 127u)];
  let t = g.cam_pos.w;
  var n = world_normal(i.nid);
  if (i.nid == 2u) {
    let p = i.world.xz;
    n = normalize(vec3<f32>(0.05 * sin(p.x * 1.7 + t * 1.3) + 0.03 * sin(p.y * 3.1 - t), 1.0, 0.05 * sin(p.y * 1.3 + t * 1.1) + 0.03 * sin(p.x * 2.7 + t * 0.8)));
  }
  let to = i.world - g.cam_pos.xyz;
  let d = length(to);
  let v = to / max(d, 0.001);
  let fres = pow(1.0 - max(dot(-v, n), 0.0), 4.0);
  let refl = reflect(v, n);
  var col = pal.rgb * (0.25 + 0.75 * g.sun_dir.w) + sky_color(vec3<f32>(refl.x, abs(refl.y), refl.z)) * (0.15 + 0.7 * fres);
  let spec = pow(max(dot(refl, g.sun_dir.xyz), 0.0), 120.0) * g.sun_dir.w;
  col += vec3<f32>(1.0, 0.95, 0.85) * spec * 2.0;
  let fog = clamp((d - g.params.x) / max(g.params.y - g.params.x, 1.0), 0.0, 1.0);
  col = mix(col, sky_color(v), fog * fog);
  var out = tonemap(col);
  out.a = mix(0.6, 0.92, fres);
  return out;
}

struct SkyOut { @builtin(position) pos : vec4<f32>, @location(0) ndc : vec2<f32> };
@vertex fn vs_sky(@builtin(vertex_index) vi : u32) -> SkyOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o : SkyOut;
  o.pos = vec4<f32>(p[vi], 1.0, 1.0);
  o.ndc = p[vi];
  return o;
}
@fragment fn fs_sky(i : SkyOut) -> @location(0) vec4<f32> {
  let far = g.inv_view_proj * vec4<f32>(i.ndc, 1.0, 1.0);
  let dir = normalize(far.xyz / far.w - g.cam_pos.xyz);
  return tonemap(sky_color(dir));
}

@vertex fn vs_line(@location(0) pos : vec3<f32>) -> @builtin(position) vec4<f32> {
  return g.view_proj * (model.m * vec4<f32>(pos, 1.0));
}
@fragment fn fs_line() -> @location(0) vec4<f32> {
  return vec4<f32>(0.02, 0.02, 0.02, 1.0);
}
`;function Te(){const s=new Float32Array(16);return s[0]=s[5]=s[10]=s[15]=1,s}function Qe(s,t,e,n){const r=1/Math.tan(s/2),a=new Float32Array(16);return a[0]=r/t,a[5]=r,a[10]=n/(e-n),a[11]=-1,a[14]=n*e/(e-n),a}function Ze(s,t,e){const n=Fe(st(s,t)),r=Fe(Re(e,n)),a=Re(n,r),i=new Float32Array(16);return i[0]=r[0],i[1]=a[0],i[2]=n[0],i[4]=r[1],i[5]=a[1],i[6]=n[1],i[8]=r[2],i[9]=a[2],i[10]=n[2],i[12]=-Ee(r,s),i[13]=-Ee(a,s),i[14]=-Ee(n,s),i[15]=1,i}function et(s,t){const e=new Float32Array(16);for(let n=0;n<4;n++)for(let r=0;r<4;r++){let a=0;for(let i=0;i<4;i++)a+=s[i*4+r]*t[n*4+i];e[n*4+r]=a}return e}function tt(s){const t=new Float32Array(16),e=s;t[0]=e[5]*e[10]*e[15]-e[5]*e[11]*e[14]-e[9]*e[6]*e[15]+e[9]*e[7]*e[14]+e[13]*e[6]*e[11]-e[13]*e[7]*e[10],t[4]=-e[4]*e[10]*e[15]+e[4]*e[11]*e[14]+e[8]*e[6]*e[15]-e[8]*e[7]*e[14]-e[12]*e[6]*e[11]+e[12]*e[7]*e[10],t[8]=e[4]*e[9]*e[15]-e[4]*e[11]*e[13]-e[8]*e[5]*e[15]+e[8]*e[7]*e[13]+e[12]*e[5]*e[11]-e[12]*e[7]*e[9],t[12]=-e[4]*e[9]*e[14]+e[4]*e[10]*e[13]+e[8]*e[5]*e[14]-e[8]*e[6]*e[13]-e[12]*e[5]*e[10]+e[12]*e[6]*e[9],t[1]=-e[1]*e[10]*e[15]+e[1]*e[11]*e[14]+e[9]*e[2]*e[15]-e[9]*e[3]*e[14]-e[13]*e[2]*e[11]+e[13]*e[3]*e[10],t[5]=e[0]*e[10]*e[15]-e[0]*e[11]*e[14]-e[8]*e[2]*e[15]+e[8]*e[3]*e[14]+e[12]*e[2]*e[11]-e[12]*e[3]*e[10],t[9]=-e[0]*e[9]*e[15]+e[0]*e[11]*e[13]+e[8]*e[1]*e[15]-e[8]*e[3]*e[13]-e[12]*e[1]*e[11]+e[12]*e[3]*e[9],t[13]=e[0]*e[9]*e[14]-e[0]*e[10]*e[13]-e[8]*e[1]*e[14]+e[8]*e[2]*e[13]+e[12]*e[1]*e[10]-e[12]*e[2]*e[9],t[2]=e[1]*e[6]*e[15]-e[1]*e[7]*e[14]-e[5]*e[2]*e[15]+e[5]*e[3]*e[14]+e[13]*e[2]*e[7]-e[13]*e[3]*e[6],t[6]=-e[0]*e[6]*e[15]+e[0]*e[7]*e[14]+e[4]*e[2]*e[15]-e[4]*e[3]*e[14]-e[12]*e[2]*e[7]+e[12]*e[3]*e[6],t[10]=e[0]*e[5]*e[15]-e[0]*e[7]*e[13]-e[4]*e[1]*e[15]+e[4]*e[3]*e[13]+e[12]*e[1]*e[7]-e[12]*e[3]*e[5],t[14]=-e[0]*e[5]*e[14]+e[0]*e[6]*e[13]+e[4]*e[1]*e[14]-e[4]*e[2]*e[13]-e[12]*e[1]*e[6]+e[12]*e[2]*e[5],t[3]=-e[1]*e[6]*e[11]+e[1]*e[7]*e[10]+e[5]*e[2]*e[11]-e[5]*e[3]*e[10]-e[9]*e[2]*e[7]+e[9]*e[3]*e[6],t[7]=e[0]*e[6]*e[11]-e[0]*e[7]*e[10]-e[4]*e[2]*e[11]+e[4]*e[3]*e[10]+e[8]*e[2]*e[7]-e[8]*e[3]*e[6],t[11]=-e[0]*e[5]*e[11]+e[0]*e[7]*e[9]+e[4]*e[1]*e[11]-e[4]*e[3]*e[9]-e[8]*e[1]*e[7]+e[8]*e[3]*e[5],t[15]=e[0]*e[5]*e[10]-e[0]*e[6]*e[9]-e[4]*e[1]*e[10]+e[4]*e[2]*e[9]+e[8]*e[1]*e[6]-e[8]*e[2]*e[5];let n=e[0]*t[0]+e[1]*t[4]+e[2]*t[8]+e[3]*t[12];if(n===0)return Te();n=1/n;for(let r=0;r<16;r++)t[r]*=n;return t}function Me(s,t,e){const n=Te();return n[12]=s,n[13]=t,n[14]=e,n}function nt(s,t){const[e,n,r,a]=[t[0],t[1],t[2],t[3]],i=new Float32Array(16);return i[0]=1-2*(n*n+r*r),i[1]=2*(e*n+r*a),i[2]=2*(e*r-n*a),i[4]=2*(e*n-r*a),i[5]=1-2*(e*e+r*r),i[6]=2*(n*r+e*a),i[8]=2*(e*r+n*a),i[9]=2*(n*r-e*a),i[10]=1-2*(e*e+n*n),i[12]=s[0],i[13]=s[1],i[14]=s[2],i[15]=1,i}const st=(s,t)=>[s[0]-t[0],s[1]-t[1],s[2]-t[2]],Ee=(s,t)=>s[0]*t[0]+s[1]*t[1]+s[2]*t[2],Re=(s,t)=>[s[1]*t[2]-s[2]*t[1],s[2]*t[0]-s[0]*t[2],s[0]*t[1]-s[1]*t[0]],Fe=s=>{const t=Math.hypot(s[0],s[1],s[2])||1;return[s[0]/t,s[1]/t,s[2]/t]},V={potato:{label:"Potato",renderScale:.45,viewDistance:3,msaa:1,ao:0,detail:0,genBudget:2,meshBudget:2},"very-low":{label:"Very low",renderScale:.6,viewDistance:4,msaa:1,ao:.5,detail:0,genBudget:3,meshBudget:3},low:{label:"Low",renderScale:.75,viewDistance:5,msaa:1,ao:.8,detail:1,genBudget:4,meshBudget:4},medium:{label:"Medium",renderScale:1,viewDistance:7,msaa:1,ao:1,detail:1,genBudget:6,meshBudget:5},high:{label:"High",renderScale:1,viewDistance:10,msaa:4,ao:1,detail:1,genBudget:8,meshBudget:6},ultra:{label:"Ultra",renderScale:1,viewDistance:14,msaa:4,ao:1,detail:1,genBudget:10,meshBudget:8}},re=["potato","very-low","low","medium","high","ultra"],rt={grass:1,leaves:2,water:3,planks:4,hull_steel:5,frame:6,gas_cell:7,propeller:8,helm:9,log:10},Oe=2272,X=s=>Math.pow(s/255,2.2);class Ae{constructor(t){this.canvas=t}canvas;device;context;format;quality=V.medium;chunks=new Map;structures=new Map;stats={drawCalls:0,chunks:0,triangles:0};globals;globalsLayout;modelLayout;globalsBind;pipelines;depth;msaaTex;lineBuf;lineModel;lineBind;palette=new Float32Array(512);dirt=[.4,.3,.2];globalsData=new Float32Array(Oe/4);width=1;height=1;static async create(t){if(!navigator.gpu)throw new Error("WebGPU is not available in this browser");const e=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!e)throw new Error("No WebGPU adapter found");const n=new Ae(t);return n.device=await e.requestDevice(),n.context=t.getContext("webgpu"),n.format=navigator.gpu.getPreferredCanvasFormat(),n.context.configure({device:n.device,format:n.format,alphaMode:"opaque"}),n.init(),n}init(){const t=this.device;this.globals=t.createBuffer({size:Oe,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.globalsLayout=t.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]}),this.modelLayout=t.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]}),this.globalsBind=t.createBindGroup({layout:this.globalsLayout,entries:[{binding:0,resource:{buffer:this.globals}}]});const e=[],n=-.003,r=1.003,a=(u,d,l)=>[u?r:n,d?r:n,l?r:n],i=[];for(const u of[0,1])for(const d of[0,1])i.push([a(0,u,d),a(1,u,d)],[a(u,0,d),a(u,1,d)],[a(u,d,0),a(u,d,1)]);for(const[u,d]of i)e.push(...u,...d);this.lineBuf=this.makeBuffer(new Float32Array(e),GPUBufferUsage.VERTEX),this.lineModel=t.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.lineBind=t.createBindGroup({layout:this.modelLayout,entries:[{binding:0,resource:{buffer:this.lineModel}}]}),this.buildPipelines(),this.resize()}buildPipelines(){const t=this.device,e=t.createShaderModule({code:Ye}),n=t.createPipelineLayout({bindGroupLayouts:[this.globalsLayout,this.modelLayout]}),r={count:this.quality.msaa},a={module:e,entryPoint:"vs",buffers:[{arrayStride:32,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x2"},{shaderLocation:2,offset:20,format:"float32x3"}]}]},i=(u,d)=>({format:"depth24plus",depthWriteEnabled:u,depthCompare:d});this.pipelines={opaque:t.createRenderPipeline({layout:n,vertex:a,fragment:{module:e,entryPoint:"fs_opaque",targets:[{format:this.format}]},primitive:{topology:"triangle-list",cullMode:"back"},depthStencil:i(!0,"less"),multisample:r}),fluid:t.createRenderPipeline({layout:n,vertex:a,fragment:{module:e,entryPoint:"fs_water",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha"}}}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:i(!1,"less"),multisample:r}),sky:t.createRenderPipeline({layout:n,vertex:{module:e,entryPoint:"vs_sky"},fragment:{module:e,entryPoint:"fs_sky",targets:[{format:this.format}]},primitive:{topology:"triangle-list"},depthStencil:i(!1,"always"),multisample:r}),line:t.createRenderPipeline({layout:n,vertex:{module:e,entryPoint:"vs_line",buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:"float32x3"}]}]},fragment:{module:e,entryPoint:"fs_line",targets:[{format:this.format}]},primitive:{topology:"line-list"},depthStencil:i(!0,"less-equal"),multisample:r})}}setQuality(t){const e=t.msaa!==this.quality.msaa;this.quality=t,e&&this.buildPipelines(),this.resize(!0)}resize(t=!1){const e=Math.min(window.devicePixelRatio||1,2),n=Math.max(1,Math.floor(this.canvas.clientWidth*e*this.quality.renderScale)),r=Math.max(1,Math.floor(this.canvas.clientHeight*e*this.quality.renderScale));if(!t&&n===this.width&&r===this.height&&this.depth)return;this.width=n,this.height=r,this.canvas.width=n,this.canvas.height=r,this.depth?.destroy(),this.msaaTex?.destroy();const a=this.quality.msaa;this.depth=this.device.createTexture({size:[n,r],format:"depth24plus",usage:GPUTextureUsage.RENDER_ATTACHMENT,sampleCount:a}),this.msaaTex=a>1?this.device.createTexture({size:[n,r],format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT,sampleCount:a}):void 0}setPalette(t){for(const e of t)e.id>=128||(this.palette.set([X(e.color[0]),X(e.color[1]),X(e.color[2]),rt[e.name]??0],e.id*4),e.name==="dirt"&&(this.dirt=[X(e.color[0]),X(e.color[1]),X(e.color[2])]))}makeBuffer(t,e){const n=this.device.createBuffer({size:Math.max(16,t.byteLength),usage:e,mappedAtCreation:!0});return t instanceof Float32Array?new Float32Array(n.getMappedRange()).set(t):new Uint32Array(n.getMappedRange()).set(t),n.unmap(),n}mesh(t,e){if(e.length!==0)return{vb:this.makeBuffer(t,GPUBufferUsage.VERTEX),ib:this.makeBuffer(e,GPUBufferUsage.INDEX),count:e.length}}drawable(t,e,n){const r=this.device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});return this.device.queue.writeBuffer(r,0,e),{opaque:this.mesh(t.opaque_vertices(),t.opaque_indices()),fluid:this.mesh(t.fluid_vertices(),t.fluid_indices()),model:r,bind:this.device.createBindGroup({layout:this.modelLayout,entries:[{binding:0,resource:{buffer:r}}]}),center:n}}free(t){if(t){for(const e of[t.opaque,t.fluid])e?.vb.destroy(),e?.ib.destroy();t.model.destroy()}}uploadChunk(t,e,n,r){const a=`${t},${e},${n}`;this.free(this.chunks.get(a));const i=this.drawable(r,Me(t*16,e*16,n*16),[t*16+8,e*16+8,n*16+8]);if(!i.opaque&&!i.fluid){i.model.destroy(),this.chunks.delete(a);return}this.chunks.set(a,i)}removeChunk(t,e,n){const r=`${t},${e},${n}`;this.free(this.chunks.get(r)),this.chunks.delete(r)}setStructure(t,e){this.free(this.structures.get(t)),this.structures.set(t,this.drawable(e,Me(0,0,0)))}removeStructure(t){this.free(this.structures.get(t)),this.structures.delete(t)}setStructurePose(t,e){const n=this.structures.get(t);!n||e.length<7||(this.device.queue.writeBuffer(n.model,0,nt([e[0],e[1],e[2]],[e[3],e[4],e[5],e[6]])),n.center=[e[0],e[1],e[2]])}get aspect(){return this.width/this.height}frame(t,e,n,r,a,i,u){const d=this.device,l=[-Math.sin(e)*Math.cos(n),Math.sin(n),-Math.cos(e)*Math.cos(n)],S=Ze(t,[t[0]+l[0],t[1]+l[1],t[2]+l[2]],[0,1,0]),L=Qe(75*Math.PI/180,this.aspect,.08,2e3),A=et(L,S),P=(r-6)/12*Math.PI,B=[Math.cos(P),Math.sin(P),.35],j=Math.hypot(B[0],B[1],B[2]),U=B.map(h=>h/j),K=it(-.1,.18,Math.sin(P)),de=Math.max(0,1-Math.abs(Math.sin(P))*4)*K,C=(h,k,R)=>h.map((ee,G)=>ee+(k[G]-ee)*R),q=C([.004,.008,.025],[.13,.3,.78],K);let x=C([.012,.02,.045],[.55,.72,.95],K);x=C(x,[1,.45,.2],de*.65);const H=u*16*.97,y=this.globalsData;y.set(A,0),y.set(tt(A),16),y.set([t[0],t[1],t[2],a],32),y.set([U[0],U[1],U[2],K],36),y.set([x[0],x[1],x[2],0],40),y.set([q[0],q[1],q[2],0],44),y.set([H*.55,H,this.quality.ao,this.quality.detail],48),y.set([this.dirt[0],this.dirt[1],this.dirt[2],0],52),y.set(this.palette,56),d.queue.writeBuffer(this.globals,0,y);const ue=ot(A),M=(h,k)=>ue.every(R=>R[0]*h[0]+R[1]*h[1]+R[2]*h[2]+R[3]>-14),N=this.context.getCurrentTexture(),fe=d.createCommandEncoder(),E=this.msaaTex?this.msaaTex.createView():N.createView(),g=fe.beginRenderPass({colorAttachments:[{view:E,resolveTarget:this.msaaTex?N.createView():void 0,clearValue:{r:0,g:0,b:0,a:1},loadOp:"clear",storeOp:this.msaaTex?"discard":"store"}],depthStencilAttachment:{view:this.depth.createView(),depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"discard"}});let Q=0,Z=0;g.setBindGroup(0,this.globalsBind),g.setBindGroup(1,this.lineBind),g.setPipeline(this.pipelines.sky),g.draw(3),g.setPipeline(this.pipelines.opaque);const z=(h,k)=>{g.setBindGroup(1,k),g.setVertexBuffer(0,h.vb),g.setIndexBuffer(h.ib,"uint32"),g.drawIndexed(h.count),Q++,Z+=h.count/3},he=(u+1)*16,J=[];for(const h of this.chunks.values()){const k=h.center;Math.hypot(k[0]-t[0],k[2]-t[2])>he+14||M(k)&&(J.push(h),h.opaque&&z(h.opaque,h.bind))}for(const h of this.structures.values())h.opaque&&z(h.opaque,h.bind);i&&(this.device.queue.writeBuffer(this.lineModel,0,Me(i[0],i[1],i[2])),g.setPipeline(this.pipelines.line),g.setBindGroup(1,this.lineBind),g.setVertexBuffer(0,this.lineBuf),g.draw(24)),g.setPipeline(this.pipelines.fluid),J.sort((h,k)=>Ue(k.center,t)-Ue(h.center,t));for(const h of J)h.fluid&&z(h.fluid,h.bind);for(const h of this.structures.values())h.fluid&&z(h.fluid,h.bind);g.end(),d.queue.submit([fe.finish()]),this.stats={drawCalls:Q,chunks:this.chunks.size,triangles:Z}}}const Ue=(s,t)=>(s[0]-t[0])**2+(s[1]-t[1])**2+(s[2]-t[2])**2,it=(s,t,e)=>{const n=Math.min(1,Math.max(0,(e-s)/(t-s)));return n*n*(3-2*n)};function ot(s){const t=l=>[s[l],s[4+l],s[8+l],s[12+l]],[e,n,r,a]=[t(0),t(1),t(2),t(3)],i=(l,S)=>l.map((L,A)=>L+S[A]),u=(l,S)=>l.map((L,A)=>L-S[A]);return[i(a,e),u(a,e),i(a,n),u(a,n),r,u(a,r)].map(l=>{const S=Math.hypot(l[0],l[1],l[2])||1;return l.map(L=>L/S)})}const p=s=>document.getElementById(s),$e="fulcrum.settings.v1";function at(){const s={quality:"medium",auto:!0,pmode:"simple",seed:20260507,off:[]};try{const t=JSON.parse(localStorage.getItem($e)??"{}");return{quality:typeof t.quality=="string"&&t.quality in V?t.quality:s.quality,auto:t.auto!==!1,pmode:t.pmode==="complex"?"complex":"simple",seed:Number.isFinite(t.seed)?Number(t.seed)>>>0:s.seed,off:Array.isArray(t.off)?t.off.filter(n=>typeof n=="string").slice(0,64):[]}}catch{return s}}async function ct(){const s=at(),e=new URL(location.href).searchParams.get("seed");e!==null&&/^\d+$/.test(e)&&(s.seed=Number(e)>>>0);const n=()=>localStorage.setItem($e,JSON.stringify(s)),r=p("play"),a=p("error"),i=c=>{a.textContent=c,a.hidden=!1,r.textContent="Unavailable"};await Je();const u=p("c");let d;try{d=await Ae.create(u)}catch(c){i(`${c.message}. Try a recent Chrome, Edge or Safari with WebGPU enabled.`);return}const l=new Le(s.seed),S=JSON.parse(l.blocks_json());d.setPalette(S),window.__fulcrum={engine:l,renderer:d};const L=()=>JSON.parse(l.phenomena_json()),A=()=>{if(s.pmode==="simple")l.set_physics_preset("simple");else{l.set_physics_preset("simple");for(const c of s.off)l.set_phenomenon(c,!1)}};A();let P=s.quality;const B=c=>{P=c;const _=V[c];d.setQuality(_),l.set_view_distance(_.viewDistance),l.set_budgets(_.genBudget,_.meshBudget),s.quality=c;for(const w of[p("quality"),p("quality2")])w.value=c;p("quality-note").textContent=c==="ultra"?"Ultra uses every effect currently implemented. Shadows, ray-traced lighting and more arrive in later phases.":`${_.viewDistance} chunks view distance, ${Math.round(_.renderScale*100)}% resolution${_.msaa>1?", 4× anti-aliasing":""}.`,n()};for(const c of[p("quality"),p("quality2")]){for(const _ of re)c.append(new Option(V[_].label,_));c.addEventListener("change",()=>{s.auto=!1,p("auto").checked=!1,B(c.value)})}p("auto").checked=s.auto,p("auto").addEventListener("change",c=>{s.auto=c.target.checked,n()}),B(s.quality);const j=["planks","hull_steel","frame","gas_cell","propeller","helm","log","stone","dirt"];let U=0;const K=p("hotbar"),de=[];j.forEach((c,_)=>{const w=S.find(b=>b.name===c),m=document.createElement("div");m.className="slot",m.title=c.replace("_"," ");const[D,v,I]=w?.color??[128,128,128];m.style.background=`rgb(${D},${v},${I})`,m.innerHTML=`<i>${_+1}</i>${c.replace("_"," ")}`,K.append(m),de.push(m)});const C=c=>{U=(c+j.length)%j.length,de.forEach((_,w)=>_.classList.toggle("sel",w===U))};C(0);const q=p("menu"),x=p("settings"),H=p("hud"),y=p("toast");let ue=0;const M=c=>{y.textContent=c,y.classList.add("show"),clearTimeout(ue),ue=window.setTimeout(()=>y.classList.remove("show"),2600)},N=()=>{const c=p("phenomena");c.replaceChildren();const _=L(),w=s.pmode==="complex";for(const m of _){const D=document.createElement("label");D.className="ph"+(w?"":" locked");const v=document.createElement("input");v.type="checkbox",v.checked=m.enabled,v.disabled=!w,v.addEventListener("change",()=>{const T=JSON.parse(l.set_phenomenon(m.id,v.checked));T.error?M(T.error):T.changed?.length&&M(`Also ${v.checked?"enabled":"disabled"}: ${T.changed.join(", ")}`),s.off=L().filter($=>!$.enabled).map($=>$.id),n(),N()});const I=document.createElement("span");I.textContent=m.name;const b=document.createElement("small");b.textContent=m.summary+(m.depends_on.length?`  (needs: ${m.depends_on.join(", ")})`:""),D.append(v,I,b),c.append(D)}};document.querySelectorAll('input[name="pmode"]').forEach(c=>{c.checked=c.value===s.pmode,c.addEventListener("change",()=>{s.pmode=c.value,A(),n(),N()})}),N();for(const[c,_]of[["demo-boat","boat"],["demo-airship","airship"]])p(c).addEventListener("click",()=>{const w=l.spawn_demo(_);x.hidden=!0,q.hidden=!0,H.hidden=!1,u.requestPointerLock(),M(w||(_==="boat"?"A boat on a pool. R to sit at the helm, W to sail":"A hydrogen airship. R to sit at the helm, W/S for thrust"))});p("seed").value=String(s.seed),p("new-world").addEventListener("click",()=>{s.seed=Number(p("seed").value)>>>0,n(),location.search=`?seed=${s.seed}`});const fe=()=>{document.exitPointerLock(),N(),x.hidden=!1};p("close-settings").addEventListener("click",()=>{x.hidden=!0,q.hidden=!0,u.requestPointerLock()});const E=new Set;let g=!1,Q=0,Z=0,z=[!1,!1,!1];const he=.0022;r.disabled=!1,r.textContent="Play",r.addEventListener("click",()=>{q.hidden=!0,H.hidden=!1,u.requestPointerLock()}),document.addEventListener("pointerlockchange",()=>{g=document.pointerLockElement===u,!g&&x.hidden&&(q.hidden=!1,r.textContent="Resume")}),u.addEventListener("click",()=>{!g&&q.hidden&&x.hidden&&u.requestPointerLock()}),document.addEventListener("mousemove",c=>{g&&l.look(-c.movementX*he,-c.movementY*he)}),document.addEventListener("mousedown",c=>{g&&(z[c.button]=!0,c.button===0&&J(),c.button===2&&h())}),document.addEventListener("mouseup",c=>z[c.button]=!1),document.addEventListener("contextmenu",c=>c.preventDefault()),document.addEventListener("wheel",c=>{g&&C(U+(c.deltaY>0?1:-1))}),document.addEventListener("keydown",c=>{if(c.code==="Tab"){c.preventDefault(),x.hidden?fe():p("close-settings").click();return}if(g&&!c.repeat){if(E.add(c.code),c.code.startsWith("Digit")&&C(Number(c.code.slice(5))-1),c.code==="KeyV"&&M(l.toggle_fly()?"Flying":"Walking"),c.code==="KeyF"){const _=l.assemble();M(_||"Assembled: it is a physics body now. Press R to sit at the helm")}if(c.code==="KeyR")if(R())l.dismount(),M("Got off");else{const _=l.board();M(_?"At the helm: W/S throttle, A/D steer, R to get off":"No structure nearby (assemble one with F)")}if(c.code==="KeyG"){const _=l.disassemble();M(_||"Put back into the world")}}}),document.addEventListener("keyup",c=>E.delete(c.code)),window.addEventListener("blur",()=>E.clear()),window.addEventListener("resize",()=>d.resize());const J=()=>{g&&(l.break_block(),Q=performance.now())},h=()=>{g&&(l.place_block(j[U]),Z=performance.now())},k=()=>l.player_state(),R=()=>k()[11]>0;let ee=performance.now(),G=16,_e=0,ge=0,ve=0;const ke=new Set,Ce=performance.now(),xe=p("ship"),Ne=p("info"),Pe=c=>{const _=Math.min(c-ee,100);ee=c;const w=_/1e3;G=G*.95+_*.05;const m=f=>E.has(f)?1:0;l.set_input(m("KeyW")-m("KeyS"),m("KeyD")-m("KeyA"),E.has("Space"),E.has("ShiftLeft")||E.has("ShiftRight"),E.has("ControlLeft")||E.has("ControlRight")),g&&(z[0]&&c-Q>220&&J(),z[2]&&c-Z>200&&h()),l.tick(w);const D=performance.now();for(;performance.now()-D<4;){const f=l.next_chunk_mesh();if(!f)break;d.uploadChunk(f.cx,f.cy,f.cz,f),f.free()}const v=l.take_removed_chunks();for(let f=0;f<v.length;f+=3)d.removeChunk(v[f],v[f+1],v[f+2]);for(const f of l.take_changed_structures()){const F=l.structure_mesh(f);F&&(d.setStructure(f,F),F.free(),ke.add(f))}const I=new Set(l.structure_ids());for(const f of[...ke])I.has(f)||(d.removeStructure(f),ke.delete(f));for(const f of I)d.setStructurePose(f,l.structure_pose(f));const b=k(),T=b[3],$=b[4];let te=[b[0],b[1],b[2]];if(b[11]>0){const f=[-Math.sin(T)*Math.cos($),Math.sin($),-Math.cos(T)*Math.cos($)];te=[te[0]-f[0]*10,te[1]-f[1]*10+2.5,te[2]-f[2]*10]}const pe=g?l.target_block():[];if(d.frame(te,T,$,b[12],(c-Ce)/1e3,pe.length?[pe[0],pe[1],pe[2]]:null,V[P].viewDistance),s.auto&&g){_e=G>24?_e+w:0,ge=G<11?ge+w:0;const f=re.indexOf(P);_e>2.5&&f>0?(B(re[f-1]),_e=0,M(`Auto: graphics set to ${V[P].label}`)):ge>12&&f<re.indexOf("high")&&(B(re[f+1]),ge=0)}if(ve+=_,ve>120&&!H.hidden){ve=0;const f=JSON.parse(l.stats());if(Ne.textContent=`${(1e3/G).toFixed(0)} fps · ${V[P].label}
xyz ${b[0].toFixed(1)} ${b[1].toFixed(1)} ${b[2].toFixed(1)}
chunks ${f.loaded_chunks} (${f.pending_meshes} queued) · draws ${d.stats.drawCalls}
physics cost ${f.physics_cost} · structures ${f.structures}`,R()){const F=JSON.parse(l.structure_info(b[11]));xe.hidden=!1,xe.textContent=`Helm
speed ${(F.speed??0).toFixed(1)} m/s (${((F.speed??0)*3.6).toFixed(0)} km/h)
vertical ${(F.vy??0).toFixed(1)} m/s
mass ${Math.round(F.mass_kg??0)} kg · ${F.blocks} blocks`}else xe.hidden=!0}requestAnimationFrame(Pe)};requestAnimationFrame(Pe)}ct().catch(s=>{console.error(s);const t=document.getElementById("error");t&&(t.textContent=String(s?.message??s),t.hidden=!1)});
