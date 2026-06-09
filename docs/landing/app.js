/* Ordinus landing — hand-drawn team scene, 100% rough.js.
   Strict black-on-white; the single accent appears ONLY on the agent that is
   currently working and on the final result. */

(() => {
  const SVGNS = "http://www.w3.org/2000/svg";
  const svg = document.getElementById("scene");
  const rc = rough.svg(svg);
  const resultCard = document.getElementById("result-card");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // mobile: can't install a desktop app on a phone — flip primary CTA to "Star"
  const isMobile = window.matchMedia("(max-width: 860px), (hover: none)").matches;
  if (isMobile) document.body.classList.add("is-mobile");

  // three little busts in a row — no table (viewBox 900 x 430)
  const SEATS = [
    { x: 170, y: 200 },
    { x: 450, y: 158 },
    { x: 730, y: 200 },
  ];

  // a connected head-to-shoulders silhouette so each agent reads as a person
  const bodyPath = (x, y) =>
    `M ${x - 30} ${y + 80} C ${x - 30} ${y + 48} ${x - 14} ${y + 41} ${x} ${y + 41} ` +
    `C ${x + 14} ${y + 41} ${x + 30} ${y + 48} ${x + 30} ${y + 80}`;

  const SCENARIOS = {
    roadtrip: {
      roles: [
        { label: "Scout", prop: "magnifier" },
        { label: "Budgeter", prop: "calculator" },
        { label: "Planner", prop: "map" },
      ],
      title: "Trip plan ready",
      items: ["5-day route", "3 budget options", "Stops & detours"],
    },
    finances: {
      roles: [
        { label: "Analyst", prop: "chart" },
        { label: "Advisor", prop: "scale" },
        { label: "Skeptic", prop: "magnifier" },
      ],
      title: "Finances reviewed",
      items: ["Spending breakdown", "2 ways to save", "A second opinion"],
    },
    dinner: {
      roles: [
        { label: "Nutritionist", prop: "leaf" },
        { label: "Chef", prop: "fork" },
        { label: "Shopper", prop: "cart" },
      ],
      title: "Dinner sorted",
      items: ["Tonight's menu", "Shopping list", "Ready in 35 min"],
    },
  };

  const ROUGH = { roughness: 1.5, bowing: 1.4, stroke: "#111", strokeWidth: 2 };
  let busy = false;
  let token = 0;

  /* ---------- low-level helpers ---------- */

  // CSS controls colour, so strip inline stroke attrs from rough's paths.
  function add(node, cls) {
    node.querySelectorAll("path").forEach((p) => {
      p.removeAttribute("stroke");
      p.removeAttribute("stroke-width");
    });
    if (cls) node.setAttribute("class", cls);
    svg.appendChild(node);
    return node;
  }

  function text(x, y, str, cls) {
    const t = document.createElementNS(SVGNS, "text");
    t.setAttribute("x", x);
    t.setAttribute("y", y);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("class", cls);
    t.textContent = str;
    svg.appendChild(t);
    return t;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));

  // animate every <path> in a node as if it's being sketched
  function drawIn(node, dur = 600) {
    const paths = node.querySelectorAll("path");
    paths.forEach((p) => {
      let len = 0;
      try { len = p.getTotalLength(); } catch (e) { len = 0; }
      if (!len || reduce) return;
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
      // force layout, then release
      p.getBoundingClientRect();
      p.style.transition = `stroke-dashoffset ${dur}ms ease`;
      p.style.strokeDashoffset = "0";
    });
  }

  /* ---------- props (small hand-drawn glyphs above each head) ---------- */

  function prop(kind, px, py) {
    const g = document.createElementNS(SVGNS, "g");
    const put = (n) => { n.querySelectorAll("path").forEach((p) => { p.removeAttribute("stroke"); p.removeAttribute("stroke-width"); }); g.appendChild(n); };
    const o = { ...ROUGH, strokeWidth: 1.8 };
    switch (kind) {
      case "magnifier":
        put(rc.circle(px - 4, py, 18, o));
        put(rc.line(px + 7, py + 7, px + 16, py + 16, o));
        break;
      case "calculator":
        put(rc.rectangle(px - 11, py - 13, 22, 26, o));
        put(rc.line(px - 11, py - 3, px + 11, py - 3, o));
        put(rc.line(px - 4, py + 3, px - 4, py + 11, o));
        put(rc.line(px + 4, py + 3, px + 4, py + 11, o));
        break;
      case "map":
        put(rc.rectangle(px - 14, py - 11, 28, 22, o));
        put(rc.path(`M ${px - 14} ${py - 6} L ${px - 4} ${py + 2} L ${px + 5} ${py - 5} L ${px + 14} ${py + 4}`, o));
        break;
      case "chart":
        put(rc.line(px - 12, py + 12, px + 12, py + 12, o));
        put(rc.line(px - 7, py + 12, px - 7, py + 3, o));
        put(rc.line(px, py + 12, px, py - 6, o));
        put(rc.line(px + 7, py + 12, px + 7, py - 2, o));
        break;
      case "scale":
        put(rc.line(px, py - 12, px, py + 10, o));
        put(rc.line(px - 13, py - 8, px + 13, py - 8, o));
        put(rc.path(`M ${px - 13} ${py - 8} q 0 9 6 9 q 6 0 6 -9`, o));
        put(rc.path(`M ${px + 1} ${py - 8} q 0 9 6 9 q 6 0 6 -9`, o));
        break;
      case "leaf":
        put(rc.path(`M ${px} ${py + 12} C ${px - 16} ${py + 2} ${px - 10} ${py - 14} ${px} ${py - 12} C ${px + 12} ${py - 14} ${px + 16} ${py + 2} ${px} ${py + 12} Z`, o));
        put(rc.line(px, py + 10, px, py - 9, o));
        break;
      case "fork":
        put(rc.line(px - 6, py - 12, px - 6, py + 12, o));
        put(rc.line(px - 10, py - 12, px - 10, py - 4, o));
        put(rc.line(px - 2, py - 12, px - 2, py - 4, o));
        put(rc.line(px + 8, py - 12, px + 8, py + 12, o));
        put(rc.path(`M ${px + 4} ${py - 12} q 4 6 4 10`, o));
        break;
      case "cart":
        put(rc.path(`M ${px - 13} ${py - 8} L ${px - 9} ${py - 8} L ${px - 5} ${py + 6} L ${px + 11} ${py + 6} L ${px + 13} ${py - 4} L ${px - 7} ${py - 4}`, o));
        put(rc.circle(px - 4, py + 12, 5, o));
        put(rc.circle(px + 8, py + 12, 5, o));
        break;
    }
    g.setAttribute("class", "prop");
    svg.appendChild(g);
    return g;
  }

  /* ---------- build pieces ---------- */

  function buildAgent(seat, role, i) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "agent");
    g.dataset.i = i;
    svg.appendChild(g);

    // head
    const head = rc.circle(seat.x, seat.y, 58, ROUGH);
    head.querySelectorAll("path").forEach((p) => { p.removeAttribute("stroke"); p.removeAttribute("stroke-width"); });
    head.setAttribute("class", "head");
    g.appendChild(head);

    // shoulders / torso (connected silhouette)
    const sh = rc.path(bodyPath(seat.x, seat.y), ROUGH);
    sh.querySelectorAll("path").forEach((p) => { p.removeAttribute("stroke"); p.removeAttribute("stroke-width"); });
    sh.setAttribute("class", "body");
    g.appendChild(sh);

    // prop above head
    const pr = prop(role.prop, seat.x, seat.y - 52);
    g.appendChild(pr);

    // label (handwritten, under the figure)
    const lbl = text(seat.x, seat.y + 112, role.label, "label");
    g.appendChild(lbl);

    return g;
  }

  function arrow(from, to) {
    const a = { x: from.x + 38, y: from.y + 6 };
    const b = { x: to.x - 38, y: to.y + 6 };
    const mx = (a.x + b.x) / 2;
    const my = Math.min(a.y, b.y) - 38; // arc upward
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "arrow");
    const curve = rc.path(`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`, { ...ROUGH, strokeWidth: 2 });
    curve.querySelectorAll("path").forEach((p) => { p.removeAttribute("stroke"); p.removeAttribute("stroke-width"); });
    g.appendChild(curve);
    // arrowhead
    const head = rc.path(`M ${b.x - 11} ${b.y - 7} L ${b.x} ${b.y} L ${b.x - 11} ${b.y + 7}`, { ...ROUGH, strokeWidth: 2 });
    head.querySelectorAll("path").forEach((p) => { p.removeAttribute("stroke"); p.removeAttribute("stroke-width"); });
    g.appendChild(head);
    svg.appendChild(g);
    return g;
  }

  /* ---------- result card ---------- */

  function showResult(cfg) {
    resultCard.querySelector(".result-title").textContent = cfg.title;
    const ul = resultCard.querySelector(".result-list");
    ul.innerHTML = "";
    cfg.items.forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it;
      ul.appendChild(li);
    });
    svg.classList.add("resolved");
    resultCard.classList.add("show");
    resultCard.setAttribute("aria-hidden", "false");
  }

  function clearScene() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.classList.remove("resolved");
    resultCard.classList.remove("show");
    resultCard.setAttribute("aria-hidden", "true");
  }

  /* ---------- the sequence ---------- */

  async function play(key) {
    if (busy) return;
    busy = true;
    const myToken = ++token;
    const cfg = SCENARIOS[key];

    clearScene();
    const agents = SEATS.map((s, i) => buildAgent(s, cfg.roles[i], i));
    agents.forEach((a, i) => setTimeout(() => drawIn(a, 520), reduce ? 0 : i * 140));
    await sleep(reduce ? 0 : 700);
    if (myToken !== token) return done();

    // pass the work down the line — highlight moves with the active agent
    for (let i = 0; i < agents.length; i++) {
      agents.forEach((a) => a.classList.remove("active"));
      agents[i].classList.add("active");
      await sleep(620);
      if (myToken !== token) return done();
      if (i < agents.length - 1) {
        const ar = arrow(SEATS[i], SEATS[i + 1]);
        drawIn(ar, 420);
        await sleep(520);
        if (myToken !== token) return done();
      }
    }

    agents.forEach((a) => a.classList.remove("active"));
    await sleep(180);
    showResult(cfg);
    done();

    function done() { busy = false; }
  }

  /* ---------- wiring ---------- */

  const cards = [...document.querySelectorAll(".card")];
  cards.forEach((c) => {
    c.addEventListener("click", () => {
      if (busy) return;
      cards.forEach((x) => x.classList.remove("selected"));
      c.classList.add("selected");
      play(c.dataset.scenario);
    });
  });

  // idle hint: gently draw the resting team so the stage isn't blank
  const IDLE_LABELS = ["Scout", "Builder", "Critic"];
  function idle() {
    clearScene();
    SEATS.forEach((s, i) => {
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "agent");
      svg.appendChild(g);
      const head = rc.circle(s.x, s.y, 58, ROUGH);
      head.querySelectorAll("path").forEach((p) => { p.removeAttribute("stroke"); p.removeAttribute("stroke-width"); });
      head.setAttribute("class", "head");
      g.appendChild(head);
      const sh = rc.path(bodyPath(s.x, s.y), ROUGH);
      sh.querySelectorAll("path").forEach((p) => { p.removeAttribute("stroke"); p.removeAttribute("stroke-width"); });
      g.appendChild(sh);
      const lbl = text(s.x, s.y + 112, IDLE_LABELS[i], "label");
      g.appendChild(lbl);
      setTimeout(() => drawIn(g, 600), reduce ? 0 : 150 + i * 160);
    });
  }

  idle();
})();
