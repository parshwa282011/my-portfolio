import { renderNav } from "../../components/nav.js";
import { renderFooter } from "../../components/footer.js";

const root = document.querySelector("[data-page]");
const restrictedPages = new Set(["secret", "login", "admin"]);
if (root) {
  const pageName = root.getAttribute("data-page");
  if (!restrictedPages.has(pageName)) {
    sessionStorage.removeItem("easterEggUnlocked");
  }
}
const mountNav = () => {
  if (!root) return;
  const nav = renderNav(window.location.pathname);

  const toggle = nav.querySelector(".nav-toggle");
  const linkWrap = nav.querySelector(".nav-links");
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

const konami = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];
let konamiIndex = 0;
document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isInput =
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable);
  if (isInput) return;

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === konami[konamiIndex]) {
    konamiIndex += 1;
    if (konamiIndex === konami.length) {
      sessionStorage.setItem("easterEggUnlocked", "true");
      mountNav();
      konamiIndex = 0;
    }
  } else {
    konamiIndex = 0;
  }
});

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
  const API_BASE = `${window.location.protocol}//${window.location.hostname}:3000`;
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
      const response = await fetch(`${API_BASE}/api/blog`);
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

const gamesGrid = document.getElementById("games-grid");
if (gamesGrid) {
  const API_BASE = `${window.location.protocol}//${window.location.hostname}:3000`;
  const renderGames = (games) => {
    gamesGrid.innerHTML = "";
    if (!games.length) {
      gamesGrid.innerHTML = "<p class=\"helper\">No games yet.</p>";
      return;
    }
    games.forEach((game, index) => {
      const block = document.createElement("article");
      block.className = "blog-block fade-up";
      block.style.animationDelay = `${index * 0.1}s`;
      block.innerHTML = `
        <button type="button" class="title-button">${game.title}</button>
      `;
      const button = block.querySelector(".title-button");
      button.addEventListener("click", () => {
        const details = [
          game.status ? `<div class="blog-meta">${game.status}</div>` : "",
          game.description ? `<p>${game.description}</p>` : "",
          game.serverJs || game.clientHtml
            ? `<p class="helper">Assets available: ${[
                game.serverJs ? "server.js" : "",
                game.clientHtml ? "client.html" : "",
              ]
                .filter(Boolean)
                .join(", ")}</p>`
            : "",
          game.link
            ? `<p><a href="${game.link}" target="_blank" rel="noopener noreferrer">Play</a></p>`
            : "",
        ].join("");
        openOverlay(`
          <h2>${game.title}</h2>
          <div class="overlay-body">${details}</div>
        `);
      });
      gamesGrid.appendChild(block);
    });

    const animatedBlocks = gamesGrid.querySelectorAll(".fade-up");
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

  const loadGames = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/games`);
      if (!response.ok) {
        throw new Error("Failed to load games.");
      }
      const games = await response.json();
      renderGames(games);
    } catch (error) {
      gamesGrid.innerHTML =
        "<p>Could not load games. Please try again later.</p>";
    }
  };

  loadGames();
}
