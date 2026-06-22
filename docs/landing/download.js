/* Ordinus landing — smart download buttons.
   Detects the visitor's OS, labels the primary button for it ("Download for Mac" /
   "Download for Windows"), and resolves the *current* release's .dmg / .exe directly
   via the GitHub API — so it always points at the latest build without anyone editing
   a versioned URL. Falls back to the releases page if the API is unavailable.

   Buttons opt in with class `js-download`. Add `data-os-label` to also relabel by OS.
   A `.js-download-other` link (optional) is pointed at the other platform's installer. */

(() => {
  const REPO = "muratgur/ordinus";
  const RELEASES = "https://github.com/muratgur/ordinus/releases/latest";

  const btns = [...document.querySelectorAll(".js-download")];
  const others = [...document.querySelectorAll(".js-download-other")];
  if (!btns.length && !others.length) return;

  const ua = navigator.userAgent || "";
  const plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  const isMac = /mac/i.test(plat) || /mac os x/i.test(ua);
  const isWin = /win/i.test(plat) || /windows/i.test(ua);
  const os = isMac ? "mac" : isWin ? "win" : "other";

  const labelFor = (o) => (o === "mac" ? "Download for Mac" : o === "win" ? "Download for Windows" : "Download");
  const otherOs = os === "mac" ? "win" : "mac";

  // labels + safe default href (the releases page) before the API resolves
  btns.forEach((b) => { if (b.dataset.osLabel !== undefined) b.textContent = labelFor(os); b.href = RELEASES; });
  others.forEach((el) => {
    if (os === "other") { el.hidden = true; return; }
    el.textContent = otherOs === "mac" ? "On a Mac? Get that version →" : "On Windows? Get that version →";
    el.href = RELEASES;
  });

  if (os === "other") return; // unknown platform → leave everything on the releases page

  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((rel) => {
      const assets = rel.assets || [];
      const url = (re) => { const a = assets.find((x) => re.test(x.name)); return a && a.browser_download_url; };
      const macUrl = url(/\.dmg$/i);
      const winUrl = url(/\.exe$/i);
      const primary = os === "mac" ? macUrl : winUrl;
      const other = os === "mac" ? winUrl : macUrl;
      if (primary) btns.forEach((b) => { b.href = primary; });
      if (other) others.forEach((el) => { el.href = other; });
    })
    .catch(() => { /* keep the releases-page fallback */ });
})();
