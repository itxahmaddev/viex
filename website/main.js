(function () {
  "use strict";

  var REPO = "itxahmaddev/viex";
  var root = document.documentElement;

  /* ---- loader -> ready ---- */
  function ready() {
    root.classList.remove("is-loading");
    root.classList.add("is-ready");
  }
  if (document.readyState === "complete") setTimeout(ready, 450);
  else window.addEventListener("load", function () { setTimeout(ready, 450); });

  /* ---- theme toggle ---- */
  var toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("viex-theme", next); } catch (e) {}
    });
  }

  /* ---- reveal on scroll ---- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    reveals.forEach(function (el, i) {
      el.style.transitionDelay = (i % 4) * 60 + "ms";
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---- copy code blocks ---- */
  document.querySelectorAll("pre[data-copy]").forEach(function (pre) {
    pre.setAttribute("data-hint", "click to copy");
    pre.addEventListener("click", function () {
      var text = pre.innerText.trim();
      var done = function () {
        pre.setAttribute("data-hint", "copied");
        setTimeout(function () { pre.setAttribute("data-hint", "click to copy"); }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });

  /* ---- latest release: version + file sizes (links already work without this) ---- */
  function formatSize(bytes) {
    if (!bytes) return "";
    var mb = bytes / (1024 * 1024);
    return mb >= 1 ? mb.toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
  }
  fetch("https://api.github.com/repos/" + REPO + "/releases/latest", { headers: { Accept: "application/vnd.github+json" } })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (release) {
      if (!release || !release.tag_name) return;
      var versionLine = document.getElementById("versionLine");
      if (versionLine) versionLine.textContent = "Latest: " + release.tag_name;
      var meta = document.getElementById("releaseMeta");
      if (meta) {
        var date = release.published_at ? new Date(release.published_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
        meta.textContent = "Latest build " + release.tag_name + (date ? " · " + date : "") + ". Every push to main is built and published automatically.";
      }
      (release.assets || []).forEach(function (asset) {
        var size = document.querySelector('[data-size-for="' + asset.name + '"]');
        if (size) size.textContent = formatSize(asset.size) + " · " + asset.download_count + " downloads";
        document.querySelectorAll('[data-asset="' + asset.name + '"]').forEach(function (a) { a.href = asset.browser_download_url; });
      });
    })
    .catch(function () { /* offline or rate limited: the static links keep working */ });
})();
