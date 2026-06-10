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
      question: "Plan our spring road trip",
      title: "Trip plan ready",
      items: ["5-day route", "3 budget options", "Stops & detours"],
    },
    finances: {
      roles: [
        { label: "Analyst", prop: "chart" },
        { label: "Advisor", prop: "scale" },
        { label: "Skeptic", prop: "magnifier" },
      ],
      question: "How are my finances looking?",
      title: "Finances reviewed",
      items: ["Spending breakdown", "2 ways to save", "A second opinion"],
    },
    dinner: {
      roles: [
        { label: "Nutritionist", prop: "leaf" },
        { label: "Chef", prop: "fork" },
        { label: "Shopper", prop: "cart" },
      ],
      question: "What should we cook tonight?",
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

  // hide a node's strokes synchronously (same frame as append) so nothing flashes
  function prepHide(node) {
    node.querySelectorAll("path").forEach((p) => {
      let len = 0;
      try { len = p.getTotalLength(); } catch (e) { len = 0; }
      if (!len || reduce) return;
      p.style.transition = "none";
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
    });
  }

  // reveal a previously-hidden node, sketching its strokes on
  function reveal(node, dur = 500) {
    node.querySelectorAll("path").forEach((p) => {
      let len = 0;
      try { len = p.getTotalLength(); } catch (e) { len = 0; }
      if (!len || reduce) { p.style.strokeDashoffset = "0"; return; }
      p.style.transition = `stroke-dashoffset ${dur}ms ease`;
      p.style.strokeDashoffset = "0";
    });
  }

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
    await showAsk(cfg.question);
    if (myToken !== token) return done();
    const agents = SEATS.map((s, i) => buildAgent(s, cfg.roles[i], i));
    agents.forEach(prepHide); // hide synchronously — no flash / double-draw
    agents.forEach((a, i) => setTimeout(() => reveal(a, 520), reduce ? 0 : i * 140));
    await sleep(reduce ? 0 : 760);
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

  // a faint centered handwritten note — placeholder for features not built yet
  function drawNote(msg) {
    clearScene();
    const t = text(450, 210, msg, "label");
    t.setAttribute("opacity", "0.45");
    t.style.fontSize = "26px";
  }

  /* ---------- Workflow feature: a designed, re-runnable flow ---------- */

  // 5-step flow with a parallel fan-out: 1 → (2,3 in parallel) → (4,5)
  const WF_NODES = [
    { cx: 128, cy: 200, label: "Pick a topic" },
    { cx: 448, cy: 118, label: "Research it" },
    { cx: 448, cy: 282, label: "Gather examples" },
    { cx: 772, cy: 118, label: "Notion article" },
    { cx: 772, cy: 282, label: "Canva slides" },
  ];
  // Pick → (Research, Gather); Gather → Research; Research → (Notion, Canva)
  const WF_ARROWS = [[0, 1], [0, 2], [2, 1], [1, 3], [1, 4]];
  // cumulative: light a box together with its OUTGOING arrows; everything stays lit
  const WF_STEPS = [
    { boxes: [0], arrows: [0, 1] }, // Pick a topic → Research, Gather
    { boxes: [2], arrows: [2] },    // Gather examples → Research
    { boxes: [1], arrows: [3, 4] }, // Research it → Notion, Canva
    { boxes: [3, 4], arrows: [] },  // Notion article, Canva slides
  ];
  const WF_QUESTION = "Make a post on electric cars";
  const WF_RESULT = {
    title: "Ready to share",
    items: ["Draft written in Notion", "Slides built in Canva", "Sources included"],
  };
  const BOX_W = 196, BOX_H = 60;
  let wfBoxEls = [], wfArrowEls = [];

  function wfBox(b) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "wf-box");
    const rect = rc.rectangle(b.cx - BOX_W / 2, b.cy - BOX_H / 2, BOX_W, BOX_H, { ...ROUGH, strokeWidth: 2 });
    rect.querySelectorAll("path").forEach((p) => { p.removeAttribute("stroke"); p.removeAttribute("stroke-width"); });
    rect.setAttribute("class", "box");
    g.appendChild(rect);
    const t = document.createElementNS(SVGNS, "text");
    t.setAttribute("x", b.cx); t.setAttribute("y", b.cy + 6);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("class", "label wf-label");
    t.textContent = b.label;
    g.appendChild(t);
    svg.appendChild(g);
    return g;
  }

  // elbowed (right-angle) connector, like a flowchart.
  // handles left-to-right flow and same-column vertical links.
  function wfArrow(a, b, bend = 0) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "arrow");
    let d, hd;
    if (Math.abs(a.cx - b.cx) < 1) {
      // vertical connector (same column)
      const x = a.cx;
      const up = b.cy < a.cy;
      const ay = a.cy + (up ? -BOX_H / 2 : BOX_H / 2);
      const by = b.cy + (up ? BOX_H / 2 : -BOX_H / 2);
      d = `M ${x} ${ay} L ${x} ${by}`;
      hd = up
        ? `M ${x - 7} ${by + 11} L ${x} ${by} L ${x + 7} ${by + 11}`
        : `M ${x - 7} ${by - 11} L ${x} ${by} L ${x + 7} ${by - 11}`;
    } else {
      const ax = a.cx + BOX_W / 2, ay = a.cy, bx = b.cx - BOX_W / 2, by = b.cy;
      const mx = (ax + bx) / 2 + bend;
      d = Math.abs(ay - by) < 1
        ? `M ${ax} ${ay} L ${bx} ${by}`
        : `M ${ax} ${ay} L ${mx} ${ay} L ${mx} ${by} L ${bx} ${by}`;
      hd = `M ${bx - 11} ${by - 7} L ${bx} ${by} L ${bx - 11} ${by + 7}`;
    }
    const c = rc.path(d, { ...ROUGH, roughness: 1.1, strokeWidth: 2 });
    c.querySelectorAll("path").forEach((p) => { p.removeAttribute("stroke"); p.removeAttribute("stroke-width"); });
    g.appendChild(c);
    const h = rc.path(hd, { ...ROUGH, strokeWidth: 2 });
    h.querySelectorAll("path").forEach((p) => { p.removeAttribute("stroke"); p.removeAttribute("stroke-width"); });
    g.appendChild(h);
    svg.appendChild(g);
    return g;
  }

  const WF_BENDS = [0, 0, 0, 0, 0];

  function buildFlow() {
    clearScene();
    wfBoxEls = WF_NODES.map(wfBox);
    wfArrowEls = WF_ARROWS.map(([a, b], i) => wfArrow(WF_NODES[a], WF_NODES[b], WF_BENDS[i]));
    // hide everything in the same frame as creation — no flash
    [...wfBoxEls, ...wfArrowEls].forEach(prepHide);
    // then sketch them on in flow order: boxes left-to-right, then arrows along the flow
    wfBoxEls.forEach((g, i) => setTimeout(() => reveal(g, 460), reduce ? 0 : i * 150));
    wfArrowEls.forEach((g, i) => setTimeout(() => reveal(g, 420), reduce ? 0 : 360 + i * 150));
  }

  function ensureFlow() {
    if (!wfBoxEls.length || !wfBoxEls[0].isConnected) buildFlow();
  }

  async function runFlow() {
    if (busy) return;
    busy = true;
    const myToken = ++token;
    clearScene();
    await showAsk(WF_QUESTION);     // 1) the question types out first
    if (myToken !== token) return doneWf();
    buildFlow();                    // 2) then the flow sketches in
    await sleep(reduce ? 0 : 1500);
    if (myToken !== token) return doneWf();

    // 3) trace the flow left-to-right; each lit box + arrow STAYS lit (cumulative)
    for (let s = 0; s < WF_STEPS.length; s++) {
      WF_STEPS[s].boxes.forEach((idx) => wfBoxEls[idx].classList.add("active"));
      WF_STEPS[s].arrows.forEach((idx) => wfArrowEls[idx].classList.add("active"));
      await sleep(reduce ? 0 : 720);
      if (myToken !== token) return doneWf();
    }
    await sleep(reduce ? 0 : 280);
    if (myToken !== token) return doneWf();
    showResult(WF_RESULT);
    const chip = controlsEl.querySelector(".card");
    if (chip) chip.textContent = "↻ Run again";
    doneWf();

    function doneWf() { busy = false; }
  }

  /* ---------- Schedules feature: set it once, wake up to it done ---------- */

  function newG(cls) {
    const g = document.createElementNS(SVGNS, "g");
    if (cls) g.setAttribute("class", cls);
    svg.appendChild(g);
    return g;
  }
  function gAdd(parent, node, cls) {
    node.querySelectorAll("path").forEach((p) => { p.removeAttribute("stroke"); p.removeAttribute("stroke-width"); });
    if (cls) node.setAttribute("class", cls);
    parent.appendChild(node);
    return node;
  }

  const SCH_CLOCK = { cx: 150, cy: 188, r: 76 };
  // each agent wakes at its hour and produces a deliverable
  const SCH_AGENTS = [
    { x: 405, y: 168, name: "Writer", time: "10:00", hourDeg: 300, minDeg: 1080, out: "doc" },
    { x: 615, y: 168, name: "Designer", time: "14:00", hourDeg: 420, minDeg: 2520, out: "slides" },
    { x: 825, y: 168, name: "Organizer", time: "16:00", hourDeg: 480, minDeg: 3240, out: "checks" },
  ];
  const SCH_QUESTION = "Take care of my daily tasks";
  const SCH_RESULT = {
    title: "Your day, handled",
    items: ["A draft by 10:00", "Slides by 14:00", "Tasks checked by 16:00"],
  };

  function schClockFace() {
    const { cx, cy, r } = SCH_CLOCK;
    const g = newG("sch-clock");
    gAdd(g, rc.circle(cx, cy, r * 2, ROUGH));
    [-90, 0, 90, 180].forEach((deg) => {
      const a = (deg * Math.PI) / 180;
      gAdd(g, rc.line(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10), cx + Math.cos(a) * r, cy + Math.sin(a) * r, ROUGH));
    });
    gAdd(g, rc.circle(cx, cy, 7, ROUGH));
    return g;
  }

  function schMinuteHand() {
    const { cx, cy, r } = SCH_CLOCK;
    const g = newG("sch-clock"); // ink, part of the clock
    gAdd(g, rc.line(cx, cy, cx, cy - r * 0.72, { ...ROUGH, strokeWidth: 2.5 }));
    g.style.transformOrigin = `${cx}px ${cy}px`;
    g.style.transform = "rotate(0deg)";
    return g;
  }

  function schHourHand() {
    const { cx, cy, r } = SCH_CLOCK;
    const g = newG("sch-hand");
    gAdd(g, rc.line(cx, cy, cx, cy - r * 0.46, { ...ROUGH, strokeWidth: 3.5 }));
    g.style.transformOrigin = `${cx}px ${cy}px`;
    g.style.transform = "rotate(210deg)"; // 7:00
    return g;
  }

  function schAgent(a) {
    const g = newG("agent sch-agent asleep");
    gAdd(g, rc.circle(a.x, a.y, 58, ROUGH), "head");
    gAdd(g, rc.path(bodyPath(a.x, a.y), ROUGH), "body");
    const name = text(a.x, a.y + 104, a.name, "label");
    name.style.fontSize = "18px";
    g.appendChild(name);
    const time = text(a.x, a.y + 126, a.time, "label sch-time");
    time.style.fontSize = "14px";
    time.style.fill = "#9a9a9a";
    g.appendChild(time);
    // sleep doodle — ascending z's
    [0, 1, 2].forEach((i) => {
      const z = text(a.x + 30 + i * 9, a.y - 22 - i * 13, "z", "label sch-z");
      z.style.fontSize = (13 + i * 4) + "px";
      g.appendChild(z);
    });
    return g;
  }

  function schOutput(kind, x, y) {
    const g = newG("sch-out");
    if (kind === "doc") {
      gAdd(g, rc.rectangle(x - 16, y - 21, 32, 42, ROUGH));
      for (let i = 0; i < 3; i++) gAdd(g, rc.line(x - 9, y - 9 + i * 9, x + 9, y - 9 + i * 9, ROUGH));
    } else if (kind === "slides") {
      gAdd(g, rc.rectangle(x - 22, y - 16, 44, 33, ROUGH));
      gAdd(g, rc.circle(x - 9, y, 9, ROUGH));
      gAdd(g, rc.line(x + 2, y - 4, x + 15, y - 4, ROUGH));
      gAdd(g, rc.line(x + 2, y + 5, x + 15, y + 5, ROUGH));
    } else { // checks
      for (let i = 0; i < 3; i++) {
        const yy = y - 15 + i * 14;
        gAdd(g, rc.path(`M ${x - 18} ${yy} l 4 4 l 8 -9`, ROUGH));
        gAdd(g, rc.line(x - 2, yy, x + 17, yy, ROUGH));
      }
    }
    return g;
  }

  async function runSch() {
    if (busy) return;
    busy = true;
    const myToken = ++token;
    clearScene();
    await showAsk(SCH_QUESTION);
    if (myToken !== token) return doneS();

    const face = schClockFace();
    const minute = schMinuteHand();
    const hand = schHourHand();
    prepHide(face);
    reveal(face, 620);

    const agentEls = SCH_AGENTS.map(schAgent);
    agentEls.forEach(prepHide);
    agentEls.forEach((g, i) => setTimeout(() => reveal(g, 480), reduce ? 0 : 240 + i * 130));
    await sleep(reduce ? 0 : 950);
    if (myToken !== token) return doneS();

    // sweep both hands; the minute hand spins full turns as the hour creeps
    // identical easing → both hands set off and arrive together
    hand.style.transition = reduce ? "none" : "transform 1.1s ease-in-out";
    minute.style.transition = reduce ? "none" : "transform 1.1s ease-in-out";
    for (let i = 0; i < SCH_AGENTS.length; i++) {
      hand.style.transform = `rotate(${SCH_AGENTS[i].hourDeg}deg)`;
      minute.style.transform = `rotate(${SCH_AGENTS[i].minDeg}deg)`;
      await sleep(reduce ? 0 : 1150);
      if (myToken !== token) return doneS();
      agentEls[i].classList.remove("asleep");
      agentEls[i].classList.add("awake");
      const a = SCH_AGENTS[i];
      const icon = schOutput(a.out, a.x + 56, a.y - 16);
      prepHide(icon);
      reveal(icon, 460);
      await sleep(reduce ? 0 : 560);
      if (myToken !== token) return doneS();
    }
    await sleep(reduce ? 0 : 260);
    if (myToken !== token) return doneS();
    showResult(SCH_RESULT);
    const chip = controlsEl.querySelector(".card");
    if (chip) chip.textContent = "↻ Replay";
    doneS();

    function doneS() { busy = false; }
  }

  /* ---------- Conversations feature: agents discuss, challenge, conclude ---------- */

  const CONV_AGENTS = [
    { x: 195, y: 262, name: "Visionary", bubble: "Buy — build equity", accent: false },
    { x: 450, y: 262, name: "Analyst", bubble: "Rent costs less now", accent: false },
    { x: 705, y: 262, name: "Skeptic", bubble: "But the risk?", accent: true },
  ];
  const CONV_QUESTION = "Should I rent or buy?";
  const CONV_RESULT = {
    title: "Leaning rent — for now",
    items: ["Lower cost today", "Freedom to move", "Revisit in a year"],
  };

  function convAgent(a) {
    const g = newG("agent conv-agent");
    gAdd(g, rc.circle(a.x, a.y, 58, ROUGH), "head");
    gAdd(g, rc.path(bodyPath(a.x, a.y), ROUGH), "body");
    const lbl = text(a.x, a.y + 104, a.name, "label");
    lbl.style.fontSize = "18px";
    g.appendChild(lbl);
    return g;
  }

  function convBubble(cx, cy, str, accent) {
    const g = newG("conv-bubble" + (accent ? " challenge" : ""));
    const w = Math.max(150, str.length * 11 + 30), h = 52;
    gAdd(g, rc.rectangle(cx - w / 2, cy - h / 2, w, h, { ...ROUGH, roughness: 1.2 }), "bub");
    gAdd(g, rc.path(`M ${cx - 12} ${cy + h / 2 - 2} L ${cx - 4} ${cy + h / 2 + 15} L ${cx + 10} ${cy + h / 2 - 2}`, { ...ROUGH, roughness: 1.2 }), "bub");
    const t = text(cx, cy + 6, str, "label conv-text");
    t.style.fontSize = "16px";
    g.appendChild(t);
    return g;
  }

  async function runConv() {
    if (busy) return;
    busy = true;
    const myToken = ++token;
    clearScene();
    await showAsk(CONV_QUESTION);
    if (myToken !== token) return doneC();

    const agents = CONV_AGENTS.map(convAgent);
    agents.forEach(prepHide);
    agents.forEach((g, i) => setTimeout(() => reveal(g, 480), reduce ? 0 : 130 + i * 130));
    await sleep(reduce ? 0 : 950);
    if (myToken !== token) return doneC();

    // each agent speaks in turn — the last one challenges (accent)
    for (let i = 0; i < CONV_AGENTS.length; i++) {
      agents.forEach((g) => g.classList.remove("active"));
      agents[i].classList.add("active");
      const a = CONV_AGENTS[i];
      const bub = convBubble(a.x, a.y - 128, a.bubble, a.accent);
      prepHide(bub);
      reveal(bub, 420);
      await sleep(reduce ? 0 : 1100);
      if (myToken !== token) return doneC();
    }
    agents.forEach((g) => g.classList.remove("active"));
    await sleep(reduce ? 0 : 220);
    showResult(CONV_RESULT);
    const chip = controlsEl.querySelector(".card");
    if (chip) chip.textContent = "↻ Replay";
    doneC();

    function doneC() { busy = false; }
  }

  /* ---------- feature registry ---------- */

  const FEATURES = {
    workboard: {
      prompt: "Pick a job — watch the team take it on.",
      controls: [
        { id: "roadtrip", label: "Plan a road trip" },
        { id: "finances", label: "Review my finances" },
        { id: "dinner", label: "Plan tonight's family dinner" },
      ],
      run(id) { play(id); },
      start() { this.run(this.controls[0].id); }, // autoplay first scenario
    },
    workflow: {
      prompt: "Wire up a flow. Run it. Run it again.",
      controls: [{ id: "run", label: "▶ Run the flow" }],
      run() { runFlow(); },
      start() { runFlow(); },
    },
    schedules: {
      prompt: "Set it once — wake up to it done.",
      controls: [{ id: "play", label: "▶ Play" }],
      run() { runSch(); },
      start() { runSch(); },
    },
    conversations: {
      prompt: "Hand them a decision. Let them argue it out.",
      controls: [{ id: "play", label: "▶ Play" }],
      run() { runConv(); },
      start() { runConv(); },
    },
  };

  /* ---------- tab controller ---------- */

  const tabs = [...document.querySelectorAll(".tab")];
  const microEl = document.getElementById("micro-prompt");
  const controlsEl = document.getElementById("controls");
  const askEl = document.getElementById("ask");
  const askTextEl = askEl.querySelector(".ask-text");

  // type out the user's question, so it reads as "you asked → they answer"
  async function showAsk(q) {
    askEl.classList.add("show", "typing");
    askTextEl.textContent = "";
    if (reduce) { askTextEl.textContent = q; askEl.classList.remove("typing"); return; }
    for (let i = 0; i < q.length; i++) {
      askTextEl.textContent = q.slice(0, i + 1);
      await sleep(24);
    }
    askEl.classList.remove("typing");
  }
  function hideAsk() { askEl.classList.remove("show", "typing"); }

  function renderControls(feature) {
    controlsEl.innerHTML = "";
    feature.controls.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "card" + (i === 0 ? " selected" : "");
      b.textContent = c.label;
      b.addEventListener("click", () => {
        if (busy) return;
        [...controlsEl.children].forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
        feature.run(c.id);
      });
      controlsEl.appendChild(b);
    });
  }

  function selectTab(id) {
    token++;        // abort any running sequence
    busy = false;
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.feature === id)));
    const feature = FEATURES[id];
    microEl.textContent = feature.prompt;
    renderControls(feature);
    feature.start();
  }

  tabs.forEach((t) => t.addEventListener("click", () => selectTab(t.dataset.feature)));

  selectTab("workboard");

  /* ---------- screenshot carousel (tail) ---------- */

  function initShots() {
    // light = base file, dark = "-Black" variant. Edit captions/order freely.
    const SHOTS = [
      { light: "Workboard-Game.png", dark: "Workboard-Game-Black.png",
        title: "Your team, at work",
        text: "Agents pick up a job and pass it down the line — here, building a game from scratch." },
      { light: "Workflow-Enemy.png", dark: "Workflow-Enemy-Black.png",
        title: "Design a flow once, reuse it",
        text: "Wire agents into a visual workflow, then run it whenever you like." },
      { light: "Agents - Ceo.png", dark: "Agents - Ceo - Black.png",
        title: "Agents with a role and a voice",
        text: "Each agent has its own profile, skills, and chat — like a real colleague." },
      { light: "Workboard-Done-Item.png", dark: "Workboard-Done-Item-Black.png",
        title: "Follow the work, step by step",
        text: "Watch each task run and inspect exactly what every agent produced." },
      { light: "Workboard-File-View.png", dark: "Workboard-File-View-Black.png",
        title: "Every result, on your machine",
        text: "Browse the files your team created. Local-first — nothing leaves your computer." },
    ];

    const shotsEl = document.getElementById("shots");
    if (!shotsEl) return;
    const img = document.getElementById("shot-img");
    const titleEl = document.getElementById("shots-title");
    const textEl = document.getElementById("shots-text");
    const dotsEl = document.getElementById("shot-dots");
    const toggleEl = document.getElementById("theme-toggle");
    const playEl = document.getElementById("shot-play");
    let theme = "light", idx = 0, timer = null, playing = true;

    SHOTS.forEach((s, i) => {
      const b = document.createElement("button");
      b.setAttribute("aria-label", "Go to screenshot " + (i + 1));
      b.addEventListener("click", () => { go(i); restart(); });
      dotsEl.appendChild(b);
    });

    function render() {
      const s = SHOTS[idx];
      const name = theme === "dark" ? s.dark : s.light;
      const pre = new Image();
      img.style.opacity = "0";
      pre.onload = () => { img.src = pre.src; img.style.opacity = "1"; };
      pre.src = "landing/shots/" + encodeURIComponent(name);
      titleEl.textContent = s.title;
      textEl.textContent = s.text;
      [...dotsEl.children].forEach((d, i) => d.classList.toggle("active", i === idx));
    }
    function go(i) { idx = (i + SHOTS.length) % SHOTS.length; render(); }
    function next() { go(idx + 1); }
    function prev() { go(idx - 1); }
    function start() { if (!reduce && playing) timer = setInterval(next, 7000); }
    function stop() { clearInterval(timer); }
    function restart() { stop(); start(); }

    document.getElementById("shot-next").addEventListener("click", () => { next(); restart(); });
    document.getElementById("shot-prev").addEventListener("click", () => { prev(); restart(); });
    toggleEl.addEventListener("click", () => {
      theme = theme === "dark" ? "light" : "dark";
      shotsEl.classList.toggle("dark", theme === "dark");
      toggleEl.textContent = theme === "dark" ? "☀ Light" : "☾ Dark";
      render();
    });
    playEl.addEventListener("click", () => {
      playing = !playing;
      playEl.textContent = playing ? "⏸" : "▶";
      playEl.setAttribute("aria-label", playing ? "Pause autoplay" : "Play autoplay");
      restart();
    });
    // hover pauses temporarily; resumes only if the user hasn't paused it
    shotsEl.addEventListener("mouseenter", stop);
    shotsEl.addEventListener("mouseleave", () => { if (playing) start(); });

    render();
    start();
  }

  initShots();
})();
