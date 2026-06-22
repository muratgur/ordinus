/* Ordinus — "How you use it" page.
   A calm, text-first usage page laid out as a walking path: numbered stations down
   a hand-drawn left rail, arrows leading from one to the next. No screenshots,
   no morph theatre. */

(() => {
  const SVGNS = "http://www.w3.org/2000/svg";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ROUGH = { roughness: 1.4, bowing: 1.5, stroke: "#111", strokeWidth: 2 };

  // phones can't install a desktop app
  if (window.matchMedia("(max-width: 860px), (hover: none)").matches) document.body.classList.add("is-mobile");

  /* ---------- the walking trail ---------- */
  const trail = document.querySelector(".trail");
  const railSvg = document.getElementById("trail-rail");

  function drawTrail() {
    if (!trail || !railSvg || !window.rough) return;
    const steps = [...trail.querySelectorAll(".trail-step")];
    if (!steps.length) return;

    const W = 64, cx = 30, R = 16;
    const H = trail.offsetHeight;
    railSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    railSvg.setAttribute("width", W);
    railSvg.setAttribute("height", H);
    railSvg.style.height = H + "px";
    while (railSvg.firstChild) railSvg.removeChild(railSvg.firstChild);

    const rc = rough.svg(railSvg);
    const strip = (n) => { n.querySelectorAll("path").forEach((p) => { p.removeAttribute("stroke"); p.removeAttribute("stroke-width"); }); return n; };
    const add = (n, cls) => { strip(n); if (cls) n.setAttribute("class", cls); railSvg.appendChild(n); return n; };

    // node centre per station, aligned to the actual centre of its kicker line
    // (measured, not guessed — padding varies, so a fixed offset drifts)
    const trailTop = trail.getBoundingClientRect().top;
    const ys = steps.map((s) => {
      const k = s.querySelector(".huui-kicker") || s;
      const r = k.getBoundingClientRect();
      return Math.round(r.top - trailTop + r.height / 2);
    });

    // connectors: a gently bowing line from one node to the next, arrow at the bottom
    for (let i = 0; i < ys.length - 1; i++) {
      const y1 = ys[i] + R + 5, y2 = ys[i + 1] - R - 7;
      const bow = i % 2 === 0 ? 7 : -7;
      add(rc.path(`M ${cx} ${y1} Q ${cx + bow} ${(y1 + y2) / 2} ${cx} ${y2}`, { ...ROUGH, roughness: 1.2, strokeWidth: 2 }), "trail-line");
      add(rc.path(`M ${cx - 6} ${y2 - 9} L ${cx} ${y2} L ${cx + 6} ${y2 - 9}`, { ...ROUGH, strokeWidth: 2 }), "trail-line"); // arrowhead, pointing down
    }

    // numbered nodes
    ys.forEach((y, i) => {
      add(rc.circle(cx, y, R * 2, { ...ROUGH, strokeWidth: 2 }), "trail-node");
      const t = document.createElementNS(SVGNS, "text");
      t.setAttribute("x", cx); t.setAttribute("y", y + 5); t.setAttribute("text-anchor", "middle");
      t.setAttribute("class", "trail-numtext"); t.textContent = String(i + 1);
      railSvg.appendChild(t);
    });

    // draw the path on, once, when it scrolls into view
    if (!reduce && !railSvg.dataset.revealed) {
      const paths = railSvg.querySelectorAll("path");
      paths.forEach((p) => { let l = 0; try { l = p.getTotalLength(); } catch (e) {} if (!l) return; p.style.strokeDasharray = l; p.style.strokeDashoffset = l; });
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          railSvg.dataset.revealed = "1";
          paths.forEach((p, i) => { let l = 0; try { l = p.getTotalLength(); } catch (e) {} if (!l) return; p.style.transition = `stroke-dashoffset 620ms ease ${Math.min(i * 45, 900)}ms`; p.style.strokeDashoffset = "0"; });
          io.disconnect();
        });
      }, { threshold: 0.04 });
      io.observe(trail);
    }
  }

  if (trail) {
    const redraw = () => requestAnimationFrame(drawTrail);
    redraw();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw); // Kalam shifts heights
    let t;
    window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { railSvg.dataset.revealed = "1"; drawTrail(); }, 160); });
  }

  /* ---------- gentle reveal for content blocks ---------- */
  if (!reduce && "IntersectionObserver" in window) {
    const blocks = document.querySelectorAll(".trail-way, .huui-qa > div");
    blocks.forEach((el) => el.classList.add("pre-reveal"));
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("revealed"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    blocks.forEach((el) => io.observe(el));
  }

  /* ---------- send the link to a real computer (mobile) ---------- */
  const sendBtn = document.getElementById("send-to-computer");
  if (sendBtn) sendBtn.addEventListener("click", async () => {
    const url = location.origin + location.pathname.replace(/how-you-use-it\.html$/, "index.html");
    if (navigator.share) { try { await navigator.share({ title: "Ordinus — not an AI, a team.", url }); } catch (e) {} }
    else { try { await navigator.clipboard.writeText(url); sendBtn.textContent = "✓ Link copied — open it on your computer"; } catch (e) {} }
  });
})();
