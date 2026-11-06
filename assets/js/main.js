import { renderNav } from "../../components/nav.js";
import { renderFooter } from "../../components/footer.js";

const root = document.querySelector("[data-page]");
const savedTheme = localStorage.getItem("siteTheme");
const prefersDark =
  window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;
const initialTheme = savedTheme || (prefersDark ? "dark" : "light");
document.documentElement.dataset.theme = initialTheme;

const mountNav = () => {
  if (!root) return;
  const nav = renderNav(window.location.pathname);

  const toggle = nav.querySelector(".nav-toggle");
  const themeToggle = nav.querySelector(".theme-toggle");
  const linkWrap = nav.querySelector(".nav-links");
  const syncThemeToggle = () => {
    if (!themeToggle) return;
    const isDark = document.documentElement.dataset.theme === "dark";
    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.querySelector(".theme-toggle-text").textContent = isDark
      ? "Light"
      : "Dark";
  };

  syncThemeToggle();
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const nextTheme =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = nextTheme;
      localStorage.setItem("siteTheme", nextTheme);
      syncThemeToggle();
    });
  }

  if (toggle) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
  }
  if (linkWrap) {
    linkWrap.addEventListener("click", (event) => {
      if (event.target.tagName === "A" && nav.classList.contains("nav-open")) {
        nav.classList.remove("nav-open");
        if (toggle) {
          toggle.setAttribute("aria-expanded", "false");
        }
      }
    });
  }

  const existing = root.querySelector(".nav");
  if (existing) {
    existing.replaceWith(nav);
  } else {
    root.prepend(nav);
  }
};

if (root) {
  mountNav();
  const footer = renderFooter();
  root.appendChild(footer);
}

const animated = document.querySelectorAll(".fade-up");
if (animated.length) {
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18, rootMargin: "0px 0px -10% 0px" }
  );

  animated.forEach((el) => observer.observe(el));
}

const ensureOverlay = () => {
  let overlay = document.getElementById("overlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "overlay";
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="overlay-backdrop" data-overlay-close></div>
    <div class="overlay-panel">
      <button class="overlay-close" type="button" data-overlay-close>Close</button>
      <div class="overlay-content"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (event) => {
    if (event.target.closest("[data-overlay-close]")) {
      overlay.classList.remove("open");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      overlay.classList.remove("open");
    }
  });
  return overlay;
};

const openOverlay = (html) => {
  const overlay = ensureOverlay();
  const content = overlay.querySelector(".overlay-content");
  content.innerHTML = html;
  overlay.classList.add("open");
};

const blogContainer = document.querySelector("[data-blog]");
if (blogContainer) {
  const renderPosts = (posts) => {
    blogContainer.innerHTML = "";
    posts.forEach((post, index) => {
      const block = document.createElement("article");
      block.className = "blog-block fade-up";
      block.style.animationDelay = `${index * 0.1}s`;
      block.innerHTML = `
        <button type="button" class="title-button">${post.title}</button>
      `;
      const button = block.querySelector(".title-button");
      button.addEventListener("click", () => {
        const body = post.contentHtml || `<p>${post.summary || ""}</p>`;
        openOverlay(`
          <h2>${post.title}</h2>
          <div class="blog-meta">${post.date || ""} ${post.location ? `• ${post.location}` : ""}</div>
          <div class="overlay-body">${body}</div>
        `);
      });
      blogContainer.appendChild(block);
    });

    const animatedBlocks = blogContainer.querySelectorAll(".fade-up");
    if (animatedBlocks.length) {
      const observer = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("in-view");
              obs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.18, rootMargin: "0px 0px -10% 0px" }
      );
      animatedBlocks.forEach((el) => observer.observe(el));
    }
  };

  const loadPosts = async () => {
    try {
      const response = await fetch("data/blog.json");
      if (!response.ok) {
        throw new Error("Failed to load blog posts.");
      }
      const posts = await response.json();
      renderPosts(posts);
    } catch (error) {
      blogContainer.innerHTML =
        "<p>Could not load blog posts. Please try again later.</p>";
    }
  };

  loadPosts();
}

// projects.html has one grid per category (data-projects="passion" | "mini").
// Every project comes from data/projects.json:
//   { title, category, kind, status, description, link?, path? }
//   link -> external URL, path -> page hosted in this repo (e.g. mini-proj/<name>/)
const projectGrids = document.querySelectorAll("[data-projects]");
if (projectGrids.length) {
  const renderProjects = (grid, projects) => {
    grid.innerHTML = "";
    if (!projects.length) {
      const empty = document.createElement("p");
      empty.className = "helper";
      empty.textContent = "Nothing here yet. Check back soon.";
      grid.appendChild(empty);
      return;
    }

    projects.forEach((project, index) => {
      const card = document.createElement("article");
      card.className = "blog-block fade-up";
      card.style.animationDelay = `${index * 0.1}s`;

      const title = document.createElement("h3");
      const meta = document.createElement("div");
      const description = document.createElement("p");
      const actions = document.createElement("div");

      title.textContent = project.title;
      meta.className = "blog-meta";
      meta.textContent = [project.kind, project.status].filter(Boolean).join(" • ");
      description.textContent = project.description || "Project details coming soon.";
      actions.className = "action-row";

      if (project.path) {
        const openLink = document.createElement("a");
        openLink.className = "primary-btn";
        openLink.href = project.path;
        openLink.textContent = "Open";
        actions.appendChild(openLink);
      }

      if (project.link) {
        const externalLink = document.createElement("a");
        externalLink.className = "ghost-btn";
        externalLink.href = project.link;
        externalLink.target = "_blank";
        externalLink.rel = "noopener noreferrer";
        externalLink.textContent = "Visit";
        actions.appendChild(externalLink);
      }

      card.append(title, meta, description);
      if (actions.children.length) card.appendChild(actions);
      grid.appendChild(card);
    });

    grid.querySelectorAll(".fade-up").forEach((el) => {
      el.classList.add("in-view");
    });
  };

  fetch("data/projects.json")
    .then((response) => {
      if (!response.ok) throw new Error("Failed to load projects.");
      return response.json();
    })
    .then((projects) => {
      projectGrids.forEach((grid) => {
        const category = grid.dataset.projects;
        renderProjects(
          grid,
          projects.filter((p) => (p.category || "passion") === category)
        );
      });
    })
    .catch(() => {
      projectGrids.forEach((grid) => {
        grid.innerHTML = "<p>Could not load projects. Please try again later.</p>";
      });
    });
}

const achievementsList = document.querySelector("[data-achievements]");
if (achievementsList) {
  const renderAchievements = (items) => {
    achievementsList.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "helper";
      empty.textContent = "Achievements coming soon.";
      achievementsList.appendChild(empty);
      return;
    }

    items.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "blog-block fade-up";
      card.style.animationDelay = `${index * 0.1}s`;

      const title = document.createElement("h3");
      const meta = document.createElement("div");
      const description = document.createElement("p");

      title.textContent = item.title;
      meta.className = "blog-meta";
      meta.textContent = [item.date, item.event].filter(Boolean).join(" • ");
      description.textContent = item.description || "";

      card.append(title, meta, description);
      achievementsList.appendChild(card);
    });

    achievementsList.querySelectorAll(".fade-up").forEach((el) => {
      el.classList.add("in-view");
    });
  };

  fetch("data/achievements.json")
    .then((response) => {
      if (!response.ok) throw new Error("Failed to load achievements.");
      return response.json();
    })
    .then(renderAchievements)
    .catch(() => {
      achievementsList.innerHTML =
        "<p>Could not load achievements. Please try again later.</p>";
    });
}
