/* ==========================================================================
   CS 4600/5200 — viz.js
   Visual tools for the playground pages. Every picture here is drawn from
   what PostgreSQL itself returns in the page, so it is never out of step
   with the data the student is changing.

   What it provides
   ----------------
   - Result charts: any result with a label column and a number column (2 to
     40 rows) gets a "Show as chart" button; cells with data-chart="open"
     draw the chart straight away. The table always stays.
   - Watch it run: cells with data-steps get a button that steps through a
     single-table query in its logical order, FROM, WHERE, SELECT, with the
     WHERE verdict (true, false or unknown) computed by PostgreSQL per row.
   - Three-valued logic explorer: [data-tvl].
   - Bag to set: [data-bagset data-sql="..."] shows duplicates collapsing.
   - Group explorer: [data-groupviz] shows rows sorted into groups and one
     result row per group, with HAVING marking the groups it drops.
   - Recursion explorer: [data-recviz] steps through WITH RECURSIVE over
     prereq one round at a time.
   - Foreign key actions: [data-fkviz] deletes a department under NO ACTION,
     CASCADE or SET NULL inside a rolled-back transaction.
   - E-R to tables: [data-erviz] draws the advisor relationship for the chosen
     cardinality and participation, writes its tables, and tests three changes.
   - Normal forms: [data-fdviz] computes closures, candidate keys, BCNF and
     3NF verdicts and a BCNF decomposition for a schema the student types.
   - Join explorer: [data-joinviz] switches one join between INNER, LEFT,
     RIGHT and FULL and marks each row matched or kept from one side only.
   - B+-tree explorer: [data-btreeviz] inserts, searches and range-scans a
     small B+-tree, numbering the pages each step reads.
   - Heap page viewer: [data-heapviz] shows page 0's item slots before and
     after an UPDATE, DELETE or INSERT, rolled back.
   - Join algorithms: [data-algoviz] steps a nested loop, block nested loop,
     merge join or hash join through eight rows, counting comparisons and
     page reads. Runs in the page alone, without the database.
   - Join order: [data-orderviz] lets the student pick a left-deep order for
     a four-table query, then steps the optimizer's dynamic programming search
     one set size at a time. Runs in the page alone, with the real row counts.
   - Two sessions: [data-txviz data-src="id"] replays two-session scenarios
     recorded on a real server (src/gen/txrec.py writes the JSON that the
     page holds in <script type="application/json" id="id">), one step at a
     time, with each session's state and the waits for locks.
   - Recovery: [data-logviz data-src="id" data-crash="n"] replays the book's
     recovery algorithm on a log (src/gen/log14.py writes the JSON in
     <script type="application/json" id="id">) after a crash the student
     places: redo forward from the last checkpoint, then undo backward.
   - Quorums: [data-quorumviz data-w data-r] three replicas; pick W and R,
     write a new version, read it back in the worst case, let them catch up.
   - Schema map: [data-schema-map] SVG whose tables are buttons; hovering or
     focusing one lights up its foreign keys, pressing it peeks at its rows.
   - Animated figures: <figure class="fig-anim"> plays when scrolled into
     view and gets a Replay button.

   Accessibility
   -------------
   Charts are SVG with role="img" and a text summary; the table they come
   from stays on the page. Steps are announced in words through a polite
   live region and use text marks (✓ ✗ ?) as well as colour. Motion is
   short, never loops, and honours prefers-reduced-motion.
   ========================================================================== */

let api = null;          // { query(sql), exec(sql), param(sql, values) } once PostgreSQL is ready
const waiting = [];      // callbacks to run when ready
const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const NUMERIC = new Set([20, 21, 23, 26, 700, 701, 1700]);

function el(tag, attrs, text) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if (text != null) e.textContent = text;
  return e;
}
const SVGNS = "http://www.w3.org/2000/svg";
function sv(tag, attrs, text) {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}
function fmt(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

let liveEl = null;
function announce(t) {
  if (!liveEl) {
    liveEl = el("p", { class: "visually-hidden", role: "status", "aria-live": "polite", "aria-atomic": "true" });
    document.body.appendChild(liveEl);
  }
  liveEl.textContent = "";
  setTimeout(() => { liveEl.textContent = t; }, 30);
}

export function vizReady(queryFn, execFn, paramFn) {
  api = { query: queryFn, exec: execFn, param: paramFn };
  while (waiting.length) waiting.shift()();
}
function whenReady(fn) { if (api) fn(); else waiting.push(fn); }

/* --------------------------------------------------------------- charts -- */

function chartable(result) {
  if (!result.fields || result.rows.length < 2 || result.rows.length > 40) return null;
  const isNum = f => NUMERIC.has(f.dataTypeID) &&
    result.rows.every(r => r[f.name] === null || !isNaN(Number(r[f.name])));
  const val = result.fields.find(isNum);
  const lab = result.fields.find(f => f !== val && !isNum(f));
  if (!val || !lab) return null;
  return { lab, val };
}

function drawChart(result, pick) {
  const rows = result.rows.map(r => ({ l: fmt(r[pick.lab.name]) ?? "NULL", v: r[pick.val.name] === null ? null : Number(r[pick.val.name]) }));
  const max = Math.max(1, ...rows.map(r => r.v || 0));
  const labW = Math.min(240, 16 + 8.2 * Math.max(...rows.map(r => r.l.length)));
  const W = 760, barMax = W - labW - 90, rh = 30;
  const H = rows.length * rh + 12;
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  const summary = `Bar chart of ${pick.val.name} by ${pick.lab.name}: ` +
    rows.map(r => `${r.l} ${r.v === null ? "NULL" : r.v}`).join("; ") + ".";
  svg.setAttribute("aria-label", summary);
  svg.appendChild(sv("line", { class: "axis", x1: labW, x2: labW, y1: 2, y2: H - 6 }));
  rows.forEach((r, i) => {
    const y = 6 + i * rh;
    const lt = sv("text", { class: "bar-lbl", x: labW - 10, y: y + 17, "text-anchor": "end" }, r.l.length > 28 ? r.l.slice(0, 27) + "…" : r.l);
    svg.appendChild(lt);
    const w = r.v === null ? 0 : Math.max(1, (r.v / max) * barMax);
    const b = sv("rect", { class: "bar", x: labW, y: y + 3, width: w.toFixed(1), height: rh - 10, rx: 3 });
    b.style.setProperty("--d", (reduced ? 0 : i * 0.05) + "s");
    svg.appendChild(b);
    svg.appendChild(sv("text", { class: "bar-val", x: labW + w + 8, y: y + 17 }, r.v === null ? "NULL" : String(r.v)));
  });
  const box = el("div", { class: "out-chart" });
  box.appendChild(svg);
  return box;
}

/* Called by playground.js after it renders a result table. */
export function addResultTools(out, result, cell) {
  const pick = chartable(result);
  if (!pick) return;
  const tools = el("div", { class: "out-tools" });
  const btn = el("button", { type: "button", class: "btn btn--small", "aria-pressed": "false" }, "Show as chart");
  tools.appendChild(btn);
  out.appendChild(tools);
  let chart = null;
  const toggle = on => {
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "Hide chart" : "Show as chart";
    if (on && !chart) { chart = drawChart(result, pick); tools.insertAdjacentElement("afterend", chart); }
    if (chart) chart.hidden = !on;
  };
  btn.addEventListener("click", () => toggle(btn.getAttribute("aria-pressed") !== "true"));
  if (cell && cell.dataset.chart === "open") toggle(true);
}

/* -------------------------------------------------------- watch it run --- */

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function parseSimple(sql) {
  const s = sql.replace(/--.*$/gm, "").trim().replace(/;\s*$/, "");
  if (s.includes(";")) return null;
  const m = s.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+WHERE\s+([\s\S]+))?$/i);
  if (!m) return null;
  if (/\b(JOIN|GROUP|ORDER|UNION|INTERSECT|EXCEPT|LIMIT|HAVING|OFFSET)\b/i.test(m[3] || "")) return null;
  const cols = m[1].trim() === "*" ? ["*"] : m[1].split(",").map(c => c.trim());
  if (cols[0] !== "*" && !cols.every(c => IDENT.test(c))) return null;
  return { cols, table: m[2], where: m[3] ? m[3].trim() : null };
}

function stepper(cell) {
  const ta = cell.querySelector("textarea");
  const out = cell.querySelector(".cell-out");
  out.textContent = "";
  const q = parseSimple(ta.value);
  if (!q) {
    out.appendChild(el("p", { class: "out-msg out-msg--no" },
      "Watch it run steps through queries of the form SELECT columns FROM one_table WHERE condition. Run this one with Run instead."));
    return;
  }
  if (!api) { out.appendChild(el("p", { class: "out-msg out-msg--no" }, "The database is still loading. Try again in a moment.")); return; }

  const sql = `SELECT *, (${q.where || "true"}) AS "__keep" FROM ${q.table}`;
  api.query(sql).then(res => buildStepper(out, q, res)).catch(e => {
    out.appendChild(el("p", { class: "out-msg out-msg--error" }, "ERROR: " + e.message));
    announce("Error. " + e.message);
  });
}

function buildStepper(out, q, res) {
  const fields = res.fields.filter(f => f.name !== "__keep").map(f => f.name);
  const keepCols = q.cols[0] === "*" ? fields.slice() : q.cols.map(c => c.toLowerCase());
  const missing = keepCols.filter(c => !fields.includes(c));
  if (missing.length) {
    out.appendChild(el("p", { class: "out-msg out-msg--error" }, `ERROR: column ${missing[0]} does not exist in ${q.table}.`));
    return;
  }
  const rows = res.rows.slice(0, 40);
  const verdict = r => r.__keep === true ? "true" : r.__keep === false ? "false" : "unknown";
  const kept = rows.filter(r => r.__keep === true);

  const box = el("section", { class: "stepper", "aria-label": "Step-through of the query" });
  const phases = el("ol", { class: "stepper-phases" });
  const names = ["1 FROM", "2 WHERE", "3 SELECT", "Result"];
  names.forEach(n => phases.appendChild(el("li", null, n)));
  const say = el("p", { class: "stepper-say" });
  const stage = el("div", { class: "out-scroll", tabindex: "0", role: "region", "aria-label": "Query step" });
  const ctl = el("div", { class: "stepper-ctl" });
  const back = el("button", { type: "button", class: "btn" }, "← Back");
  const next = el("button", { type: "button", class: "btn btn--run" }, "Next step →");
  const play = el("button", { type: "button", class: "btn" }, "Play");
  const close = el("button", { type: "button", class: "btn" }, "Close");
  [back, next, play, close].forEach(b => ctl.appendChild(b));
  box.append(phases, say, stage, ctl);
  out.appendChild(box);

  const counts = { true: 0, false: 0, unknown: 0 };
  rows.forEach(r => counts[verdict(r)]++);

  function table(step) {
    const t = el("table", { class: "out-tbl" + (step === 3 ? " result-in" : "") });
    const cols = step === 3 ? keepCols : fields;
    t.appendChild(el("caption", null, step === 3
      ? `${kept.length} ${kept.length === 1 ? "row" : "rows"} × ${keepCols.length} ${keepCols.length === 1 ? "column" : "columns"}`
      : `${q.table}: ${rows.length} rows`));
    const hr = el("tr");
    cols.forEach(c => {
      const th = el("th", { scope: "col" }, c);
      if (step === 2) th.className = keepCols.includes(c) ? "col-keep" : "col-drop";
      hr.appendChild(th);
    });
    if (step === 1 || step === 2) hr.appendChild(el("th", { scope: "col" }, "WHERE gives"));
    const thead = el("thead"); thead.appendChild(hr); t.appendChild(thead);
    const tb = el("tbody");
    (step === 3 ? kept : rows).forEach(r => {
      const tr = el("tr");
      const v = verdict(r);
      if (step >= 1 && step < 3) tr.className = v === "true" ? "keep" : "drop";
      cols.forEach(c => {
        const val = fmt(r[c]);
        const td = val === null ? el("td", { class: "null" }, "NULL") : el("td", null, val);
        if (step === 2) td.classList.add(keepCols.includes(c) ? "col-keep" : "col-drop");
        tr.appendChild(td);
      });
      if (step === 1 || step === 2) {
        const mark = v === "true" ? "✓ true, kept" : v === "false" ? "✗ false, dropped" : "? unknown, dropped";
        tr.appendChild(el("td", { class: "vcell" }, "")).appendChild(el("span", { class: "verdict verdict--" + v }, mark));
      }
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }

  const text = [
    `FROM ${q.table}: start with every tuple of ${q.table}, ${rows.length} rows and ${fields.length} attributes.`,
    q.where
      ? `WHERE ${q.where}: PostgreSQL works out the condition for each row. ${counts.true} true, ${counts.false} false, ${counts.unknown} unknown. Only the ${counts.true} true ${counts.true === 1 ? "row is" : "rows are"} kept.`
      : `No WHERE clause, so every row is kept.`,
    q.cols[0] === "*"
      ? `SELECT *: keep every attribute.`
      : `SELECT ${keepCols.join(", ")}: keep only ${keepCols.length === 1 ? "this column" : "these " + keepCols.length + " columns"}; the others are dropped.`,
    `Result: ${kept.length} ${kept.length === 1 ? "row" : "rows"} × ${keepCols.length} ${keepCols.length === 1 ? "column" : "columns"}. It is a relation too.`
  ];

  let step = 0, timer = null;
  function show(i) {
    step = Math.max(0, Math.min(3, i));
    Array.from(phases.children).forEach((li, k) => {
      if (k === step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
      li.classList.toggle("done", k < step);
    });
    say.textContent = text[step];
    stage.textContent = "";
    stage.appendChild(table(step));
    back.disabled = step === 0;
    next.disabled = step === 3;
    announce(names[step] + ". " + text[step]);
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } play.textContent = "Play"; }
  back.addEventListener("click", () => { stop(); show(step - 1); });
  next.addEventListener("click", () => { stop(); show(step + 1); });
  play.addEventListener("click", () => {
    if (timer) { stop(); return; }
    if (step === 3) show(0);
    play.textContent = "Pause";
    timer = setInterval(() => { if (step >= 3) stop(); else show(step + 1); }, 2200);
  });
  close.addEventListener("click", () => { stop(); out.textContent = ""; });
  show(0);
  next.focus();
}

/* ---------------------------------------------- three-valued logic -------- */

function tvl(box) {
  const vals = ["TRUE", "FALSE", "NULL"];
  const word = v => v === true ? "true" : v === false ? "false" : "unknown";
  const mark = v => v === true ? "✓" : v === false ? "✗" : "?";
  box.textContent = "";
  box.appendChild(el("h3", null, "Try it: SQL's three truth values"));
  box.appendChild(el("p", null, "Pick a value for p and q. PostgreSQL in this page works out each expression. NULL used as a condition counts as unknown."));
  const pick = el("div", { class: "tvl-pick" });
  const mk = (id, name, init) => {
    const lab = el("label", { for: id }, name);
    const s = el("select", { id });
    vals.forEach(v => { const o = el("option", { value: v }, v); if (v === init) o.selected = true; s.appendChild(o); });
    lab.appendChild(s);
    pick.appendChild(lab);
    return s;
  };
  const p = mk("tvl-p", "p", "TRUE");
  const qq = mk("tvl-q", "q", "NULL");
  box.appendChild(pick);
  const outList = el("ul", { class: "tvl-out", "aria-live": "polite" });
  box.appendChild(outList);
  const grids = el("div", { class: "tvl-grids" });
  box.appendChild(grids);
  outList.appendChild(el("li", null, "Waiting for PostgreSQL…"));

  whenReady(async () => {
    const g = await api.query(`SELECT a::text AS a, b::text AS b, a AND b AS "and", a OR b AS "or"
      FROM (VALUES (1, true), (2, false), (3, NULL::boolean)) x(i, a)
      CROSS JOIN (VALUES (1, true), (2, false), (3, NULL::boolean)) y(j, b) ORDER BY x.i, y.j`);
    const lbl = v => v === null ? "NULL" : v === "true" ? "TRUE" : "FALSE";
    ["and", "or"].forEach(op => {
      const t = el("table", { class: "tvl-grid" });
      t.appendChild(el("caption", null, `p ${op.toUpperCase()} q`));
      const hr = el("tr"); hr.appendChild(el("th", { scope: "col" }, "p \\ q"));
      vals.forEach(v => hr.appendChild(el("th", { scope: "col" }, v)));
      const th = el("thead"); th.appendChild(hr); t.appendChild(th);
      const tb = el("tbody");
      for (let i = 0; i < 3; i++) {
        const tr = el("tr"); tr.appendChild(el("th", { scope: "row" }, vals[i]));
        for (let j = 0; j < 3; j++) {
          const r = g.rows[i * 3 + j];
          const v = r[op];
          const td = el("td", { class: "tv tv--" + word(v), "data-p": lbl(r.a), "data-q": lbl(r.b) }, mark(v) + " " + word(v));
          tr.appendChild(td);
        }
        tb.appendChild(tr);
      }
      t.appendChild(tb);
      grids.appendChild(t);
    });

    async function update() {
      const P = p.value, Q = qq.value;
      const r = (await api.query(`SELECT ${P}::boolean AND ${Q}::boolean AS a, ${P}::boolean OR ${Q}::boolean AS o,
        NOT ${P}::boolean AS n, ${P}::boolean = ${Q}::boolean AS e, ${Q}::boolean IS NULL AS isn`)).rows[0];
      outList.textContent = "";
      [[`p AND q`, r.a], [`p OR q`, r.o], [`NOT p`, r.n], [`p = q`, r.e], [`q IS NULL`, r.isn]].forEach(([k, v]) => {
        const li = el("li", { class: "tv tv--" + word(v) }, `${k} → ${mark(v)} ${word(v)}`);
        outList.appendChild(li);
      });
      grids.querySelectorAll("td").forEach(td => td.classList.toggle("is-sel", td.dataset.p === P && td.dataset.q === Q));
    }
    p.addEventListener("change", update);
    qq.addEventListener("change", update);
    update();
  });
}

/* ------------------------------------------------------- bag to set ------ */

function bagset(box) {
  const sql = box.dataset.sql;
  box.textContent = "";
  box.appendChild(el("h3", null, "See it: a bag becomes a set"));
  box.appendChild(el("p", null, "Each chip is one row of "));
  box.lastChild.appendChild(el("code", null, sql));
  box.lastChild.appendChild(document.createTextNode(". DISTINCT keeps one chip per value."));
  const btn = el("button", { type: "button", class: "btn", "aria-pressed": "false" }, "Apply DISTINCT");
  const refresh = el("button", { type: "button", class: "btn" }, "Reload from the database");
  const ctl = el("div", { class: "stepper-ctl" }); ctl.append(btn, refresh);
  const list = el("ul", { class: "chips", "aria-label": "Rows of the result" });
  const say = el("p", { class: "bagset-say", "aria-live": "polite" }, "Waiting for PostgreSQL…");
  box.append(list, say, ctl);

  let n = 0, distinct = 0;
  async function load() {
    const res = await api.query(sql);
    const f = res.fields[0].name;
    list.textContent = "";
    list.classList.remove("is-set");
    btn.setAttribute("aria-pressed", "false"); btn.textContent = "Apply DISTINCT";
    const seen = new Map();
    res.rows.forEach(r => { const v = fmt(r[f]) ?? "NULL"; seen.set(v, (seen.get(v) || 0) + 1); });
    const first = new Set();
    res.rows.forEach(r => {
      const v = fmt(r[f]) ?? "NULL";
      const li = el("li", { class: "chip" }, v);
      if (first.has(v)) li.classList.add("dup");
      else { first.add(v); if (seen.get(v) > 1) li.appendChild(el("span", { class: "ct", hidden: "" }, "×" + seen.get(v))); }
      list.appendChild(li);
    });
    n = res.rows.length; distinct = seen.size;
    say.textContent = `Bag: ${n} rows, duplicates included.`;
  }
  btn.addEventListener("click", () => {
    const on = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "Undo DISTINCT" : "Apply DISTINCT";
    list.classList.toggle("is-set", on);
    list.querySelectorAll(".dup").forEach(li => on ? li.setAttribute("aria-hidden", "true") : li.removeAttribute("aria-hidden"));
    list.querySelectorAll(".ct").forEach(c => { c.hidden = !on; });
    say.textContent = on ? `Set: ${distinct} distinct values. The ${n - distinct} duplicates are gone; ×N shows how many each one stood for.`
                         : `Bag: ${n} rows, duplicates included.`;
  });
  refresh.addEventListener("click", () => api && load());
  whenReady(load);
}

/* ---------------------------------------------------- join explorer ---- */
/* <div data-joinviz data-cols="d.dept_name, s.name" data-from="department d {JOIN} student s ON ..."
        data-lcheck="d.dept_name" data-rcheck="s.id" data-order="d.dept_name, s.name"
        data-lname="department" data-rname="student" data-start="LEFT"></div>
   lcheck/rcheck name a column that is never NULL in a real row of that side, so a
   NULL there means the row was padded by the outer join. */

const JOINS = [["INNER", "INNER JOIN"], ["LEFT", "LEFT JOIN"], ["RIGHT", "RIGHT JOIN"], ["FULL", "FULL JOIN"]];
let jvCount = 0;
function joinviz(box) {
  const { cols, from, lcheck, rcheck, order } = box.dataset;
  const ln = box.dataset.lname || "left", rn = box.dataset.rname || "right";
  const uid = ++jvCount;
  box.textContent = "";
  box.appendChild(el("h3", null, box.dataset.title || "Try it: four kinds of join"));
  box.appendChild(el("p", null, `Pick a join. PostgreSQL in this page runs it; each row says whether it matched, or was kept from ${ln} only or ${rn} only, with NULL on the other side.`));
  const fs = el("fieldset", { class: "jv-pick" });
  fs.appendChild(el("legend", null, "Join type"));
  JOINS.forEach(([k, kw]) => {
    const id = `jv${uid}-${k}`;
    const inp = el("input", { type: "radio", name: `jv${uid}`, id, value: k });
    if (k === (box.dataset.start || "LEFT")) inp.checked = true;
    const lab = el("label", { for: id });
    lab.append(inp, document.createTextNode(" " + kw));
    fs.appendChild(lab);
  });
  const code = el("pre", { class: "jv-sql" });
  const say = el("p", { class: "jv-say", "aria-live": "polite" }, "Waiting for PostgreSQL…");
  const out = el("div", { class: "jv-out" });
  const refresh = el("button", { type: "button", class: "btn" }, "Reload from the database");
  const ctl = el("div", { class: "stepper-ctl" }); ctl.append(refresh);
  box.append(fs, code, say, out, ctl);
  const ord = order ? " ORDER BY " + order : "";
  const q = kw => `SELECT (${lcheck}) IS NOT NULL AS __l, (${rcheck}) IS NOT NULL AS __r, ${cols} FROM ${from.replace("{JOIN}", kw)}${ord}`;

  async function draw() {
    const k = fs.querySelector("input:checked").value;
    const kw = JOINS.find(j => j[0] === k)[1];
    code.textContent = `SELECT ${cols}\nFROM ${from.replace("{JOIN}", kw)}${order ? "\nORDER BY " + order : ""};`;
    let res, full;
    try { [res, full] = await Promise.all([api.query(q(kw)), api.query(q("FULL JOIN"))]); }
    catch (e) { say.textContent = "PostgreSQL could not run this join: " + e.message + ". Reset the database and try again."; out.textContent = ""; return; }
    const band = r => r.__l && r.__r ? "both" : r.__l ? "l" : "r";
    const cnt = rows => rows.reduce((c, r) => (c[band(r)]++, c), { both: 0, l: 0, r: 0 });
    const c = cnt(res.rows), all = cnt(full.rows);
    const parts = [`${c.both} matched`];
    if (c.l) parts.push(`${c.l} from ${ln} only`);
    if (c.r) parts.push(`${c.r} from ${rn} only`);
    const lost = [];
    if (all.l - c.l) lost.push(`${all.l - c.l} ${ln} row${all.l - c.l > 1 ? "s" : ""} with no match`);
    if (all.r - c.r) lost.push(`${all.r - c.r} ${rn} row${all.r - c.r > 1 ? "s" : ""} with no match`);
    say.textContent = `${kw}: ${res.rows.length} rows, ${parts.join(", ")}.` + (lost.length ? ` It drops ${lost.join(" and ")}.` : " Nothing is dropped.");
    const fields = res.fields.filter(f => f.name !== "__l" && f.name !== "__r");
    const wrap = el("div", { class: "out-scroll", tabindex: "0", role: "region", "aria-label": kw + " result" });
    const t = el("table", { class: "out-tbl jv-tbl" });
    t.appendChild(el("caption", null, res.rows.length + " rows"));
    const hr = el("tr");
    hr.appendChild(el("th", { scope: "col" }, "row"));
    fields.forEach(f => hr.appendChild(el("th", { scope: "col" }, f.name)));
    const th = el("thead"); th.appendChild(hr); t.appendChild(th);
    const tb = el("tbody");
    res.rows.forEach(r => {
      const b = band(r);
      const tr = el("tr", { class: "jv-" + b });
      tr.appendChild(el("td", { class: "jv-tag" }, b === "both" ? "matched" : b === "l" ? ln + " only" : rn + " only"));
      fields.forEach(f => { const v = fmt(r[f.name]); tr.appendChild(v === null ? el("td", { class: "null" }, "NULL") : el("td", null, v)); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t);
    out.textContent = ""; out.appendChild(wrap);
  }
  fs.addEventListener("change", () => api && draw());
  refresh.addEventListener("click", () => api && draw());
  whenReady(draw);
}

/* ------------------------------------------------------- group explorer -- */
/* <div data-groupviz data-table="instructor" data-group="dept_name" data-show="name, salary"
        data-aggs="count(*)|count(salary)|avg(salary)|..." data-having="none|count(*) >= 2|avg(salary) > 85000"></div>
   Shows the input rows sorted into groups, and one output row per group; groups that
   HAVING removes stay visible, marked "dropped by HAVING". */
let gvCount = 0;
function groupviz(box) {
  const { table, group, show } = box.dataset;
  const aggs = (box.dataset.aggs || "count(*)").split("|");
  const havs = (box.dataset.having || "none").split("|");
  const uid = ++gvCount;
  box.textContent = "";
  box.appendChild(el("h3", null, box.dataset.title || "Try it: GROUP BY, one group at a time"));
  box.appendChild(el("p", null, `Pick an aggregate and a HAVING test. On the left, the rows of ${table} sorted into groups by ${group}; on the right, one row per group.`));
  const pick = el("div", { class: "tvl-pick" });
  const mk = (lab, opts, id) => {
    const l = el("label", { for: id }, lab);
    const sel = el("select", { id });
    opts.forEach(o => sel.appendChild(el("option", { value: o }, o)));
    l.appendChild(sel); pick.appendChild(l); return sel;
  };
  const aggSel = mk("Aggregate", aggs, `gv${uid}a`);
  const havSel = mk("HAVING", havs, `gv${uid}h`);
  const code = el("pre", { class: "jv-sql" });
  const say = el("p", { class: "jv-say", "aria-live": "polite" }, "Waiting for PostgreSQL…");
  const out = el("div", { class: "gv-out" });
  box.append(pick, code, say, out);

  const tableOf = (caption, fields, rows, rowCls, cellFmt) => {
    const wrap = el("div", { class: "out-scroll", tabindex: "0", role: "region", "aria-label": caption });
    const t = el("table", { class: "out-tbl jv-tbl" });
    t.appendChild(el("caption", null, caption));
    const hr = el("tr"); fields.forEach(f => hr.appendChild(el("th", { scope: "col" }, f)));
    const th = el("thead"); th.appendChild(hr); t.appendChild(th);
    const tb = el("tbody");
    rows.forEach((r, i) => {
      const tr = el("tr", { class: rowCls(r, i) });
      fields.forEach(f => { const v = cellFmt(r, f); tr.appendChild(v === null ? el("td", { class: "null" }, "NULL") : el("td", null, v)); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); return wrap;
  };

  async function draw() {
    const agg = aggSel.value, hav = havSel.value;
    const having = hav === "none" ? "" : `\nHAVING ${hav}`;
    code.textContent = `SELECT ${group}, ${agg}\nFROM ${table}\nGROUP BY ${group}${having}\nORDER BY ${group};`;
    let inp, res;
    try {
      [inp, res] = await Promise.all([
        api.query(`SELECT ${group} AS __g, ${group}, ${show} FROM ${table} ORDER BY ${group} NULLS LAST, 2, 3`),
        api.query(`SELECT ${group}, ${agg} AS value, count(*) AS __n, ${hav === "none" ? "true" : hav} AS __keep FROM ${table} GROUP BY ${group} ORDER BY ${group} NULLS LAST`)]);
    } catch (e) { say.textContent = "PostgreSQL could not run this: " + e.message + ". Reset the database and try again."; out.textContent = ""; return; }
    const keys = []; inp.rows.forEach(r => { const k = String(r.__g); if (!keys.includes(k)) keys.push(k); });
    const kept = res.rows.filter(r => r.__keep === true).length;
    const dropped = res.rows.length - kept;
    say.textContent = `${inp.rows.length} rows form ${res.rows.length} groups, so the result has ${kept} row${kept === 1 ? "" : "s"}` +
      (dropped ? `; HAVING drops ${dropped} group${dropped === 1 ? "" : "s"}.` : ".");
    const inFields = inp.fields.map(f => f.name).filter(n => n !== "__g");
    const left = tableOf(`${table}: ${inp.rows.length} rows in ${keys.length} groups`, inFields, inp.rows,
      r => "gv-g" + (keys.indexOf(String(r.__g)) % 2), (r, f) => fmt(r[f]));
    const right = tableOf(`result: ${kept} rows`, [group, agg, "group"], res.rows,
      r => r.__keep === true ? "" : "gv-drop",
      (r, f) => f === group ? fmt(r[group]) : f === agg ? fmt(r.value) : (r.__keep === true ? `${r.__n} row${r.__n == 1 ? "" : "s"}` : "dropped by HAVING"));
    out.textContent = ""; out.append(left, right);
  }
  aggSel.addEventListener("change", () => api && draw());
  havSel.addEventListener("change", () => api && draw());
  whenReady(draw);
}

/* --------------------------------------------------- recursion explorer -- */
/* <div data-recviz data-courses="CS-319|CS-347|CS-190"></div>
   Steps through WITH RECURSIVE over prereq one round at a time: round 1 is the
   base query (direct prerequisites), each later round joins the newest rows
   back to prereq, and the recursion stops at the first round that adds nothing. */
let rvCount = 0;
const sqlStr = v => "'" + String(v).replace(/'/g, "''") + "'";
function recviz(box) {
  const courses = (box.dataset.courses || "CS-319").split("|");
  const uid = ++rvCount;
  box.textContent = "";
  box.appendChild(el("h3", null, box.dataset.title || "Try it: WITH RECURSIVE, one round at a time"));
  box.appendChild(el("p", null, "Pick a course, then press Next round. Round 1 is the base query: the course's direct prerequisites. Each later round looks up the prerequisites of the courses the round before it found. When a round finds nothing new, the recursion stops."));
  const pick = el("div", { class: "tvl-pick" });
  const lab = el("label", { for: `rv${uid}c` }, "Course");
  const sel = el("select", { id: `rv${uid}c` });
  courses.forEach(c => sel.appendChild(el("option", { value: c }, c)));
  lab.appendChild(sel); pick.appendChild(lab);
  const code = el("pre", { class: "jv-sql" });
  const say = el("p", { class: "jv-say", "aria-live": "polite" }, "Waiting for PostgreSQL…");
  const out = el("div", { class: "jv-out" });
  const next = el("button", { type: "button", class: "btn btn--run" }, "Next round");
  const all = el("button", { type: "button", class: "btn" }, "Show every round");
  const again = el("button", { type: "button", class: "btn" }, "Start over");
  const ctl = el("div", { class: "stepper-ctl" }); ctl.append(next, all, again);
  box.append(pick, code, ctl, say, out);
  let rows = [], last = 0, shown = 0, course = "";

  function paint() {
    const done = shown > last;
    const vis = rows.filter(r => r.round <= shown);
    if (shown === 0) say.textContent = `Ready. Press Next round to run the base query for ${course}.`;
    else if (!done) {
      const fresh = rows.filter(r => r.round === shown);
      say.textContent = (shown === 1 ? `Round 1, the base query: ${course} directly needs ` : `Round ${shown}, the recursive step: those courses need `) +
        fresh.map(r => r.course_id).join(" and ") + `. ${vis.length} course${vis.length === 1 ? "" : "s"} so far.`;
    } else {
      say.textContent = last === 0
        ? `Round 1, the base query, finds no prerequisites for ${course}, so the result is empty and the recursion stops at once.`
        : `Round ${shown}: the recursive step finds no course that is not already in the result, so the recursion stops. ${course} needs ${rows.length} course${rows.length === 1 ? "" : "s"} in all.`;
    }
    next.disabled = done; all.disabled = done;
    out.textContent = "";
    if (!vis.length) return;
    const wrap = el("div", { class: "out-scroll", tabindex: "0", role: "region", "aria-label": "Prerequisites found so far" });
    const t = el("table", { class: "out-tbl jv-tbl" });
    t.appendChild(el("caption", null, `${vis.length} row${vis.length === 1 ? "" : "s"} after round ${Math.min(shown, last)}`));
    const hr = el("tr");
    ["found in", "prereq_id", "title", "needed by"].forEach(f => hr.appendChild(el("th", { scope: "col" }, f)));
    const th = el("thead"); th.appendChild(hr); t.appendChild(th);
    const tb = el("tbody");
    vis.forEach(r => {
      const isNew = r.round === shown;
      const tr = el("tr", { class: isNew ? "jv-both" : "" });
      tr.appendChild(el("td", { class: "jv-tag" }, (isNew ? "new: " : "") + "round " + r.round));
      [r.course_id, r.title, r.via].forEach(v => tr.appendChild(el("td", null, fmt(v))));
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); out.appendChild(wrap);
  }

  async function load() {
    course = sel.value;
    code.textContent = `WITH RECURSIVE needs(prereq_id) AS (\n  -- base query (round 1)\n  SELECT prereq_id FROM prereq\n  WHERE course_id = ${sqlStr(course)}\n  UNION\n  -- recursive step (rounds 2, 3, ...)\n  SELECT p.prereq_id FROM prereq p\n  JOIN needs n ON p.course_id = n.prereq_id\n)\nSELECT * FROM needs;`;
    try {
      const res = await api.query(`WITH RECURSIVE r(course_id, round, via) AS (
          SELECT prereq_id, 1, course_id FROM prereq WHERE course_id = ${sqlStr(course)}
          UNION ALL
          SELECT p.prereq_id, r.round + 1, p.course_id FROM prereq p JOIN r ON p.course_id = r.course_id WHERE r.round < 25)
        SELECT DISTINCT ON (r.course_id) r.course_id, r.round, r.via, c.title
        FROM r LEFT JOIN course c ON c.course_id = r.course_id
        ORDER BY r.course_id, r.round, r.via`);
      rows = res.rows.sort((a, b) => a.round - b.round || String(a.course_id).localeCompare(String(b.course_id)));
    } catch (e) { say.textContent = "PostgreSQL could not run this: " + e.message + ". Reset the database and try again."; out.textContent = ""; return; }
    last = rows.reduce((m, r) => Math.max(m, r.round), 0);
    shown = 0; paint();
  }
  next.addEventListener("click", () => { if (shown <= last) { shown++; paint(); } });
  all.addEventListener("click", () => { shown = last + 1; paint(); });
  again.addEventListener("click", () => api && load());
  sel.addEventListener("change", () => api && load());
  whenReady(load);
}

/* ------------------------------------------------- foreign key actions ---- */
/* <div data-fkviz data-depts="History|Physics|Economics"></div>
   Copies department and instructor into temporary tables inside a transaction,
   links them with the chosen ON DELETE action, deletes one department, shows
   what happened to its instructors, and rolls everything back. */
const FK_ACTIONS = [["NO ACTION", "NO ACTION (the default)"], ["CASCADE", "CASCADE"], ["SET NULL", "SET NULL"]];
let fkCount = 0;
function fkviz(box) {
  const depts = (box.dataset.depts || "History|Physics|Economics").split("|");
  const uid = ++fkCount;
  box.textContent = "";
  box.appendChild(el("h3", null, box.dataset.title || "Try it: what a foreign key does when its row is deleted"));
  box.appendChild(el("p", null, "Pick what the foreign key from instructor to department should do ON DELETE, and a department to delete. The page copies both tables, deletes the department inside a transaction, shows the result, then rolls back, so the real data never changes."));
  const pick = el("div", { class: "tvl-pick" });
  const mk = (labTxt, opts, id) => {
    const l = el("label", { for: id }, labTxt);
    const s2 = el("select", { id });
    opts.forEach(([v, t]) => s2.appendChild(el("option", { value: v }, t)));
    l.appendChild(s2); pick.appendChild(l); return s2;
  };
  const actSel = mk("ON DELETE", FK_ACTIONS, `fk${uid}a`);
  const depSel = mk("Delete department", depts.map(d0 => [d0, d0]), `fk${uid}d`);
  const code = el("pre", { class: "jv-sql" });
  const say = el("p", { class: "jv-say", "aria-live": "polite" }, "Waiting for PostgreSQL…");
  const out = el("div", { class: "jv-out" });
  box.append(pick, code, say, out);

  async function draw() {
    const act = actSel.value, dep = depSel.value;
    code.textContent = `ALTER TABLE instructor\n  ADD FOREIGN KEY (dept_name) REFERENCES department\n  ON DELETE ${act};\n\nDELETE FROM department WHERE dept_name = ${sqlStr(dep)};`;
    let before, after = null, err = null, left = null;
    try {
      await api.query("BEGIN");
      try {
        await api.query("CREATE TEMP TABLE fk_d AS SELECT dept_name, building FROM department");
        await api.query("ALTER TABLE fk_d ADD PRIMARY KEY (dept_name)");
        await api.query("CREATE TEMP TABLE fk_i AS SELECT id, name, dept_name FROM instructor");
        await api.query(`ALTER TABLE fk_i ADD FOREIGN KEY (dept_name) REFERENCES fk_d ON DELETE ${act}`);
        before = (await api.query(`SELECT id, name, dept_name FROM fk_i WHERE dept_name = ${sqlStr(dep)} ORDER BY name`)).rows;
        try {
          await api.query(`DELETE FROM fk_d WHERE dept_name = ${sqlStr(dep)}`);
          after = (await api.query(`SELECT id, name, dept_name FROM fk_i WHERE id IN (${before.map(r => sqlStr(r.id)).join(",") || "NULL"}) ORDER BY name`)).rows;
          left = (await api.query("SELECT count(*)::int AS n FROM fk_d")).rows[0].n;
        } catch (e) { err = e; }
      } finally { await api.query("ROLLBACK").catch(() => {}); }
    } catch (e) { say.textContent = "PostgreSQL could not run this: " + e.message + ". Reset the database and try again."; out.textContent = ""; return; }

    const n = before.length;
    const who = n === 1 ? "1 instructor" : n + " instructors";
    if (err) say.textContent = `✗ Refused. ${dep} still has ${who}, and NO ACTION does not let a referenced row go. Nothing was deleted. PostgreSQL said: ${err.message}.`;
    else if (!n) say.textContent = `✓ Deleted. ${dep} had no instructors, so nothing referenced it and every ON DELETE action behaves the same. ${left} departments are left.`;
    else if (act === "CASCADE") say.textContent = `✓ Deleted, and the delete cascaded: ${who} of ${dep} were deleted with it.`;
    else say.textContent = `✓ Deleted. ${who} of ${dep} stay, with dept_name set to NULL.`;

    const rowsShown = before.map(r => {
      const a = after ? after.find(x => x.id === r.id) : r;
      return { name: r.name, beforeD: r.dept_name, afterD: err ? r.dept_name : a ? a.dept_name : undefined };
    });
    out.textContent = "";
    if (!rowsShown.length) return;
    const wrap = el("div", { class: "out-scroll", tabindex: "0", role: "region", "aria-label": "Instructors of the deleted department" });
    const t = el("table", { class: "out-tbl jv-tbl" });
    t.appendChild(el("caption", null, `${dep}'s instructors, before and after the DELETE`));
    const hr = el("tr");
    ["name", "dept_name before", "after the DELETE"].forEach(f => hr.appendChild(el("th", { scope: "col" }, f)));
    const th = el("thead"); th.appendChild(hr); t.appendChild(th);
    const tb = el("tbody");
    rowsShown.forEach(r => {
      const gone = r.afterD === undefined;
      const tr = el("tr", { class: gone ? "gv-drop" : r.afterD === null ? "jv-l" : "" });
      tr.appendChild(el("td", null, r.name));
      tr.appendChild(el("td", null, r.beforeD));
      tr.appendChild(gone ? el("td", null, "row deleted") : r.afterD === null ? el("td", { class: "null" }, "NULL") : el("td", null, r.afterD + (err ? " (unchanged)" : "")));
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); out.appendChild(wrap);
  }
  // One draw at a time: each opens its own transaction, so two overlapping
  // draws would share it. A change made while one runs redraws once it ends.
  let running = null, again = false;
  const schedule = () => {
    if (!api) return;
    if (running) { again = true; return; }
    running = draw().finally(() => { running = null; if (again) { again = false; schedule(); } });
  };
  actSel.addEventListener("change", schedule);
  depSel.addEventListener("change", schedule);
  whenReady(schedule);
}


/* ----------------------------------------------- SQL injection (week 9) */
/* <div class="injviz" data-injviz></div>
   Runs one name search two ways: with the typed text pasted into the SQL,
   and with the text sent as a parameter ($1). The pasted version runs with
   exec (so injected statements really run) inside BEGIN ... ROLLBACK, and the
   page reports what it did to takes before rolling it back. */
const INJ_PRESETS = [
  ["ri", "an ordinary search"],
  ["O'Brien", "an honest apostrophe"],
  ["' OR 1=1 --", "match everyone"],
  ["x'; DELETE FROM takes; --", "add a statement"]
];
let injCount = 0;
function injviz(box) {
  const uid = ++injCount;
  box.textContent = "";
  box.appendChild(el("h3", null, box.dataset.title || "Try it: one search, built two ways"));
  box.appendChild(el("p", null, "Type what a user might type into a search box, or pick an example. The left side pastes the text into the SQL, as code built with + or an f-string does. The right side sends it as a parameter. Both run inside a transaction that is rolled back, so nothing is kept."));
  const form = el("div", { class: "inj-form" });
  const lab = el("label", { for: `inj${uid}` }, "Name contains");
  const inp = el("input", { id: `inj${uid}`, type: "text", value: "ri", autocomplete: "off", spellcheck: "false" });
  lab.appendChild(inp);
  const go = el("button", { type: "button", class: "btn btn--run" }, "Search both ways");
  form.append(lab, go);
  const presets = el("div", { class: "inj-presets", role: "group", "aria-label": "Example inputs" });
  INJ_PRESETS.forEach(([v, why]) => {
    const b = el("button", { type: "button", class: "btn btn--small" });
    b.appendChild(el("code", null, v));
    b.appendChild(document.createTextNode(" " + why));
    b.addEventListener("click", () => { inp.value = v; schedule(); });
    presets.appendChild(b);
  });
  const say = el("p", { class: "jv-say", "aria-live": "polite" }, "Waiting for PostgreSQL…");
  const cols = el("div", { class: "inj-cols" });
  const mkSide = (title, cls) => {
    const d = el("div", { class: "inj-side " + cls });
    d.appendChild(el("h4", null, title));
    const code = el("pre", { class: "jv-sql" });
    const res = el("div", { class: "inj-res" });
    d.append(code, res); cols.appendChild(d);
    return { code, res };
  };
  const L = mkSide("Text pasted into the SQL", "inj-bad");
  const R = mkSide("Text sent as a parameter", "inj-good");
  box.append(form, presets, say, cols);

  // One line, as most programs build it: a -- comment then hides the rest.
  const before = "SELECT id, name FROM student WHERE name ILIKE '%";
  const after = "%' ORDER BY name;";
  function names(rows) {
    if (!rows.length) return "no students";
    const n = rows.map(r => r.name);
    return rows.length + (rows.length === 1 ? " student: " : " students: ") + (n.length > 6 ? n.slice(0, 6).join(", ") + ", …" : n.join(", "));
  }
  function line(target, mark, text) {
    const p = el("p", { class: "inj-line" });
    p.appendChild(el("span", { class: "inj-mark", "aria-hidden": "true" }, mark));
    p.appendChild(document.createTextNode(text));
    target.appendChild(p);
  }
  async function draw() {
    const t = inp.value;
    // left: what the database receives
    L.code.textContent = "";
    L.code.append(before, el("mark", null, t), after);
    R.code.textContent = "SELECT id, name FROM student WHERE name ILIKE $1 ORDER BY name;\n\n$1 = " + sqlStr("%" + t + "%");
    L.res.textContent = ""; R.res.textContent = "";
    let lSay, rSay;
    try {
      await api.exec("BEGIN");
      let results = null, err = null;
      try { results = await api.exec(before + t + after); } catch (e) { err = e; }
      if (err) {
        line(L.res, "✗", "Error: " + err.message + ".");
        lSay = "the pasted version failed with an error";
        await api.exec("ROLLBACK").catch(() => {});
        await api.exec("BEGIN");
      } else {
        const sel = results.filter(r => r.fields && r.fields.length);
        const stmts = results.length;
        const last = sel.length ? sel[sel.length - 1].rows : [];
        const takes = (await api.query("SELECT count(*)::int AS n FROM takes")).rows[0].n;
        if (stmts > 1) line(L.res, "!", `The database ran ${stmts} statements, not 1.`);
        line(L.res, last.length > 2 && !/^\w+$/.test(t) ? "✗" : "·", "Found " + names(last) + ".");
        if (takes !== 22) line(L.res, "✗", `takes now has ${takes} rows instead of 22. (Rolled back: nothing was kept.)`);
        lSay = (stmts > 1 ? `the pasted version ran ${stmts} statements` : "the pasted version found " + names(last).split(":")[0]) + (takes !== 22 ? ` and left takes with ${takes} rows` : "");
      }
      await api.exec("ROLLBACK").catch(() => {});
      await api.exec("BEGIN");
      const r = await api.param("SELECT id, name FROM student WHERE name ILIKE $1 ORDER BY name", ["%" + t + "%"]);
      const takes2 = (await api.query("SELECT count(*)::int AS n FROM takes")).rows[0].n;
      line(R.res, "✓", "Found " + names(r.rows) + ".");
      line(R.res, "✓", `One statement ran, and takes still has ${takes2} rows.`);
      rSay = "the parameter version found " + names(r.rows).split(":")[0];
      await api.exec("ROLLBACK").catch(() => {});
    } catch (e) {
      await api.exec("ROLLBACK").catch(() => {});
      say.textContent = "PostgreSQL could not run this: " + e.message + ". Press Reset database and try again.";
      return;
    }
    say.textContent = "For " + (t ? JSON.stringify(t) : "an empty search") + ": " + lSay + "; " + rSay + ".";
  }
  let running = null, again = false;
  const schedule = () => {
    if (!api) return;
    if (running) { again = true; return; }
    running = draw().finally(() => { running = null; if (again) { again = false; schedule(); } });
  };
  go.addEventListener("click", schedule);
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); schedule(); } });
  whenReady(schedule);
}

/* ------------------------------------------------- B+-tree explorer (week 10) */
/* <div data-btreeviz></div>
   A B+-tree of order 4 (at most 3 keys in a node) that the student grows one
   key at a time. Each insert, search or range search lights up the pages it
   reads, numbered in order, and says in words what happened: where the key
   went, which node split, and which key moved up. The same tree is also
   written out level by level as text, so nothing depends on the drawing. */
let btCount = 0;
const BT_MAX = 3;
const BT_SHUFFLED = [20, 5, 35, 12, 27, 41, 8, 16, 30, 3, 45, 24];
function btreeviz(box) {
  const uid = ++btCount;
  box.textContent = "";
  box.appendChild(el("h3", null, box.dataset.title || "Try it: grow a B+-tree"));
  box.appendChild(el("p", null, "Each node is one page and holds at most 3 keys. Insert keys and watch a full node split in two; search for a key and count the pages read, one per level. The leaves are linked left to right, which is how a range search runs."));
  const form = el("div", { class: "inj-form bt-form" });
  const lab = el("label", { for: `bt${uid}` }, "Key (1 to 99)");
  const inp = el("input", { id: `bt${uid}`, type: "number", min: "1", max: "99", value: "10", inputmode: "numeric" });
  lab.appendChild(inp);
  const bIns = el("button", { type: "button", class: "btn btn--run" }, "Insert");
  const bFind = el("button", { type: "button", class: "btn" }, "Search");
  form.append(lab, bIns, bFind);
  const presets = el("div", { class: "inj-presets", role: "group", "aria-label": "Ready-made steps" });
  const mk = (label, fn) => { const b = el("button", { type: "button", class: "btn btn--small" }, label); b.addEventListener("click", fn); presets.appendChild(b); return b; };
  const say = el("p", { class: "jv-say", "aria-live": "polite" }, "");
  const stats = el("p", { class: "bt-stats" });
  const fig = el("div", { class: "bt-fig" });
  const text = el("ol", { class: "bt-text", "aria-label": "The tree, level by level" });
  const hint = el("p", { class: "swipe-hint" }, "Swipe sideways to see the whole tree, or read it in words below.");
  hint.hidden = true;
  box.append(form, presets, say, stats, fig, hint, el("p", { class: "bt-text-h" }, "The tree in words, from the root down:"), text);

  let root, timers = [];
  const leaf = keys => ({ leaf: true, keys, next: null });
  function reset() { root = leaf([]); }
  function childIndex(n, k) { let i = 0; while (i < n.keys.length && k >= n.keys[i]) i++; return i; }
  function pathTo(k) { const p = [root]; let n = root; while (!n.leaf) { n = n.kids[childIndex(n, k)]; p.push(n); } return p; }
  function height() { let h = 1, n = root; while (!n.leaf) { n = n.kids[0]; h++; } return h; }
  function leaves() { let n = root; while (!n.leaf) n = n.kids[0]; const out = []; while (n) { out.push(n); n = n.next; } return out; }
  const list = ks => ks.length ? ks.join(", ") : "empty";

  function insert(k) {
    const path = pathTo(k);
    const lf = path[path.length - 1];
    if (lf.keys.includes(k)) return { path, msg: `${k} is already in the tree. A unique index refuses a second copy, as a primary key does.` };
    lf.keys.push(k); lf.keys.sort((a, b) => a - b);
    const notes = [`${k} went into the leaf that now holds ${list(lf.keys)}.`];
    let node = lf, level = path.length - 1;
    while (node.keys.length > BT_MAX) {
      let right, up;
      if (node.leaf) {
        right = leaf(node.keys.splice(2));
        right.next = node.next; node.next = right;
        up = right.keys[0];
        notes.push(`That leaf was over 3 keys, so it split into ${list(node.keys)} and ${list(right.keys)}, and ${up} was copied up as the dividing key.`);
      } else {
        up = node.keys[2];
        right = { leaf: false, keys: node.keys.splice(3), kids: node.kids.splice(3) };
        node.keys.splice(2);
        notes.push(`Its parent was then over 3 keys too, so it split into ${list(node.keys)} and ${list(right.keys)}, and ${up} moved up.`);
      }
      if (level === 0) {
        root = { leaf: false, keys: [up], kids: [node, right] };
        notes.push(`The root split, so a new root holding ${up} was made, and the tree grew one level taller, at the top.`);
        break;
      }
      const parent = path[level - 1];
      const i = parent.kids.indexOf(node);
      parent.keys.splice(i, 0, up); parent.kids.splice(i + 1, 0, right);
      node = parent; level--;
    }
    return { path, msg: notes.join(" "), hit: k };
  }

  function draw(pathNodes, hitKeys, rangeLeaves) {
    timers.forEach(clearTimeout); timers = [];
    const CW = 34, H = 34, GAP = 14, VG = 70, PAD = 10;
    const levels = []; (function walk(n, d) { (levels[d] = levels[d] || []).push(n); if (!n.leaf) n.kids.forEach(c => walk(c, d + 1)); })(root, 0);
    const pos = new Map();
    const ls = levels[levels.length - 1];
    let x = PAD;
    ls.forEach(n => { const w = Math.max(1, n.keys.length) * CW; pos.set(n, { x, w, y: PAD + 22 + (levels.length - 1) * (H + VG) }); x += w + GAP; });
    for (let d = levels.length - 2; d >= 0; d--) levels[d].forEach(n => {
      const a = pos.get(n.kids[0]), b = pos.get(n.kids[n.kids.length - 1]);
      const w = n.keys.length * CW, mid = (a.x + b.x + b.w) / 2;
      pos.set(n, { x: mid - w / 2, w, y: PAD + 22 + d * (H + VG) });
    });
    const vw = Math.max(x - GAP + PAD, 240), vh = PAD * 2 + 22 + levels.length * H + (levels.length - 1) * VG + 8;
    const svg = sv("svg", { viewBox: `0 0 ${vw} ${vh}`, class: "bt-svg", role: "img", "aria-label": "B+-tree drawing; the same tree is written out below." });
    const defs = sv("defs");
    const m = sv("marker", { id: `bta${uid}`, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
    m.appendChild(sv("path", { d: "M0 0 L10 5 L0 10 z", class: "bt-ah" })); defs.appendChild(m); svg.appendChild(defs);
    levels.forEach(lv => lv.forEach(n => { if (!n.leaf) n.kids.forEach((c, i) => {
      const p = pos.get(n), q = pos.get(c);
      svg.appendChild(sv("line", { x1: p.x + i * CW, y1: p.y + H, x2: q.x + q.w / 2, y2: q.y, class: "bt-edge" }));
    }); }));
    ls.forEach(n => { if (n.next) { const p = pos.get(n), q = pos.get(n.next);
      svg.appendChild(sv("line", { x1: p.x + p.w, y1: p.y + H / 2, x2: q.x - 1, y2: q.y + H / 2, class: "bt-link", "marker-end": `url(#bta${uid})` })); } });
    const groups = new Map();
    levels.forEach(lv => lv.forEach(n => {
      const p = pos.get(n), g = sv("g", { class: "bt-node" + (n.leaf ? " bt-leaf" : "") });
      g.appendChild(sv("rect", { x: p.x, y: p.y, width: p.w, height: H, rx: 3 }));
      n.keys.forEach((k, i) => {
        if (i) g.appendChild(sv("line", { x1: p.x + i * CW, y1: p.y, x2: p.x + i * CW, y2: p.y + H, class: "bt-sep" }));
        g.appendChild(sv("text", { x: p.x + i * CW + CW / 2, y: p.y + H / 2 + 5, "text-anchor": "middle", class: "bt-key" + (hitKeys && hitKeys.has(k) && n.leaf ? " bt-hit" : "") }, String(k)));
      });
      if (!n.keys.length) g.appendChild(sv("text", { x: p.x + CW / 2, y: p.y + H / 2 + 5, "text-anchor": "middle", class: "bt-key" }, "–"));
      svg.appendChild(g); groups.set(n, g);
    }));
    const visit = (pathNodes || []).concat(rangeLeaves || []);
    visit.forEach((n, i) => {
      const g = groups.get(n); if (!g) return;
      const on = () => {
        g.classList.add("bt-on");
        const p = pos.get(n);
        g.appendChild(sv("circle", { cx: p.x, cy: p.y, r: 10, class: "bt-badge" }));
        g.appendChild(sv("text", { x: p.x, y: p.y + 4, "text-anchor": "middle", class: "bt-badge-t" }, String(i + 1)));
      };
      if (reduced) on(); else timers.push(setTimeout(on, Math.min(i * 350, 3500)));
    });
    fig.textContent = ""; fig.appendChild(svg);
    fig.style.setProperty("--fig-min", Math.round(vw * 0.72) + "px");
    const scrolls = vw * 0.72 > fig.clientWidth + 2;
    hint.hidden = !scrolls;
    if (scrolls) { fig.setAttribute("tabindex", "0"); fig.setAttribute("role", "region"); fig.setAttribute("aria-label", "B+-tree drawing, scrolls sideways"); }
    else { fig.removeAttribute("tabindex"); fig.removeAttribute("role"); fig.removeAttribute("aria-label"); }
    text.textContent = "";
    levels.forEach((lv, d) => {
      const name = d === 0 ? "Root" : d === levels.length - 1 ? "Leaves, linked left to right" : `Level ${d + 1}`;
      const sep = d === levels.length - 1 && d > 0 ? " → " : " | ";
      text.appendChild(el("li", null, name + ": " + lv.map(n => "[" + list(n.keys) + "]").join(sep)));
    });
    const nk = leaves().reduce((s, n) => s + n.keys.length, 0);
    stats.textContent = `${nk} key${nk === 1 ? "" : "s"} · ${height()} level${height() === 1 ? "" : "s"} · ${leaves().length} leaf page${leaves().length === 1 ? "" : "s"}. Finding any one key reads ${height()} page${height() === 1 ? "" : "s"}.`;
  }

  const val = () => { const k = Math.round(Number(inp.value)); return k >= 1 && k <= 99 ? k : null; };
  function doInsert(k) {
    if (leaves().reduce((s, n) => s + n.keys.length, 0) >= 30) { say.textContent = "The drawing holds 30 keys at most. Press Start over to begin again."; return; }
    const r = insert(k);
    draw(r.path, new Set([k]));
    say.textContent = r.msg + ` The insert read ${r.path.length} page${r.path.length === 1 ? "" : "s"} on its way down, numbered in the drawing.`;
  }
  function doSearch(k) {
    const path = pathTo(k), lf = path[path.length - 1];
    const found = lf.keys.includes(k);
    draw(path, found ? new Set([k]) : null);
    say.textContent = (found ? `Found ${k}` : `${k} is not in the tree`) + ` after reading ${path.length} page${path.length === 1 ? "" : "s"}, one per level: ` +
      path.map((n, i) => (i === path.length - 1 ? "leaf " : "") + "[" + list(n.keys) + "]").join(", then ") + ".";
  }
  function doRange(lo, hi) {
    const path = pathTo(lo); let n = path[path.length - 1];
    const more = [], got = [];
    for (;;) { n.keys.forEach(k => { if (k >= lo && k <= hi) got.push(k); }); if (!n.next || n.keys[n.keys.length - 1] >= hi || n.next.keys[0] > hi) break; n = n.next; more.push(n); }
    draw(path, new Set(got), more);
    say.textContent = `Keys from ${lo} to ${hi}: ${got.length ? got.join(", ") : "none"}. The search went down ${path.length} page${path.length === 1 ? "" : "s"} to the first leaf, then followed the links through ${more.length} more leaf page${more.length === 1 ? "" : "s"}, never going back up.`;
  }
  bIns.addEventListener("click", () => { const k = val(); if (k == null) say.textContent = "Type a whole number from 1 to 99."; else doInsert(k); });
  bFind.addEventListener("click", () => { const k = val(); if (k == null) say.textContent = "Type a whole number from 1 to 99."; else doSearch(k); });
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); bIns.click(); } });
  mk("Insert 12 keys, shuffled", () => { reset(); BT_SHUFFLED.forEach(k => insert(k)); draw(); say.textContent = "Inserted " + BT_SHUFFLED.join(", ") + ". Three levels hold 12 keys; search for one, or insert 10 to see a leaf split."; });
  mk("Insert 1 to 12 in order", () => { reset(); for (let k = 1; k <= 12; k++) insert(k); draw(); say.textContent = "Inserted 1 to 12 in order. Every split happens at the right edge, so the left leaves stay half full. PostgreSQL splits its rightmost page unevenly to avoid this, for keys that only grow."; });
  mk("Range 10 to 30", () => doRange(10, 30));
  mk("Start over", () => { reset(); draw(); say.textContent = "The tree is empty: one leaf page, which is also the root."; });
  reset(); BT_SHUFFLED.forEach(k => insert(k)); draw();
  say.textContent = "Twelve keys are already in. Insert 10 to see a leaf split, search for a key, or try a range.";
}

/* ------------------------------------------------- heap page viewer (week 10) */
/* <div data-heapviz></div>
   Draws page 0 of the student table: one slot per item number, labelled with
   the row that ctid (0, n) points to. An UPDATE, run inside a transaction that
   is rolled back afterwards, shows the new version taking a new slot while
   the old slot is left behind, which is how PostgreSQL's MVCC stores changes. */
function heapviz(box) {
  box.textContent = "";
  box.appendChild(el("h3", null, box.dataset.title || "Try it: what an UPDATE does to a page"));
  box.appendChild(el("p", null, "Page 0 of the student table, one box per item number. Each row's ctid says where it lives: (page, item). Update a row and see where the new version goes. Everything here runs inside a transaction that is rolled back, so nothing is kept."));
  const bar = el("div", { class: "inj-presets", role: "group", "aria-label": "Changes to try" });
  const say = el("p", { class: "jv-say", "aria-live": "polite" }, "Waiting for PostgreSQL…");
  const grid = el("ol", { class: "hp-grid", "aria-label": "Item slots on page 0" });
  box.append(bar, say, grid);
  const ACTIONS = [
    ["Show the page", []],
    ["Update one row", ["UPDATE student SET tot_cred = tot_cred + 3 WHERE id = '12345'"]],
    ["Update it twice", ["UPDATE student SET tot_cred = tot_cred + 3 WHERE id = '12345'", "UPDATE student SET tot_cred = tot_cred + 3 WHERE id = '12345'"]],
    ["Delete one row", ["DELETE FROM advisor WHERE s_id = '76653'", "DELETE FROM takes WHERE id = '76653'", "DELETE FROM student WHERE id = '76653'"]],
    ["Insert a row", ["INSERT INTO student VALUES ('99999', 'Rowan Ellis', 'Music', 0)"]]
  ];
  async function run(label, stmts) {
    try {
      await api.exec("BEGIN");
      const before = (await api.query("SELECT (ctid::text::point)[1]::int AS item, id, name FROM student WHERE (ctid::text::point)[0] = 0 ORDER BY 1")).rows;
      for (const s of stmts) await api.exec(s);
      const after = (await api.query("SELECT (ctid::text::point)[1]::int AS item, id, name, tot_cred FROM student WHERE (ctid::text::point)[0] = 0 ORDER BY 1")).rows;
      await api.exec("ROLLBACK");
      const max = Math.max(...before.map(r => r.item), ...after.map(r => r.item));
      const now = new Map(after.map(r => [r.item, r])), was = new Map(before.map(r => [r.item, r]));
      grid.textContent = "";
      let fresh = 0, left = 0;
      for (let i = 1; i <= max; i++) {
        const r = now.get(i), o = was.get(i);
        const li = el("li", { class: "hp-slot" + (r ? (o ? "" : " hp-new") : " hp-dead") });
        li.appendChild(el("span", { class: "hp-no" }, `(0, ${i})`));
        if (r) li.appendChild(el("span", { class: "hp-row" }, `${r.id} ${r.name}` + (o ? "" : " · new version")));
        else li.appendChild(el("span", { class: "hp-row" }, o ? `${o.id} ${o.name} · old version, no longer visible` : "a dead version, waiting for VACUUM"));
        if (r && !o) fresh++; if (!r && o) left++;
        grid.appendChild(li);
      }
      say.textContent = stmts.length === 0
        ? `Page 0 holds all ${after.length} students, in items 1 to ${max}, in the order they were inserted, not by id.`
        : `${label}: ${fresh} new slot${fresh === 1 ? "" : "s"} used at the end of the page, and ${left} row${left === 1 ? " that was" : "s that were"} visible before ${left === 1 ? "is" : "are"} now a dead version. An UPDATE writes a whole new row version and leaves the old one; VACUUM reclaims dead versions later. Rolled back, so the new versions are dead now too.`;
    } catch (e) {
      await api.exec("ROLLBACK").catch(() => {});
      say.textContent = "PostgreSQL could not run this: " + e.message + ". Press Reset database and try again.";
    }
  }
  ACTIONS.forEach(([label, stmts]) => {
    const b = el("button", { type: "button", class: "btn btn--small" }, label);
    b.addEventListener("click", () => api && run(label, stmts));
    bar.appendChild(b);
  });
  whenReady(() => run("Show the page", []));
}

/* ------------------------------------------------- join algorithms (week 11) */
/* <div data-algoviz></div>
   Four students and eight enrollments, two rows to a page, joined on
   student_no by four algorithms: nested loop, block nested loop, merge join
   and hash join. Step through, or play to the end, and count the comparisons
   and the page reads. Each step is also said in words, so nothing depends on
   the highlighting, and the playback ends within five seconds. */
let alCount = 0;
const AL_R = [[5, "Avery"], [9, "Quinn"], [3, "Kai"], [8, "Sage"]];
const AL_S = [[5, "CS-101"], [7, "MA-201"], [3, "CS-190"], [9, "PHY-101"], [5, "MU-199"], [3, "CS-315"], [8, "HIS-351"], [2, "BIO-101"]];
const AL_INFO = {
  nl: ["Nested loop", "For each student, read every takes page and compare each row.", "Real tables, big_student and big_takes: n_r × b_s + b_r = 10,000 × 736 + 76 = 7,360,076 page reads."],
  bnl: ["Block nested loop", "For each page of students, read every takes page once, and compare each takes row with every student on the page.", "Real tables, one student page at a time: b_r × b_s + b_r = 76 × 736 + 76 = 56,012 page reads. With M pages of memory, ⌈b_r / (M − 2)⌉ × b_s + b_r."],
  mj: ["Merge join", "Both inputs are sorted on student_no first. Then one pass down each, always moving the side with the smaller key.", "Real tables, once sorted: b_r + b_s = 76 + 736 = 812 page reads, plus the cost of sorting whichever input is not already in order."],
  hj: ["Hash join", "Build: put each student in a bucket by student_no mod 3. Probe: for each takes row, look only in its bucket.", "Real tables, when the smaller input's hash table fits in memory: b_r + b_s = 812 page reads, the number EXPLAIN shows. If it does not fit, both inputs are split into partitions first: about 3 × (b_r + b_s)."]
};
function algoSteps(kind) {
  const R = AL_R.map(([no, name], i) => ({ no, name, i })), S = AL_S.map(([no, c], i) => ({ no, c, i }));
  const steps = [];
  let reads = 0, cmp = 0;
  const out = [];
  const push = (o) => steps.push(Object.assign({ reads, cmp, out: out.slice() }, o));
  const page = i => Math.floor(i / 2) + 1;
  const compare = (r, s, extra) => {
    cmp++;
    const hit = r.no === s.no;
    if (hit) out.push(`${r.name} · ${s.c}`);
    push(Object.assign({ r: r.i, s: s.i, hit, say: `${hit ? "Match" : "No match"}: ${r.name} (${r.no}) and ${s.c} (${s.no}).` }, extra || {}));
  };
  if (kind === "nl") {
    R.forEach(r => {
      if (r.i % 2 === 0) reads++;
      S.forEach(s => { if (s.i % 2 === 0) reads++; compare(r, s); });
    });
  } else if (kind === "bnl") {
    for (let rp = 0; rp < 2; rp++) {
      reads++;
      for (let sp = 0; sp < 4; sp++) {
        reads++;
        for (let k = 0; k < 2; k++) { const s = S[sp * 2 + k]; for (let q = 0; q < 2; q++) compare(R[rp * 2 + q], s); }
      }
    }
  } else if (kind === "mj") {
    const rs = R.slice().sort((a, b) => a.no - b.no), ss = S.slice().sort((a, b) => a.no - b.no);
    push({ sorted: true, say: "Both inputs sorted on student_no. Students: " + rs.map(r => r.no).join(", ") + ". Takes: " + ss.map(s => s.no).join(", ") + "." });
    let i = 0, j = 0; reads = 2;
    while (i < rs.length && j < ss.length) {
      const r = rs[i], s = ss[j];
      cmp++;
      if (s.no < r.no) { push({ r: r.i, s: s.i, sorted: true, say: `${s.no} < ${r.no}: no student ${s.no}, so move down takes.` }); j++; if (j < ss.length && j % 2 === 0) reads++; }
      else if (s.no === r.no) { out.push(`${r.name} · ${s.c}`); push({ r: r.i, s: s.i, hit: true, sorted: true, say: `Match: ${r.name} (${r.no}) and ${s.c}. Move down takes; the next row may be ${r.name}'s too.` }); j++; if (j < ss.length && j % 2 === 0) reads++; }
      else { push({ r: r.i, s: s.i, sorted: true, say: `${s.no} > ${r.no}: ${r.name} has no more rows, so move down students.` }); i++; if (i < rs.length && i % 2 === 0) reads++; }
    }
    push({ sorted: true, done: true, say: i >= rs.length ? "No students left, so the merge stops without reading the rest of takes." : "No takes rows left, so the merge stops." });
  } else {
    const buckets = [[], [], []];
    R.forEach(r => {
      if (r.i % 2 === 0) reads++;
      buckets[r.no % 3].push(r);
      push({ r: r.i, build: true, buckets: buckets.map(b => b.map(x => x.name)), say: `Build: ${r.name} (${r.no}) goes in bucket ${r.no} mod 3 = ${r.no % 3}.` });
    });
    const bk = buckets.map(b => b.map(x => x.name));
    S.forEach(s => {
      if (s.i % 2 === 0) reads++;
      const b = buckets[s.no % 3];
      if (!b.length) push({ s: s.i, buckets: bk, bucket: s.no % 3, say: `Probe: ${s.c} (${s.no}) hashes to bucket ${s.no % 3}, which is empty. No comparison needed.` });
      b.forEach(r => compare(r, s, { buckets: bk, bucket: s.no % 3 }));
    });
  }
  return steps;
}
function algoviz(box) {
  const uid = ++alCount;
  box.textContent = "";
  box.appendChild(el("h3", null, box.dataset.title || "Try it: four ways to join"));
  box.appendChild(el("p", null, "Four Music students and eight enrollments, two rows to a page, joined on student_no. Pick an algorithm, then step through it or play it, and compare how many rows each one compares and how many pages it reads."));
  const pick = el("fieldset", { class: "jv-pick" });
  pick.appendChild(el("legend", null, "Algorithm"));
  Object.entries(AL_INFO).forEach(([k, v], n) => {
    const lab = el("label");
    const r = el("input", { type: "radio", name: `al${uid}`, value: k });
    if (!n) r.checked = true;
    lab.append(r, document.createTextNode(v[0]));
    pick.appendChild(lab);
  });
  const how = el("p", { class: "al-how" });
  const ctl = el("div", { class: "inj-presets", role: "group", "aria-label": "Playback" });
  const bStep = el("button", { type: "button", class: "btn btn--run" }, "Step");
  const bPlay = el("button", { type: "button", class: "btn" }, "Play to the end");
  const bReset = el("button", { type: "button", class: "btn" }, "Start over");
  ctl.append(bStep, bPlay, bReset);
  const say = el("p", { class: "jv-say", "aria-live": "polite" });
  const stats = el("p", { class: "bt-stats" });
  const cols = el("div", { class: "al-cols" });
  const colR = el("div", { class: "al-col" }), colS = el("div", { class: "al-col" }), colH = el("div", { class: "al-col al-hash" }), colO = el("div", { class: "al-col al-out" });
  cols.append(colR, colS, colH, colO);
  const real = el("p", { class: "al-real" });
  box.append(pick, how, ctl, say, stats, cols, real);

  let kind = "nl", steps = [], at = -1, timer = null;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  function table(col, title, rows, label, sorted, cur, hit) {
    col.textContent = "";
    col.appendChild(el("h4", null, title + (sorted ? ", sorted" : "")));
    const order = sorted ? rows.slice().sort((a, b) => a[0] - b[0]) : rows;
    const ol = el("ol", { class: "al-rows" });
    order.forEach((row, n) => {
      const i = rows.indexOf(row);
      if (!sorted && n % 2 === 0) ol.appendChild(el("li", { class: "al-page" }, `Page ${n / 2 + 1}`));
      const li = el("li", { class: "al-row" + (i === cur ? (hit ? " al-hit" : " al-cur") : "") }, `${row[0]} ${row[1]}` + (i === cur ? (hit ? "  ✓ match" : "  ◀ now") : ""));
      ol.appendChild(li);
    });
    col.appendChild(ol);
  }
  function render() {
    const st = at >= 0 ? steps[at] : null;
    const sorted = !!(st && st.sorted) || (kind === "mj" && at >= 0);
    table(colR, "Students", AL_R, "student", sorted, st ? st.r : null, st && st.hit);
    table(colS, "Takes", AL_S, "takes", sorted, st ? st.s : null, st && st.hit);
    colH.hidden = kind !== "hj";
    if (kind === "hj") {
      colH.textContent = "";
      colH.appendChild(el("h4", null, "Hash table in memory"));
      const ol = el("ol", { class: "al-rows" });
      const bk = st && st.buckets ? st.buckets : [[], [], []];
      bk.forEach((b, n) => ol.appendChild(el("li", { class: "al-row" + (st && st.bucket === n ? " al-cur" : "") }, `Bucket ${n}: ${b.length ? b.join(", ") : "empty"}`)));
      colH.appendChild(ol);
    }
    colO.textContent = "";
    colO.appendChild(el("h4", null, "Result rows"));
    const ol = el("ol", { class: "al-rows" });
    (st ? st.out : []).forEach(t => ol.appendChild(el("li", { class: "al-row" }, t)));
    if (!st || !st.out.length) ol.appendChild(el("li", { class: "al-row al-none" }, "none yet"));
    colO.appendChild(ol);
    const last = steps[steps.length - 1];
    stats.textContent = st
      ? `Step ${at + 1} of ${steps.length} · ${st.cmp} comparison${st.cmp === 1 ? "" : "s"} · ${st.reads} page read${st.reads === 1 ? "" : "s"} · ${st.out.length} result row${st.out.length === 1 ? "" : "s"}.`
      : `${steps.length} steps. At the end: ${last.cmp} comparisons and ${last.reads} page reads, for 6 result rows.`;
    real.textContent = at === steps.length - 1 ? AL_INFO[kind][2] : "";
    bStep.disabled = at >= steps.length - 1;
  }
  function load(k) {
    stop(); kind = k; steps = algoSteps(k); at = -1;
    how.textContent = AL_INFO[k][1];
    say.textContent = `${AL_INFO[k][0]}. Press Step to begin.`;
    render();
  }
  function step() {
    if (at >= steps.length - 1) { stop(); return; }
    at++; say.textContent = steps[at].say; render();
    if (at === steps.length - 1) { stop(); say.textContent = steps[at].say + ` Done: ${steps[at].cmp} comparisons, ${steps[at].reads} page reads.`; }
  }
  bStep.addEventListener("click", () => { stop(); step(); });
  bPlay.addEventListener("click", () => {
    stop();
    if (reduced) { at = steps.length - 2; step(); return; }
    const left = steps.length - 1 - at;
    timer = setInterval(step, Math.min(400, Math.floor(4500 / Math.max(left, 1))));
  });
  bReset.addEventListener("click", () => load(kind));
  pick.addEventListener("change", e => load(e.target.value));
  load("nl");
}

/* ------------------------------------------------ join order (week 12) -- */
/* <div data-orderviz></div>
   One query joins four tables in a chain: department (only building =
   'Kirk', one row), big_student, big_takes and course. First the student
   builds a left-deep order one table at a time and sees the rows each join
   produces; then the optimizer's dynamic programming search fills in the best
   plan for every set of tables, smallest sets first. The row counts are the
   real ones from the playground's data. Nothing moves on its own. */
let ovCount = 0;
const OV_T = { D: ["department", 1, "building = 'Kirk', 1 of its 7 rows"], S: ["big_student", 10000, "10,000 rows"], T: ["big_takes", 100000, "100,000 rows"], C: ["course", 10, "10 rows"] };
const OV_ALL = "DSTC";
const OV_SIZE = { DS: 1000, ST: 100000, TC: 100000, DST: 10000, STC: 100000, DSTC: 10000 };
const OV_ON = { DS: "dept_name", ST: "student_no", TC: "course_id" };
const ovKey = set => OV_ALL.split("").filter(c => set.includes(c)).join("");
const ovNum = n => n.toLocaleString("en-US");
function ovLink(r, set) {
  for (const c of set) { const k = ovKey(r + c); if (OV_ON[k]) return OV_ON[k]; }
  return null;
}
function ovSearch() {
  const best = {}, levels = [];
  OV_ALL.split("").forEach(c => { best[c] = { cost: 0, plan: OV_T[c][0], rows: OV_T[c][1] }; });
  levels.push(OV_ALL.split("").map(c => ({ set: c, best: best[c], tried: [] })));
  for (let k = 2; k <= 4; k++) {
    const lv = [];
    let skipped = 0;
    const subsets = [];
    (function pick(start, cur) {
      if (cur.length === k) { subsets.push(cur); return; }
      for (let i = start; i < 4; i++) pick(i + 1, cur + OV_ALL[i]);
    })(0, "");
    subsets.forEach(set => {
      if (!OV_SIZE[set]) { skipped++; return; }
      const cands = [];
      set.split("").forEach(r => {
        const rest = set.replace(r, "");
        if (!best[rest] || !ovLink(r, rest)) return;
        if (k === 2) {   // a ⋈ b and b ⋈ a cost the same: one candidate, in table order
          if (!cands.length) cands.push({ cost: OV_SIZE[set], plan: OV_T[set[0]][0] + " ⋈ " + OV_T[set[1]][0] });
          return;
        }
        cands.push({ cost: best[rest].cost + OV_SIZE[set], plan: "(" + best[rest].plan + ") ⋈ " + OV_T[r][0] });
      });
      cands.sort((a, b) => a.cost - b.cost);
      best[set] = { cost: cands[0].cost, plan: cands[0].plan, rows: OV_SIZE[set] };
      lv.push({ set, best: best[set], tried: cands.slice(1) });
    });
    lv.skipped = skipped;
    levels.push(lv);
  }
  return levels;
}
function orderviz(box) {
  const uid = ++ovCount;
  box.textContent = "";
  box.appendChild(el("h3", null, box.dataset.title || "Try it: choose a join order"));
  box.appendChild(el("p", null, "The query finds the courses taken by students in the department housed in Kirk. It joins four tables in a chain: department to big_student on dept_name, big_student to big_takes on student_no, big_takes to course on course_id. Every order gives the same 10,000 rows; what changes is how many rows the joins produce on the way."));

  // Part 1: the student picks the order.
  const h1 = el("h4", null, "1. Pick the order yourself");
  const chips = el("div", { class: "inj-presets", role: "group", "aria-label": "Tables to join, in order" });
  const btns = {};
  OV_ALL.split("").forEach(c => {
    const b = el("button", { type: "button", class: "btn" }, `${OV_T[c][0]} (${OV_T[c][2]})`);
    b.addEventListener("click", () => add(c));
    btns[c] = b; chips.appendChild(b);
  });
  const hint = el("p", { class: "al-how" });
  const steps = el("ol", { class: "ov-steps" });
  const verdict = el("p", { class: "jv-say", "aria-live": "polite" });
  const again = el("button", { type: "button", class: "btn" }, "Start over");
  box.append(h1, chips, hint, steps, verdict, again);
  let picked = "", produced = 0;
  function paint() {
    OV_ALL.split("").forEach(c => {
      const used = picked.includes(c), ok = !used && (!picked || ovLink(c, picked));
      btns[c].disabled = !ok;
    });
    if (picked.length === 4) hint.textContent = "";
    else if (!picked) hint.textContent = "Press the table to start with.";
    else {
      const can = OV_ALL.split("").filter(c => !picked.includes(c) && ovLink(c, picked)).map(c => `${OV_T[c][0]} (on ${ovLink(c, picked)})`);
      const cannot = OV_ALL.split("").filter(c => !picked.includes(c) && !ovLink(c, picked)).map(c => OV_T[c][0]);
      hint.textContent = `Next you can join ${can.join(" or ")}.` + (cannot.length ? ` Not yet ${cannot.join(" or ")}: nothing you have so far joins with it, so it would be a cross product, and the optimizer leaves those out too.` : "");
    }
  }
  function add(c) {
    if (!picked) {
      picked = c;
      steps.appendChild(el("li", null, `Start with ${OV_T[c][0]}: ${OV_T[c][2]}.`));
      verdict.textContent = `Started with ${OV_T[c][0]}.`;
    } else {
      const on = ovLink(c, picked);
      picked = ovKey(picked + c);
      const rows = OV_SIZE[picked];
      produced += rows;
      steps.appendChild(el("li", null, `Join ${OV_T[c][0]} on ${on}: ${ovNum(rows)} rows.`));
      verdict.textContent = picked.length < 4
        ? `Joined ${OV_T[c][0]}: ${ovNum(rows)} rows. Rows produced by joins so far: ${ovNum(produced)}.`
        : `Done. Your joins produced ${ovNum(produced)} rows in all. The best order produces 21,000 and the worst 210,000. ` +
          (produced === 21000 ? "That is the best order: start small, and keep every result small." : `That is ${Math.round(produced / 21000)} times the best. Try starting from the filtered department.`);
    }
    paint();
  }
  again.addEventListener("click", () => { picked = ""; produced = 0; steps.textContent = ""; verdict.textContent = "Order cleared."; paint(); });
  paint();

  // Part 2: dynamic programming.
  const h2 = el("h4", null, "2. Let the optimizer search");
  const how = el("p", null, "The optimizer does not try every order. It finds the cheapest way to join each set of tables, two at a time, then three, then four, building each set from the best plan for a smaller one. Cost here is the rows the joins produce.");
  const ctl = el("div", { class: "inj-presets", role: "group", "aria-label": "Search" });
  const bNext = el("button", { type: "button", class: "btn btn--run" }, "Next size");
  const bAll = el("button", { type: "button", class: "btn" }, "Show all");
  const bReset = el("button", { type: "button", class: "btn" }, "Start over");
  ctl.append(bNext, bAll, bReset);
  const say = el("p", { class: "jv-say", "aria-live": "polite" });
  const wrap = el("div", { class: "fig-scroll", tabindex: "0", role: "region", "aria-label": `Best plan for each set of tables, search ${uid}` });
  const tbl = el("table", { class: "tbl ov-dp" });
  tbl.appendChild(el("caption", null, "Best plan found for each set of tables"));
  const thr = el("tr");
  ["Tables", "Rows", "Best way to build it", "Rows produced by joins", "Dropped"].forEach(t => thr.appendChild(el("th", { scope: "col" }, t)));
  const thead = el("thead"); thead.appendChild(thr);
  const tbody = el("tbody");
  tbl.append(thead, tbody); wrap.appendChild(tbl);
  box.append(h2, how, ctl, say, wrap);
  const levels = ovSearch();
  let lvAt = 0;
  function showLevel(i) {
    const lv = levels[i];
    lv.forEach(({ set, best, tried }) => {
      const tr = el("tr");
      tr.appendChild(el("th", { scope: "row" }, set.split("").map(c => OV_T[c][0]).join(", ")));
      tr.appendChild(el("td", { class: "num", "data-label": "Rows" }, ovNum(best.rows)));
      tr.appendChild(el("td", { "data-label": "Best way" }, best.plan));
      tr.appendChild(el("td", { class: "num", "data-label": "Rows produced by joins" }, ovNum(best.cost)));
      tr.appendChild(el("td", { "data-label": "Dropped" }, tried.length ? tried.map(t => `${t.plan}: ${ovNum(t.cost)}`).join("; ") : "none"));
      tbody.appendChild(tr);
    });
    const n = i + 1;
    if (n === 1) say.textContent = "Size 1: each table on its own. No joins yet, so nothing produced.";
    else {
      const parts = lv.map(({ set, best, tried }) => `${set.split("").map(c => OV_T[c][0]).join(" + ")}: best ${ovNum(best.cost)}` + (tried.length ? `, dropping ${tried.map(t => ovNum(t.cost)).join(" and ")}` : ""));
      say.textContent = `Size ${n}: ${parts.join(". ")}.` + (lv.skipped ? ` Skipped ${lv.skipped} set${lv.skipped === 1 ? "" : "s"} that would need a cross product.` : "") +
        (n === 4 ? " The answer: department ⋈ big_student, then big_takes, then course, 21,000 rows. It looked at 10 sets instead of listing all 24 orders; for 10 tables, about a thousand sets instead of 3.6 million orders." : "");
    }
    bNext.disabled = bAll.disabled = n === 4;
  }
  bNext.addEventListener("click", () => { if (lvAt < 4) showLevel(lvAt++); });
  bAll.addEventListener("click", () => { while (lvAt < 4) showLevel(lvAt++); });
  bReset.addEventListener("click", () => { tbody.textContent = ""; lvAt = 0; bNext.disabled = bAll.disabled = false; say.textContent = "Search cleared. Press Next size."; });
  say.textContent = "Press Next size to start with single tables.";
}

/* ------------------------------------------------- E-R to tables (week 6) */
/* <div data-erviz></div>
   One relationship, advisor, between student and instructor. The student picks
   how many advisors a student may have, how many students an instructor may
   advise, and whether every student must have an advisor. The page draws the
   E-R diagram in the book's notation, writes the tables that diagram maps to,
   and runs three test changes against them inside a rolled-back transaction,
   so each rule is shown being enforced (or not) by PostgreSQL itself.
   The tables are temporary and shadow the real ones only inside that
   transaction. */
let erCount = 0;
function erviz(box) {
  const uid = ++erCount;
  box.textContent = "";
  box.appendChild(el("h3", null, box.dataset.title || "Try it: from an E‑R relationship to tables"));
  box.appendChild(el("p", null, "Choose the rules for advisor. The page draws the diagram, writes the tables it maps to, and tries three changes against those tables inside a transaction that is rolled back. The tables start with three pairs from our database: Priya Raman advises Riley Adams, Avery Chen advises Morgan Lee, and Lena Fischer advises Casey Brooks."));
  const pick = el("div", { class: "tvl-pick" });
  const mk = (labTxt, opts, id) => {
    const l = el("label", { for: id }, labTxt);
    const s2 = el("select", { id });
    opts.forEach(([v, t]) => s2.appendChild(el("option", { value: v }, t)));
    l.appendChild(s2); pick.appendChild(l); return s2;
  };
  const sSel = mk("A student has", [["one", "at most one advisor"], ["many", "any number of advisors"]], `er${uid}s`);
  const iSel = mk("An instructor advises", [["many", "any number of students"], ["one", "at most one student"]], `er${uid}i`);
  const pSel = mk("Every student must have an advisor", [["partial", "no (partial)"], ["total", "yes (total)"]], `er${uid}p`);
  const fig = el("figure", { class: "er-fig" });
  const cap = el("figcaption");
  const code = el("pre", { class: "jv-sql" });
  const say = el("p", { class: "jv-say", "aria-live": "polite" }, "Waiting for PostgreSQL…");
  const out = el("div", { class: "er-tests" });
  box.append(pick, fig, code, say, out);

  function diagram(s1, i1, total) {
    const lim = (lo, one) => `${lo}..${one ? "1" : "*"}`;
    const svg = sv("svg", { viewBox: "0 22 424 104", role: "img", "aria-labelledby": `er${uid}t er${uid}d`, class: "er-svg" });
    const sentence = `Student ${total ? "takes part totally (double line)" : "takes part partially (single line)"}, limits ${lim(total ? 1 : 0, s1)}: ` +
      `each student has ${total ? (s1 ? "exactly one advisor" : "one or more advisors") : (s1 ? "at most one advisor" : "any number of advisors")}. ` +
      `Instructor takes part partially, limits ${lim(0, i1)}: each instructor advises ${i1 ? "at most one student" : "any number of students"}.` +
      (s1 ? " The line to instructor ends in an arrow, meaning one." : "") + (i1 ? " The line to student ends in an arrow, meaning one." : "");
    svg.append(sv("title", { id: `er${uid}t` }, "E-R diagram of advisor"), sv("desc", { id: `er${uid}d` }, sentence));
    const defs = sv("defs");
    const mkr = sv("marker", { id: `er${uid}m`, markerWidth: 10, markerHeight: 10, refX: 9, refY: 5, orient: "auto" });
    mkr.append(sv("path", { d: "M0,0 L10,5 L0,10 z", class: "er-arrow" }));
    defs.append(mkr); svg.append(defs);
    const ent = (x, name, key, other) => {
      const g = sv("g");
      g.append(sv("rect", { x, y: 30, width: 112, height: 90, class: "er-ent" }));
      g.append(sv("rect", { x, y: 30, width: 112, height: 32, class: "er-ent-h" }));
      g.append(sv("text", { x: x + 12, y: 52, class: "er-t er-tb" }, name));
      const k = sv("text", { x: x + 12, y: 84, class: "er-t er-key" }, key); g.append(k);
      g.append(sv("text", { x: x + 12, y: 108, class: "er-t" }, other));
      return g;
    };
    svg.append(ent(4, "student", "ID", "name"), ent(308, "instructor", "ID", "name"));
    svg.append(sv("polygon", { points: "212,40 258,75 212,110 166,75", class: "er-rel" }));
    svg.append(sv("text", { x: 212, y: 81, class: "er-t", "text-anchor": "middle" }, "advisor"));
    // student side line: double when total; arrow at the student end when an instructor has one student
    if (total) {
      svg.append(sv("path", { d: "M116 71 H171", class: "er-line" }), sv("path", { d: "M116 79 H171", class: "er-line" }));
      if (i1) svg.append(sv("path", { d: "M168 75 H118", class: "er-line er-none", "marker-end": `url(#er${uid}m)` }));
    } else {
      svg.append(sv("path", i1 ? { d: "M166 75 H118", class: "er-line", "marker-end": `url(#er${uid}m)` } : { d: "M116 75 H166", class: "er-line" }));
    }
    svg.append(sv("path", s1 ? { d: "M258 75 H306", class: "er-line", "marker-end": `url(#er${uid}m)` } : { d: "M258 75 H308", class: "er-line" }));
    svg.append(sv("text", { x: 141, y: 62, class: "er-t er-lim", "text-anchor": "middle" }, lim(total ? 1 : 0, s1)));
    svg.append(sv("text", { x: 283, y: 62, class: "er-t er-lim", "text-anchor": "middle" }, lim(0, i1)));
    fig.textContent = ""; fig.append(svg, cap);
    cap.textContent = sentence;
  }

  function design(s1, i1, total) {
    const fold = total && s1;   // every student has exactly one: a NOT NULL column in student
    const ddl = [], note = [];
    ddl.push("CREATE TABLE instructor (\n  id    char(5) PRIMARY KEY,\n  name  varchar(30) NOT NULL\n);");
    if (fold) {
      ddl.push(`CREATE TABLE student (\n  id       char(5) PRIMARY KEY,\n  name     varchar(30) NOT NULL,\n  advisor  char(5) NOT NULL${i1 ? " UNIQUE" : ""} REFERENCES instructor\n);`);
      note.push("Exactly one advisor per student fits in one column of student, and NOT NULL makes it required." + (i1 ? " UNIQUE stops two students sharing an advisor." : ""));
    } else {
      ddl.push("CREATE TABLE student (\n  id    char(5) PRIMARY KEY,\n  name  varchar(30) NOT NULL\n);");
      const key = s1 && i1 ? "PRIMARY KEY (s_id),\n  UNIQUE (i_id)" : s1 ? "PRIMARY KEY (s_id)" : i1 ? "PRIMARY KEY (i_id)" : "PRIMARY KEY (s_id, i_id)";
      ddl.push(`CREATE TABLE advisor (\n  s_id  char(5) REFERENCES student,\n  i_id  char(5) REFERENCES instructor,\n  ${key}\n);`);
      note.push(s1 && i1 ? "One-to-one: the key on s_id allows one row per student, and UNIQUE on i_id one per instructor."
        : s1 ? "Many-to-one: the key is s_id alone, so a student appears in at most one row."
        : i1 ? "One-to-many: the key is i_id alone, so an instructor appears in at most one row."
        : "Many-to-many: the key is both columns, so only the same pair cannot repeat.");
      if (total) note.push("Total participation cannot be declared here: no constraint can require a row in another table. A trigger or the application has to check it.");
    }
    return { fold, ddl, note };
  }

  async function draw() {
    const s1 = sSel.value === "one", i1 = iSel.value === "one", total = pSel.value === "total";
    diagram(s1, i1, total);
    const { fold, ddl, note } = design(s1, i1, total);
    code.textContent = ddl.join("\n\n");
    const temp = ddl.map(x => x.replace("CREATE TABLE", "CREATE TEMP TABLE"));
    const base = fold
      ? ["INSERT INTO instructor VALUES ('10101', 'Avery Chen'), ('45565', 'Priya Raman'), ('32343', 'Lena Fischer')",
         "INSERT INTO student VALUES ('00128', 'Riley Adams', '45565'), ('12345', 'Morgan Lee', '10101'), ('19991', 'Casey Brooks', '32343')"]
      : ["INSERT INTO instructor VALUES ('10101', 'Avery Chen'), ('45565', 'Priya Raman'), ('32343', 'Lena Fischer')",
         "INSERT INTO student VALUES ('00128', 'Riley Adams'), ('12345', 'Morgan Lee'), ('19991', 'Casey Brooks')",
         "INSERT INTO advisor VALUES ('00128', '45565'), ('12345', '10101'), ('19991', '32343')"];
    const tests = fold ? [
      ["Riley Adams gets a second advisor, Avery Chen.", ["INSERT INTO student VALUES ('00128', 'Riley Adams', '10101')"], !s1],
      ["Avery Chen also advises a new student, Dana Price.", ["INSERT INTO student VALUES ('70001', 'Dana Price', '10101')"], !i1],
      ["A new student, Sam Lee, has no advisor yet.", ["INSERT INTO student VALUES ('70002', 'Sam Lee', NULL)"], !total],
    ] : [
      ["Riley Adams gets a second advisor, Avery Chen.", ["INSERT INTO advisor VALUES ('00128', '10101')"], !s1 && !i1],
      ["Avery Chen also advises a new student, Dana Price.", ["INSERT INTO student VALUES ('70001', 'Dana Price')", "INSERT INTO advisor VALUES ('70001', '10101')"], !i1],
      ["A new student, Sam Lee, has no advisor yet.", ["INSERT INTO student VALUES ('70002', 'Sam Lee')"], !total],
    ];
    const results = [];
    try {
      for (const [, stmts] of tests) {
        let err = null;
        await api.query("BEGIN");
        try {
          for (const q of [...temp, ...base]) await api.query(q);
          try { for (const q of stmts) await api.query(q); } catch (e) { err = e; }
        } finally { await api.query("ROLLBACK").catch(() => {}); }
        results.push(err);
      }
    } catch (e) { say.textContent = "PostgreSQL could not run this: " + e.message + ". Reset the database and try again."; out.textContent = ""; return; }
    say.textContent = note.join(" ");
    out.textContent = "";
    const list = el("ul", { class: "er-list" });
    tests.forEach(([what, stmts, allowed], k) => {
      const err = results[k];
      const li = el("li", { class: err ? "er-no" : allowed ? "er-ok" : "er-gap" });
      li.append(el("span", { class: "er-mark", "aria-hidden": "true" }, err ? "✗" : allowed ? "✓" : "!"));
      const body = el("div");
      body.append(el("strong", null, what + " "));
      body.append(el("span", null, err ? "Refused: " + err.message + "." : allowed ? "Accepted, as the diagram allows."
        : "Accepted, although the diagram forbids it: the tables cannot enforce this rule on their own."));
      body.append(el("code", { class: "er-stmt" }, stmts.join(";\n") + ";"));
      li.append(body); list.append(li);
    });
    out.append(list);
  }
  let running = null, again = false;
  const schedule = () => {
    if (!api) return;
    if (running) { again = true; return; }
    running = draw().finally(() => { running = null; if (again) { again = false; schedule(); } });
  };
  [sSel, iSel, pSel].forEach(x => x.addEventListener("change", schedule));
  diagram(true, false, false);
  whenReady(schedule);
}

/* ------------------------------------------------------- schema map ------ */

function schemaMap(fig) {
  const nodes = fig.querySelectorAll(".tbl-node");
  const links = fig.querySelectorAll(".fk-link");
  const light = t => {
    fig.classList.toggle("has-focus", !!t);
    links.forEach(l => l.classList.toggle("on", !!t && (l.dataset.from === t || l.dataset.to === t)));
  };
  const peekCell = document.querySelector(fig.dataset.peek || "#peek");
  nodes.forEach(n => {
    const t = n.dataset.table;
    n.addEventListener("mouseenter", () => light(t));
    n.addEventListener("mouseleave", () => light(null));
    n.addEventListener("focus", () => light(t));
    n.addEventListener("blur", () => light(null));
    const go = () => {
      if (!peekCell) return;
      const ta = peekCell.querySelector("textarea");
      ta.value = `SELECT * FROM ${t};`;
      ta.dispatchEvent(new Event("input"));
      peekCell.dispatchEvent(new CustomEvent("pg:run"));
      announce(`Showing the rows of ${t} below the map.`);
    };
    n.addEventListener("click", go);
    n.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
}

/* --------------------------------------------------- animated figures --- */

/* On a phone a wide diagram would shrink until its labels are unreadable.
   Instead it keeps a minimum width (viewBox width × scale, set in db.css for
   narrow screens) and scrolls sideways in its own box. The box is a labelled,
   focusable region only while it actually scrolls, and a hint says so. */
export function phoneScroll(fig, scale) {
  const svg = fig.querySelector(":scope > svg");
  if (!svg) return;
  const vw = Number((svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/)[2]);
  if (!vw) return;
  const box = el("div", { class: "fig-scroll" });
  svg.replaceWith(box);
  box.appendChild(svg);
  box.style.setProperty("--fig-min", Math.round(vw * scale) + "px");
  const hint = el("p", { class: "swipe-hint" }, "Swipe sideways to see the whole diagram.");
  hint.hidden = true;
  box.insertAdjacentElement("afterend", hint);
  const name = (svg.querySelector("title")?.textContent || svg.getAttribute("aria-label") || "Diagram").split(".")[0];
  const check = () => {
    const scrolls = box.scrollWidth > box.clientWidth + 2;
    hint.hidden = !scrolls;
    if (scrolls) {
      box.setAttribute("tabindex", "0");
      box.setAttribute("role", "region");
      box.setAttribute("aria-label", name + ", scrolls sideways");
    } else {
      box.removeAttribute("tabindex"); box.removeAttribute("role"); box.removeAttribute("aria-label");
    }
  };
  check();
  if ("ResizeObserver" in window) new ResizeObserver(check).observe(box);
  else window.addEventListener("resize", check);
}

function animFigures() {
  const figs = document.querySelectorAll("figure.fig-anim");
  figs.forEach(f => phoneScroll(f, f.matches("[data-schema-map]") ? 0.8 : 0.75));
  const play = f => { f.classList.remove("is-playing"); void f.offsetWidth; f.classList.add("is-playing"); };
  figs.forEach(f => {
    const b = el("button", { type: "button", class: "btn btn--small fig-replay" }, "Replay animation");
    b.addEventListener("click", () => play(f));
    f.appendChild(b);
  });
  if (reduced || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { play(en.target); io.unobserve(en.target); } });
  }, { threshold: 0.45 });
  figs.forEach(f => io.observe(f));
}


/* <div data-fdviz></div>
   Closures, keys and normal forms for a schema the student types (or a
   preset): the closure of an attribute set step by step, every candidate
   key, which FDs break BCNF or 3NF, and a BCNF decomposition with a check of
   which dependencies it preserves. Pure JavaScript: no database needed. */
const FD_PRESETS = {
  inst_dept: { label: "inst_dept (slides 4 to 6)", attrs: "id, name, salary, dept_name, building, budget",
    fds: "id -> name, salary, dept_name\ndept_name -> building, budget", of: "dept_name" },
  textbook: { label: "R(A, B, C, G, H, I) (slide 13)", attrs: "A, B, C, G, H, I",
    fds: "A -> B\nA -> C\nC, G -> H\nC, G -> I\nB -> H", of: "A, G" },
  takes_flat: { label: "takes_flat (exercises 5 and 8)", attrs: "id, name, dept_name, course_id, title, credits, semester, year, grade",
    fds: "id -> name, dept_name\ncourse_id -> title, credits\nid, course_id, semester, year -> grade", of: "id, course_id, semester, year" },
  dept_advisor: { label: "dept_advisor (slide 21)", attrs: "s_id, i_id, dept_name",
    fds: "i_id -> dept_name\ns_id, dept_name -> i_id", of: "s_id, dept_name" },
};
let fdCount = 0;
function fdviz(box) {
  const uid = ++fdCount;
  box.textContent = "";
  box.appendChild(el("h3", null, box.dataset.title || "Try it: closures, keys and normal forms"));
  box.appendChild(el("p", null, "Pick a schema or type your own: attributes separated by commas, and one functional dependency per line, written A, B -> C. The page computes the closure step by step, finds every candidate key, checks BCNF and 3NF, and decomposes into BCNF."));
  const pick = el("div", { class: "tvl-pick fd-pick" });
  const lab = (t, id, ctl) => { const l = el("label", { for: id }, t); l.appendChild(ctl); pick.appendChild(l); return ctl; };
  const pre = lab("Schema", `fd${uid}p`, el("select", { id: `fd${uid}p` }));
  Object.keys(FD_PRESETS).forEach(k => pre.appendChild(el("option", { value: k }, FD_PRESETS[k].label)));
  pre.appendChild(el("option", { value: "own" }, "my own"));
  const attrsIn = lab("Attributes", `fd${uid}a`, el("input", { id: `fd${uid}a`, type: "text", spellcheck: "false", autocapitalize: "off" }));
  const fdsIn = lab("Functional dependencies, one per line", `fd${uid}f`, el("textarea", { id: `fd${uid}f`, rows: "4", spellcheck: "false", autocapitalize: "off" }));
  const ofIn = lab("Closure of", `fd${uid}c`, el("input", { id: `fd${uid}c`, type: "text", spellcheck: "false", autocapitalize: "off" }));
  const go = el("button", { type: "button", class: "btn btn--run" }, "Compute");
  pick.appendChild(go);
  const say = el("p", { class: "jv-say", "aria-live": "polite" });
  const out = el("div", { class: "fd-out" });
  box.append(pick, say, out);

  const load = k => { const p = FD_PRESETS[k]; if (!p) return; attrsIn.value = p.attrs; fdsIn.value = p.fds; ofIn.value = p.of; };
  pre.addEventListener("change", () => { if (pre.value !== "own") { load(pre.value); run(); } });
  [attrsIn, fdsIn, ofIn].forEach(c => c.addEventListener("input", () => { if (pre.value !== "own") pre.value = "own"; }));
  go.addEventListener("click", run);

  function list(str) { return str.split(/[,\s]+/).map(x => x.trim()).filter(Boolean); }
  function parse() {
    const attrs = [...new Set(list(attrsIn.value))];
    const errs = [], fds = [];
    fdsIn.value.split("\n").forEach((line, i) => {
      if (!line.trim()) return;
      const m = line.split(/->|→/);
      if (m.length !== 2) { errs.push(`Line ${i + 1} needs one arrow, like A, B -> C.`); return; }
      const l = list(m[0]), r = list(m[1]);
      const bad = [...l, ...r].filter(a => !attrs.includes(a));
      if (!l.length || !r.length) errs.push(`Line ${i + 1} needs attributes on both sides of the arrow.`);
      else if (bad.length) errs.push(`Line ${i + 1} uses ${bad.join(", ")}, which ${bad.length > 1 ? "are" : "is"} not in the attribute list.`);
      else fds.push({ l, r });
    });
    const of = list(ofIn.value);
    const badOf = of.filter(a => !attrs.includes(a));
    if (badOf.length) errs.push(`The closure box uses ${badOf.join(", ")}, which ${badOf.length > 1 ? "are" : "is"} not in the attribute list.`);
    if (attrs.length > 12) errs.push("Use at most 12 attributes, so the key search stays quick.");
    return { attrs, fds, of, errs };
  }
  const order = (attrs, set) => attrs.filter(a => set.has(a));
  const show = (attrs, set) => "{" + order(attrs, set).join(", ") + "}";
  function closure(fds, start) {
    const c = new Set(start), steps = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of fds) {
        if (f.l.every(a => c.has(a))) {
          const add = f.r.filter(a => !c.has(a));
          if (add.length) { add.forEach(a => c.add(a)); steps.push({ f, add }); changed = true; }
        }
      }
    }
    return { c, steps };
  }
  function subsets(arr) {   // smallest first
    const res = [];
    for (let m = 1; m < (1 << arr.length); m++) res.push(arr.filter((_, i) => m & (1 << i)));
    return res.sort((a, b) => a.length - b.length);
  }
  function keys(attrs, fds, of = attrs) {
    const ks = [];
    for (const s of subsets(of)) {
      if (ks.some(k => k.every(a => s.includes(a)))) continue;
      const c = closure(fds, s).c;
      if (of.every(a => c.has(a))) ks.push(s);
    }
    return ks;
  }
  function bcnf(attrs, fds) {
    const steps = [], done = [];
    const todo = [attrs.slice()];
    let guard = 0;
    while (todo.length && guard++ < 40) {
      const R = todo.shift();
      let viol = null;
      // Given dependencies first, the one that moves the fewest attributes out,
      // so the split stays close to the textbook's; then any other subset.
      const given = fds.filter(f => f.l.every(x => R.includes(x))).map(f => {
        const c = closure(fds, f.l).c;
        return { a: R.filter(x => f.l.includes(x)), extra: R.filter(x => c.has(x) && !f.l.includes(x)) };
      }).filter(v => v.extra.length && v.extra.length + v.a.length < R.length)
        .sort((p, q) => p.extra.length - q.extra.length);
      if (given.length) viol = given[0];
      else for (const a of subsets(R)) {
        if (a.length === R.length) continue;
        const c = closure(fds, a).c;
        const extra = R.filter(x => c.has(x) && !a.includes(x));
        if (extra.length && extra.length + a.length < R.length) { viol = { a, extra }; break; }
      }
      if (!viol) { done.push(R); continue; }
      const R1 = R.filter(x => viol.a.includes(x) || viol.extra.includes(x));
      const R2 = R.filter(x => !viol.extra.includes(x));
      steps.push({ R, viol, R1, R2 });
      todo.unshift(R2); todo.unshift(R1);
    }
    return { steps, done };
  }
  function preserved(fds, parts, f) {
    let res = new Set(f.l), changed = true;
    while (changed) {
      changed = false;
      for (const R of parts) {
        const t = closure(fds, [...res].filter(a => R.includes(a))).c;
        R.forEach(a => { if (t.has(a) && !res.has(a)) { res.add(a); changed = true; } });
      }
    }
    return f.r.every(a => res.has(a));
  }
  const code = t => el("code", null, t);
  const para = (...bits) => { const p = el("p"); bits.forEach(b => p.append(typeof b === "string" ? document.createTextNode(b) : b)); return p; };
  const fdText = f => f.l.join(", ") + " → " + f.r.join(", ");

  function run() {
    out.textContent = "";
    const { attrs, fds, of, errs } = parse();
    if (errs.length) { say.textContent = errs[0]; const u = el("ul"); errs.slice(1).forEach(e => u.appendChild(el("li", null, e))); out.appendChild(u); return; }
    // 1. closure
    out.appendChild(el("h4", null, "1. The closure of " + show(attrs, new Set(of))));
    const { c, steps } = closure(fds, of);
    const ol = el("ol", { class: "fd-steps" });
    ol.appendChild(el("li", null, "Start with " + show(attrs, new Set(of)) + "."));
    const acc = new Set(of);
    steps.forEach(st => { st.add.forEach(a => acc.add(a));
      ol.appendChild(el("li", null, `${fdText(st.f)} applies, since ${show(attrs, new Set(st.f.l))} is inside; add ${st.add.join(", ")}: ${show(attrs, acc)}.`)); });
    ol.appendChild(el("li", null, steps.length ? "No dependency adds anything more, so the closure is complete." : "No dependency applies, so the closure is the set itself."));
    out.appendChild(ol);
    const all = attrs.every(a => c.has(a));
    out.appendChild(para(show(attrs, new Set(of)) + "+ = " + show(attrs, c) + ". " + (all ? "It holds every attribute, so it is a superkey." : "It misses " + attrs.filter(a => !c.has(a)).join(", ") + ", so it is not a superkey.")));
    // 2. keys
    const ks = keys(attrs, fds);
    out.appendChild(el("h4", null, "2. Candidate keys"));
    out.appendChild(para(ks.length === 1 ? "One candidate key: " : ks.length + " candidate keys: ", ks.map(k => show(attrs, new Set(k))).join(" and ") + ".",
      " A candidate key's closure holds every attribute, and no smaller set inside it does."));
    const prime = new Set(ks.flat());
    // 3. normal forms
    out.appendChild(el("h4", null, "3. BCNF and 3NF, one dependency at a time"));
    const ul = el("ul", { class: "er-list" });
    let isB = true, is3 = true;
    fds.forEach(f => {
      const trivial = f.r.every(a => f.l.includes(a));
      const sk = attrs.every(a => closure(fds, f.l).c.has(a));
      const rhs = f.r.filter(a => !f.l.includes(a));
      const ok3 = sk || trivial || rhs.every(a => prime.has(a));
      if (!sk && !trivial) isB = false;
      if (!ok3) is3 = false;
      const cls = sk || trivial ? "er-ok" : ok3 ? "er-gap" : "er-no";
      const li = el("li", { class: cls });
      li.append(el("span", { class: "er-mark", "aria-hidden": "true" }, sk || trivial ? "✓" : ok3 ? "!" : "✗"));
      const d = el("div");
      d.append(el("strong", null, fdText(f) + ". "));
      d.append(document.createTextNode(trivial ? "Trivial, so it never breaks a normal form."
        : sk ? `${show(attrs, new Set(f.l))} is a superkey: fine for BCNF and 3NF.`
        : ok3 ? `Breaks BCNF: ${show(attrs, new Set(f.l))} is not a superkey. Allowed in 3NF, because ${rhs.join(", ")} ${rhs.length > 1 ? "are" : "is"} part of a candidate key.`
        : `Breaks BCNF and 3NF: ${show(attrs, new Set(f.l))} is not a superkey, and ${rhs.filter(a => !prime.has(a)).join(", ")} ${rhs.filter(a => !prime.has(a)).length > 1 ? "are" : "is"} in no candidate key.`));
      li.append(d); ul.append(li);
    });
    out.appendChild(ul);
    out.appendChild(para(isB ? "The schema is in BCNF." : is3 ? "The schema is in 3NF but not in BCNF." : "The schema is in neither BCNF nor 3NF."));
    // 4. decomposition
    out.appendChild(el("h4", null, "4. A BCNF decomposition"));
    const dec = bcnf(attrs, fds);
    if (!dec.steps.length) out.appendChild(para("Nothing to split: every non-trivial dependency has a superkey on its left."));
    else {
      const o2 = el("ol", { class: "fd-steps" });
      dec.steps.forEach(st => o2.appendChild(el("li", null,
        `(${st.R.join(", ")}) breaks BCNF on ${st.viol.a.join(", ")} → ${st.viol.extra.join(", ")}. Split it into (${st.R1.join(", ")}) and (${st.R2.join(", ")}).`)));
      out.appendChild(o2);
      const u2 = el("ul");
      dec.done.forEach(R => { const k = keys(attrs, fds, R)[0] || R;
        const li = el("li"); li.append(code(`(${R.join(", ")})`), document.createTextNode(", key " + show(attrs, new Set(k)))); u2.append(li); });
      out.append(para("The result, each with a key:"), u2);
      const lost = fds.filter(f => !preserved(fds, dec.done, f));
      out.appendChild(para(lost.length
        ? `Lost: ${lost.map(fdText).join("; ")}. No single table holds ${lost.length > 1 ? "these" : "it"}, so checking ${lost.length > 1 ? "them" : "it"} needs a join. The split is still lossless, since each left side is a key of its new table; keeping the rule is where 3NF can be the better choice.`
        : "Every dependency is preserved: each can be checked inside one table, without a join. The decomposition is lossless, because each left side is a key of its new table."));
    }
    say.textContent = `${show(attrs, new Set(of))}+ = ${show(attrs, c)}. ${ks.length} candidate key${ks.length === 1 ? "" : "s"}. ${isB ? "In BCNF." : is3 ? "In 3NF, not BCNF." : "Not in 3NF."}`;
  }
  load(pre.value); run();
}

/* ----------------------------------------------------------- wiring ----- */

/* Two-session replay ----------------------------------------------------- */
let txCount = 0;
function txState(st, e) {
  // st: { tx: false|level, failed, wait }
  const out = e.out || "";
  if (e.waiting) return Object.assign({}, st, { wait: true });
  const n = Object.assign({}, st, { wait: false });
  const verb = e.sql.trim().split(/[\s;]+/)[0].toUpperCase();
  if (verb === "BEGIN") { const m = e.sql.match(/ISOLATION LEVEL ([A-Z ]+?);/i); n.tx = m ? m[1].toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : "Read Committed"; n.failed = false; }
  else if (verb === "COMMIT" || verb === "ROLLBACK") { n.tx = false; n.failed = false; }
  else if (/^ERROR/m.test(out) && n.tx) n.failed = true;
  return n;
}
function txSay(st) {
  if (st.wait) return "waiting for a row lock";
  if (st.failed) return "transaction failed: it can only roll back";
  return st.tx ? `in a transaction (${st.tx})` : "no transaction open";
}
function txviz(box) {
  const uid = ++txCount;
  const src = document.getElementById(box.dataset.src || "txdata");
  if (!src) return;
  let all = JSON.parse(src.textContent);
  if (box.dataset.only) { const keep = box.dataset.only.split(","); all = keep.map(k => all.find(s => s.id === k)).filter(Boolean); }
  box.textContent = "";
  box.appendChild(el("h3", null, box.dataset.title || "Try it: two sessions at once"));
  box.appendChild(el("p", null, "Your browser's database has one session, so two transactions can't run side by side here. These scenarios were run on a real PostgreSQL server, with two psql sessions, A and B, taking turns; you replay what each session sent and what came back. Lab 8 has you run them yourself."));
  const pick = el("select", { id: `tx-pick-${uid}` });
  all.forEach((s, i) => pick.appendChild(el("option", { value: String(i) }, `${s.title} (${s.level})`)));
  const lab = el("label", { for: pick.id, class: "tx-pickl" }, "Scenario ");
  lab.appendChild(pick);
  const intro = el("p", { class: "al-how" });
  const states = el("div", { class: "tx-states" });
  const sA = el("p", { class: "tx-st tx-a" }), sB = el("p", { class: "tx-st tx-b" });
  states.append(sA, sB);
  const log = el("ol", { class: "tx-log", "aria-label": "Steps so far" });
  const ctl = el("div", { class: "inj-presets", role: "group", "aria-label": "Replay" });
  const bNext = el("button", { type: "button", class: "btn btn--run" }, "Next step");
  const bAll = el("button", { type: "button", class: "btn" }, "Show all");
  const bAgain = el("button", { type: "button", class: "btn" }, "Start over");
  ctl.append(bNext, bAll, bAgain);
  const live = el("p", { class: "visually-hidden", "aria-live": "polite" });
  const lesson = el("p", { class: "jv-say" });
  box.append(lab, intro, states, log, lesson, ctl, live);
  let sc, i, st, waitedAt;
  function paintStates() {
    sA.textContent = `Session A: ${txSay(st.A)}`;
    sB.textContent = `Session B: ${txSay(st.B)}`;
    sA.classList.toggle("tx-waiting", !!st.A.wait); sB.classList.toggle("tx-waiting", !!st.B.wait);
  }
  function reset() {
    sc = all[+pick.value]; i = 0; waitedAt = {};
    st = { A: { tx: false }, B: { tx: false } };
    intro.textContent = sc.intro; log.textContent = ""; lesson.textContent = "";
    bNext.disabled = bAll.disabled = false;
    paintStates();
  }
  function step(quiet) {
    if (i >= sc.events.length) return;
    const e = sc.events[i], n = i + 1;
    log.querySelectorAll(".tx-new").forEach(x => x.classList.remove("tx-new"));
    const li = el("li", { class: `tx-ev tx-${e.who.toLowerCase()} tx-new` });
    li.appendChild(el("span", { class: "tx-who" }, `Session ${e.who}`));
    let said;
    if (e.late) {
      li.appendChild(el("span", { class: "tx-note" }, `Its statement from step ${waitedAt[e.who]} gets the lock and finishes:`));
      said = `Step ${n}. Session ${e.who}'s statement from step ${waitedAt[e.who]} finishes`;
    } else {
      li.appendChild(el("code", { class: "tx-sql" }, e.sql));
      said = `Step ${n}. Session ${e.who} sends ${e.sql.replace(/;\s*$/, "")}`;
    }
    if (e.waiting) {
      waitedAt[e.who] = n;
      li.classList.add("tx-wait");
      li.appendChild(el("span", { class: "tx-note" }, "Waiting: another session holds a lock on this row."));
      said += ". It waits for a lock.";
    } else {
      const err = /^ERROR/m.test(e.out || "");
      const pre = el("pre", { class: "tx-out" + (err ? " tx-err" : "") }, e.out);
      li.appendChild(pre);
      said += `. Result: ${(e.out || "").replace(/-{3,}/g, "").replace(/\s+/g, " ").trim()}.`;
    }
    log.appendChild(li);
    st[e.who] = txState(st[e.who], e);
    paintStates();
    i++;
    if (i >= sc.events.length) {
      lesson.textContent = sc.lesson;
      bNext.disabled = bAll.disabled = true;
      said += " " + sc.lesson;
    }
    if (!quiet) live.textContent = said;
  }
  bNext.addEventListener("click", () => { step(false); if (bNext.disabled) bAgain.focus(); });
  bAll.addEventListener("click", () => { while (i < sc.events.length) step(true); live.textContent = `All ${sc.events.length} steps shown. ${sc.lesson}`; bAgain.focus(); });
  bAgain.addEventListener("click", () => { reset(); live.textContent = "Scenario restarted."; bNext.focus(); });
  pick.addEventListener("change", () => { reset(); live.textContent = `${sc.title}, ${sc.level}. ${sc.intro}`; });
  window.addEventListener("beforeprint", () => { while (i < sc.events.length) step(true); });
  const start = all.findIndex(s => s.id === box.dataset.start);
  pick.value = String(start < 0 ? 0 : start);
  reset();
}

/* ------------------------------------------------------------ logviz ----
   Recovery replay. The page holds a log (src/gen/log14.py writes it) in
   <script type="application/json" id="logdata">; the student picks where the
   crash came, then steps through the book's recovery algorithm: the redo
   pass forward from the last checkpoint, building the undo list, then the
   undo pass backward, writing redo-only records and <T abort>. */
let logCount = 0;
function logviz(box) {
  const uid = ++logCount;
  const src = document.getElementById(box.dataset.src || "logdata");
  if (!src) return;
  const data = JSON.parse(src.textContent);
  const R = data.records, items = Object.keys(data.init);
  box.textContent = "";
  box.appendChild(el("h3", null, box.dataset.title || "Try it: crash, then recover"));
  box.appendChild(el("p", null, "Choose where the crash comes. Everything after that record was never written, so it is gone. Then step through recovery: the redo pass goes forward from the last checkpoint, repeating history and working out which transactions never finished; the undo pass goes backward and rolls those back, writing new log records as it goes."));
  const pick = el("select", { id: `lg-pick-${uid}` });
  R.forEach(r => { if (r.lsn >= 2) pick.appendChild(el("option", { value: String(r.lsn) }, `Record ${r.lsn}: ${r.rec}`)); });
  const lab = el("label", { for: pick.id, class: "tx-pickl" }, "Crash right after ");
  lab.appendChild(pick);
  const panel = el("div", { class: "lg-panel" });
  const phase = el("p", { class: "lg-phase" });
  const undo = el("p", { class: "lg-undo" });
  const vals = el("dl", { class: "lg-vals", "aria-label": "Values of the items" });
  panel.append(phase, undo, vals);
  const log = el("ol", { class: "lg-log", "aria-label": "The log" });
  const say = el("p", { class: "jv-say" });
  const ctl = el("div", { class: "inj-presets", role: "group", "aria-label": "Recovery" });
  const bNext = el("button", { type: "button", class: "btn btn--run" }, "Next step");
  const bAll = el("button", { type: "button", class: "btn" }, "Show all");
  const bAgain = el("button", { type: "button", class: "btn" }, "Start over");
  ctl.append(bNext, bAll, bAgain);
  const live = el("p", { class: "visually-hidden", "aria-live": "polite" });
  box.append(lab, panel, log, say, ctl, live);
  let steps, k, v, ul, lis;
  const set = s => s.size ? "{" + [...s].sort().join(", ") + "}" : "empty";
  function plan(crash) {
    // Work the whole recovery out ahead; each step carries what it changes.
    const kept = R.filter(r => r.lsn <= crash);
    const cp = [...kept].reverse().find(r => r.kind === "checkpoint");
    const val = { ...data.init };
    let from = 0;
    if (cp) { kept.forEach(r => { if (r.lsn < cp.lsn && r.new !== undefined) val[r.item] = r.new; }); from = cp.lsn; }
    const undoL = new Set(cp ? cp.active : []);
    const out = [{ phase: "redo", at: cp ? cp.lsn : null, val: { ...val }, ul: new Set(undoL),
      text: cp ? `Redo pass: start at the last checkpoint, record ${cp.lsn}. Every change before it is already on disk. The undo list starts as its list: ${set(undoL)}.`
               : "Redo pass: there is no checkpoint, so start at the first record, with the undo list empty." }];
    kept.filter(r => r.lsn > from).forEach(r => {
      let t;
      if (r.kind === "start") { undoL.add(r.tx); t = `${r.tx} starts: add it to the undo list.`; }
      else if (r.kind === "update") { val[r.item] = r.new; t = `Redo: set ${r.item} to ${r.new}.`; }
      else if (r.kind === "redo-only") { val[r.item] = r.new; t = `Redo the rollback's record too: set ${r.item} to ${r.new}.`; }
      else if (r.kind === "commit" || r.kind === "abort") { undoL.delete(r.tx); t = `${r.tx} ${r.kind === "commit" ? "committed" : "finished rolling back"}: take it off the undo list.`; }
      else t = "Another checkpoint: nothing to do.";
      out.push({ phase: "redo", at: r.lsn, val: { ...val }, ul: new Set(undoL), text: t });
    });
    if (!undoL.size) {
      out.push({ phase: "done", at: null, val: { ...val }, ul: new Set(), text: "The undo list is empty: every transaction had finished. Recovery is complete, and nothing new was written." });
      return out;
    }
    out.push({ phase: "undo", at: null, val: { ...val }, ul: new Set(undoL), text: `Undo pass: go backward from record ${crash}, rolling back ${set(undoL)}.` });
    let next = crash + 1;
    for (const r of [...kept].reverse()) {
      if (!undoL.size) break;
      if (!undoL.has(r.tx)) continue;
      if (r.kind === "update") {
        val[r.item] = r.old;
        out.push({ phase: "undo", at: r.lsn, val: { ...val }, ul: new Set(undoL), add: { lsn: next++, rec: `<${r.tx}, ${r.item}, ${r.old}>` },
          text: `Undo record ${r.lsn}: set ${r.item} back to ${r.old}, and log <${r.tx}, ${r.item}, ${r.old}>.` });
      } else if (r.kind === "start") {
        undoL.delete(r.tx);
        out.push({ phase: "undo", at: r.lsn, val: { ...val }, ul: new Set(undoL), add: { lsn: next++, rec: `<${r.tx} abort>` },
          text: `Back at ${r.tx}'s start: log <${r.tx} abort> and take it off the undo list.` });
      }
    }
    out.push({ phase: "done", at: null, val: { ...val }, ul: new Set(),
      text: `Recovery is complete. Every committed change is in place, and none of the unfinished ones. The undo pass wrote ${next - crash - 1} records.` });
    return out;
  }
  function paint(quiet) {
    const s = steps[k];
    const names = { redo: "Redo pass, going forward", undo: "Undo pass, going backward", done: "Recovered" };
    phase.textContent = names[s.phase];
    undo.textContent = "Undo list: " + set(s.ul);
    vals.textContent = "";
    items.forEach(it => {
      const changed = k > 0 && steps[k - 1].val[it] !== s.val[it];
      const d = el("div", { class: changed ? "lg-chg" : "" });
      d.append(el("dt", null, it), el("dd", null, String(s.val[it])));
      vals.appendChild(d);
    });
    lis.forEach(li => li.classList.remove("lg-cur"));
    if (s.at != null && lis.has(s.at)) lis.get(s.at).classList.add("lg-cur");
    if (s.add && !lis.has(s.add.lsn)) {
      const li = el("li", { class: "lg-rec lg-new" });
      li.append(el("span", { class: "lg-n" }, String(s.add.lsn)), el("code", null, s.add.rec), el("span", { class: "lg-tag" }, "written by recovery"));
      log.appendChild(li); lis.set(s.add.lsn, li);
    }
    say.textContent = s.text;
    bNext.disabled = bAll.disabled = k >= steps.length - 1;
    if (!quiet) live.textContent = `${names[s.phase]}. ${s.text} Values: ${items.map(it => it + " " + s.val[it]).join(", ")}.`;
  }
  function reset() {
    const crash = +pick.value;
    steps = plan(crash); k = 0; lis = new Map();
    log.textContent = "";
    R.filter(r => r.lsn <= crash).forEach(r => {
      const li = el("li", { class: "lg-rec" + (r.kind === "checkpoint" ? " lg-cp" : "") });
      li.append(el("span", { class: "lg-n" }, String(r.lsn)), el("code", null, r.rec));
      log.appendChild(li); lis.set(r.lsn, li);
    });
    const lost = R.length - crash;
    log.appendChild(el("li", { class: "lg-crash" }, lost ? `Crash. The ${lost} record${lost > 1 ? "s" : ""} after this never reached the disk.` : "Crash."));
    paint(true);
  }
  bNext.addEventListener("click", () => { if (k < steps.length - 1) { k++; paint(false); } if (bNext.disabled) bAgain.focus(); });
  bAll.addEventListener("click", () => {
    while (k < steps.length - 1) { k++; paint(true); }
    const s = steps[k];
    live.textContent = `${s.text} Values: ${items.map(it => it + " " + s.val[it]).join(", ")}.`;
    bAgain.focus();
  });
  bAgain.addEventListener("click", () => { reset(); live.textContent = "Back to the moment of the crash. " + steps[0].text; bNext.focus(); });
  pick.addEventListener("change", () => { reset(); live.textContent = `Crash after record ${pick.value}. ${steps[0].text}`; });
  window.addEventListener("beforeprint", () => { while (k < steps.length - 1) { k++; paint(true); } });
  pick.value = box.dataset.crash || String(R.length);
  reset();
}

/* ---------------------------------------------------------- quorumviz ----
   Three replicas of one value. The student picks W (how many replicas must
   confirm a write) and R (how many a read asks), writes a new version, and
   reads it back in the worst case: the read asks the replicas the write
   reached last. R + W > N means the two sets overlap, so the read sees it. */
function quorumviz(box) {
  const N = 3, names = ["A", "B", "C"];
  box.textContent = "";
  box.appendChild(el("h3", null, box.dataset.title || "Try it: replicas and quorums"));
  box.appendChild(el("p", null, "Three replicas each hold a copy of Music's budget, version 1. A write is confirmed once W replicas have it; the others catch up later. A read asks R replicas and keeps the newest version it hears. Choose W and R, write, then read before the others catch up."));
  const mk = (id, lab) => {
    const s = el("select", { id });
    for (let i = 1; i <= N; i++) s.appendChild(el("option", { value: String(i) }, String(i)));
    const l = el("label", { for: id, class: "qv-l" }, lab); l.appendChild(s);
    return [l, s];
  };
  const uid = Math.random().toString(36).slice(2, 7);
  const [lw, sw] = mk(`qv-w-${uid}`, "W, replicas a write waits for ");
  const [lr, sr] = mk(`qv-r-${uid}`, "R, replicas a read asks ");
  sw.value = box.dataset.w || "1"; sr.value = box.dataset.r || "1";
  const pickers = el("div", { class: "qv-pick" }); pickers.append(lw, lr);
  const reps = el("ul", { class: "qv-reps", "aria-label": "Replicas" });
  const rule = el("p", { class: "qv-rule" });
  const say = el("p", { class: "jv-say" });
  const ctl = el("div", { class: "inj-presets", role: "group", "aria-label": "Quorum" });
  const bW = el("button", { type: "button", class: "btn btn--run" }, "Write version 2");
  const bR = el("button", { type: "button", class: "btn" }, "Read");
  const bC = el("button", { type: "button", class: "btn" }, "Let them catch up");
  const bX = el("button", { type: "button", class: "btn" }, "Start over");
  ctl.append(bW, bR, bC, bX);
  const live = el("p", { class: "visually-hidden", "aria-live": "polite" });
  box.append(pickers, rule, reps, say, ctl, live);
  let ver, asked;
  function paint() {
    const W = +sw.value, R = +sr.value;
    rule.textContent = `N = ${N}, W = ${W}, R = ${R}: R + W = ${R + W}, ${R + W > N ? "more than N, so every read overlaps every write" : "not more than N, so a read can miss the latest write"}.`;
    reps.textContent = "";
    names.forEach((n, i) => {
      const li = el("li", { class: "qv-rep" + (ver[i] === 2 ? " qv-new" : "") + (asked.includes(i) ? " qv-asked" : "") });
      li.append(el("span", { class: "qv-n" }, `Replica ${n}`), el("span", { class: "qv-v" }, `version ${ver[i]}`),
        el("span", { class: "qv-tag" }, (ver[i] === 2 ? "has the write" : "behind") + (asked.includes(i) ? " · asked by the read" : "")));
      reps.appendChild(li);
    });
    bR.disabled = !ver.some(v => v === 2);
    bC.disabled = ver.every(v => v === 2);
  }
  function reset(msg) { ver = [1, 1, 1]; asked = []; say.textContent = ""; bW.disabled = false; paint(); if (msg) live.textContent = msg; }
  bW.addEventListener("click", () => {
    const W = +sw.value;
    ver = names.map((_, i) => (i < W ? 2 : 1)); asked = [];
    bW.disabled = true;
    say.textContent = `The write reached ${names.slice(0, W).join(" and ")} and was confirmed after ${W} acknowledgement${W > 1 ? "s" : ""}. ${W < N ? names.slice(W).join(" and ") + " still hold" + (N - W === 1 ? "s" : "") + " version 1." : "Every replica has it."}`;
    paint(); live.textContent = say.textContent;
  });
  bR.addEventListener("click", () => {
    const R = +sr.value;
    asked = [...Array(N).keys()].reverse().slice(0, R);  // worst case: the replicas the write reached last
    const got = Math.max(...asked.map(i => ver[i]));
    say.textContent = `The read asked ${asked.map(i => names[i]).sort().join(" and ")}, ${R === 1 ? "the replica" : "the replicas"} the write reached last, and returned version ${got}. ` +
      (got === 2 ? "It saw the write: at least one replica it asked had it." : "Stale: none of the replicas it asked had the write yet.");
    paint(); live.textContent = say.textContent;
  });
  bC.addEventListener("click", () => {
    ver = [2, 2, 2]; asked = [];
    say.textContent = "Every replica now has version 2. Given time and no new writes, the replicas agree: eventual consistency.";
    paint(); live.textContent = say.textContent;
  });
  bX.addEventListener("click", () => reset("Back to version 1 on every replica."));
  [sw, sr].forEach(s => s.addEventListener("change", () => reset(rule.textContent)));
  reset();
  live.textContent = "";
  paint();
}

export function initViz() {
  document.querySelectorAll("[data-cell][data-steps]").forEach(cell => {
    const actions = cell.querySelector(".cell-actions");
    const b = el("button", { type: "button", class: "btn btn--check" }, "Watch it run");
    b.addEventListener("click", () => stepper(cell));
    actions.insertBefore(b, actions.children[1] || null);
  });
  document.querySelectorAll("[data-tvl]").forEach(tvl);
  document.querySelectorAll("[data-bagset]").forEach(bagset);
  document.querySelectorAll("[data-joinviz]").forEach(joinviz);
  document.querySelectorAll("[data-groupviz]").forEach(groupviz);
  document.querySelectorAll("[data-recviz]").forEach(recviz);
  document.querySelectorAll("[data-fkviz]").forEach(fkviz);
  document.querySelectorAll("[data-fdviz]").forEach(fdviz);
  document.querySelectorAll("[data-erviz]").forEach(erviz);
  document.querySelectorAll("[data-injviz]").forEach(injviz);
  document.querySelectorAll("[data-btreeviz]").forEach(btreeviz);
  document.querySelectorAll("[data-heapviz]").forEach(heapviz);
  document.querySelectorAll("[data-algoviz]").forEach(algoviz);
  document.querySelectorAll("[data-orderviz]").forEach(orderviz);
  document.querySelectorAll("[data-txviz]").forEach(txviz);
  document.querySelectorAll("[data-logviz]").forEach(logviz);
  document.querySelectorAll("[data-quorumviz]").forEach(quorumviz);
  document.querySelectorAll("[data-schema-map]").forEach(schemaMap);
  animFigures();
}
