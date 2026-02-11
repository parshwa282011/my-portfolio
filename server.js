import cors from "cors";
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const ADMIN_USER = "p";
const ADMIN_PASS = "a";
const ADMIN_TOKEN = "admin_token_9f3c2";

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
    const { title, date, location, summary } = req.body || {};
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
    const { title, date, location, summary } = req.body || {};
    if (!title || !date || !location || !summary) {
      res.status(400).json({ error: "Missing fields." });
      return;
    }
    const posts = await readJson("blog.json", []);
    const next = posts.map((post) =>
      post.id === req.params.id
        ? { ...post, title, date, location, summary }
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

app.get("/api/games", async (req, res) => {
  try {
    const games = await readJson("games.json", []);
    const normalized = await ensureIds("games.json", games);
    res.json(normalized);
  } catch (error) {
    res.status(500).json({ error: "Failed to load games." });
  }
});

app.post("/api/games", requireAdmin, async (req, res) => {
  try {
    const { title, status, description, link, serverJs, clientHtml } = req.body || {};
    if (!title || !status) {
      res.status(400).json({ error: "Missing fields." });
      return;
    }
    const games = await readJson("games.json", []);
    const next = [
      {
        id: `game_${Date.now()}`,
        title,
        status,
        description: description || "",
        link: link || "",
        serverJs: serverJs || "",
        clientHtml: clientHtml || "",
      },
      ...games,
    ];
    await writeJson("games.json", next);
    res.json(next);
  } catch (error) {
    res.status(500).json({ error: "Failed to save game." });
  }
});

app.put("/api/games/:id", requireAdmin, async (req, res) => {
  try {
    const { title, status, description, link, serverJs, clientHtml } = req.body || {};
    if (!title || !status) {
      res.status(400).json({ error: "Missing fields." });
      return;
    }
    const games = await readJson("games.json", []);
    const next = games.map((game) =>
      game.id === req.params.id
        ? {
            ...game,
            title,
            status,
            description: description || "",
            link: link || "",
            serverJs: serverJs || "",
            clientHtml: clientHtml || "",
          }
        : game
    );
    await writeJson("games.json", next);
    res.json(next);
  } catch (error) {
    res.status(500).json({ error: "Failed to update game." });
  }
});

app.delete("/api/games/:id", requireAdmin, async (req, res) => {
  try {
    const games = await readJson("games.json", []);
    const next = games.filter((game) => game.id !== req.params.id);
    await writeJson("games.json", next);
    res.json(next);
  } catch (error) {
    res.status(500).json({ error: "Failed to delete game." });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
