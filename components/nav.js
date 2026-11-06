export function renderNav(activePath) {
  const links = [
    { href: "about.html", label: "About" },
    { href: "blog.html", label: "Blog" },
    { href: "projects.html", label: "Projects" },
    { href: "achievements.html", label: "Achievements" },
    { href: "activities.html", label: "Activities" },
    { href: "socials.html", label: "Ways to Connect" },
  ];

  const nav = document.createElement("nav");
  nav.className = "nav";

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
    // Resolve from this file so links also work from subfolders (mini-proj/...).
    anchor.href = new URL(`../${link.href}`, import.meta.url).href;
    anchor.textContent = link.label;
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
