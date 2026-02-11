export function renderNav(activePath) {
  const links = [
    { href: "about.html", label: "About" },
    { href: "blog.html", label: "Blog" },
    { href: "projects.html", label: "Passion Projects" },
    { href: "socials.html", label: "Ways to Connect" },
    { href: "activities.html", label: "Activities" },
  ];
  const isUnlocked =
    typeof window !== "undefined" &&
    sessionStorage.getItem("easterEggUnlocked") === "true";
  if (isUnlocked) {
    links.push({ href: "secret.html", label: "Cool Projects", secret: true });
    links.push({ href: "login.html", label: "Admin Portal", secret: true });
  }
  const hasToken =
    typeof window !== "undefined" && localStorage.getItem("adminToken");
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

  nav.appendChild(brand);
  nav.appendChild(toggle);
  nav.appendChild(linkWrap);

  return nav;
}
