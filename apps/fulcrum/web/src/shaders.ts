// WGSL for the block renderer. Textures are procedural (original art, no image assets):
// each block kind gets a pattern computed from its position inside the block.
export const SHADER = /* wgsl */ `
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
`;
