/* ==========================================================================
   CS 4600/5200 — playground.js
   Runs the SQL on a playground page in PostgreSQL itself, compiled to
   WebAssembly (PGlite) and running inside the student's browser. Nothing is
   installed and nothing is sent to a server: each page gets its own private
   database, loaded from the page's seed script.

   Page contract
   -------------
   <script type="text/plain" id="seed-sql">  ...CREATE / INSERT...  </script>
   <div class="cell" data-cell>             a runnable example
     <textarea>SQL</textarea>
   </div>
   <div class="cell cell--ex" data-cell data-ex="e1"
        data-ordered="false">               an exercise with a Check button
     <textarea></textarea>
     <script type="text/plain" class="solution">SELECT ...</script>
   </div>

   Transactions
   ------------
   A box runs as one unit (one implicit transaction), as PostgreSQL does for
   a multi-statement string. If a statement inside BEGIN fails, the box ends
   the aborted transaction with ROLLBACK and says so.

   Accessibility
   -------------
   - The editor is a plain <textarea>: screen readers, zoom, high contrast
     and the browser's own spellcheck-off all work. Tab leaves the editor as
     usual; Ctrl+Enter (Cmd+Enter on a Mac) runs it.
   - Results are real tables with a caption and column headers.
   - Every outcome is announced in words through a polite live region and
     carries a text mark (✓, ✗, !) so colour is never the only cue.
   ========================================================================== */

import { addResultTools, initViz, vizReady } from "./viz.js";
import { raCompile, raTree, raSqlDetails, initRa, RaError } from "./ra.js";

const PGLITE_URL = "https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.14/dist/index.js";
const MAX_ROWS = 200;
const STORE_KEY = "cs5200-playground:" + location.pathname;

let db = null;
let ready = false;
let busy = false;

const statusEl = document.getElementById("pg-status");
const statusText = statusEl ? statusEl.querySelector(".txt") : null;
const progressEl = document.getElementById("pg-progress");
const resetDbBtn = document.getElementById("pg-reset-db");
const seedSql = (document.getElementById("seed-sql") || {}).textContent || "";

/* ------------------------------------------------------------- helpers -- */

function el(tag, attrs, text) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if (text != null) e.textContent = text;
  return e;
}

function setStatus(state, text) {
  if (!statusEl) return;
  statusEl.dataset.state = state;
  statusText.textContent = text;
}

function fmt(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().replace("T", " ").replace(/\.000Z$/, "").replace(/ 00:00:00$/, "");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/* json and jsonb values, written the way PostgreSQL writes them, so that a
   JSON string keeps its quotes and -> and ->> look different. */
const JSON_TYPES = new Set([114, 3802]);
function pgJson(v) {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "[" + v.map(pgJson).join(", ") + "]";
  if (typeof v === "object") return "{" + Object.keys(v).map(k => JSON.stringify(k) + ": " + pgJson(v[k])).join(", ") + "}";
  return JSON.stringify(v);
}

/* What an error code usually means, in course words. */
const WHY = {
  "23505": "A primary key or UNIQUE constraint already has this value. Keys mean no two rows may agree on them.",
  "23503": "A foreign key would point at a row that does not exist (or a row other rows still point at would disappear).",
  "23502": "A NOT NULL column was left empty.",
  "23514": "A CHECK constraint rejected the value.",
  "22P02": "A value has the wrong type, for example text where a number is expected.",
  "42P01": "That table does not exist. Check the spelling against the schema at the top of the page.",
  "42703": "That column does not exist. Check the spelling against the schema at the top of the page.",
  "42601": "PostgreSQL could not parse the statement. Look just before the word it names: a missing comma or quote is the usual cause.",
  "42883": "No function or operator matches these types.",
  "25P02": "An earlier statement in this transaction failed, so PostgreSQL ignores everything until the transaction ends. Run ROLLBACK; to end it.",
  "42501": "The current role does not have this privilege. The owner can GRANT it; RESET ROLE; switches back to the owner.",
  "42P07": "That name is already taken by a table, view or index. DROP it first, or choose another name. Reset database, at the top of the page, restores the sample data.",
  "42710": "An object with that name already exists. Use CREATE OR REPLACE, or DROP it first.",
  "2BP01": "Other objects, such as a view or a foreign key, depend on this one. Drop them first, or add CASCADE to drop them too.",
  "44000": "The new row would not satisfy the view's WHERE condition, and the view was created WITH CHECK OPTION.",
  "P0001": "A trigger or function raised this error on purpose; its message says why.",
  "2F005": "A trigger function ended without RETURN. Row triggers must RETURN NEW (or OLD, or NULL).",
  "42804": "Two values that must have the same type do not. In ∪, ∩ and −, the attributes in the same position on both sides need compatible types."
};

function messageBox(kind, mark, lines) {
  const box = el("div", { class: "out-msg out-msg--" + kind });
  box.appendChild(el("span", { class: "ico", "aria-hidden": "true" }, mark));
  const body = el("div");
  lines.forEach((l, i) => body.appendChild(el("p", i ? { class: "why" } : null, l)));
  box.appendChild(body);
  return box;
}

function renderTable(result, label) {
  const frag = document.createDocumentFragment();
  const n = result.rows.length;
  const shown = Math.min(n, MAX_ROWS);
  const wrap = el("div", { class: "out-scroll", tabindex: "0", role: "region", "aria-label": label + " result" });
  const t = el("table", { class: "out-tbl" });
  t.appendChild(el("caption", null,
    n === 1 ? "1 row" : n + " rows" + (shown < n ? " (first " + shown + " shown)" : "")));
  const thead = el("thead");
  const hr = el("tr");
  result.fields.forEach(f => hr.appendChild(el("th", { scope: "col" }, f.name)));
  thead.appendChild(hr);
  t.appendChild(thead);
  const tb = el("tbody");
  for (let i = 0; i < shown; i++) {
    const tr = el("tr");
    const row = result.rows[i];
    result.fields.forEach(f => {
      const raw = row[f.name];
      const v = fmt(raw);
      if (v === null) tr.appendChild(el("td", { class: "null" }, "NULL"));
      else if (JSON_TYPES.has(f.dataTypeID)) tr.appendChild(el("td", { class: "json" }, pgJson(raw)));
      else tr.appendChild(el("td", v.includes("\n") ? { class: "multi" } : null, v));
    });
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  wrap.appendChild(t);
  frag.appendChild(wrap);
  const names = result.fields.map(f => f.name);
  const twice = names.filter((x, i) => names.indexOf(x) !== i);
  if (twice.length) frag.appendChild(messageBox("no", "!", [
    `Two columns are both named "${twice[0]}", so this table shows the last one's values under both names.`,
    "Give each column its own name with AS, for example count(*) AS reviews."]));
  return frag;
}

function verbOf(sql) {
  const m = sql.replace(/--.*$/gm, "").trim().match(/^[A-Za-z]+/);
  return m ? m[0].toUpperCase() : "";
}

/* Split only to label each statement's outcome; PostgreSQL does the real work. */
function statements(sql) {
  const out = [];
  let cur = "", q = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === "$") {           // a dollar-quoted body, as in CREATE FUNCTION ... AS $$ ... $$
      const tag = sql.slice(i).match(/^\$[A-Za-z_]*\$/);
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        const stop = end < 0 ? sql.length : end + tag[0].length;
        cur += sql.slice(i, stop); i = stop - 1; continue;
      }
    }
    if (c === "-" && sql[i + 1] === "-") { const j = sql.indexOf("\n", i); i = j < 0 ? sql.length : j; cur += "\n"; continue; }
    if (c === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ------------------------------------------------------------- running -- */

async function runCell(cell) {
  const ta = cell.querySelector("textarea");
  const out = cell.querySelector(".cell-out");
  const label = cell.dataset.label || "Query";
  let sql = ta.value;
  out.textContent = "";
  if (!ready) { out.appendChild(messageBox("no", "!", ["The database is still loading. Try again in a moment."])); return; }
  if (!sql.trim()) { out.appendChild(messageBox("no", "!", ["The editor is empty. Type a query first."])); return; }

  busy = true; setButtons(true);
  let ra = null;
  try {
    if (cell.dataset.lang === "ra") { ra = await raCompile(sql, q => db.query(q)); sql = ra.sql; }
    const stmts = statements(sql);
    const results = await db.exec(sql);
    let tables = 0;
    // PGlite's exec() reports affectedRows as a running total across the
    // statements of one call, so each statement's own count is the difference.
    let before = 0;
    results.forEach((r, i) => {
      const total = r.affectedRows || 0;
      const n = Math.max(0, total - before);
      before = total;
      const verb = verbOf(stmts[i] || "");
      if (r.fields && r.fields.length) {
        if (results.length > 1) out.appendChild(el("p", { class: "out-meta" }, "Statement " + (i + 1) + ": " + verb));
        out.appendChild(renderTable(r, label));
        addResultTools(out, r, cell);
        tables++;
      } else {
        const what = verb === "INSERT" ? "inserted" : verb === "UPDATE" ? "updated" :
                     verb === "DELETE" ? "deleted" : null;
        out.appendChild(messageBox("ok", "✓",
          [(results.length > 1 ? "Statement " + (i + 1) + ": " : "") +
           (what ? verb + " succeeded: " + n + (n === 1 ? " row " : " rows ") + what + "." : (verb || "Statement") + " succeeded.")]));
      }
    });
    if (ra) {
      ra.notes.forEach(n => out.appendChild(messageBox("no", "!", [n])));
      await raTree(out, ra, q => db.query(q));
      raSqlDetails(out, ra);
    }
    const last = results[results.length - 1];
    announce(label + ": " + (last && last.fields && last.fields.length
      ? last.rows.length + (last.rows.length === 1 ? " row." : " rows.")
      : "statement succeeded."));
  } catch (e) {
    const lines = errorLines(e);
    // An error inside BEGIN leaves the transaction aborted, and every later box
    // would fail with 25P02. End it here and say so.
    let aborted = false;
    try { await db.query("SELECT 1"); } catch (e2) { aborted = e2.code === "25P02"; }
    if (aborted) {
      await db.exec("ROLLBACK").catch(() => {});
      lines.push("PostgreSQL rolled back the open transaction, so none of its changes were kept.");
    } else if (statements(sql).length > 1 && !/\b(BEGIN|START\s+TRANSACTION|COMMIT)\b/i.test(sql)) {
      lines.push("This box runs as one unit, so any changes made by the statements before the error were undone too.");
    }
    out.appendChild(messageBox("error", "✗", lines));
    announce(label + ": error. " + e.message);
  } finally {
    busy = false; setButtons(false);
  }
}

function errorLines(e) {
  if (e instanceof RaError) return [e.message].concat(e.hint ? [e.hint] : []);
  return ["ERROR: " + e.message].concat(WHY[e.code] ? [WHY[e.code]] : []);
}

/* An exercise is right when its last result has the same columns (by
   position, not name) and the same rows as the hidden solution. Rows are
   compared as a multiset unless data-ordered="true". With data-kind="design"
   the last result is a table_info() listing, and the messages talk about
   the table's columns instead of a query's rows. Both queries run in a
   transaction that is rolled back, so checking never changes the data. */
async function checkCell(cell) {
  const ta = cell.querySelector("textarea");
  const out = cell.querySelector(".cell-out");
  const solEl = cell.querySelector(".solution");
  const sol = solEl.textContent;
  const ordered = cell.dataset.ordered === "true";
  const label = cell.dataset.label || "Exercise";
  out.textContent = "";
  if (!ready) { out.appendChild(messageBox("no", "!", ["The database is still loading. Try again in a moment."])); return; }
  if (!ta.value.trim()) { out.appendChild(messageBox("no", "!", ["Write a query first, then check it."])); return; }

  busy = true; setButtons(true);
  let mine, want;
  try {
    await db.exec("BEGIN");
    try {
      const mineSql = cell.dataset.lang === "ra" ? (await raCompile(ta.value, q => db.query(q))).sql : ta.value;
      const r = await db.exec(mineSql);
      mine = r.filter(x => x.fields && x.fields.length).pop();
    } catch (e) {
      out.appendChild(messageBox("error", "✗", errorLines(e)));
      announce(label + ": error. " + e.message);
      return;
    } finally {
      await db.exec("ROLLBACK").catch(() => {});
    }
    await db.exec("BEGIN");
    try {
      const solSql = solEl.dataset.lang === "ra" ? (await raCompile(sol, q => db.query(q))).sql : sol;
      want = (await db.exec(solSql)).filter(x => x.fields && x.fields.length).pop();
    } catch (e) {
      out.appendChild(messageBox("no", "!", ["This exercise's answer key did not run, so your answer can't be checked here. Please tell your instructor."]));
      return;
    }
    finally { await db.exec("ROLLBACK").catch(() => {}); }
  } finally {
    busy = false; setButtons(false);
  }

  if (!mine) {
    out.appendChild(messageBox("no", "✗", ["Not yet. Your statement ran but returned no rows to compare. The exercise asks for a SELECT."]));
    announce(label + ": not yet. No result to compare.");
    return;
  }
  const isRa = cell.dataset.lang === "ra";
  const design = cell.dataset.kind === "design";
  const key = (res, row) => res.fields.map(f => fmt(row[f.name])).join("␟");
  let verdict = null;
  if (mine.fields.length !== want.fields.length) {
    verdict = "Your result has " + mine.fields.length + " column" + (mine.fields.length === 1 ? "" : "s") +
      "; the answer has " + want.fields.length + (isRa ? ". Check the attributes in your π." : ". Check the SELECT list.");
  } else if (design && mine.rows.length === 0) {
    verdict = "table_info found no table by that name. Create it above the SELECT line, with the name the prompt gives.";
  } else if (design && mine.rows.length !== want.rows.length) {
    verdict = "Your table has " + mine.rows.length + " column" + (mine.rows.length === 1 ? "" : "s") +
      " and the design has " + want.rows.length + ". Check the column list in the prompt.";
  } else if (mine.rows.length !== want.rows.length) {
    verdict = "The columns line up, but you return " + mine.rows.length + " row" + (mine.rows.length === 1 ? "" : "s") +
      " and the answer has " + want.rows.length + (isRa ? ". Check your conditions and joins." : ". Check the WHERE clause" +
      (mine.rows.length > want.rows.length ? ", or whether you need DISTINCT." : "."));
  } else {
    const a = mine.rows.map(r => key(mine, r));
    const b = want.rows.map(r => key(want, r));
    if (!ordered) { a.sort(); b.sort(); }
    const same = a.every((v, i) => v === b[i]);
    if (!same && design) {
      // A design exercise ends with table_info(): name the columns whose
      // nulls or keys differ, so the student knows where to look.
      const wantSet = new Set(b);
      const name = (res, r) => fmt(r[res.fields[0].name]);
      const wantNames = new Set(want.rows.map(r => name(want, r)));
      const odd = mine.rows.map(r => name(mine, r)).filter(n => !wantNames.has(n));
      const off = mine.rows.filter(r => !wantSet.has(key(mine, r))).map(r => name(mine, r));
      verdict = odd.length
        ? "The design names its columns " + want.rows.map(r => name(want, r)).join(", ") + ". Rename " + odd.join(", ") + " to match the prompt."
        : "Your table has the right columns, but " + (off.length === 1 ? "this one differs" : "these differ") +
          " from the design asked for: " + off.join(", ") + ". Compare " + (off.length === 1 ? "its" : "their") + " nulls and keys with the prompt.";
    } else if (!same) verdict = ordered
      ? "Same number of rows, but the values or their order differ. Check ORDER BY."
      : "Same number of rows and columns, but some values differ. Check the columns' order and the " + (isRa ? "conditions." : "WHERE clause.");
  }

  out.appendChild(renderTable(mine, label));
  if (verdict) {
    out.insertBefore(messageBox("no", "✗", ["Not yet. " + verdict]), out.firstChild);
    announce(label + ": not yet. " + verdict);
  } else {
    out.insertBefore(messageBox("ok", "✓", ["Correct. Your result matches the answer (" +
      want.rows.length + (want.rows.length === 1 ? " row" : " rows") + ")."]), out.firstChild);
    announce(label + ": correct.");
    markSolved(cell.dataset.ex);
  }
}

/* ------------------------------------------------------------- progress -- */

function loadSolved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch (e) { return []; }
}
function saveSolved(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) { /* private mode */ }
}
function markSolved(id) {
  if (!id) return;
  const s = loadSolved();
  if (s.indexOf(id) < 0) { s.push(id); saveSolved(s); }
  paintProgress();
}
function paintProgress() {
  const exs = Array.prototype.slice.call(document.querySelectorAll("[data-ex]"));
  const s = loadSolved();
  exs.forEach(c => {
    const b = c.querySelector(".solved-badge");
    if (b) b.textContent = s.indexOf(c.dataset.ex) >= 0 ? "✓ Solved" : "";
  });
  if (progressEl) {
    const done = exs.filter(c => s.indexOf(c.dataset.ex) >= 0).length;
    progressEl.innerHTML = "";
    progressEl.appendChild(document.createTextNode("Exercises solved: "));
    progressEl.appendChild(el("strong", null, done + " of " + exs.length));
  }
}

/* ------------------------------------------------------------ wiring ---- */

const live = el("p", { class: "visually-hidden", role: "status", "aria-live": "polite", "aria-atomic": "true" });
document.body.appendChild(live);
function announce(t) { live.textContent = ""; setTimeout(() => { live.textContent = t; }, 30); }

function setButtons(disabled) {
  document.querySelectorAll("[data-cell] .btn--run, [data-cell] .btn--check, #pg-reset-db")
    .forEach(b => { b.disabled = disabled || !ready; });
}

function fitTextarea(ta) {
  const lines = ta.value.split("\n").length;
  ta.style.height = "";
  ta.rows = Math.max(3, Math.min(lines + 1, 18));
  // On a narrow screen long lines wrap, so grow to fit what is really there
  // (up to most of the screen) instead of scrolling inside a small box.
  if (ta.scrollHeight > ta.clientHeight + 1) {
    ta.style.height = Math.min(ta.scrollHeight + 4, Math.round(window.innerHeight * 0.7)) + "px";
  }
}

document.querySelectorAll("[data-cell]").forEach((cell, i) => {
  const ta = cell.querySelector("textarea");
  const original = ta.value;
  fitTextarea(ta);
  ta.setAttribute("spellcheck", "false");
  ta.setAttribute("autocapitalize", "off");
  ta.setAttribute("autocomplete", "off");

  const actions = el("div", { class: "cell-actions" });
  const run = el("button", { type: "button", class: "btn btn--run" }, "Run");
  run.addEventListener("click", () => runCell(cell));
  actions.appendChild(run);

  if (cell.dataset.ex) {
    const check = el("button", { type: "button", class: "btn btn--check" }, "Check answer");
    check.addEventListener("click", () => checkCell(cell));
    actions.appendChild(check);
  }
  const reset = el("button", { type: "button", class: "btn" }, cell.dataset.ex ? (original.trim() ? "Start over" : "Clear") : "Restore example");
  reset.addEventListener("click", () => {
    ta.value = original; fitTextarea(ta);
    cell.querySelector(".cell-out").textContent = "";
    ta.focus();
  });
  actions.appendChild(reset);
  actions.appendChild(el("span", { class: "kbd-hint" }, "Ctrl+Enter runs"));

  const out = el("div", { class: "cell-out" });
  ta.insertAdjacentElement("afterend", actions);
  actions.insertAdjacentElement("afterend", out);

  ta.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!busy) (cell.dataset.ex && e.shiftKey ? checkCell : runCell)(cell);
    }
  });
  ta.addEventListener("input", () => fitTextarea(ta));
  cell.addEventListener("pg:run", () => { if (!busy) runCell(cell); });
});

// Refit the editors when a phone turns or a window is resized.
let refit = 0;
window.addEventListener("resize", () => {
  clearTimeout(refit);
  refit = setTimeout(() => document.querySelectorAll("[data-cell] textarea").forEach(fitTextarea), 150);
});

initViz();
initRa();

if (resetDbBtn) {
  resetDbBtn.addEventListener("click", async () => {
    if (!ready || busy) return;
    busy = true; setButtons(true);
    setStatus("loading", "Restoring the sample data…");
    try {
      // Leave any transaction or SET ROLE a cell left open, so the seed runs as the owner.
      await db.exec("ROLLBACK").catch(() => {});
      await db.exec("RESET ROLE").catch(() => {});
      await db.exec(seedSql);
      setStatus("ready", "Ready. The sample data is back to its starting state.");
      announce("Database reset to its starting state.");
    } catch (e) {
      setStatus("error", "Reset failed: " + e.message);
    } finally { busy = false; setButtons(false); }
  });
}

paintProgress();
setButtons(true);

/* ------------------------------------------------------------- start ---- */

(async function start() {
  setStatus("loading", "Loading PostgreSQL in your browser (about 3 MB, first visit only)…");
  try {
    const mod = await import(PGLITE_URL);
    // By default PGlite fetches its WebAssembly and data files from the CDN.
    // A page can serve its own copies instead (for a campus mirror, or a
    // host that blocks the CDN) with <html data-pglite-assets="folder/">.
    const base = document.documentElement.dataset.pgliteAssets;
    let opts = {};
    if (base) {
      const get = name => fetch(base + name).then(r => {
        if (!r.ok) throw new Error(name + " returned " + r.status);
        return r;
      });
      const [w, i, d] = await Promise.all([get("pglite.wasm"), get("initdb.wasm"), get("pglite.data")]);
      opts = {
        pgliteWasmModule: await WebAssembly.compile(await w.arrayBuffer()),
        initdbWasmModule: await WebAssembly.compile(await i.arrayBuffer()),
        fsBundle: await d.blob()
      };
    }
    db = new mod.PGlite(opts);
    await db.waitReady;
    await db.exec(seedSql);
    const v = (await db.query("SHOW server_version")).rows[0].server_version;
    ready = true;
    vizReady(q => db.query(q), q => db.exec(q), (q, p) => db.query(q, p));
    setStatus("ready", "Ready: PostgreSQL " + v.split(" ")[0] + " is running in this page. Your changes stay in this tab.");
    announce("PostgreSQL is ready.");
  } catch (e) {
    setStatus("error", "The in-browser database could not start (" + (e && e.message ? e.message : e) +
      "). Check your internet connection and reload, or run these queries in your own PostgreSQL from Lab 0.");
  } finally {
    setButtons(false);
  }
})();
