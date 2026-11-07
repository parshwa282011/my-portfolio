import "./style.css";
import init, { Engine } from "./pkg/fulcrum_wasm.js";
import { BlockInfo, QUALITIES, QUALITY_ORDER, Renderer } from "./renderer";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const SAVE = "fulcrum.settings.v1";

interface Saved {
  quality: string;
  auto: boolean;
  pmode: "simple" | "complex";
  seed: number;
  off: string[];
}

function loadSaved(): Saved {
  const fallback: Saved = { quality: "medium", auto: true, pmode: "simple", seed: 20260507, off: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE) ?? "{}");
    const q = typeof raw.quality === "string" && raw.quality in QUALITIES ? raw.quality : fallback.quality;
    return {
      quality: q,
      auto: raw.auto !== false,
      pmode: raw.pmode === "complex" ? "complex" : "simple",
      seed: Number.isFinite(raw.seed) ? Number(raw.seed) >>> 0 : fallback.seed,
      off: Array.isArray(raw.off) ? raw.off.filter((x: unknown) => typeof x === "string").slice(0, 64) : [],
    };
  } catch {
    return fallback;
  }
}

async function main() {
  const saved = loadSaved();
  const url = new URL(location.href);
  const seedParam = url.searchParams.get("seed");
  if (seedParam !== null && /^\d+$/.test(seedParam)) saved.seed = Number(seedParam) >>> 0;
  const persist = () => localStorage.setItem(SAVE, JSON.stringify(saved));

  const playBtn = $<HTMLButtonElement>("play");
  const errorEl = $("error");
  const fail = (msg: string) => {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    playBtn.textContent = "Unavailable";
  };

  await init();
  const canvas = $<HTMLCanvasElement>("c");
  let renderer: Renderer;
  try {
    renderer = await Renderer.create(canvas);
  } catch (e) {
    fail(`${(e as Error).message}. Try a recent Chrome, Edge or Safari with WebGPU enabled.`);
    return;
  }

  const engine = new Engine(saved.seed);
  const blocks: BlockInfo[] = JSON.parse(engine.blocks_json());
  renderer.setPalette(blocks);
  (window as unknown as Record<string, unknown>).__fulcrum = { engine, renderer };

  // ---------------------------------------------------------------- physics toggles
  type Ph = { id: string; name: string; summary: string; depends_on: string[]; enabled: boolean };
  const phenomena = (): Ph[] => JSON.parse(engine.phenomena_json());
  const applyPhysicsMode = () => {
    if (saved.pmode === "simple") {
      engine.set_physics_preset("simple");
    } else {
      engine.set_physics_preset("simple");
      for (const id of saved.off) engine.set_phenomenon(id, false);
    }
  };
  applyPhysicsMode();

  // ---------------------------------------------------------------- quality
  let qualityName = saved.quality;
  const setQuality = (name: string) => {
    qualityName = name;
    const q = QUALITIES[name];
    renderer.setQuality(q);
    engine.set_view_distance(q.viewDistance);
    engine.set_budgets(q.genBudget, q.meshBudget);
    saved.quality = name;
    for (const sel of [$<HTMLSelectElement>("quality"), $<HTMLSelectElement>("quality2")]) sel.value = name;
    $("quality-note").textContent =
      name === "ultra" ? "Ultra uses every effect currently implemented. Shadows, ray-traced lighting and more arrive in later phases." : `${q.viewDistance} chunks view distance, ${Math.round(q.renderScale * 100)}% resolution${q.msaa > 1 ? ", 4× anti-aliasing" : ""}.`;
    persist();
  };
  for (const sel of [$<HTMLSelectElement>("quality"), $<HTMLSelectElement>("quality2")]) {
    for (const k of QUALITY_ORDER) sel.append(new Option(QUALITIES[k].label, k));
    sel.addEventListener("change", () => {
      saved.auto = false;
      $<HTMLInputElement>("auto").checked = false;
      setQuality(sel.value);
    });
  }
  $<HTMLInputElement>("auto").checked = saved.auto;
  $<HTMLInputElement>("auto").addEventListener("change", (e) => {
    saved.auto = (e.target as HTMLInputElement).checked;
    persist();
  });
  setQuality(saved.quality);

  // ---------------------------------------------------------------- hotbar
  const hotbarNames = ["planks", "hull_steel", "frame", "gas_cell", "propeller", "helm", "log", "stone", "dirt"];
  let selected = 0;
  const hotbar = $("hotbar");
  const slots: HTMLElement[] = [];
  hotbarNames.forEach((name, i) => {
    const b = blocks.find((x) => x.name === name);
    const el = document.createElement("div");
    el.className = "slot";
    el.title = name.replace("_", " ");
    const [r, g, bl] = b?.color ?? [128, 128, 128];
    el.style.background = `rgb(${r},${g},${bl})`;
    el.innerHTML = `<i>${i + 1}</i>${name.replace("_", " ")}`;
    hotbar.append(el);
    slots.push(el);
  });
  const select = (i: number) => {
    selected = (i + hotbarNames.length) % hotbarNames.length;
    slots.forEach((s, k) => s.classList.toggle("sel", k === selected));
  };
  select(0);

  // ---------------------------------------------------------------- UI helpers
  const menu = $("menu"), settings = $("settings"), hud = $("hud");
  const toastEl = $("toast");
  let toastTimer = 0;
  const toast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 2600);
  };

  const renderPhenomena = () => {
    const box = $("phenomena");
    box.replaceChildren();
    const list = phenomena();
    const complex = saved.pmode === "complex";
    for (const p of list) {
      const row = document.createElement("label");
      row.className = "ph" + (complex ? "" : " locked");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = p.enabled;
      cb.disabled = !complex;
      cb.addEventListener("change", () => {
        const res = JSON.parse(engine.set_phenomenon(p.id, cb.checked));
        if (res.error) toast(res.error);
        else if (res.changed?.length) toast(`Also ${cb.checked ? "enabled" : "disabled"}: ${res.changed.join(", ")}`);
        saved.off = phenomena().filter((x) => !x.enabled).map((x) => x.id);
        persist();
        renderPhenomena();
      });
      const title = document.createElement("span");
      title.textContent = p.name;
      const small = document.createElement("small");
      small.textContent = p.summary + (p.depends_on.length ? `  (needs: ${p.depends_on.join(", ")})` : "");
      row.append(cb, title, small);
      box.append(row);
    }
  };
  document.querySelectorAll<HTMLInputElement>('input[name="pmode"]').forEach((r) => {
    r.checked = r.value === saved.pmode;
    r.addEventListener("change", () => {
      saved.pmode = r.value as "simple" | "complex";
      applyPhysicsMode();
      persist();
      renderPhenomena();
    });
  });
  renderPhenomena();
  for (const [id, kind] of [["demo-boat", "boat"], ["demo-airship", "airship"]]) {
    $(id).addEventListener("click", () => {
      const msg = engine.spawn_demo(kind);
      settings.hidden = true;
      menu.hidden = true;
      hud.hidden = false;
      canvas.requestPointerLock();
      toast(msg || (kind === "boat" ? "A boat on a pool. R to sit at the helm, W to sail" : "A hydrogen airship. R to sit at the helm, W/S for thrust"));
    });
  }
  $<HTMLInputElement>("seed").value = String(saved.seed);
  $("new-world").addEventListener("click", () => {
    saved.seed = Number($<HTMLInputElement>("seed").value) >>> 0;
    persist();
    location.search = `?seed=${saved.seed}`;
  });

  const openSettings = () => {
    document.exitPointerLock();
    renderPhenomena();
    settings.hidden = false;
  };
  $("close-settings").addEventListener("click", () => {
    settings.hidden = true;
    menu.hidden = true;
    canvas.requestPointerLock();
  });

  // ---------------------------------------------------------------- input
  const keys = new Set<string>();
  let locked = false;
  let lastBreak = 0, lastPlace = 0;
  let mouseDown = [false, false, false];
  const sensitivity = 0.0022;

  playBtn.disabled = false;
  playBtn.textContent = "Play";
  playBtn.addEventListener("click", () => {
    menu.hidden = true;
    hud.hidden = false;
    canvas.requestPointerLock();
  });
  document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === canvas;
    if (!locked && settings.hidden) {
      menu.hidden = false;
      playBtn.textContent = "Resume";
    }
  });
  canvas.addEventListener("click", () => {
    if (!locked && menu.hidden && settings.hidden) canvas.requestPointerLock();
  });
  document.addEventListener("mousemove", (e) => {
    if (locked) engine.look(-e.movementX * sensitivity, -e.movementY * sensitivity);
  });
  document.addEventListener("mousedown", (e) => {
    if (!locked) return;
    mouseDown[e.button] = true;
    if (e.button === 0) breakBlock();
    if (e.button === 2) placeBlock();
  });
  document.addEventListener("mouseup", (e) => (mouseDown[e.button] = false));
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("wheel", (e) => {
    if (locked) select(selected + (e.deltaY > 0 ? 1 : -1));
  });
  document.addEventListener("keydown", (e) => {
    if (e.code === "Tab") {
      e.preventDefault();
      settings.hidden ? openSettings() : $("close-settings").click();
      return;
    }
    if (!locked) return;
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code.startsWith("Digit")) select(Number(e.code.slice(5)) - 1);
    if (e.code === "KeyV") toast(engine.toggle_fly() ? "Flying" : "Walking");
    if (e.code === "KeyF") {
      const msg = engine.assemble();
      toast(msg || "Assembled: it is a physics body now. Press R to sit at the helm");
    }
    if (e.code === "KeyR") {
      if (riding()) {
        engine.dismount();
        toast("Got off");
      } else {
        const id = engine.board();
        toast(id ? "At the helm: W/S throttle, A/D steer, R to get off" : "No structure nearby (assemble one with F)");
      }
    }
    if (e.code === "KeyG") {
      const msg = engine.disassemble();
      toast(msg || "Put back into the world");
    }
  });
  document.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());
  window.addEventListener("resize", () => renderer.resize());

  const breakBlock = () => {
    if (!locked) return;
    engine.break_block();
    lastBreak = performance.now();
  };
  const placeBlock = () => {
    if (!locked) return;
    engine.place_block(hotbarNames[selected]);
    lastPlace = performance.now();
  };

  const state = () => engine.player_state();
  const riding = () => state()[11] > 0;

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  let frameEma = 16;
  let slow = 0, fast = 0;
  let infoTimer = 0;
  const knownStructures = new Set<number>();
  const t0 = performance.now();
  const shipEl = $("ship"), infoEl = $("info");

  const frame = (now: number) => {
    const dtMs = Math.min(now - last, 100);
    last = now;
    const dt = dtMs / 1000;
    frameEma = frameEma * 0.95 + dtMs * 0.05;

    const k = (c: string) => (keys.has(c) ? 1 : 0);
    engine.set_input(k("KeyW") - k("KeyS"), k("KeyD") - k("KeyA"), keys.has("Space"), keys.has("ShiftLeft") || keys.has("ShiftRight"), keys.has("ControlLeft") || keys.has("ControlRight"));
    if (locked) {
      if (mouseDown[0] && now - lastBreak > 220) breakBlock();
      if (mouseDown[2] && now - lastPlace > 200) placeBlock();
    }
    engine.tick(dt);

    // upload finished meshes within a small time slice
    const t = performance.now();
    while (performance.now() - t < 4) {
      const m = engine.next_chunk_mesh();
      if (!m) break;
      renderer.uploadChunk(m.cx, m.cy, m.cz, m);
      m.free();
    }
    const removed = engine.take_removed_chunks();
    for (let i = 0; i < removed.length; i += 3) renderer.removeChunk(removed[i], removed[i + 1], removed[i + 2]);

    // structures
    for (const id of engine.take_changed_structures()) {
      const m = engine.structure_mesh(id);
      if (m) {
        renderer.setStructure(id, m);
        m.free();
        knownStructures.add(id);
      }
    }
    const live = new Set(engine.structure_ids());
    for (const id of [...knownStructures]) if (!live.has(id)) {
      renderer.removeStructure(id);
      knownStructures.delete(id);
    }
    for (const id of live) renderer.setStructurePose(id, engine.structure_pose(id));

    const s = state();
    const yaw = s[3], pitch = s[4];
    let eye = [s[0], s[1], s[2]];
    if (s[11] > 0) {
      const f = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
      eye = [eye[0] - f[0] * 10, eye[1] - f[1] * 10 + 2.5, eye[2] - f[2] * 10];
    }
    const target = locked ? engine.target_block() : [];
    renderer.frame(eye, yaw, pitch, s[12], (now - t0) / 1000, target.length ? [target[0], target[1], target[2]] : null, QUALITIES[qualityName].viewDistance);

    // auto quality: drop a tier when frames are slow, rise when there is lots of headroom
    if (saved.auto && locked) {
      slow = frameEma > 24 ? slow + dt : 0;
      fast = frameEma < 11 ? fast + dt : 0;
      const i = QUALITY_ORDER.indexOf(qualityName);
      if (slow > 2.5 && i > 0) {
        setQuality(QUALITY_ORDER[i - 1]);
        slow = 0;
        toast(`Auto: graphics set to ${QUALITIES[qualityName].label}`);
      } else if (fast > 12 && i < QUALITY_ORDER.indexOf("high")) {
        setQuality(QUALITY_ORDER[i + 1]);
        fast = 0;
      }
    }

    infoTimer += dtMs;
    if (infoTimer > 120 && !hud.hidden) {
      infoTimer = 0;
      const st = JSON.parse(engine.stats());
      infoEl.textContent = `${(1000 / frameEma).toFixed(0)} fps · ${QUALITIES[qualityName].label}\nxyz ${s[0].toFixed(1)} ${s[1].toFixed(1)} ${s[2].toFixed(1)}\nchunks ${st.loaded_chunks} (${st.pending_meshes} queued) · draws ${renderer.stats.drawCalls}\nphysics cost ${st.physics_cost} · structures ${st.structures}`;
      if (riding()) {
        const info = JSON.parse(engine.structure_info(s[11]));
        shipEl.hidden = false;
        shipEl.textContent = `Helm\nspeed ${(info.speed ?? 0).toFixed(1)} m/s (${((info.speed ?? 0) * 3.6).toFixed(0)} km/h)\nvertical ${(info.vy ?? 0).toFixed(1)} m/s\nmass ${Math.round(info.mass_kg ?? 0)} kg · ${info.blocks} blocks`;
      } else shipEl.hidden = true;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  const el = document.getElementById("error");
  if (el) {
    el.textContent = String(e?.message ?? e);
    el.hidden = false;
  }
});
