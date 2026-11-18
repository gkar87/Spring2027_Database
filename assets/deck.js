/* ==========================================================================
   CS 4600/5200 — deck.js (from the CS 5700 toolkit)
   Slide navigation for every lecture deck.

   What it guarantees
   ------------------
   - Nothing depends on a mouse. Arrow keys, Page Up/Down, Space, Home, End.
   - The current slide is announced to screen readers through a polite
     live region, so a keyboard or screen-reader user always knows where
     they are ("Slide 4 of 22: A* Search").
   - Speaker notes stay out of the reading order until you ask for them.
   - O (or the Slides button) opens an overview of every slide as a grid of
     thumbnails; Enter or a click jumps there, Escape or O closes it.
   - The 1280×720 canvas is scaled to fit the window without changing
     the exported size (print/PDF is fixed at that size).
   ========================================================================== */

(function () {
  "use strict";

  var deck = document.querySelector(".deck");
  if (!deck) return;

  var slides = Array.prototype.slice.call(deck.querySelectorAll(".slide"));
  // A copy of the deck without speaker notes shows no Notes button.
  var hasNotes = slides.some(function (s) { return !!s.querySelector(".notes"); });
  if (!slides.length) return;

  var stage = document.querySelector(".deck-stage");
  var notesDrawer = null;
  var current = 0;
  var notesOpen = false;

  /* ---------------------------------------------------------------- chrome */

  // Footer on every slide: course identity on the left, page number right.
  slides.forEach(function (slide, i) {
    if (slide.querySelector(".slide-foot")) return;
    var foot = document.createElement("footer");
    foot.className = "slide-foot";

    var left = document.createElement("span");
    left.textContent = slide.dataset.foot || "CS 4600/5200 · Database Theory and Applications";

    var right = document.createElement("span");
    right.className = "slide-num";
    right.innerHTML = (i + 1) + ' <span aria-hidden="true">/</span> ' + slides.length;

    foot.appendChild(left);
    foot.appendChild(right);
    slide.appendChild(foot);
  });

  // Progress bar + live region + navigation buttons.
  var progressWrap = document.createElement("div");
  progressWrap.className = "ui ui-progress";
  progressWrap.setAttribute("role", "presentation");
  var progressBar = document.createElement("div");
  progressWrap.appendChild(progressBar);

  var live = document.createElement("p");
  live.className = "visually-hidden";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");

  var nav = document.createElement("div");
  nav.className = "ui ui-nav";

  var prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.innerHTML = '<span aria-hidden="true">←</span> Previous';
  prevBtn.setAttribute("aria-label", "Previous slide");

  var notesBtn = document.createElement("button");
  notesBtn.type = "button";
  notesBtn.textContent = "Notes";
  notesBtn.setAttribute("aria-expanded", "false");
  notesBtn.setAttribute("aria-controls", "speaker-notes");

  var ovBtn = document.createElement("button");
  ovBtn.type = "button";
  ovBtn.className = "ui-ov-btn";
  ovBtn.innerHTML = '<span class="ui-ov-icon" aria-hidden="true"></span><span class="ui-ov-text">Slides</span>';
  ovBtn.setAttribute("aria-label", "All slides (overview)");
  ovBtn.setAttribute("aria-haspopup", "dialog");

  var nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.innerHTML = 'Next <span aria-hidden="true">→</span>';
  nextBtn.setAttribute("aria-label", "Next slide");

  nav.appendChild(prevBtn);
  nav.appendChild(ovBtn);
  if (hasNotes) nav.appendChild(notesBtn);
  nav.appendChild(nextBtn);

  var home = document.createElement("a");
  home.className = "ui ui-home";
  home.href = "../../index.html";
  home.innerHTML = '<span aria-hidden="true">←</span> <span class="ui-home-long">Course </span>home';
  home.setAttribute("aria-label", "Course home");

  // On a phone held upright the 16:9 slide is small; suggest turning it.
  var rotate = document.createElement("p");
  rotate.className = "ui ui-rotate";
  rotate.textContent = "Turn your phone sideways for larger slides.";

  var hint = document.createElement("p");
  hint.className = "ui ui-hint";
  hint.innerHTML = 'Use <kbd>←</kbd> <kbd>→</kbd> to move · <kbd>O</kbd> overview · ' + (hasNotes ? '<kbd>N</kbd> notes · ' : '') + '<kbd>R</kbd> replay · <kbd>P</kbd> print';

  // A blank strip behind the controls: the slide canvas stops above it, so no
  // button or hint can ever land on a slide's footer line.
  var strip = document.createElement("div");
  strip.className = "ui ui-strip";
  strip.setAttribute("aria-hidden", "true");

  document.body.appendChild(progressWrap);
  document.body.appendChild(live);
  document.body.appendChild(strip);
  document.body.appendChild(nav);
  document.body.appendChild(home);
  document.body.appendChild(rotate);
  document.body.appendChild(hint);

  /* ---------------------------------------------------------------- notes */

  function notesFor(i) {
    var n = slides[i].querySelector(".notes");
    return n ? n.innerHTML : "";
  }

  function ensureDrawer() {
    if (notesDrawer) return notesDrawer;
    notesDrawer = document.createElement("aside");
    notesDrawer.className = "notes-drawer";
    notesDrawer.id = "speaker-notes";
    notesDrawer.hidden = true;
    notesDrawer.setAttribute("aria-label", "Speaker notes");
    document.body.appendChild(notesDrawer);
    return notesDrawer;
  }

  function renderNotes() {
    if (!notesOpen) return;
    var drawer = ensureDrawer();
    var html = notesFor(current);
    drawer.innerHTML =
      '<h2>Speaker notes — slide ' + (current + 1) + " of " + slides.length + "</h2>" +
      (html || "<p>No notes for this slide.</p>");
  }

  function toggleNotes(force) {
    notesOpen = typeof force === "boolean" ? force : !notesOpen;
    var drawer = ensureDrawer();
    drawer.hidden = !notesOpen;
    notesBtn.setAttribute("aria-expanded", String(notesOpen));
    if (notesOpen) renderNotes();
  }


  /* ------------------------------------------------------------- overview */

  // Every slide as a thumbnail in a modal dialog. The thumbnails are copies
  // of the real slides, frozen in their finished state (no animation), and
  // hidden from assistive technology; each one sits inside a button whose
  // name is "Slide 4: Title", so a screen reader hears a plain list of slides.
  var ov = null, ovGrid = null, ovCards = [], ovOpen = false;

  function cloneForThumb(slide, i) {
    var c = slide.cloneNode(true);
    c.classList.remove("is-active");
    c.classList.add("ov-slide");
    c.removeAttribute("id");
    c.removeAttribute("tabindex");
    c.removeAttribute("aria-labelledby");
    c.removeAttribute("aria-label");
    c.removeAttribute("role");
    Array.prototype.forEach.call(c.querySelectorAll(".notes"), function (n) { n.remove(); });
    // Give every id in the copy a suffix, and follow it wherever the copy
    // points at that id (SVG markers and gradients, aria references), so the
    // page never holds two elements with the same id.
    var ids = {};
    Array.prototype.forEach.call(c.querySelectorAll("[id]"), function (el) {
      ids[el.id] = el.id + "--ov" + i;
      el.id = ids[el.id];
    });
    var names = Object.keys(ids);
    if (names.length) {
      Array.prototype.forEach.call(c.querySelectorAll("*"), function (el) {
        Array.prototype.forEach.call(el.attributes, function (a) {
          var v = a.value, changed = v;
          if (v.indexOf("#") !== -1) {
            changed = v.replace(/#([A-Za-z_][\w:.-]*)/g, function (m, id) {
              return ids[id] ? "#" + ids[id] : m;
            });
          }
          if (/^(aria-labelledby|aria-describedby|aria-controls|for|headers|list)$/.test(a.name)) {
            changed = changed.split(/\s+/).map(function (t) { return ids[t] || t; }).join(" ");
          }
          if (changed !== v) el.setAttribute(a.name, changed);
        });
      });
    }
    c.setAttribute("aria-hidden", "true");
    c.setAttribute("inert", "");
    // Nothing inside a thumbnail can take focus.
    Array.prototype.forEach.call(
      c.querySelectorAll("a, button, input, select, textarea, [tabindex], details, summary, iframe, video, audio"),
      function (el) { el.setAttribute("tabindex", "-1"); });
    return c;
  }

  function buildOverview() {
    if (ov) return ov;
    ov = document.createElement("dialog");
    ov.className = "ov";
    ov.id = "slide-overview";
    ov.setAttribute("aria-labelledby", "ov-title");

    var head = document.createElement("div");
    head.className = "ov-head";
    var h = document.createElement("h2");
    h.id = "ov-title";
    h.textContent = "All slides (" + slides.length + ")";
    var tip = document.createElement("p");
    tip.className = "ov-tip";
    tip.innerHTML = 'Arrow keys move · <kbd>Enter</kbd> opens a slide · <kbd>Esc</kbd> or <kbd>O</kbd> closes';
    var close = document.createElement("button");
    close.type = "button";
    close.className = "ov-close";
    close.textContent = "Close";
    close.setAttribute("aria-label", "Close the overview");
    close.addEventListener("click", function () { closeOverview(); });
    head.appendChild(h);
    head.appendChild(tip);
    head.appendChild(close);

    ovGrid = document.createElement("ol");
    ovGrid.className = "ov-grid";

    slides.forEach(function (slide, i) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ov-card";
      b.setAttribute("aria-label", "Slide " + (i + 1) + ": " + titleOf(slide));
      var thumb = document.createElement("span");
      thumb.className = "ov-thumb";
      thumb.setAttribute("aria-hidden", "true");
      thumb.appendChild(cloneForThumb(slide, i));
      var label = document.createElement("span");
      label.className = "ov-label";
      label.setAttribute("aria-hidden", "true");
      var num = document.createElement("span");
      num.className = "ov-num";
      num.textContent = String(i + 1);
      label.appendChild(num);
      label.appendChild(document.createTextNode(titleOf(slide)));
      b.appendChild(thumb);
      b.appendChild(label);
      b.addEventListener("click", function () { closeOverview(i); });
      li.appendChild(b);
      ovGrid.appendChild(li);
      ovCards.push(b);
    });

    ov.appendChild(head);
    ov.appendChild(ovGrid);
    document.body.appendChild(ov);

    // Escape (the dialog's own cancel) returns to the slide you were on.
    ov.addEventListener("cancel", function (e) { e.preventDefault(); closeOverview(); });
    // A click on the backdrop margin, outside any card, also closes.
    ov.addEventListener("click", function (e) { if (e.target === ov) closeOverview(); });
    ov.addEventListener("keydown", overviewKeys);
    if (window.ResizeObserver) new ResizeObserver(scaleThumbs).observe(ovGrid);
    return ov;
  }

  // Thumbnails are the 1280x720 slide scaled to the card's width.
  function scaleThumbs() {
    if (!ovCards.length) return;
    var w = ovCards[0].querySelector(".ov-thumb").clientWidth;
    if (w) ov.style.setProperty("--ov-scale", String(w / 1280));
  }

  function columns() {
    var top = ovCards[0].offsetTop, n = 0;
    while (n < ovCards.length && ovCards[n].offsetTop === top) n++;
    return Math.max(1, n);
  }

  function overviewKeys(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var i = ovCards.indexOf(document.activeElement);
    var step = 0;
    switch (e.key) {
      case "ArrowRight": step = 1; break;
      case "ArrowLeft": step = -1; break;
      case "ArrowDown": step = columns(); break;
      case "ArrowUp": step = -columns(); break;
      case "Home": e.preventDefault(); ovCards[0].focus(); return;
      case "End": e.preventDefault(); ovCards[ovCards.length - 1].focus(); return;
      case "o": case "O":
        e.preventDefault(); e.stopPropagation(); closeOverview(); return;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (i === -1) { ovCards[current].focus(); return; }
    var j = Math.max(0, Math.min(ovCards.length - 1, i + step));
    ovCards[j].focus();
  }

  function openOverview() {
    if (ovOpen) return;
    if (notesOpen) toggleNotes(false);
    buildOverview();
    ovCards.forEach(function (b, i) {
      if (i === current) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    });
    if (typeof ov.showModal === "function") ov.showModal();
    else ov.setAttribute("open", "");
    ovOpen = true;
    ovBtn.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("ov-is-open");
    scaleThumbs();
    ovCards[current].focus();
    ovCards[current].scrollIntoView({ block: "center" });
  }

  // closeOverview(i) jumps to slide i; with no argument it returns to the
  // slide that was showing.
  function closeOverview(i) {
    if (!ovOpen) return;
    ovOpen = false;
    if (typeof ov.close === "function" && ov.open) ov.close();
    else ov.removeAttribute("open");
    ovBtn.setAttribute("aria-expanded", "false");
    document.documentElement.classList.remove("ov-is-open");
    if (typeof i === "number") show(i, { force: true });
    else show(current, { force: true });
    ovBtn.focus({ preventScroll: true });
  }

  function toggleOverview() { if (ovOpen) closeOverview(); else openOverview(); }

  /* ------------------------------------------------------------ navigation */

  function titleOf(slide) {
    var h = slide.querySelector("h1, h2");
    return h ? h.textContent.trim() : "Slide";
  }

  function show(i, opts) {
    var next = Math.max(0, Math.min(slides.length - 1, i));
    if (next === current && slides[current].classList.contains("is-active") && !(opts && opts.force)) {
      return;
    }
    slides[current].classList.remove("is-active");
    current = next;
    slides[current].classList.add("is-active");

    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === slides.length - 1;

    progressBar.style.width = ((current + 1) / slides.length) * 100 + "%";
    live.textContent =
      "Slide " + (current + 1) + " of " + slides.length + ": " + titleOf(slides[current]);

    if (location.hash !== "#" + (current + 1)) {
      history.replaceState(null, "", "#" + (current + 1));
    }

    renderNotes();
    if (opts && opts.focus) slides[current].focus({ preventScroll: true });
  }

  function next() { show(current + 1); }
  function prev() { show(current - 1); }

  // Re-run a slide's sequence animation without leaving the slide — useful
  // when the class wants to see a traversal a second time, or after a
  // discussion has run past the animation.
  function replay() {
    var slide = slides[current];
    slide.classList.remove("is-active");
    void slide.offsetWidth; // force reflow so the animation restarts
    slide.classList.add("is-active");
  }

  prevBtn.addEventListener("click", prev);
  nextBtn.addEventListener("click", next);
  notesBtn.addEventListener("click", function () { toggleNotes(); });
  ovBtn.addEventListener("click", function () { toggleOverview(); });
  ovBtn.setAttribute("aria-expanded", "false");

  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (ovOpen) return; // the overview handles its own keys

    var t = e.target;
    // Fields keep every key. Buttons keep Enter and Space; the arrow keys and
    // letter shortcuts still work after a click on Previous, Next or Slides.
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (t && /^(BUTTON|A|SUMMARY)$/.test(t.tagName) && (e.key === " " || e.key === "Enter")) return;

    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
      case " ":
        e.preventDefault(); next(); break;
      case "ArrowLeft":
      case "PageUp":
        e.preventDefault(); prev(); break;
      case "Home":
        e.preventDefault(); show(0); break;
      case "End":
        e.preventDefault(); show(slides.length - 1); break;
      case "n":
      case "N":
        if (hasNotes) { e.preventDefault(); toggleNotes(); } break;
      case "o":
      case "O":
        e.preventDefault(); openOverview(); break;
      case "p":
      case "P":
        e.preventDefault(); window.print(); break;
      case "r":
      case "R":
        e.preventDefault(); replay(); break;
      case "Escape":
        if (notesOpen) { e.preventDefault(); toggleNotes(false); }
        break;
      default:
        break;
    }
  });

  // Touch: horizontal swipes, with a generous threshold so vertical
  // scrolling inside a slide still works.
  var tx = 0, ty = 0;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  deck.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
  }, { passive: true });

  deck.addEventListener("touchend", function (e) {
    if (e.changedTouches.length !== 1) return;
    var dx = e.changedTouches[0].clientX - tx;
    var dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      if (dx < 0) next(); else prev();
    }
  }, { passive: true });

  /* --------------------------------------------------------------- scaling */

  // The viewer's own controls live in a reserved strip below the canvas, so
  // they never sit on top of a slide's footer line.
  var CHROME_H = 54;

  function fit() {
    if (!stage || !deck) return;
    var availH = Math.max(260, window.innerHeight - CHROME_H);
    var scale = Math.min(window.innerWidth / 1280, availH / 720);
    deck.style.transform = "scale(" + scale + ")";
    deck.style.position = "absolute";
    deck.style.left = "50%";
    deck.style.top = (availH / 2) + "px";
    deck.style.marginLeft = "-640px";
    deck.style.marginTop = "-360px";
    if (!reduced) deck.style.transition = "transform 120ms ease-out";
  }

  window.addEventListener("resize", fit);

  // Some embedded preview panes change the viewport without firing a window
  // resize event. Watching the stage itself keeps the canvas fitted, and the
  // bottom strip reserved, in that case too.
  if (window.ResizeObserver && stage) {
    new ResizeObserver(function () { fit(); }).observe(stage);
  }

  fit();

  /* ----------------------------------------------------------------- start */

  var start = 1;
  if (location.hash) {
    var parsed = parseInt(location.hash.replace("#", ""), 10);
    if (!isNaN(parsed)) start = parsed;
  }
  show(start - 1, { force: true });
})();
