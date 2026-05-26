import { renderNav } from "../../components/nav.js";
import { renderFooter } from "../../components/footer.js";

const root = document.querySelector("[data-page]");
const getApiBase = () => {
  if (window.location.protocol === "file:") {
    return "http://localhost:3000";
  }
  return window.location.origin;
};

const savedTheme = localStorage.getItem("siteTheme");
const prefersDark =
  window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;
const initialTheme = savedTheme || (prefersDark ? "dark" : "light");
document.documentElement.dataset.theme = initialTheme;

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
  const API_BASE = getApiBase();
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

const requestForm = document.querySelector("[data-custom-request-form]");
if (requestForm) {
  const status = document.querySelector("[data-request-status]");
  const setStatus = (message, type = "") => {
    if (!status) return;
    status.textContent = message;
    status.dataset.status = type;
  };

  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Sending request...");

    const formData = new FormData(requestForm);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch(`${getApiBase()}/api/custom-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Could not send request.");
      }

      requestForm.reset();
      setStatus("Request sent. I will review it soon.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
}

export { getApiBase };
