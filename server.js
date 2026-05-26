import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, spawnSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json());
app.use(express.static(__dirname));

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!ADMIN_USER || !ADMIN_PASS || !ADMIN_TOKEN) {
  throw new Error("Missing ADMIN_USER, ADMIN_PASS, or ADMIN_TOKEN in environment.");
}

const dataPath = (name) => path.join(__dirname, "data", name);

const readJson = async (fileName, fallback) => {
  try {
    const raw = await fs.readFile(dataPath(fileName), "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
};

const writeJson = async (fileName, data) => {
  await fs.writeFile(dataPath(fileName), JSON.stringify(data, null, 2));
};

const ensureIds = async (fileName, items) => {
  let changed = false;
  const updated = items.map((item, index) => {
    if (!item.id) {
      changed = true;
      return { ...item, id: `item_${Date.now()}_${index}` };
    }
    return item;
  });
  if (changed) {
    await writeJson(fileName, updated);
  }
  return updated;
};

const requireAdmin = (req, res, next) => {
  const auth = req.headers.authorization || "";
  if (auth === `Bearer ${ADMIN_TOKEN}`) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
};

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ token: ADMIN_TOKEN });
    return;
  }
  res.status(401).json({ error: "Invalid credentials" });
});

app.get("/api/admin/verify", requireAdmin, (req, res) => {
  res.json({ ok: true });
});

app.get("/api/blog", async (req, res) => {
  try {
    const posts = await readJson("blog.json", []);
    const normalized = await ensureIds("blog.json", posts);
    res.json(normalized);
  } catch (error) {
    res.status(500).json({ error: "Failed to load blog posts." });
  }
});

app.post("/api/blog", requireAdmin, async (req, res) => {
  try {
    const { title, date, location, summary, contentHtml } = req.body || {};
    if (!title || !date || !location || !summary) {
      res.status(400).json({ error: "Missing fields." });
      return;
    }
    const posts = await readJson("blog.json", []);
    const next = [
      {
        id: `post_${Date.now()}`,
        title,
        date,
        location,
        summary,
        contentHtml: contentHtml || "",
      },
      ...posts,
    ];
    await writeJson("blog.json", next);
    res.json(next);
  } catch (error) {
    res.status(500).json({ error: "Failed to save blog post." });
  }
});

app.put("/api/blog/:id", requireAdmin, async (req, res) => {
  try {
    const { title, date, location, summary, contentHtml } = req.body || {};
    if (!title || !date || !location || !summary) {
      res.status(400).json({ error: "Missing fields." });
      return;
    }
    const posts = await readJson("blog.json", []);
    const next = posts.map((post) =>
      post.id === req.params.id
        ? { ...post, title, date, location, summary, contentHtml }
        : post
    );
    await writeJson("blog.json", next);
    res.json(next);
  } catch (error) {
    res.status(500).json({ error: "Failed to update blog post." });
  }
});

app.delete("/api/blog/:id", requireAdmin, async (req, res) => {
  try {
    const posts = await readJson("blog.json", []);
    const next = posts.filter((post) => post.id !== req.params.id);
    await writeJson("blog.json", next);
    res.json(next);
  } catch (error) {
    res.status(500).json({ error: "Failed to delete blog post." });
  }
});

app.post("/api/custom-requests", async (req, res) => {
  try {
    const { name, email, pageType, budget, timeline, details } = req.body || {};
    if (!name || !email || !pageType || !details) {
      res.status(400).json({ error: "Please fill out the required fields." });
      return;
    }

    const requests = await readJson("custom-requests.json", []);
    const next = [
      {
        id: `request_${Date.now()}`,
        name,
        email,
        pageType,
        budget: budget || "",
        timeline: timeline || "",
        details,
        createdAt: new Date().toISOString(),
      },
      ...requests,
    ];
    await writeJson("custom-requests.json", next);
    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to save request." });
  }
});

app.get("/api/custom-requests", requireAdmin, async (req, res) => {
  try {
    const requests = await readJson("custom-requests.json", []);
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: "Failed to load requests." });
  }
});


app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
