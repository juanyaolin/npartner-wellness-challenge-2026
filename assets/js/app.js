const externalSignupLinks = document.querySelectorAll("[data-signup-link]");

externalSignupLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");

    if (!href || href === "#") {
      event.preventDefault();
      window.alert("正式上線時，這裡會替換成 Google Form 報名連結。");
    }
  });
});

const currentPath = window.location.pathname.split("/").pop() || "index.html";
const navLinks = document.querySelectorAll("[data-nav-link]");

navLinks.forEach((link) => {
  const href = link.getAttribute("href") || "";
  const isCurrentPage = href === currentPath || href.startsWith(`${currentPath}#`);

  if (isCurrentPage) {
    link.setAttribute("aria-current", "page");
  }
});
