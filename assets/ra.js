/* ==========================================================================
   CS 4600/5200 — ra.js
   Relational algebra for the playground. A cell with data-lang="ra" holds an
   algebra expression instead of SQL. This module parses it, translates it to
   one PostgreSQL query with set semantics (every operator removes duplicates,
   as in the textbook), and draws the expression tree with the number of
   tuples each operator produces.

   Notation (Unicode or plain words; both work everywhere)
   -------------------------------------------------------
     σ[cond](E)     select[cond](E)      selection
     π[a, b](E)     project[a, b](E)     projection
     ρ[S](E)        rename[S](E)         rename the relation
     ρ[S(a,b)](E)   rename[S(a,b)](E)    rename the relation and its attributes
     E ∪ F          E union F
     E ∩ F          E intersect F
     E − F          E minus F   (also -)
     E × F          E cross F
     E ⋈ F          E join F             natural join
     E ⋈[cond] F    E join[cond] F       theta join
     E ÷ F          E divide F
     T ← E          T <- E               assignment; later lines can use T
   Conditions use attribute names (qualified as rel.attr when two attributes
   share a name), constants in single quotes, = ≠ < ≤ > ≥ (or <> <= >=), and
   ∧ ∨ ¬ (or and, or, not). Lines starting with -- are comments.

   Precedence, loosest first: ∪ and −, then ∩, then × ⋈ ÷. The unary
   operators apply to the relation or parenthesised expression right after
   them. When in doubt, add parentheses.
   ========================================================================== */
import { phoneScroll } from "./viz.js";

const SYM = {
  "σ": "select", "π": "project", "ρ": "rename",
  "∪": "union", "∩": "intersect", "−": "minus", "×": "cross", "⋈": "join", "÷": "divide", "←": "assign"
};
const WORDS = {
  select: "select", sigma: "select", project: "project", pi: "project", rename: "rename", rho: "rename",
  union: "union", intersect: "intersect", minus: "minus", except: "minus", cross: "cross", times: "cross",
  join: "join", divide: "divide"
};
const UNARY = new Set(["select", "project", "rename"]);
const LEVEL = { union: 1, minus: 1, intersect: 2, cross: 3, join: 3, divide: 3 };
const SHOW = { select: "σ", project: "π", rename: "ρ", union: "∪", intersect: "∩", minus: "−", cross: "×", join: "⋈", divide: "÷" };

export class RaError extends Error {
  constructor(msg, hint) { super(msg); this.hint = hint || ""; }
}

/* ------------------------------------------------------------- tokens --- */

function tokenize(src) {
  const out = [];
  let i = 0, depth = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "-" && src[i + 1] === "-") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "\n" || c === ";") { out.push({ t: "nl" }); i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "(") { out.push({ t: "(" }); depth++; i++; continue; }
    if (c === ")") { out.push({ t: ")" }); depth--; i++; continue; }
    if (c === ",") { out.push({ t: "," }); i++; continue; }
    if (c === "[") {
      // A parameter: read to the matching ], skipping quoted text.
      let j = i + 1, lvl = 1, q = null;
      for (; j < n; j++) {
        const d = src[j];
        if (q) { if (d === q) q = null; continue; }
        if (d === "'" || d === '"') { q = d; continue; }
        if (d === "[") lvl++;
        if (d === "]" && --lvl === 0) break;
      }
      if (j >= n) throw new RaError("A [ has no matching ].", "Every σ, π, ρ and theta join takes its condition or list in square brackets.");
      out.push({ t: "param", v: src.slice(i + 1, j).trim() });
      i = j + 1; continue;
    }
    if (c === "<" && src[i + 1] === "-") { out.push({ t: "op", v: "assign" }); i += 2; continue; }
    if (c === ":" && src[i + 1] === "=") { out.push({ t: "op", v: "assign" }); i += 2; continue; }
    if (SYM[c]) { out.push({ t: "op", v: SYM[c] }); i++; continue; }
    if (c === "-") { out.push({ t: "op", v: "minus" }); i++; continue; }
    if (c === "✕" || c === "⨯") { out.push({ t: "op", v: "cross" }); i++; continue; }
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (m) {
      const w = m[0].toLowerCase();
      if (WORDS[w]) out.push({ t: "op", v: WORDS[w] });
      else out.push({ t: "id", v: m[0] });
      i += m[0].length; continue;
    }
    if (c === "'") throw new RaError("A quoted constant can only appear inside a condition, in [ ].");
    throw new RaError("The symbol " + c + " is not part of the algebra here.",
      "Use σ π ρ ∪ ∩ − × ⋈ ÷ ← (or select, project, rename, union, intersect, minus, cross, join, divide, <-).");
  }
  if (depth !== 0) throw new RaError(depth > 0 ? "A ( has no matching )." : "A ) has no matching (.");
  return out;
}

/* ------------------------------------------------------------- parser --- */

function parse(src) {
  const tk = tokenize(src);
  let p = 0;
  const peek = (k = 0) => tk[p + k];
  const isOp = (t, v) => t && t.t === "op" && (!v || t.v === v);
  const skipNl = () => { while (peek() && peek().t === "nl") p++; };

  function primary() {
    const t = peek();
    if (!t) throw new RaError("The expression ends too early.", "Something is missing after the last operator.");
    if (t.t === "(") {
      p++; skipNl();
      const e = expr(0);
      skipNl();
      if (!peek() || peek().t !== ")") throw new RaError("A ( has no matching ).");
      p++;
      return e;
    }
    if (isOp(t) && UNARY.has(t.v)) {
      p++;
      const prm = peek();
      if (!prm || prm.t !== "param") throw new RaError(SHOW[t.v] + " needs its " + (t.v === "select" ? "condition" : t.v === "project" ? "attribute list" : "new name") + " in square brackets, for example " +
        (t.v === "select" ? "σ[salary > 90000](instructor)." : t.v === "project" ? "π[name, salary](instructor)." : "ρ[i](instructor)."));
      p++;
      if (!prm.v) throw new RaError("The brackets after " + SHOW[t.v] + " are empty.");
      const child = primary();
      return { op: t.v, param: prm.v, kids: [child] };
    }
    if (t.t === "id") { p++; return { op: "rel", name: t.v, kids: [] }; }
    if (isOp(t)) throw new RaError(SHOW[t.v] + " needs a relation on its left.", "Binary operators go between two relations, as in student ⋈ takes.");
    throw new RaError("Unexpected " + (t.t === "param" ? "[" + t.v + "]" : t.t === "nl" ? "line break" : t.t) + ".");
  }

  function expr(minLevel) {
    let left = primary();
    for (;;) {
      let k = 0;
      while (peek(k) && peek(k).t === "nl") k++;
      const t = peek(k);
      if (!isOp(t) || !LEVEL[t.v] || LEVEL[t.v] <= minLevel) break;
      p += k + 1;
      let param = null;
      if (t.v === "join" && peek() && peek().t === "param") { param = peek().v; p++; }
      skipNl();
      const right = expr(LEVEL[t.v]);
      left = { op: t.v, param, kids: [left, right] };
    }
    return left;
  }

  const stmts = [];
  skipNl();
  while (p < tk.length) {
    let target = null, attrs = null;
    if (peek().t === "id" && isOp(peek(1), "assign")) { target = peek().v; p += 2; }
    else if (peek().t === "id" && peek(1) && peek(1).t === "(") {
      // T(a, b) ← E
      let k = 2; const names = [];
      while (peek(k) && peek(k).t === "id") { names.push(peek(k).v); k++; if (peek(k) && peek(k).t === ",") k++; else break; }
      if (peek(k) && peek(k).t === ")" && isOp(peek(k + 1), "assign")) { target = peek().v; attrs = names; p += k + 2; }
    }
    skipNl();
    const e = expr(0);
    stmts.push({ target, attrs, e });
    const t = peek();
    if (t && t.t !== "nl") {
      throw new RaError("Unexpected " + (t.t === "op" ? SHOW[t.v] || t.v : t.t === "param" ? "[" + t.v + "]" : t.v || t.t) + " after a complete expression.",
        t.t === "(" ? "A unary operator applies only to what follows it directly. Did you mean to put parentheses around a larger part?" : "Check for a missing operator or parenthesis.");
    }
    skipNl();
  }
  if (!stmts.length) throw new RaError("The editor is empty. Type an expression first.");
  if (stmts[stmts.length - 1].target) throw new RaError("The last line is an assignment, so there is nothing to show.", "End with the expression you want to see, for example just the name you assigned.");
  return stmts;
}

/* -------------------------------------------------------- conditions --- */

const KEYWORDS = new Set(["and", "or", "not", "is", "null", "true", "false", "like", "ilike", "in", "between",
  "unknown", "distinct", "from", "case", "when", "then", "else", "end", "similar", "to", "escape", "any", "all"]);

function display(schema, i) {
  const a = schema[i];
  return schema.filter(b => b.name.toLowerCase() === a.name.toLowerCase()).length > 1 && a.rel ? a.rel + "." + a.name : a.name;
}

function attrList(schema) { return schema.map((_, i) => display(schema, i)).join(", "); }

function resolve(ref, schema, where) {
  const parts = ref.split(".");
  let hits;
  if (parts.length === 2) {
    hits = schema.map((a, i) => i).filter(i => (schema[i].rel || "").toLowerCase() === parts[0].toLowerCase() &&
      schema[i].name.toLowerCase() === parts[1].toLowerCase());
  } else {
    hits = schema.map((a, i) => i).filter(i => schema[i].name.toLowerCase() === ref.toLowerCase());
  }
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new RaError("There is no attribute " + ref + " in " + where + ".", "The attributes there are: " + attrList(schema) + ".");
  throw new RaError(ref + " is ambiguous in " + where + ": " + hits.map(i => schema[i].rel + "." + schema[i].name).join(" or ") + ".",
    "Qualify it with the relation's name, or rename one side with ρ first.");
}

function rewriteCond(cond, schema, alias, where) {
  let out = "", i = 0;
  const s = cond.replace(/∧/g, " AND ").replace(/∨/g, " OR ").replace(/¬/g, " NOT ")
    .replace(/≠/g, "<>").replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/!=/g, "<>");
  while (i < s.length) {
    const c = s[i];
    if (c === "'") {
      let j = i + 1;
      for (; j < s.length; j++) { if (s[j] === "'") { if (s[j + 1] === "'") j++; else break; } }
      if (j >= s.length) throw new RaError("A quoted constant in " + where + " has no closing quote.");
      out += s.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '"') {
      const j = s.indexOf('"', i + 1);
      if (j < 0) throw new RaError("A double quote in " + where + " has no closing quote.", "Constants go in single quotes: 'Physics'.");
      out += alias + ".c" + (resolve(s.slice(i + 1, j), schema, where) + 1); i = j + 1; continue;
    }
    const m = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?/.exec(s.slice(i));
    if (m) {
      const w = m[0];
      const after = s.slice(i + w.length).trimStart();
      if (!w.includes(".") && (KEYWORDS.has(w.toLowerCase()) || after[0] === "(")) out += w;
      else out += alias + ".c" + (resolve(w, schema, where) + 1);
      i += w.length; continue;
    }
    if (c === "=" && s[i + 1] === "=") { out += "="; i += 2; continue; }
    if (c === ";") throw new RaError("A ; inside " + where + " is not allowed.");
    out += c; i++;
  }
  return out;
}

function splitTop(s) {
  const out = []; let cur = "", lvl = 0, q = null;
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === "(") lvl++;
    if (c === ")") lvl--;
    if (c === "," && !lvl) { out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ------------------------------------------------------------ compile --- */

const ident = s => '"' + String(s).replace(/"/g, '""') + '"';
const colsAs = (alias, from, count, start = 0) =>
  Array.from({ length: count }, (_, i) => alias + ".c" + (from + i + 1) + " AS c" + (start + i + 1));

function label(node) {
  if (node.op === "rel") return node.name;
  if (node.op === "join") return node.param ? "⋈ " + node.param : "⋈";
  if (UNARY.has(node.op)) return SHOW[node.op] + " " + node.param;
  return SHOW[node.op];
}

function compile(node, env) {
  const A = () => "t" + (++env.n);
  const where = SHOW[node.op] ? "the condition of " + label(node).slice(0, 40) : node.name;
  let r;
  switch (node.op) {
    case "rel": {
      const key = node.name.toLowerCase();
      if (env.vars.has(key)) {
        const v = env.vars.get(key);
        r = { sql: v.sql, schema: v.schema.map((a, i) => ({ rel: v.name, name: v.attrs ? v.attrs[i] : a.name })) };
        break;
      }
      const cols = env.tables.get(key);
      if (!cols) {
        const names = Array.from(env.tables.keys()).concat(Array.from(env.vars.keys()));
        throw new RaError("There is no relation called " + node.name + ".", "The relations are: " + names.join(", ") + ".");
      }
      r = {
        sql: "SELECT DISTINCT " + cols.map((c, i) => ident(c) + " AS c" + (i + 1)).join(", ") + " FROM " + ident(key),
        schema: cols.map(c => ({ rel: key, name: c }))
      };
      break;
    }
    case "select": {
      const c = compile(node.kids[0], env), a = A();
      const cond = rewriteCond(node.param, c.schema, a, "σ[" + node.param + "]");
      r = { sql: "SELECT * FROM (" + c.sql + ") AS " + a + " WHERE " + cond, schema: c.schema };
      break;
    }
    case "project": {
      const c = compile(node.kids[0], env), a = A();
      const items = splitTop(node.param);
      const idx = items.map(it => resolve(it, c.schema, "π[" + node.param + "]"));
      if (new Set(idx).size !== idx.length) throw new RaError("π[" + node.param + "] names the same attribute twice.");
      r = {
        sql: "SELECT DISTINCT " + idx.map((j, i) => a + ".c" + (j + 1) + " AS c" + (i + 1)).join(", ") + " FROM (" + c.sql + ") AS " + a,
        schema: idx.map(j => c.schema[j])
      };
      break;
    }
    case "rename": {
      const c = compile(node.kids[0], env);
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s*$/.exec(node.param);
      if (!m) throw new RaError("ρ[" + node.param + "] is not a name I can use.", "Write ρ[s](student), or ρ[s(sid, sname, dept, cred)](student) to rename the attributes too.");
      let names = c.schema.map(a => a.name);
      if (m[2] !== undefined) {
        names = m[2].split(",").map(x => x.trim());
        if (names.length !== c.schema.length || names.some(x => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(x)))
          throw new RaError("ρ[" + node.param + "] gives " + names.length + " attribute names, but the relation has " + c.schema.length + ": " + attrList(c.schema) + ".");
      }
      r = { sql: c.sql, schema: names.map(x => ({ rel: m[1], name: x })) };
      break;
    }
    case "union": case "intersect": case "minus": {
      const l = compile(node.kids[0], env), rr = compile(node.kids[1], env);
      if (l.schema.length !== rr.schema.length)
        throw new RaError(SHOW[node.op] + " needs both sides to have the same number of attributes, but the left has " + l.schema.length +
          " (" + attrList(l.schema) + ") and the right has " + rr.schema.length + " (" + attrList(rr.schema) + ").",
          "Project both sides onto matching attributes first.");
      const kw = node.op === "union" ? "UNION" : node.op === "intersect" ? "INTERSECT" : "EXCEPT";
      r = { sql: "(" + l.sql + ") " + kw + " (" + rr.sql + ")", schema: l.schema };
      break;
    }
    case "cross": case "join": {
      const l = compile(node.kids[0], env), rr = compile(node.kids[1], env);
      const la = A(), ra = A();
      if (node.op === "join" && !node.param) {
        // natural join on every attribute name the two sides share
        const common = [];
        l.schema.forEach((a, i) => {
          const j = rr.schema.map((b, k) => k).filter(k => rr.schema[k].name.toLowerCase() === a.name.toLowerCase());
          if (j.length > 1 || l.schema.filter(b => b.name.toLowerCase() === a.name.toLowerCase()).length > 1 && j.length)
            throw new RaError("⋈ cannot tell which " + a.name + " to match: a side has two attributes with that name.", "Rename with ρ or project first.");
          if (j.length) common.push([i, j[0]]);
        });
        const rest = rr.schema.map((b, k) => k).filter(k => !common.some(p => p[1] === k));
        const sel = colsAs(la, 0, l.schema.length).concat(rest.map((k, n) => ra + ".c" + (k + 1) + " AS c" + (l.schema.length + n + 1)));
        const on = common.length ? common.map(([i, j]) => la + ".c" + (i + 1) + " = " + ra + ".c" + (j + 1)).join(" AND ") : "TRUE";
        r = {
          sql: "SELECT " + sel.join(", ") + " FROM (" + l.sql + ") AS " + la + " JOIN (" + rr.sql + ") AS " + ra + " ON " + on,
          schema: l.schema.concat(rest.map(k => rr.schema[k])),
          note: common.length ? "" : "These two relations share no attribute name, so ⋈ here is the same as ×."
        };
        break;
      }
      const schema = l.schema.concat(rr.schema);
      const seen = new Set();
      for (const a of schema) {
        const k = (a.rel || "").toLowerCase() + "." + a.name.toLowerCase();
        if (seen.has(k)) throw new RaError("Both sides have an attribute " + a.rel + "." + a.name + ", so the result could not tell them apart.",
          "Rename one side first, for example ρ[i2](instructor).");
        seen.add(k);
      }
      const sel = colsAs(la, 0, l.schema.length).concat(colsAs(ra, 0, rr.schema.length, l.schema.length));
      let sql = "SELECT " + sel.join(", ") + " FROM (" + l.sql + ") AS " + la + " CROSS JOIN (" + rr.sql + ") AS " + ra;
      if (node.op === "join") {
        const a = A();
        sql = "SELECT * FROM (" + sql + ") AS " + a + " WHERE " + rewriteCond(node.param, schema, a, "⋈[" + node.param + "]");
      }
      r = { sql, schema };
      break;
    }
    case "divide": {
      const l = compile(node.kids[0], env), rr = compile(node.kids[1], env);
      const B = rr.schema.map(b => {
        const hits = l.schema.map((a, i) => i).filter(i => l.schema[i].name.toLowerCase() === b.name.toLowerCase());
        if (hits.length !== 1) throw new RaError("÷ needs every attribute of the right side in the left side. The left side has no single " + b.name + ".",
          "In R ÷ S, S's attributes must be a subset of R's.");
        return hits[0];
      });
      const Aidx = l.schema.map((a, i) => i).filter(i => !B.includes(i));
      if (!Aidx.length) throw new RaError("÷ would leave no attributes: the right side has all of the left side's.");
      const x = A(), y = A(), z = A();
      const sql = "SELECT DISTINCT " + Aidx.map((i, n) => x + ".c" + (i + 1) + " AS c" + (n + 1)).join(", ") +
        " FROM (" + l.sql + ") AS " + x + " WHERE NOT EXISTS (SELECT 1 FROM (" + rr.sql + ") AS " + y +
        " WHERE NOT EXISTS (SELECT 1 FROM (" + l.sql + ") AS " + z + " WHERE " +
        Aidx.map(i => z + ".c" + (i + 1) + " = " + x + ".c" + (i + 1)).concat(B.map((i, k) => z + ".c" + (i + 1) + " = " + y + ".c" + (k + 1))).join(" AND ") + "))";
      r = { sql, schema: Aidx.map(i => l.schema[i]) };
      break;
    }
    default:
      throw new RaError("Unknown operator " + node.op + ".");
  }
  node.sql = r.sql;
  node.schema = r.schema;
  if (r.note) env.notes.push(r.note);
  return r;
}

/* Translate an algebra program. queryFn(sql) returns a PGlite result. */
export async function raCompile(src, queryFn) {
  const stmts = parse(src);
  const info = await queryFn(
    "SELECT table_name AS t, column_name AS c FROM information_schema.columns " +
    "WHERE table_schema = 'public' ORDER BY table_name, ordinal_position");
  const tables = new Map();
  info.rows.forEach(r => { if (!tables.has(r.t)) tables.set(r.t, []); tables.get(r.t).push(r.c); });
  const env = { tables, vars: new Map(), n: 0, notes: [] };
  let last = null;
  for (const st of stmts) {
    const c = compile(st.e, env);
    if (st.target) {
      if (st.attrs && st.attrs.length !== c.schema.length)
        throw new RaError(st.target + "(" + st.attrs.join(", ") + ") names " + st.attrs.length + " attributes, but the expression has " + c.schema.length + ".");
      env.vars.set(st.target.toLowerCase(), { name: st.target, attrs: st.attrs, sql: c.sql, schema: c.schema });
    } else last = { e: st.e, c };
  }
  const { e, c } = last;
  const cols = c.schema.map((_, i) => "r.c" + (i + 1) + " AS " + ident(display(c.schema, i)));
  const sql = "SELECT " + cols.join(", ") + " FROM (" + c.sql + ") AS r ORDER BY " + c.schema.map((_, i) => i + 1).join(", ");
  return { sql, tree: e, notes: env.notes, steps: stmts.length };
}

/* ------------------------------------------------------- tree drawing --- */

const NS = "http://www.w3.org/2000/svg";
function sv(tag, attrs, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}
function h(tag, attrs, text) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
  if (text != null) e.textContent = text;
  return e;
}

function short(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

/* Count each operator's output, then draw the tree: leaves at the bottom,
   the answer at the top, each node with its tuple count. */
export async function raTree(out, ra, queryFn) {
  const nodes = [];
  (function walk(nd, depth) { nd.depth = depth; nodes.push(nd); nd.kids.forEach(k => walk(k, depth + 1)); })(ra.tree, 0);
  if (nodes.length < 2) return;
  for (const nd of nodes) {
    try { nd.count = (await queryFn("SELECT count(*)::int AS n FROM (" + nd.sql + ") AS q")).rows[0].n; }
    catch (e) { nd.count = null; }
  }
  // layout: leaves left to right, parents centred over their children
  const GAP = 18, ROW = 92, PAD = 8;
  let cursor = 0;
  (function place(nd) {
    nd.w = Math.min(260, Math.max(64, 18 + 8.6 * short(label(nd), 30).length));
    if (!nd.kids.length) { nd.x = cursor + nd.w / 2; cursor += nd.w + GAP; return; }
    nd.kids.forEach(place);
    nd.x = nd.kids.reduce((s, k) => s + k.x, 0) / nd.kids.length;
  })(ra.tree);
  // shift so the widest box on any side is inside the picture
  const minX = Math.min(...nodes.map(n => n.x - n.w / 2)), maxX = Math.max(...nodes.map(n => n.x + n.w / 2));
  nodes.forEach(n => { n.x += PAD - minX; });
  const maxDepth = Math.max(...nodes.map(n => n.depth));
  const width = Math.max(Math.ceil(maxX - minX) + 2 * PAD, 240), height = (maxDepth + 1) * ROW + 10;
  const svg = sv("svg", { viewBox: "0 0 " + width + " " + height, role: "img", class: "ra-tree", style: "--dg-k:1" });
  const say = nodes.map(nd => label(nd) + (nd.count == null ? "" : ": " + nd.count + (nd.count === 1 ? " tuple" : " tuples"))).join("; ");
  svg.setAttribute("aria-label", "Expression tree, from the answer down to the base relations. " + say + ".");
  const y = nd => (maxDepth - nd.depth) * ROW + 8;
  const time = nd => (0.25 + (maxDepth - nd.depth) * Math.min(0.6, 3.2 / (maxDepth + 1))).toFixed(2);
  nodes.forEach(nd => nd.kids.forEach(k => {
    svg.appendChild(sv("path", { class: "dg-line-q v-in", style: "--d:" + time(nd) + "s", d: "M" + k.x + " " + y(k) + " L" + nd.x + " " + (y(nd) + 44) }));
  }));
  nodes.forEach(nd => {
    const g = sv("g", { class: "v-in", style: "--d:" + time(nd) + "s" });
    const isRel = nd.op === "rel";
    g.appendChild(sv("rect", { class: isRel ? "dg-box-m" : nd.depth === 0 ? "dg-box-a" : "dg-box-t", x: nd.x - nd.w / 2, y: y(nd), width: nd.w, height: 44, rx: 6 }));
    g.appendChild(sv("text", { class: "dg-sm" + (isRel ? "" : " dg-mono"), x: nd.x, y: y(nd) + 19, "text-anchor": "middle" }, short(label(nd), 30)));
    if (nd.count != null) g.appendChild(sv("text", { class: "dg-xs dg-teal", x: nd.x, y: y(nd) + 37, "text-anchor": "middle" }, nd.count + (nd.count === 1 ? " tuple" : " tuples")));
    g.appendChild(sv("title", {}, label(nd)));
    svg.appendChild(g);
  });
  const fig = h("figure", { class: "fig-anim ra-fig is-playing" });
  fig.appendChild(svg);
  fig.appendChild(h("figcaption", null, "The expression tree, read from the bottom up. Each box is one operator and the number of tuples it produces."));
  out.appendChild(fig);
  phoneScroll(fig, 0.85);
}

export function raSqlDetails(out, ra) {
  const det = h("details", { class: "ra-sql" });
  det.appendChild(h("summary", null, "Show the SQL this became"));
  det.appendChild(h("p", null, "PostgreSQL ran this translation. Each operator is a subquery, every column is renamed c1, c2, … and SELECT DISTINCT keeps the results sets."));
  det.appendChild(h("pre", null, ra.sql.replace(/ (FROM|WHERE|JOIN|CROSS JOIN|UNION|INTERSECT|EXCEPT|ORDER BY) /g, "\n$1 ")));
  out.appendChild(det);
}

/* The symbol bar above each algebra editor. */
const KEYS = [
  ["σ[]()", "σ", "Selection: σ[condition](relation)"], ["π[]()", "π", "Projection: π[attributes](relation)"],
  ["ρ[]()", "ρ", "Rename: ρ[new name](relation)"], [" ∪ ", "∪", "Union"], [" ∩ ", "∩", "Intersection"],
  [" − ", "−", "Difference"], [" × ", "×", "Cartesian product"], [" ⋈ ", "⋈", "Natural join"],
  [" ⋈[] ", "⋈θ", "Theta join ⋈θ: ⋈[condition]"], [" ÷ ", "÷", "Division"], [" ← ", "←", "Assignment"],
  [" ∧ ", "∧", "And"], [" ∨ ", "∨", "Or"], ["¬", "¬", "Not"], [" ≠ ", "≠", "Not equal"], [" ≤ ", "≤", "Less than or equal"], [" ≥ ", "≥", "Greater than or equal"]
];

export function initRa() {
  document.querySelectorAll('[data-cell][data-lang="ra"]').forEach(cell => {
    const ta = cell.querySelector("textarea");
    if (!ta || cell.querySelector(".ra-keys")) return;
    const bar = h("div", { class: "ra-keys", role: "toolbar", "aria-label": "Insert an algebra symbol" });
    KEYS.forEach(([ins, face, name]) => {
      const nm = name.includes(face) ? name : name + " " + face;
      const b = h("button", { type: "button", class: "ra-key", "aria-label": nm, title: nm }, face);
      b.addEventListener("click", () => {
        const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
        ta.setRangeText(ins, s, e, "end");
        const br = ins.indexOf("[");
        if (br >= 0) { const at = s + br + 1; ta.setSelectionRange(at, at); }
        ta.focus();
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      });
      bar.appendChild(b);
    });
    ta.insertAdjacentElement("beforebegin", bar);
  });
}
