import { SHADER } from "./shaders";
import { Mat4, fromPose, invert, lookAt, multiply, perspective, translation } from "./math";

export interface Quality {
  label: string;
  renderScale: number;
  viewDistance: number; // chunks
  msaa: 1 | 4;
  ao: number; // 0..1 strength of baked ambient occlusion
  detail: 0 | 1; // procedural surface detail
  genBudget: number; // chunks generated per tick
  meshBudget: number; // chunk meshes built per tick
}

export const QUALITIES: Record<string, Quality> = {
  potato: { label: "Potato", renderScale: 0.45, viewDistance: 3, msaa: 1, ao: 0, detail: 0, genBudget: 2, meshBudget: 2 },
  "very-low": { label: "Very low", renderScale: 0.6, viewDistance: 4, msaa: 1, ao: 0.5, detail: 0, genBudget: 3, meshBudget: 3 },
  low: { label: "Low", renderScale: 0.75, viewDistance: 5, msaa: 1, ao: 0.8, detail: 1, genBudget: 4, meshBudget: 4 },
  medium: { label: "Medium", renderScale: 1, viewDistance: 7, msaa: 1, ao: 1, detail: 1, genBudget: 6, meshBudget: 5 },
  high: { label: "High", renderScale: 1, viewDistance: 10, msaa: 4, ao: 1, detail: 1, genBudget: 8, meshBudget: 6 },
  ultra: { label: "Ultra", renderScale: 1, viewDistance: 14, msaa: 4, ao: 1, detail: 1, genBudget: 10, meshBudget: 8 },
};
export const QUALITY_ORDER = ["potato", "very-low", "low", "medium", "high", "ultra"];

export interface BlockInfo {
  id: number;
  name: string;
  color: number[];
  render: string;
}

const KIND: Record<string, number> = { grass: 1, leaves: 2, water: 3, planks: 4, hull_steel: 5, frame: 6, gas_cell: 7, propeller: 8, helm: 9, log: 10 };

interface MeshBuffers {
  vb: GPUBuffer;
  ib: GPUBuffer;
  count: number;
}
interface Drawable {
  opaque?: MeshBuffers;
  fluid?: MeshBuffers;
  model: GPUBuffer;
  bind: GPUBindGroup;
  center?: [number, number, number];
}

const GLOBALS_SIZE = 2272;
const srgbToLinear = (c: number) => Math.pow(c / 255, 2.2);

export interface MeshLike {
  opaque_vertices(): Float32Array;
  opaque_indices(): Uint32Array;
  fluid_vertices(): Float32Array;
  fluid_indices(): Uint32Array;
}

export class Renderer {
  device!: GPUDevice;
  context!: GPUCanvasContext;
  format!: GPUTextureFormat;
  quality: Quality = QUALITIES.medium;
  chunks = new Map<string, Drawable>();
  structures = new Map<number, Drawable>();
  stats = { drawCalls: 0, chunks: 0, triangles: 0 };

  private globals!: GPUBuffer;
  private globalsLayout!: GPUBindGroupLayout;
  private modelLayout!: GPUBindGroupLayout;
  private globalsBind!: GPUBindGroup;
  private pipelines!: { opaque: GPURenderPipeline; fluid: GPURenderPipeline; sky: GPURenderPipeline; line: GPURenderPipeline };
  private depth!: GPUTexture;
  private msaaTex?: GPUTexture;
  private lineBuf!: GPUBuffer;
  private lineModel!: GPUBuffer;
  private lineBind!: GPUBindGroup;
  private palette = new Float32Array(128 * 4);
  private dirt = [0.4, 0.3, 0.2];
  private globalsData = new Float32Array(GLOBALS_SIZE / 4);
  private width = 1;
  private height = 1;

  private constructor(private canvas: HTMLCanvasElement) {}

  static async create(canvas: HTMLCanvasElement): Promise<Renderer> {
    if (!navigator.gpu) throw new Error("WebGPU is not available in this browser");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter found");
    const r = new Renderer(canvas);
    r.device = await adapter.requestDevice();
    r.context = canvas.getContext("webgpu") as GPUCanvasContext;
    r.format = navigator.gpu.getPreferredCanvasFormat();
    r.context.configure({ device: r.device, format: r.format, alphaMode: "opaque" });
    r.init();
    return r;
  }

  private init() {
    const d = this.device;
    this.globals = d.createBuffer({ size: GLOBALS_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.globalsLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }] });
    this.modelLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }] });
    this.globalsBind = d.createBindGroup({ layout: this.globalsLayout, entries: [{ binding: 0, resource: { buffer: this.globals } }] });

    // wire cube for the block highlight
    const lines: number[] = [];
    const lo = -0.003, hi = 1.003;
    const c = (x: number, y: number, z: number) => [x ? hi : lo, y ? hi : lo, z ? hi : lo];
    const edges: [number[], number[]][] = [];
    for (const a of [0, 1]) for (const b of [0, 1]) {
      edges.push([c(0, a, b), c(1, a, b)], [c(a, 0, b), c(a, 1, b)], [c(a, b, 0), c(a, b, 1)]);
    }
    for (const [p, q] of edges) lines.push(...p, ...q);
    this.lineBuf = this.makeBuffer(new Float32Array(lines), GPUBufferUsage.VERTEX);
    this.lineModel = d.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.lineBind = d.createBindGroup({ layout: this.modelLayout, entries: [{ binding: 0, resource: { buffer: this.lineModel } }] });
    this.buildPipelines();
    this.resize();
  }

  private buildPipelines() {
    const d = this.device;
    const module = d.createShaderModule({ code: SHADER });
    const layout = d.createPipelineLayout({ bindGroupLayouts: [this.globalsLayout, this.modelLayout] });
    const multisample = { count: this.quality.msaa };
    const vertex: GPUVertexState = {
      module,
      entryPoint: "vs",
      buffers: [{ arrayStride: 32, attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" },
        { shaderLocation: 1, offset: 12, format: "float32x2" },
        { shaderLocation: 2, offset: 20, format: "float32x3" },
      ] }],
    };
    const depth = (write: boolean, compare: GPUCompareFunction): GPUDepthStencilState => ({ format: "depth24plus", depthWriteEnabled: write, depthCompare: compare });
    this.pipelines = {
      opaque: d.createRenderPipeline({ layout, vertex, fragment: { module, entryPoint: "fs_opaque", targets: [{ format: this.format }] }, primitive: { topology: "triangle-list", cullMode: "back" }, depthStencil: depth(true, "less"), multisample }),
      fluid: d.createRenderPipeline({
        layout, vertex,
        fragment: { module, entryPoint: "fs_water", targets: [{ format: this.format, blend: { color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } } }] },
        primitive: { topology: "triangle-list", cullMode: "none" }, depthStencil: depth(false, "less"), multisample,
      }),
      sky: d.createRenderPipeline({ layout, vertex: { module, entryPoint: "vs_sky" }, fragment: { module, entryPoint: "fs_sky", targets: [{ format: this.format }] }, primitive: { topology: "triangle-list" }, depthStencil: depth(false, "always"), multisample }),
      line: d.createRenderPipeline({
        layout, vertex: { module, entryPoint: "vs_line", buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] }] },
        fragment: { module, entryPoint: "fs_line", targets: [{ format: this.format }] }, primitive: { topology: "line-list" }, depthStencil: depth(true, "less-equal"), multisample,
      }),
    };
  }

  setQuality(q: Quality) {
    const rebuild = q.msaa !== this.quality.msaa;
    this.quality = q;
    if (rebuild) this.buildPipelines();
    this.resize(true);
  }

  resize(force = false) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr * this.quality.renderScale));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr * this.quality.renderScale));
    if (!force && w === this.width && h === this.height && this.depth) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.depth?.destroy();
    this.msaaTex?.destroy();
    const sampleCount = this.quality.msaa;
    this.depth = this.device.createTexture({ size: [w, h], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT, sampleCount });
    this.msaaTex = sampleCount > 1 ? this.device.createTexture({ size: [w, h], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT, sampleCount }) : undefined;
  }

  setPalette(blocks: BlockInfo[]) {
    for (const b of blocks) {
      if (b.id >= 128) continue;
      this.palette.set([srgbToLinear(b.color[0]), srgbToLinear(b.color[1]), srgbToLinear(b.color[2]), KIND[b.name] ?? 0], b.id * 4);
      if (b.name === "dirt") this.dirt = [srgbToLinear(b.color[0]), srgbToLinear(b.color[1]), srgbToLinear(b.color[2])];
    }
  }

  private makeBuffer(data: Float32Array | Uint32Array, usage: GPUBufferUsageFlags): GPUBuffer {
    const buf = this.device.createBuffer({ size: Math.max(16, data.byteLength), usage, mappedAtCreation: true });
    if (data instanceof Float32Array) new Float32Array(buf.getMappedRange()).set(data);
    else new Uint32Array(buf.getMappedRange()).set(data);
    buf.unmap();
    return buf;
  }

  private mesh(v: Float32Array, i: Uint32Array): MeshBuffers | undefined {
    if (i.length === 0) return undefined;
    return { vb: this.makeBuffer(v, GPUBufferUsage.VERTEX), ib: this.makeBuffer(i, GPUBufferUsage.INDEX), count: i.length };
  }

  private drawable(mesh: MeshLike, model: Mat4, center?: [number, number, number]): Drawable {
    const buf = this.device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(buf, 0, model as Float32Array<ArrayBuffer>);
    return {
      opaque: this.mesh(mesh.opaque_vertices(), mesh.opaque_indices()),
      fluid: this.mesh(mesh.fluid_vertices(), mesh.fluid_indices()),
      model: buf,
      bind: this.device.createBindGroup({ layout: this.modelLayout, entries: [{ binding: 0, resource: { buffer: buf } }] }),
      center,
    };
  }

  private free(d?: Drawable) {
    if (!d) return;
    for (const m of [d.opaque, d.fluid]) {
      m?.vb.destroy();
      m?.ib.destroy();
    }
    d.model.destroy();
  }

  uploadChunk(cx: number, cy: number, cz: number, mesh: MeshLike) {
    const key = `${cx},${cy},${cz}`;
    this.free(this.chunks.get(key));
    const d = this.drawable(mesh, translation(cx * 16, cy * 16, cz * 16), [cx * 16 + 8, cy * 16 + 8, cz * 16 + 8]);
    if (!d.opaque && !d.fluid) {
      d.model.destroy();
      this.chunks.delete(key);
      return;
    }
    this.chunks.set(key, d);
  }

  removeChunk(cx: number, cy: number, cz: number) {
    const key = `${cx},${cy},${cz}`;
    this.free(this.chunks.get(key));
    this.chunks.delete(key);
  }

  setStructure(id: number, mesh: MeshLike) {
    this.free(this.structures.get(id));
    this.structures.set(id, this.drawable(mesh, translation(0, 0, 0)));
  }

  removeStructure(id: number) {
    this.free(this.structures.get(id));
    this.structures.delete(id);
  }

  setStructurePose(id: number, pose: ArrayLike<number>) {
    const d = this.structures.get(id);
    if (!d || pose.length < 7) return;
    this.device.queue.writeBuffer(d.model, 0, fromPose([pose[0], pose[1], pose[2]], [pose[3], pose[4], pose[5], pose[6]]) as Float32Array<ArrayBuffer>);
    d.center = [pose[0], pose[1], pose[2]];
  }

  /** Aspect ratio of the drawing surface. */
  get aspect() {
    return this.width / this.height;
  }

  frame(eye: number[], yaw: number, pitch: number, hour: number, seconds: number, highlight: number[] | null, viewDistance: number) {
    const d = this.device;
    const f = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const view = lookAt(eye, [eye[0] + f[0], eye[1] + f[1], eye[2] + f[2]], [0, 1, 0]);
    const proj = perspective((75 * Math.PI) / 180, this.aspect, 0.08, 2000);
    const vp = multiply(proj, view);

    // sun and sky from the time of day
    const ang = ((hour - 6) / 12) * Math.PI;
    const sun = [Math.cos(ang), Math.sin(ang), 0.35];
    const sl = Math.hypot(sun[0], sun[1], sun[2]);
    const sunN = sun.map((v) => v / sl);
    const day = smooth(-0.1, 0.18, Math.sin(ang));
    const dusk = Math.max(0, 1 - Math.abs(Math.sin(ang)) * 4) * day;
    const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
    const zenith = mix([0.004, 0.008, 0.025], [0.13, 0.30, 0.78], day);
    let horizon = mix([0.012, 0.02, 0.045], [0.55, 0.72, 0.95], day);
    horizon = mix(horizon, [1.0, 0.45, 0.2], dusk * 0.65);
    const fogEnd = viewDistance * 16 * 0.97;

    const g = this.globalsData;
    g.set(vp, 0);
    g.set(invert(vp), 16);
    g.set([eye[0], eye[1], eye[2], seconds], 32);
    g.set([sunN[0], sunN[1], sunN[2], day], 36);
    g.set([horizon[0], horizon[1], horizon[2], 0], 40);
    g.set([zenith[0], zenith[1], zenith[2], 0], 44);
    g.set([fogEnd * 0.55, fogEnd, this.quality.ao, this.quality.detail], 48);
    g.set([this.dirt[0], this.dirt[1], this.dirt[2], 0], 52);
    g.set(this.palette, 56);
    d.queue.writeBuffer(this.globals, 0, g as Float32Array<ArrayBuffer>);

    const frustum = planes(vp);
    const visible = (c: [number, number, number], r: number) => frustum.every((p) => p[0] * c[0] + p[1] * c[1] + p[2] * c[2] + p[3] > -r);

    const tex = this.context.getCurrentTexture();
    const enc = d.createCommandEncoder();
    const colorView = this.msaaTex ? this.msaaTex.createView() : tex.createView();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: colorView, resolveTarget: this.msaaTex ? tex.createView() : undefined, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: this.msaaTex ? "discard" : "store" }],
      depthStencilAttachment: { view: this.depth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" },
    });
    let calls = 0, tris = 0;
    pass.setBindGroup(0, this.globalsBind);
    pass.setBindGroup(1, this.lineBind);
    pass.setPipeline(this.pipelines.sky);
    pass.draw(3);

    pass.setPipeline(this.pipelines.opaque);
    const draw = (m: MeshBuffers, bind: GPUBindGroup) => {
      pass.setBindGroup(1, bind);
      pass.setVertexBuffer(0, m.vb);
      pass.setIndexBuffer(m.ib, "uint32");
      pass.drawIndexed(m.count);
      calls++;
      tris += m.count / 3;
    };
    const maxDist = (viewDistance + 1) * 16;
    const near: Drawable[] = [];
    for (const c of this.chunks.values()) {
      const ctr = c.center!;
      if (Math.hypot(ctr[0] - eye[0], ctr[2] - eye[2]) > maxDist + 14) continue;
      if (!visible(ctr, 14)) continue;
      near.push(c);
      if (c.opaque) draw(c.opaque, c.bind);
    }
    for (const s of this.structures.values()) if (s.opaque) draw(s.opaque, s.bind);

    if (highlight) {
      this.device.queue.writeBuffer(this.lineModel, 0, translation(highlight[0], highlight[1], highlight[2]) as Float32Array<ArrayBuffer>);
      pass.setPipeline(this.pipelines.line);
      pass.setBindGroup(1, this.lineBind);
      pass.setVertexBuffer(0, this.lineBuf);
      pass.draw(24);
    }

    pass.setPipeline(this.pipelines.fluid);
    near.sort((a, b) => dist2(b.center!, eye) - dist2(a.center!, eye));
    for (const c of near) if (c.fluid) draw(c.fluid, c.bind);
    for (const s of this.structures.values()) if (s.fluid) draw(s.fluid, s.bind);
    pass.end();
    d.queue.submit([enc.finish()]);
    this.stats = { drawCalls: calls, chunks: this.chunks.size, triangles: tris };
  }
}

const dist2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// frustum planes (normalised) from a column-major view-projection matrix
function planes(m: Mat4): number[][] {
  const row = (r: number) => [m[r], m[4 + r], m[8 + r], m[12 + r]];
  const [r0, r1, r2, r3] = [row(0), row(1), row(2), row(3)];
  const add = (a: number[], b: number[]) => a.map((v, i) => v + b[i]);
  const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
  const ps = [add(r3, r0), sub(r3, r0), add(r3, r1), sub(r3, r1), r2, sub(r3, r2)];
  return ps.map((p) => {
    const l = Math.hypot(p[0], p[1], p[2]) || 1;
    return p.map((v) => v / l);
  });
}
