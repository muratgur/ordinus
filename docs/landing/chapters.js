/* Ordinus landing — narrative scroll chapters.
   Each chapter draws a loose hand-drawn WIREFRAME of the real app screen (no detail,
   just the main message), then settles into the actual screenshot inside a window
   frame (the "sketch → the real thing" beat). The doodle's viewBox matches the
   screenshot's aspect, so the sketch lands on the real UI in place.

   Reuses the hero's visual language: Kalam labels, rough.js, accent ONLY on the
   live moment.

   NOTE: the doodle primitives below are a small standalone core. Once all five
   chapters exist we'll lift the shared bits out of app.js into one module; for now
   this keeps the working hero engine untouched. */

(() => {
  const SVGNS = "http://www.w3.org/2000/svg";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ROUGH = { roughness: 1.5, bowing: 1.4, stroke: "#111", strokeWidth: 2 };
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));

  /* ---------- a doodle stage bound to one <svg> ---------- */
  function makeStage(svg) {
    const rc = rough.svg(svg);
    const strip = (node) => {
      node.querySelectorAll("path").forEach((p) => { p.removeAttribute("stroke"); p.removeAttribute("stroke-width"); });
      return node;
    };
    const newG = (cls) => { const g = document.createElementNS(SVGNS, "g"); if (cls) g.setAttribute("class", cls); svg.appendChild(g); return g; };
    const gAdd = (parent, node, cls) => { strip(node); if (cls) node.setAttribute("class", cls); parent.appendChild(node); return node; };
    const text = (x, y, str, cls) => {
      const t = document.createElementNS(SVGNS, "text");
      t.setAttribute("x", x); t.setAttribute("y", y);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", cls);
      t.textContent = str; svg.appendChild(t); return t;
    };
    const prepHide = (node) => node.querySelectorAll("path").forEach((p) => {
      let len = 0; try { len = p.getTotalLength(); } catch (e) {}
      if (!len || reduce) return;
      p.style.transition = "none"; p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
    });
    const reveal = (node, dur = 500) => node.querySelectorAll("path").forEach((p) => {
      let len = 0; try { len = p.getTotalLength(); } catch (e) {}
      if (!len || reduce) { p.style.strokeDashoffset = "0"; return; }
      p.style.transition = `stroke-dashoffset ${dur}ms ease`; p.style.strokeDashoffset = "0";
    });
    const clear = () => { while (svg.firstChild) svg.removeChild(svg.firstChild); };
    return { svg, rc, newG, gAdd, text, prepHide, reveal, clear };
  }

  /* ---------- small wireframe helpers ---------- */
  const wLine = (st, parent, x1, y1, x2, y2) =>
    st.gAdd(parent, st.rc.line(x1, y1, x2, y2, { ...ROUGH, roughness: 1.1, strokeWidth: 1.5 }));
  const wRect = (st, parent, x, y, w, h, cls) =>
    st.gAdd(parent, st.rc.rectangle(x, y, w, h, { ...ROUGH, roughness: 1.05, strokeWidth: 1.8 }), cls);
  function wLabel(st, parent, x, y, str, size) {
    const t = st.text(x, y, str, "label wire-name");
    t.setAttribute("text-anchor", "start");
    t.style.fontSize = size + "px";
    parent.appendChild(t);
    return t;
  }

  /* ---------- Conversations scene (chapter 01) ----------
     A loose wireframe of the real Conversations screen — one question, several
     agents answering in a thread. viewBox 960 x 580 matches the screenshot. */
  const CONV_AGENTS = ["Investment Explorer", "CFO", "CEO"];

  async function playConversation(st, alive) {
    st.clear();

    // chrome (faint): nav strip, sidebar divider, composer line, sidebar list items
    const chrome = st.newG("wire-faint");
    st.gAdd(chrome, st.rc.line(0, 44, 960, 44, { ...ROUGH, roughness: 1, strokeWidth: 1.3 }));
    st.gAdd(chrome, st.rc.line(210, 44, 210, 524, { ...ROUGH, roughness: 1, strokeWidth: 1.3 }));
    st.gAdd(chrome, st.rc.line(240, 524, 930, 524, { ...ROUGH, roughness: 1, strokeWidth: 1.3 }));
    st.gAdd(chrome, st.rc.line(20, 112, 185, 112, ROUGH));
    st.gAdd(chrome, st.rc.line(20, 150, 185, 150, ROUGH));
    st.prepHide(chrome); st.reveal(chrome, 520);

    // the only accent in the chrome: "New conversation" pill + active nav tab
    const accent = st.newG("wire-accent");
    st.gAdd(accent, st.rc.rectangle(20, 60, 170, 30, { ...ROUGH, roughness: 1, strokeWidth: 1.8 }));
    st.gAdd(accent, st.rc.line(520, 44, 612, 44, { ...ROUGH, roughness: 1, strokeWidth: 3 }));
    st.prepHide(accent); st.reveal(accent, 360);
    await sleep(620);
    if (!alive()) return;

    // the question you put to the room (You bubble, top-right)
    const q = st.newG("wire-q");
    wRect(st, q, 540, 82, 404, 52, "box");
    wLine(st, q, 562, 104, 922, 104);
    wLine(st, q, 562, 119, 850, 119);
    wLabel(st, q, 540, 74, "You", 16);
    st.prepHide(q); st.reveal(q, 520);
    await sleep(760);
    if (!alive()) return;

    // the agents weigh in, one card at a time (accent flashes as each speaks)
    const cardY = [152, 258, 364], cardH = [92, 92, 84];
    for (let i = 0; i < CONV_AGENTS.length; i++) {
      const y = cardY[i], h = cardH[i];
      const card = st.newG("wire-card");
      wRect(st, card, 240, y, 690, h, "box");
      st.gAdd(card, st.rc.circle(272, y + 26, 22, { ...ROUGH, strokeWidth: 1.6 }), "avatar");
      wLabel(st, card, 298, y + 31, CONV_AGENTS[i], 18);
      wLine(st, card, 264, y + 56, 900, y + 56);
      wLine(st, card, 264, y + 72, 820, y + 72);
      st.prepHide(card); st.reveal(card, 460);
      card.classList.add("speaking");
      await sleep(880);
      if (!alive()) return;
      card.classList.remove("speaking");
      await sleep(150);
    }
    await sleep(420);
  }

  /* ---------- Workboard scene (chapter 02) — a kanban board ----------
     viewBox 960 x 665. One job, split into cards across Waiting -> Running -> Done. */
  async function playWorkboard(st, alive) {
    st.clear();
    const chrome = st.newG("wire-faint");
    st.gAdd(chrome, st.rc.line(0, 40, 960, 40, { ...ROUGH, roughness: 1, strokeWidth: 1.3 }));
    st.gAdd(chrome, st.rc.line(200, 40, 200, 548, { ...ROUGH, roughness: 1, strokeWidth: 1.3 }));
    st.gAdd(chrome, st.rc.line(20, 150, 182, 150, ROUGH));
    st.prepHide(chrome); st.reveal(chrome, 500);
    const accent = st.newG("wire-accent");
    st.gAdd(accent, st.rc.rectangle(18, 58, 166, 30, { ...ROUGH, roughness: 1, strokeWidth: 1.8 }));
    st.gAdd(accent, st.rc.line(340, 40, 430, 40, { ...ROUGH, roughness: 1, strokeWidth: 3 }));
    st.prepHide(accent); st.reveal(accent, 340);
    await sleep(540); if (!alive()) return;

    const colX = [222, 470, 718], names = ["Waiting", "Running", "Done"];
    const head = st.newG("wire-faint");
    colX.forEach((x) => st.gAdd(head, st.rc.line(x, 100, x + 212, 100, ROUGH)));
    st.prepHide(head); st.reveal(head, 420);
    names.forEach((n, i) => wLabel(st, head, colX[i] + 4, 90, n, 15));
    await sleep(520); if (!alive()) return;

    const card = (x, y, active) => {
      const c = st.newG("wire-card");
      wRect(st, c, x, y, 206, 96, "box");
      st.gAdd(c, st.rc.circle(x + 22, y + 28, 11, { ...ROUGH, strokeWidth: 1.4 }), "avatar");
      wLine(st, c, x + 40, y + 28, x + 160, y + 28);
      wLine(st, c, x + 16, y + 60, x + 184, y + 60);
      wLine(st, c, x + 16, y + 76, x + 120, y + 76);
      st.prepHide(c); st.reveal(c, 440);
      if (active) c.classList.add("speaking");
      return c;
    };
    // one job, split into tasks across Waiting -> Running -> Done
    const wY = [108, 214, 320];
    card(colX[0] + 4, wY[0]); await sleep(480); if (!alive()) return;
    card(colX[0] + 4, wY[1]); await sleep(540); if (!alive()) return;
    card(colX[1] + 4, wY[0]); await sleep(300); if (!alive()) return;
    const run = card(colX[1] + 4, wY[1], true); await sleep(340); if (!alive()) return;
    card(colX[1] + 4, wY[2]); await sleep(640); if (!alive()) return;
    card(colX[2] + 4, wY[0]); await sleep(700); if (!alive()) return;
    run.classList.remove("speaking");
    await sleep(320);
  }

  /* ---------- Connections scene (chapter 03) — a list of integrations ----------
     viewBox 960 x 646. Each tool a row with an accent Connect button. */
  async function playConnections(st, alive) {
    st.clear();
    const chrome = st.newG("wire-faint");
    st.gAdd(chrome, st.rc.line(0, 40, 960, 40, { ...ROUGH, roughness: 1, strokeWidth: 1.3 }));
    st.gAdd(chrome, st.rc.line(210, 40, 210, 548, { ...ROUGH, roughness: 1, strokeWidth: 1.3 }));
    [96, 140, 184, 286, 330].forEach((y) => st.gAdd(chrome, st.rc.line(22, y, 182, y, ROUGH)));
    st.prepHide(chrome); st.reveal(chrome, 500);
    const accent = st.newG("wire-accent");
    st.gAdd(accent, st.rc.rectangle(14, 220, 186, 36, { ...ROUGH, roughness: 1, strokeWidth: 1.6 }));
    st.prepHide(accent); st.reveal(accent, 340);
    const title = st.newG("wire-faint");
    st.gAdd(title, st.rc.line(230, 76, 430, 76, { ...ROUGH, strokeWidth: 2 }));
    st.prepHide(title); st.reveal(title, 360);
    await sleep(620); if (!alive()) return;

    for (const y of [108, 168, 228, 288, 348]) {
      const r = st.newG("wire-card");
      wRect(st, r, 226, y, 700, 48, "box");
      st.gAdd(r, st.rc.rectangle(246, y + 14, 20, 20, { ...ROUGH, strokeWidth: 1.4 }), "avatar");
      wLine(st, r, 278, y + 20, 520, y + 20);
      wLine(st, r, 278, y + 34, 440, y + 34);
      const pill = st.newG("wire-accent");
      st.gAdd(pill, st.rc.rectangle(826, y + 12, 84, 24, { ...ROUGH, roughness: 1, strokeWidth: 1.6 }));
      st.prepHide(r); st.prepHide(pill);
      st.reveal(r, 420); st.reveal(pill, 360);
      await sleep(500); if (!alive()) return;
    }
    await sleep(340);
  }

  /* ---------- Workflow scene (chapter 04) — a node graph (DAG) ----------
     viewBox 960 x 580. Wired tasks, top-to-bottom, then a Run button. */
  async function playWorkflow(st, alive) {
    st.clear();
    const chrome = st.newG("wire-faint");
    st.gAdd(chrome, st.rc.line(0, 40, 960, 40, { ...ROUGH, roughness: 1, strokeWidth: 1.3 }));
    st.gAdd(chrome, st.rc.line(200, 40, 200, 548, { ...ROUGH, roughness: 1, strokeWidth: 1.3 }));
    st.gAdd(chrome, st.rc.line(20, 150, 182, 150, ROUGH));
    st.prepHide(chrome); st.reveal(chrome, 500);
    const accent = st.newG("wire-accent");
    st.gAdd(accent, st.rc.rectangle(18, 58, 166, 30, { ...ROUGH, roughness: 1, strokeWidth: 1.8 }));
    st.gAdd(accent, st.rc.line(300, 40, 392, 40, { ...ROUGH, roughness: 1, strokeWidth: 3 }));
    st.prepHide(accent); st.reveal(accent, 340);
    await sleep(520); if (!alive()) return;

    const NW = 150, NH = 32;
    const nodes = [[560, 78], [560, 146], [430, 218], [690, 218], [560, 290], [430, 362], [690, 362], [560, 440]];
    const edges = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5], [4, 6], [5, 7], [6, 7]];
    const edgeG = st.newG("wire-faint");
    edges.forEach(([a, b]) => st.gAdd(edgeG, st.rc.line(nodes[a][0], nodes[a][1] + NH, nodes[b][0], nodes[b][1], { ...ROUGH, roughness: 1, strokeWidth: 1.4 })));
    st.prepHide(edgeG);
    const nodeEls = nodes.map(([x, y]) => {
      const g = st.newG("wire-card");
      wRect(st, g, x - NW / 2, y, NW, NH, "box");
      st.gAdd(g, st.rc.circle(x - NW / 2 + 13, y + NH / 2, 6, { ...ROUGH, strokeWidth: 1.3 }), "avatar");
      wLine(st, g, x - NW / 2 + 26, y + NH / 2, x + NW / 2 - 16, y + NH / 2);
      st.prepHide(g);
      return g;
    });
    for (let i = 0; i < nodeEls.length; i++) { st.reveal(nodeEls[i], 340); await sleep(210); if (!alive()) return; }
    st.reveal(edgeG, 520);
    await sleep(520); if (!alive()) return;
    const run = st.newG("wire-accent");
    st.gAdd(run, st.rc.rectangle(772, 498, 166, 34, { ...ROUGH, roughness: 1, strokeWidth: 1.8 }));
    st.prepHide(run); st.reveal(run, 360);
    nodeEls[7].classList.add("speaking");
    await sleep(700); if (!alive()) return;
    nodeEls[7].classList.remove("speaking");
    await sleep(320);
  }

  /* ---------- Schedules scene (chapter 05) — standing tasks on a cadence ----------
     viewBox 960 x 580. Groups of scheduled tasks; next-run times in accent. */
  async function playSchedules(st, alive) {
    st.clear();
    const chrome = st.newG("wire-faint");
    st.gAdd(chrome, st.rc.line(0, 44, 960, 44, { ...ROUGH, roughness: 1, strokeWidth: 1.3 }));
    st.prepHide(chrome); st.reveal(chrome, 460);
    const accent = st.newG("wire-accent");
    st.gAdd(accent, st.rc.line(520, 44, 612, 44, { ...ROUGH, roughness: 1, strokeWidth: 3 }));
    st.gAdd(accent, st.rc.rectangle(800, 60, 140, 30, { ...ROUGH, roughness: 1, strokeWidth: 1.8 }));
    st.prepHide(accent); st.reveal(accent, 340);
    const chips = st.newG("wire-faint");
    st.gAdd(chips, st.rc.rectangle(28, 64, 150, 26, { ...ROUGH, roughness: 1, strokeWidth: 1.5 }));
    st.gAdd(chips, st.rc.rectangle(190, 64, 140, 26, { ...ROUGH, roughness: 1, strokeWidth: 1.5 }));
    st.prepHide(chips); st.reveal(chips, 360);
    await sleep(600); if (!alive()) return;

    const tops = [128, 300], gnames = ["Legatus", "Vivian"];
    for (let gi = 0; gi < tops.length; gi++) {
      const top = tops[gi];
      const block = st.newG("wire-card");
      st.gAdd(block, st.rc.circle(44, top + 12, 7, { ...ROUGH, strokeWidth: 1.4 }), "avatar");
      wLabel(st, block, 60, top + 17, gnames[gi], 16);
      wRect(st, block, 28, top + 34, 904, 92, "box");
      wLine(st, block, 56, top + 58, 200, top + 58);
      wLine(st, block, 620, top + 58, 720, top + 58);
      wLine(st, block, 56, top + 92, 280, top + 92);
      wLine(st, block, 620, top + 92, 740, top + 92);
      st.prepHide(block); st.reveal(block, 520);
      const hot = st.newG("wire-accent");
      st.gAdd(hot, st.rc.line(836, top + 90, 906, top + 90, { ...ROUGH, roughness: 1, strokeWidth: 2.4 }));
      st.gAdd(hot, st.rc.path(`M 918 ${top + 84} l 12 6 l -12 6 z`, { ...ROUGH, strokeWidth: 1.4 }));
      st.prepHide(hot); st.reveal(hot, 360);
      await sleep(800); if (!alive()) return;
    }
    await sleep(340);
  }

  // results: only chapters that need a floating answer card define one. The wireframe
  // -> screenshot reveal is the payoff, so none of these use one.
  const SCENES = {
    conversations: playConversation,
    workboard: playWorkboard,
    connections: playConnections,
    workflow: playWorkflow,
    schedules: playSchedules,
  };
  const RESULTS = {};

  /* ---------- result card (DOM, inside the frame) ---------- */
  function fillResult(card, cfg) {
    card.querySelector(".result-title").textContent = cfg.title;
    const ul = card.querySelector(".result-list");
    ul.innerHTML = "";
    cfg.items.forEach((it) => { const li = document.createElement("li"); li.textContent = it; ul.appendChild(li); });
  }

  /* ---------- chapter controller ---------- */
  function initChapter(section) {
    const key = section.dataset.chapter;
    const player = SCENES[key];
    if (!player) return;
    const svg = section.querySelector(".chapter-scene");
    const body = section.querySelector(".frame-body");
    const card = section.querySelector(".chapter-result");
    const st = makeStage(svg);

    let run = 0;          // run token — a new run / replay invalidates the old one
    let played = false;

    async function play() {
      const my = ++run;
      const alive = () => my === run;
      body.classList.remove("show-shot");
      card.classList.remove("show");
      svg.classList.remove("resolved");
      if (reduce) {
        // reduced motion: skip straight to the proof — show the screenshot
        st.clear();
        body.classList.add("show-shot");
        return;
      }
      await player(st, alive);
      if (!alive()) return;
      const res = RESULTS[key];
      if (res) {
        fillResult(card, res);
        card.classList.add("show");
        svg.classList.add("resolved");
      }
      await sleep(res ? 1500 : 650);
      if (!alive()) return;
      // settle into the real product: the sketch fades, the screenshot fills the frame
      body.classList.add("show-shot");
    }

    // play once when the chapter scrolls into view
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !played) { played = true; play(); }
      });
    }, { threshold: 0.4 });
    io.observe(section);

    // click the frame to replay the sketch
    body.addEventListener("click", () => play());
  }

  document.querySelectorAll(".chapter[data-chapter]").forEach(initChapter);

  /* ---------- hand the link from a phone to a real computer (hero + finale) ---------- */
  document.querySelectorAll(".send-to-computer").forEach((sendBtn) => {
    sendBtn.addEventListener("click", async () => {
      const url = location.origin + location.pathname;
      if (navigator.share) {
        try { await navigator.share({ title: "Ordinus — not an AI, a team.", url }); } catch (e) {}
      } else {
        try {
          await navigator.clipboard.writeText(url);
          sendBtn.textContent = "✓ Link copied — open it on your computer";
        } catch (e) {}
      }
    });
  });
})();
