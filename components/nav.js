import { SERVERLESS } from "../assets/js/config.js";

export function renderNav(activePath) {
  const links = SERVERLESS
    ? [
        { href: "about.html", label: "About" },
        { href: "blog.html", label: "Blog" },
        { href: "projects.html", label: "Passion Projects" },
        { href: "achievements.html", label: "Achievements" },
        { href: "socials.html", label: "Ways to Connect" },
      ]
    : [
        { href: "about.html", label: "About" },
        { href: "blog.html", label: "Blog" },
        { href: "projects.html", label: "Passion Projects" },
        { href: "requests.html", label: "Custom Pages" },
        { href: "socials.html", label: "Ways to Connect" },
        { href: "activities.html", label: "Activities" },
      ];
  // Secret/admin links all lead to server-backed pages.
  const isUnlocked =
    !SERVERLESS &&
    typeof window !== "undefined" &&
    sessionStorage.getItem("easterEggUnlocked") === "true";
  if (isUnlocked) {
    links.push({ href: "secret.html", label: "Cool Projects", secret: true });
    links.push({ href: "login.html", label: "Admin Portal", secret: true });
  }
  const hasToken =
    !SERVERLESS &&
    typeof window !== "undefined" &&
    localStorage.getItem("adminToken");
  if (hasToken) {
    links.push({ href: "admin.html", label: "Dashboard" });
  }

  const nav = document.createElement("nav");
  nav.className = "nav";
  if (isUnlocked) {
    nav.classList.add("nav-unlocked");
  }

  const brand = document.createElement("div");
  brand.className = "nav-brand";
  brand.textContent = "Parshwa Shah";

  const toggle = document.createElement("button");
  toggle.className = "nav-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Toggle navigation");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = "<span></span><span></span><span></span>";

  const linkWrap = document.createElement("div");
  linkWrap.className = "nav-links";

  links.forEach((link) => {
    const anchor = document.createElement("a");
    anchor.href = link.href;
    anchor.textContent = link.label;
    if (link.secret) {
      anchor.classList.add("nav-secret");
    }
    if (activePath && activePath.endsWith(link.href)) {
      anchor.classList.add("active");
    }
    linkWrap.appendChild(anchor);
  });

  const actions = document.createElement("div");
  actions.className = "nav-actions";

  const themeToggle = document.createElement("button");
  themeToggle.className = "theme-toggle";
  themeToggle.type = "button";
  themeToggle.setAttribute("aria-label", "Switch theme");
  themeToggle.setAttribute("aria-pressed", "false");
  themeToggle.innerHTML = `<span class="theme-toggle-icon" aria-hidden="true"></span><span class="theme-toggle-text">Dark</span>`;

  actions.appendChild(themeToggle);
  actions.appendChild(toggle);

  nav.appendChild(brand);
  nav.appendChild(linkWrap);
  nav.appendChild(actions);

  return nav;
}
